# Spec: Schedule drag / resize / cross-day move   (slug: 007-schedule-drag-resize)

<!-- Third M1 feature module. Owned by: planner. Extends spec 005's scheduling engine (real TimeShift +
     a new cross-day MoveVisit patch type) and spec 006's Planner UI schedule pane (drag to time-shift,
     drag across days to move, bottom-edge resize to change duration, live rubber-band reflow preview).
     This is the interaction the v0.5 prototype's calendar pane models and that 006 shipped only as a
     static grid ("blok: sürükle / alt kenar: süre uzat" is a label with no behavior behind it yet). -->

## Problem & goal

Spec 006 built a **time-accurate but read-only** schedule grid: visit blocks are positioned by
`PlannedVisitDto.start/end`, breaks render as locked blocks, and the pane head already advertises
"blok: sürükle / alt kenar: süre uzat" (drag block / drag bottom edge to extend) — but **none of it does
anything**. A Supervisor can *see* the plan but cannot *touch* it on the calendar. The only way to change
timing today is the `PatchForm`, and even there **TimeShift is a lie**: `PatchResolver` has a comment
saying "TimeShift carries as a marker … DayScheduler applies the window later" but neither the resolver nor
the scheduler ever reads a TimeShift patch's `ParamsJson`, so creating a TimeShift patch changes nothing in
the generated plan.

This spec closes both gaps at once — the backend semantics **and** the UI that drives them:

1. **Make TimeShift real (same-day).** Parse a TimeShift patch's `ParamsJson` in the scheduling engine so
   dragging a visit to a new time on the same day actually re-times that visit (and reflows the day) in the
   materialized plan.
2. **Cross-day move (must-have).** Dragging a visit from one day's column to another must actually move the
   visit in the scheduler — the store is skipped on its normal day and inserted on the target day, as a
   dated, auto-reverting exception. This needs **real backend semantics**, designed below (new `MoveVisit`
   patch type).
3. **Bottom-edge resize → duration.** Dragging a block's bottom edge changes that stop's service minutes
   (store-permanent, via the existing `UpdateStop.serviceMinutes`), snapped to 5 minutes and clamped
   10–240.
4. **Live rubber-band reflow preview.** While dragging or resizing, downstream blocks **ghost-shift in real
   time** (the prototype's behavior) — the human sees the consequence *before* dropping, not after a
   drop-then-refetch round trip.

Success = a Supervisor opens `/planner`, focuses a route, and on the schedule grid can: drag a visit up/down
to re-time it (downstream blocks slide live), drag the bottom edge to lengthen/shorten it, and drag a visit
into another day's column to move it — each drop opening a **pre-filled `PatchForm`** (TimeShift or
MoveVisit, mandatory expiry) or, for a resize, committing the new duration; the plan then re-materializes
through the **real engine** so a reload shows the same result. Past weeks are read-only; the 450-minute
quota recolors as a warning but never blocks a drop. Backend engine changes are covered by xUnit; the
client geometry/reflow/payload logic is covered by Vitest (no flaky drag e2e).

## Cross-day move — backend design (the one real design decision)

**The problem.** `PatchResolver.Apply(baseline, patches, date)` is a **pure, per-date** function: it is
handed the baseline projected visits for *one* date and the patches whose window covers that date, and it
returns the resolved visits for that date. Priority order is **SKIP > TIME_SHIFT > ADD > REASSIGN**. A
cross-day move is inherently a **two-date** operation (remove from day A, add to day B), so it does not fit
any single existing patch type, and the resolver never sees two dates at once.

**Chosen approach — a new `MoveVisit` patch type (`PatchType.MoveVisit = 6`), resolved as a
skip-here + add-there keyed off the resolver's per-date evaluation.** A single `MoveVisit` patch row
carries, in `ParamsJson`, a `fromDate` and a `toDate` (the store is identified by the existing top-level
`Patch.StoreId`). Because `PatchResolver.Apply` is already invoked **once per date** across the whole
horizon, one patch row produces both effects without the resolver ever needing to see two dates
simultaneously:

- When the resolver runs for `date == fromDate`, the `MoveVisit` **removes** the store's baseline visit —
  applied in the **SKIP phase** (so it composes correctly with other skips/adds).
- When the resolver runs for `date == toDate`, the `MoveVisit` **injects** the visit — applied in the
  **ADD phase**, but (unlike a raw `AddStore`) with the store's **real `RouteStopId`, real service minutes,
  and its sequence** looked up from a `stopMetaByStoreId` map the orchestrator passes in, plus an optional
  **pinned start time** (the drop's y-position on the target day).
- For every other date in the patch's window, the `MoveVisit` is a no-op.

So the resolver's full priority becomes **SKIP (incl. `MoveVisit` remove-on-`fromDate`) > TIME_SHIFT >
ADD (incl. `MoveVisit` add-on-`toDate`) > REASSIGN**.

**Why this is the cleanest fit:**
- **It reuses "baseline, never mutate" verbatim** (design §2.5). The Monday→Tuesday move is expressed
  purely as an overlay; the baseline calendar is untouched.
- **Auto-revert on expiry is free.** The patch has the mandatory `EndsOn`; once it lapses (or is cancelled)
  the resolver simply stops applying it, so Monday's visit reappears and Tuesday's injected visit vanishes —
  no compensating action, exactly like every other patch type.
- **It matches the resolver's existing per-date shape.** No new "spanning" resolver pass is needed; the
  move is two ordinary single-date effects that happen to belong to one row.
- **One row = one expiry = one audit/journal entry = atomic.** Cancelling the move cancels both halves at
  once; there is no way for the "skip" and the "add" to drift apart.
- **No DB migration.** `Patch.Type` is a `byte` enum column with no CHECK constraint; `ParamsJson` is
  already `nvarchar(max)`. Adding enum value `6` and storing `fromDate`/`toDate` in `ParamsJson` needs no
  schema change.

**Alternatives considered and rejected:**
- **Two linked patches (a `SkipStore` on `fromDate` + an `AddStore` on `toDate`).** Rejected: two rows, two
  expiries, two journal entries that must be created, cancelled, and expired together — they can drift, and
  the "one move = one thing the human did" audit story is lost.
- **Overload `TimeShift` with an optional target date (`fromDate == toDate` ⇒ same-day, else move).**
  Tempting (no new enum value), but it forks the resolver's behavior inside one type into two genuinely
  different mechanics (a pin vs. a skip+add), muddies the decision journal ("Zaman Kaydır" reading as a
  day-move), and contradicts the design's clean §2.5 type list. Rejected for legibility. `MoveVisit` as its
  own named type reads correctly everywhere (audit log, journal, patch list).
- **A brand-new "planned exception" table decoupled from patches.** Rejected: over-engineering; it would
  duplicate the patch lifecycle (status, expiry, auto-revert, journal) the existing `patch` table already
  gives us.

**Same-day `TimeShift` semantics (the other half of "make TimeShift real").** A `TimeShift` patch carries
`{ startMinutes }` in `ParamsJson` (minutes-from-midnight, the drop's y-position) and identifies the visit
by the top-level `StoreId`. In the resolver's **TIME_SHIFT phase** it marks the matching baseline visit
with a `PinnedStart`. `DayScheduler` then honors `PinnedStart` as a **"no earlier than" anchor**: the
pinned visit starts at `max(sequentialCursor, pinnedStart)` (still pushed past any break it overlaps), and
every later visit reflows after it. A pin therefore **can only delay** a visit and its successors — it can
never pull a visit before its sequence predecessors finish (that case clamps). This is deterministic,
mirrors the prototype's "downstream blocks push" reflow, and needs no reordering machinery (permanent
reordering already lives in 006's `stops:reorder`).

> **DECISION TO CONFIRM AT REVIEW:** proceeding with the new `MoveVisit = 6` patch type (recommended). The
> only genuine alternative was overloading `TimeShift` with a target date; it is rejected above for audit
> legibility. If the reviewer prefers the overload, only Phase 2's type/param wiring changes — the resolver
> and UI mechanics are otherwise identical.

## Brainstorm results

- **Chosen approach:** a 6-phase module — **3 backend phases** (real same-day `TimeShift` pin +
  reflow-aware `DayScheduler`; the new cross-day `MoveVisit` patch type; API/DTO/contract plumbing +
  `serviceMinutes` clamp) then **3 client phases** (pure geometry/reflow/payload math with full Vitest
  cover; the drag/resize interaction + live rubber-band ghost preview; `PatchForm` extension + drop→mutation
  wiring + docs). Sized like 006, not a "lightweight tweak," because cross-day is now a must-have with real
  engine semantics.
- **Rejected scope:** same-day-only (the user overrode the recommendation to defer cross-day); two-linked-
  patch cross-day model (see above); dated/route/format duration scopes (stay deferred to M2 — duration is
  store-permanent only here); a Playwright drag e2e (dnd simulation is flaky — component/unit tests only);
  a new toast/expiry-prompt infrastructure (reuse the existing `PatchForm` with a mandatory expiry date
  picker).
- **Later (out of 007 scope):** dated/route/format-scoped duration overrides (M2 Tasks & Rules); dragging
  breaks (breaks stay locked); multi-visit / lasso drag; hard-blocking a >450 drop (warning-only here);
  merchandiser-swap on drop (no person picker in MVP, per 006); a Playwright drag e2e.

## User stories

- As a Supervisor, I drag a visit block up or down within its day and the block re-times to where I drop it;
  the blocks below it slide down **live while I drag**, so I see the reflowed day before I commit.
- As a Supervisor, on drop the system opens a **pre-filled `PatchForm`** (type = Zaman Kaydır / TimeShift,
  the new start already filled, store already selected) and makes me pick a **mandatory expiry date** before
  saving — so every temporary re-time auto-reverts.
- As a Supervisor, I drag a visit block into **another day's column** and, on drop, get a pre-filled
  `PatchForm` (type = Ziyareti Taşı / MoveVisit, from-day and to-day filled) with a mandatory expiry — and
  after saving, the store disappears from its old day and appears on the new day in the reloaded plan.
- As a Supervisor, I drag a block's **bottom edge** to make a visit longer or shorter; on drop the stop's
  service minutes update (snapped to 5, clamped 10–240) and the whole day reflows.
- As a Supervisor, I see the day-total minutes **recolor toward red when a drag would push the day over
  450**, but the drop is never blocked — the number is a warning, not a wall.
- As a Supervisor, I **cannot** drag or resize visits in a **past week** (the grid is read-only there);
  current and future weeks are editable.
- As a developer, I run Vitest and the snap/clamp geometry, the reflow algorithm, the patch-payload builder,
  and the drop→mutation wiring are all covered and green — without a flaky drag e2e.

## Acceptance criteria (testable)

### Backend — real same-day TimeShift (Phase 1)
- [ ] `ProjectedVisit` gains a `TimeOnly? PinnedStart` field (nullable, defaults null for baseline visits).
      All existing constructions compile (record `with`/positional callers updated).
- [ ] A pure `PatchParams` helper (`backend/src/Evo.Domain/Scheduling/PatchParams.cs`) defines
      `record TimeShiftParams(int StartMinutes)` and `record MoveVisitParams(DateOnly FromDate, DateOnly
      ToDate, int? StartMinutes)` with `TryParse(string? json, out …)` using `System.Text.Json`
      (case-insensitive). Malformed/empty JSON returns false (never throws).
- [ ] `PatchResolver` TIME_SHIFT phase parses each `TimeShift` patch's `ParamsJson`; for the baseline visit
      whose `StoreId` matches the patch's `StoreId`, it sets `PinnedStart = TimeOnly.FromTimeSpan(
      TimeSpan.FromMinutes(StartMinutes))`. Patches with unparseable params are ignored (no throw).
- [ ] `DayScheduler.ScheduleDay` input tuple gains `TimeOnly? PinnedStart`; a pinned visit starts at
      `max(cursor, PinnedStart)` (then still pushed past any overlapping break), and all later visits reflow
      after it. A pin earlier than the running cursor has no effect (clamps to `cursor`).
- [ ] `PlanGenerationService` threads each resolved visit's `PinnedStart` into the `DayScheduler` input and
      re-materializes `planned_visit` rows accordingly (an active TimeShift within horizon changes the
      stored `PlannedStart`/`PlannedEnd`).
- [ ] xUnit: `DayScheduler` honors a pinned start + reflows downstream; a too-early pin clamps; a pin that
      collides with a break pushes past it. `PatchResolver` sets `PinnedStart` for a matching TimeShift and
      ignores a malformed one. An end-to-end `PlanGenerationService` test: a TimeShift patch shifts the
      stored start of exactly that store's visit and pushes the following visit.
      (`backend/tests/Evo.Tests/Scheduling/*`.)

### Backend — cross-day MoveVisit (Phase 2)
- [ ] `PatchType` gains `MoveVisit = 6`. No migration required (documented: `patch.Type` is an unconstrained
      `byte` column). A test asserts the enum value is `6` (guards the wire contract).
- [ ] `PatchResolver.Apply` signature gains an optional
      `IReadOnlyDictionary<Guid, StopMeta> stopMetaByStoreId = null` parameter (`record StopMeta(Guid
      RouteStopId, int Minutes, int Sequence)`), defaulting to empty so existing callers/tests keep
      compiling with a one-line update.
- [ ] In the **SKIP phase**, a `MoveVisit` patch whose parsed `FromDate == date` removes the store's
      baseline visit (same effect as `SkipStore`, but only on `FromDate`).
- [ ] In the **ADD phase**, a `MoveVisit` patch whose parsed `ToDate == date` injects a `ProjectedVisit`
      for the store using `stopMetaByStoreId[storeId]` for the real `RouteStopId`, `Minutes`, and (via
      ordering) `Sequence`, `Source = Patch`, `PatchId = patch.Id`, and `PinnedStart` from
      `MoveVisitParams.StartMinutes` when present. If the store has no stop meta (not on the route) the
      injection is skipped (defensive; a moved visit is always an existing stop).
- [ ] `PlanGenerationService` builds `stopMetaByStoreId` from the route's active stops and passes it to
      `PatchResolver.Apply`. The injected MoveVisit visit upserts to `planned_visit (RouteStopId, ToDate)`;
      the `FromDate` row is removed. Edge case documented + tested: if the store is *also* normally visited
      on `ToDate`, the `(RouteStopId, ToDate)` upsert key coalesces the two into one visit (no unique-index
      violation, no crash).
- [ ] xUnit: MoveVisit removes the visit on `FromDate`; injects it (correct minutes + stop id + pinned
      start) on `ToDate`; leaves other dates untouched; **auto-reverts** past `EndsOn` (both halves gone);
      composes with a same-store `SkipStore` per the SKIP-before-ADD priority; the `ToDate`-already-visited
      edge coalesces. Existing `PatchResolverTests` updated for the new signature and stay green.
      (`backend/tests/Evo.Tests/Scheduling/PatchResolverTests.cs`, new
      `MoveVisitResolverTests.cs`.)

### Backend — API / DTO / contract plumbing (Phase 3)
- [ ] `POST /routes/{id}/patches` (`CreatePatch`) validates that a `TimeShift` or `MoveVisit` request has a
      non-null, **parseable** `ParamsJson` (via `PatchParams.TryParse`), throwing `EvoValidationException`
      (400, shared ProblemDetails) otherwise — with `StoreId` required for both. `MoveVisit` additionally
      requires `FromDate != ToDate` (same-day is TimeShift's job) → 400 otherwise. Existing patch types are
      unaffected.
- [ ] `PlannedVisitDto` gains `Guid RouteStopId` (so the client can correlate a dragged block back to its
      stop and build precise payloads); populated in `RoutesController.GetPlan` and
      `MerchandisersController.GetDay`. (Purely additive — existing consumers ignore it.)
- [ ] `RoutesController.UpdateStop` snaps `ServiceMinutes` to the nearest 5 and clamps to `[10, 240]` before
      persisting (matches the resize UX). A test asserts `237 → 235` and `500 → 240`, `3 → 10`.
- [ ] xUnit: CreatePatch rejects a TimeShift/MoveVisit with null/garbage params and a same-`FromDate`/`ToDate`
      MoveVisit (400); UpdateStop snap/clamp. (`backend/tests/Evo.Api.Tests/Routes/*`.)
- [ ] `contracts/openapi.json` regenerated (`dotnet build`) to include `MoveVisit` in the `PatchType` enum,
      `PlannedVisitDto.routeStopId`; `panel/src/api/generated/schema.ts` regenerated
      (`npm run generate-api-client`). Full backend suite green (`dotnet test backend/Evo.sln`); panel
      `npm run build` green.
- [ ] Docs updated: `docs/API.md` (TimeShift/MoveVisit `ParamsJson` shapes, `PlannedVisitDto.routeStopId`,
      UpdateStop snap/clamp), `docs/DECISIONS.md` (the `MoveVisit = 6` decision + rejected alternatives),
      `docs/DATABASE.md` note (no schema change; `patch.Type = 6` semantics), `EVO-Route-Planning-Design.md`
      §2.5 flagged (new patch type — never contradict the design log silently, per CLAUDE.md rule 5).

### Client — pure geometry / reflow / payload math (Phase 4, all Vitest, no UI)
- [ ] `panel/src/planner/schedule/dragMath.ts`: `pxToMinutes(px)` and `minutesToPx(min)` (inverse of
      `PX_PER_MINUTE`); `snapMinutes(min, step=5)`; `clampStart(startMin, durationMin, dayStart, dayEnd)`
      (keeps a block inside the 09:00–18:00 grid); `clampDuration(min)` → `[10, 240]` snapped to 5. Pure,
      no React.
- [ ] `panel/src/planner/schedule/reflow.ts`: `reflowDay(visits, changedIndex, newStartMin, newDurationMin,
      breaks)` → new `{ startMin, endMin }[]` — a pure client mirror of `DayScheduler`: the changed visit is
      pinned at `newStartMin` (no earlier than its predecessor's end), every later visit repacks
      sequentially, each pushed past any overlapping break. Deterministic; identical ordering rules to the
      backend.
- [ ] `panel/src/planner/schedule/patchPayload.ts`: `buildTimeShiftPatch({storeId, startsOn, endsOn,
      startMinutes, reason})` → `CreatePatchRequest` (type 5, `paramsJson` = `{"startMinutes":…}`);
      `buildMoveVisitPatch({storeId, fromDate, toDate, startMinutes?, endsOn, reason})` → `CreatePatchRequest`
      (type 6, `paramsJson` = `{"fromDate":…,"toDate":…,"startMinutes":…}`, `startsOn = min(fromDate,toDate)`);
      `buildResizeUpdate({serviceMinutes})` → `UpdateStopRequest`. All return the generated `schema.ts`
      types — no hand-written shapes.
- [ ] Vitest for each: `dragMath.test.ts` (snap 237→235, clamp 500→240 & 3→10, start clamped to grid),
      `reflow.test.ts` (downstream slides, break push, too-early pin clamps to predecessor end),
      `patchPayload.test.ts` (each builder emits the exact `type` + parseable `paramsJson`; MoveVisit sets
      `startsOn = min`). `npm test` green.

### Client — drag / resize interaction + live reflow preview (Phase 5)
- [ ] `VisitBlock` becomes draggable (vertical move) and gains a **bottom-edge resize handle**; pointer
      handlers report drag deltas. Blocks in a **past week are not interactive** (read-only guard keyed off
      the pane's `week.from < currentWeek().from`).
- [ ] **Live rubber-band preview:** while dragging/resizing, `SchedulePane` recomputes `reflowDay` on each
      pointer move and renders the affected day's downstream blocks at their **ghost** positions (and the
      dragged block following the cursor, snapped to 5 min) — applied during drag, **before** any commit.
- [ ] **Cross-day drag:** dragging a block over a different day column highlights that column as a drop
      target; the block previews at the hovered day + y-position (each day is a drop zone).
- [ ] The dragged day's **day-total recolors live** using the previewed minutes (over-450 → warning color);
      it never prevents the drop (warning-only, per clarification #6).
- [ ] On drop: **same-day** → open `PatchForm` pre-filled (TimeShift, storeId, `startsOn = visit date`,
      `startMinutes = snapped drop start`); **cross-day** → open `PatchForm` pre-filled (MoveVisit, storeId,
      `fromDate`, `toDate`, `startMinutes`); **bottom-edge resize** → call `useUpdateStop` with the
      snapped/clamped `serviceMinutes` (no PatchForm — resize is a store-permanent duration change). On
      cancel of the PatchForm, the ghost preview reverts (query data is the source of truth; nothing was
      committed).

### Client — PatchForm extension, wiring, tests, docs (Phase 6)
- [ ] `PatchForm` accepts optional `prefill` props (`type`, `storeId`, `startsOn`, `startMinutes`,
      `fromDate`, `toDate`) and, when `type` is TimeShift/MoveVisit, renders the extra read-only context
      (moved-from/to day, new start time) and builds `paramsJson` via `patchPayload.ts`. The **mandatory
      expiry** date picker (existing `endsOn`, `expiryInvalid` guard) is reused unchanged — no new toast
      infra (clarification #3). MoveVisit added to `PATCH_TYPE_OPTIONS` ("Ziyareti Taşı (MoveVisit)").
- [ ] The drop→mutation path is wired through the existing `useCreatePatch` / `useUpdateStop` hooks (which
      already invalidate `route`/`plan`/`health`/`stores-geo`), so after save the schedule, health card, and
      day-totals refresh from the re-materialized plan.
- [ ] Vitest: a component/logic test that a same-day drop builds the correct TimeShift `CreatePatchRequest`,
      a cross-day drop builds the correct MoveVisit request, and a resize drop calls `useUpdateStop` with the
      clamped minutes (mutation hooks mocked — assert the payloads). The reflow algorithm's integration with
      a fixed visit set is asserted. No Playwright drag e2e (clarification #7).
- [ ] New Turkish strings added to `panel/src/i18n/locales/tr.json` via `t()` (no hardcoded literals):
      move/time-shift labels, over-450 warning, past-week read-only hint.
- [ ] `npm run lint`, `npm test` (Vitest), `npm run build` all green. Docs updated:
      `docs/ARCHITECTURE.md` (schedule drag/resize + client reflow mirror of `DayScheduler`),
      `docs/ROADMAP.md` (mark schedule editing landed), `docs/DECISIONS.md` (client reflow-mirror decision;
      duration-as-store-permanent scope).

## Clarifications
<!-- All 8 answered 2026-07-17 by the human, pre-plan. The one scope override is #2 (cross-day is a
     must-have, not deferred). Implementation may proceed. -->
| # | Question | Answer (2026-07-17) |
|---|---|---|
| 1 | The backend TimeShift gap — leave TimeShift a no-op, or make it real? | **Make it real** — add a backend phase to 007: parse `ParamsJson` in the scheduler so a TimeShift patch actually re-times the visit. |
| 2 | Cross-day drag (day-move) scope — defer (same-day only) or must-have? | **MUST-HAVE (override of the planner's defer recommendation).** Cross-day move must actually work in the scheduler, not just same-day time-shift. Design the real backend semantics — a new/extended patch type or skip-here+add-there — picking what best fits `PatchResolver`/`DayScheduler`. Same-day TimeShift AND cross-day move both ship in 007. |
| 3 | Expiry UX on drop — new toast/prompt infra or reuse the PatchForm? | **Reuse the existing `PatchForm`** (pre-filled, type = TimeShift/MoveVisit, mandatory expiry via its date picker). No new toast infrastructure. |
| 4 | Duration change scope on resize — store-permanent, or dated/route/format-scoped? | **Store-permanent only**, via the existing `UpdateStop.serviceMinutes` (5-min snap, 10–240 clamp). Dated/route/format duration scopes stay deferred to M2. |
| 5 | Live rubber-band reflow preview — port the prototype's live ghost-shift, or drop-then-refetch? | **YES — port the prototype's live preview** (downstream blocks ghost-shift in real time while dragging), not drop-then-refetch. Real client-side work: the reflow math, ghost rendering, applying it during drag before commit on drop. |
| 6 | Guardrails — past-week editability and the 450-min quota on drop? | **Confirmed as proposed:** past weeks read-only (no drag/resize; matches WeekNavigator already reaching them); the 450-min quota is **warning-only** (day-total recolor + finding chip, never blocks a drop). |
| 7 | Test coverage — component/unit only, or add a Playwright drag e2e? | **Component/unit only** (Vitest for snap/clamp geometry, the patch-payload builder, drop→mutation wiring, the reflow algorithm). **Skip** a Playwright drag e2e — dnd simulation is flaky. |
| 8 | Checkpoint cadence / phase structure? | Same as 006: CLAUDE.md rule 3d HARD STOP per phase, ~10 tasks/phase, 2–5 min tasks with exact file paths + verification. Given cross-day is must-have, restructure into a real module-sized breakdown (6 phases) rather than 3 lightweight ones. |

## Non-goals
- **No dated / route-scoped / format-scoped duration overrides** — resize changes the stop's permanent
  `serviceMinutes` only; scoped durations are M2 (Tasks & Rules).
- **No draggable breaks** — statutory breaks stay locked grey blocks (design §3.3).
- **No merchandiser swap on drop** — no person picker in MVP (matches 006's ReassignTemp deferral).
- **No hard block on a >450 drop** — the day-total recolors as a warning; the drop always succeeds
  ("never block, always justify").
- **No multi-visit / lasso drag** — one block at a time.
- **No Playwright drag e2e** — dnd simulation is flaky; Vitest covers the geometry/reflow/payload/wiring.
- **No new backend beyond**: `PatchType.MoveVisit`, real `TimeShift`/`MoveVisit` `ParamsJson` resolution,
  `PlannedVisitDto.routeStopId`, and the `UpdateStop` snap/clamp. No new endpoints, no schema migration.
- **No change to how permanent stop reordering works** — that stays 006's `stops:reorder`; TimeShift is a
  temporary, expiring re-time, not a reorder.

## Open questions (product decisions — flag at review, do not guess)
- The `MoveVisit = 6` vs. overload-`TimeShift`-with-a-target-date decision is **flagged for review** in the
  cross-day design section above (recommendation: proceed with `MoveVisit`). No other open questions — all
  8 clarifications answered.
