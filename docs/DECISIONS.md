# Decisions Log

<!-- Newest first — insert new entries directly below this line -->
## 2026-07-19 — RETROACTIVE LOG: the prototype-verbatim pivot (2026-07-18, ~20 commits) — /planner hosts the v0.5 prototype unchanged; backend wired behind it via bridges
- **Decision:** Instead of continuing the React re-implementation of the planner workspace (specs 006/007's UI phases), the `/planner` route hosts `evo-planner-prototype-v0.5.html` VERBATIM (commit `c672e3b`): `panel/scripts/extract-prototype.mjs` slices it into `public/evo-prototype/{proto.css, body.html, engine.js}`; `PrototypeHost.tsx` mounts that DOM once per browser session and reveals it only after the first backend load (the engine paints its mock seed first). Real data flows through bridge modules — `backendBridge` (load: routes/people/stores/plan/notes → `window.__evoLoadData`; province + week nav), `publishBridge` (Yayınla → pure `computePublishOps` diff of live state vs load snapshot → real mutations + republish), `prototypeMap` (SVG map swapped for MapLibre GL, `ef54209`), `tasksBridge`/`scheduleBridge`/`notesBridge` (panel tabs + inbox), coordinated by `afterPanel.ts` render hooks. Draft-until-publish comes free from the prototype's own `changes[]` buffer.
- **Why:** The prototype IS the interaction model the design mandates matching (CLAUDE.md source-of-truth list); re-implementing it in React was slower and drifted visually/behaviorally (the parity analysis in `docs/prototype-parity/` documents the gaps). Hosting it verbatim gives pixel-exact parity immediately and lets backend wiring proceed pane-by-pane behind a working UI. This entry is logged retroactively by the 2026-07-19 audit session (C5) — the pivot itself violated CLAUDE.md rule 5 when it landed undocumented.
- **Alternatives rejected:** Continuing the React rebuild (the ~4.5k-LOC tree it produced was deleted as unreachable — see D1a below); iframing the original single-file prototype (no seam for backend bridges or the MapLibre swap).
- **Consequences:** `engine.js` (3.2k lines of vanilla JS) is temporarily outside eslint/tests and ships its own legacy dead code under "verbatim" — resolved by decision D2b (adopt as TS product code, pending). The prototype file becomes a build input: after editing it, re-run `npm run extract-prototype`. E2e must target the prototype DOM and gate on the host reveal. Some backend-complete features lost their UI in the pivot and await bridges: Onarım workbench (§A3.2 decision open), outcome coloring, audit-log/decision-journal/history views.

## 2026-07-19 — Audit decisions D1/D2/D3: dead pre-rebuild React tree DELETED; engine.js to be adopted as product code; unregistered seeder modules to be DELETED
- **Decision:** From `docs/audit/TODO-from-audit.md` §0, the user marked: **D1a** — delete the dead pre-rebuild React planner tree (~4,552 LOC: `planner/components/**` except `map/storeLayer.ts`, `planner/{state,api}/**`, `planner/format.ts`, `planner.css`, dead `schedule/*` modules except `patchPayload.ts`, `src/onarim/**`, their ~20 test files, the dead client fns in `api/planner.ts`, the `useRouteEvidence`/`getRouteEvidence` pair, i18n keys only that tree used, and deps `@dnd-kit/*`, `@turf/*`, `recharts`, `zustand`). **D2b** — adopt `public/evo-prototype/engine.js` as product code (move into `src/` as TS under eslint/tests, escape interpolations) in a later session rather than migrating pane-by-pane back to React. **D3b** — delete the three never-registered seeder modules (`RouteSeederModule`, `FieldExecutionSeederModule`, `AbsenceSeederModule`) + `MaterializeHistoryAsync`, and fix the 4 docs that claim they run (executes in session C3).
- **Why:** The keep-rationale for the tree was stale — the `/planner` route runs the v0.5 prototype verbatim via `PrototypeHost` since commit `c672e3b`, and the map swap (`ef54209`) reuses only `storeLayer.ts`. Git history preserves everything deleted. D2b pairs with D1a (migrating back would mean rewriting, not reusing). D3b matches the branch's actual philosophy that routes are the planner's work product, not seed data.
- **Alternatives rejected:** D1b (keep tree as migration target) — nothing has been migrated from it since the pivot; it cost 5–6 npm deps, ~20 dead test files, and a false sense of coverage. D2a (pane-by-pane React migration) — conflicts with D1a. D3a (re-register seeder modules) — the recommended option in the audit, but the user chose deletion; Onarım/analytics data needs will be met by panel-created data or revisited.
- **Consequences:** Session C2 (this session) executed D1a: panel Vitest went 133→26 tests (7 files) — the delta was dead-tree tests; `tokens.test.ts` (a `planner.css` parity guard) died with `planner.css`. `@types/geojson` became a direct devDependency (was transitive via deleted deps) + `"geojson"` added to tsconfig `types`. Backend endpoints whose only panel callers died stay per audit §A4 (contract-intentional). D2b and D3b execute in later sessions. The 4 Playwright specs against dead-tree DOMs remain broken until session C4.

## 2026-07-18 — Fixed past-week detection: comparing Mondays missed weekend "todays"
- **Decision:** `SchedulePane`'s read-only-past-week check now compares the displayed week's LAST day (`week.to`, Friday) against today's date, not the first day (`week.from`, Monday) against `currentWeek().from`. Added `todayIso()` to `week.ts`.
- **Why:** The previous check (`week.from < currentWeek().from`) only ever differs when the displayed week's Monday differs from today's Monday. Whenever "today" itself falls on a Saturday or Sunday, today's Monday IS the same Monday as the just-finished Mon-Fri week — so a fully-elapsed week was never flagged read-only. The displayed grid then allowed drags on already-completed, already-materialized visits; a resulting patch's `StartsOn` was in the past, but `RoutesController.CreatePatch`'s `RegenerateFutureAsync(id, today, ...)` only ever regenerates from today forward — so the patch was created in the DB but never resolved into the (already-materialized) plan being displayed. Every drag looked like it silently reverted on release. Discovered directly from the user testing on a Saturday (2026-07-18) against the still-displayed Jul 13–17 week — this wasn't a drag-mechanics bug at all (those were fixed in the entry below), it was a date-comparison bug making an entire already-past week masquerade as editable.
- **Alternatives rejected:** Making `RegenerateFutureAsync` also resolve past dates — rejected; past visits are meant to be locked history (design's read-only-past-weeks rule), not rewritable, so the right fix is correctly detecting "past" rather than making past data mutable.
- **Consequences:** On a weekend, the default-displayed "current" week now correctly shows the "(geçmiş hafta — salt okunur)" badge and disables dragging; the user must navigate to the next (genuinely future) week to edit. No other file had the same buggy comparison pattern (verified via repo-wide grep). Added a regression test in `week.test.ts` reproducing the exact Saturday scenario.

## 2026-07-18 — Schedule drag/drop applies instantly as a this-week patch + undo toast; new Cancel-patch endpoint
- **Decision:** Dragging a visit (move or cross-day) no longer opens a blocking modal asking for an expiry date. It now builds and submits a real `CreatePatchRequest` immediately, scoped to the currently displayed week (`endsOn` = the week's last day), and shows a toast with the resulting change + a real "Geri al" (undo) button — matching design §10's already-documented "Drag = patch-for-this-week by default, toast offers 'Kalıcı yap' with impact count" convention, which the modal-per-drag flow had not actually implemented. "Geri al" calls a new `POST /routes/{id}/patches/{patchId}/cancel` endpoint that flips the patch to the pre-existing (but previously unused) `PatchStatus.Cancelled` and regenerates the plan — `PlanGenerationService` already excluded `Cancelled` patches from resolution, so this only needed a controller action, no new domain/schema work. The prototype's "Kalıcı yap (Baz)" (promote to permanent baseline) button is deliberately NOT built: the real scheduling engine has no per-stop pinned-start-time concept in the baseline (`DayScheduler` always computes start times sequentially from `DayStart`), so there is no real backend action for "make this exact time permanent" to call — building a fake button for it would violate the standing no-fake-buttons rule. Also fixed a real bug in `reflow.ts`'s live drag preview: it always packed every visit at/after the dragged one back-to-back with zero gap, so moving or resizing ONE visit made every later visit in the day visibly jump to a new position even with no actual overlap — it now only pushes a later visit forward if the change would actually overlap it (mirrors the prototype's `reflow()`).
- **Why:** User reported (2026-07-18) that drag/move/resize "does not work" — dragging looked like it moved every subsequent visit, then snapping back to the original layout on release. Two independent causes: (1) the reflow preview bug made the drag *look* wrong during the gesture even when the eventual real change was fine; (2) requiring a manual modal fill-in on every drop meant nothing was visibly committed until the user noticed the modal, filled a date, and clicked Kaydet — which felt like "it reverted" even though the data was simply untouched. Auto-applying as a bounded, mandatorily-expiring patch is safe by construction (baseline is never mutated, no design rule is violated) and matches what design §10 already specified.
- **Alternatives rejected:** Building a fake "Kalıcı yap" button that just creates a longer patch instead of a real baseline change — rejected as dishonest UI (a Turkish "make baseline" label on something that isn't actually baseline). Hard-deleting patches for undo — rejected; `PatchStatus.Cancelled` already existed and is the correct terminal state, consistent with the "no delete, only status transitions" pattern used elsewhere (routes/stores).
- **Consequences:** `panel/src/planner/schedule/dropDecision.ts` now returns a ready `CreatePatchRequest` (not a `PatchFormPrefill`) for the `patch` action; `SchedulePane.tsx` no longer renders its own `PatchForm` instance (the "+ Yama ekle" entry point in `RouteDetailPanel.tsx` is a separate, unaffected instance for manual/non-drag patch creation with a hand-picked window). New `useCancelPatch` mutation + `planner.cancelPatch()` client. Backend: `RoutesController.CancelPatch`, 2 new integration tests in `PatchParamsValidationTests.cs`. `contracts/openapi.json`/generated TS client regenerated.

## 2026-07-18 — Lunch break removed from break_blocks (reverses clarification #12)
- **Decision:** The seeded `break_blocks` setting (`EvoDbContext.cs`) is now `[]` — no breaks at all, matching the shipped `evo-planner-prototype-v0.5.html` (its `BREAKS` constant is empty; the "Öğle"/lunch literal never appears in the prototype). Migration `RemoveLunchBreak` updates the existing seeded row; `panel/src/planner/schedule/breaks.ts`'s `BREAK_BLOCKS` is now `[]` too.
- **Why:** User request during the scheduler-pane prototype-parity pass ("remove any lunch or tea breaks") — direct instruction, not a re-derivation from the prototype file (which was already empty on this point; spec 006/clarification #12's tea+lunch breaks were a decision made independently of the prototype and are now explicitly reversed).
- **Alternatives rejected:** Keeping lunch as a UI-only display while leaving `DayScheduler`'s break-avoidance logic wired to an empty list — rejected as unnecessary complexity; the engine (`DayScheduler.ScheduleDay`, `Evo.Domain.Scheduling`) already treats `Breaks` as fully data-driven, so an empty seeded list is sufficient without touching engine code.
- **Consequences:** `DayScheduler`/`SchedulingSettings`/`BreakBlock` domain types are unchanged (still support breaks generically) — only the seeded data and the client mirror constant changed. `DaySchedulerTests` is unaffected (constructs its own local break list, independent of the seed). Existing demo DB needs a reseed (or the migration applied) to pick this up. Spec 006's `tasks.md` line documenting the original 3-break decision is left as historical record, not rewritten.

## 2026-07-18 — 010-analytics-onarim: on-read analytics (not materialized), all 8 §8 metrics Supervisor-scoped, new CrossReassignVisit patch type, V8/V14 landed, live-location map stays deferred
- **Decision:** Five things this session. (1) **Analytics is entirely on-read aggregation** (`PlanHealthService`/`MobilityService`/`StabilityService` in `Evo.Api/Analytics`) — no new materialized tables, no nightly refresh job, despite design §9 sketching "Analytics reader — materialized views over change log / assignments, refreshed nightly" (Q9). (2) All **8 design §8 metrics ship**, including mobility-per-person and override-rate, **Supervisor-scoped** like every other analytics endpoint — NOT gated behind a "senior management" role as §8 frames it ("person-level mobility view restricted to senior management") — a user override of the planner's more conservative recommendation (Q1/Q8). (3) Onarım v1 adds a **fourth per-visit action, `ReassignPerson`**, beyond the original three (Skip/MoveDay/ReassignRoute), backed by a **new `PatchType.CrossReassignVisit = 7`** — another user override of the planner's recommendation to just reuse the existing three patch types. (4) V8 (utilization band) and V14 (absence/store-closure collision) — both deferred since spec 005 — landed as pure `UtilizationValidator`/`AbsenceValidator`, wired into `GET /routes/{id}/plan` and `POST /routes/{id}/validate`. (5) The live-location **map visualization** layer stays deferred (Q10) — the data pipeline (`merchandiser_location_ping`) already landed in spec 009/M3; only rendering it as a map layer remains out of scope.
- **Why:** (1) On-read aggregation avoids a refresh-job/staleness story for a feature whose query volume (per-region analytics page, opened occasionally by ~1,000 supervisors) doesn't need it — LINQ aggregation over already-indexed tables (`planned_visit`, `visit_realization`, `task_instance`, `patch`, `assignment`, `audit_log`) is fast enough, and a materialized-view + refresh-scheduling story is real added complexity with no current performance justification. (2) EVO's role model is deliberately just two roles (Supervisor, FieldAgent) — inventing a third tier solely to gate two metrics contradicts that foundational decision (see design §10 "Roles: Two only"); the user's call reframes mobility/override-rate as "outlier surfacing" (a review signal any supervisor can see, not a punitive report kept from them) rather than silently dropping the metrics or building unplanned role infrastructure. (3) `CrossReassignVisit` reuses `PatchResolver`'s existing per-route/per-date resolution pattern exactly the way `MoveVisit` (spec 007) does for cross-date moves — one patch row, one expiry, one audit trail — just crossing two ROUTES on one date instead of two DATES on one route; this keeps Onarım's v1 scope (per-visit redistribution across people/routes, not just skip/move/reassign-whole-route) inside the existing patch-engine invariants rather than needing a new mutation pathway. (4) V8/V14 had no blocking dependency left once `absence` (a new table, not in design §5) existed — both were only deferred pending modules that didn't exist at spec-005 time. (5) The map-rendering layer is genuinely separable UI polish on top of a pipeline that already works; keeping it deferred avoids scope creep in an already-large M4 spec.
- **Alternatives rejected:** Materialized views with nightly refresh (design §9's original sketch) — rejected per (1) above, revisit if/when query volume actually demands it. Gating mobility/override-rate behind a new "senior management" role or hiding them from the panel entirely — rejected per (2), both would either require unplanned role infrastructure or silently drop metrics the design explicitly wants surfaced. Reusing the existing 3 Onarım patch types for `ReassignPerson` (e.g. two paired `ReassignTemp` patches) — rejected per (3), doesn't cleanly express "this ONE visit moves to a different person on a different route," which is exactly what `MoveVisit`'s two-date pairing pattern already solves in miniature for dates instead of routes. Building the live-location map layer now that the ping pipeline exists — deferred again per (5), same reasoning as the 2026-07-17 M3 entry.
- **Consequences:** `docs/DATABASE.md`/`docs/API.md`/`docs/ARCHITECTURE.md` updated for the new `absence` table, V8/V14, the on-read analytics endpoints, and the Onarım workbench + `CrossReassignVisit` patch type. `EVO-Route-Planning-Design.md` flagged with build notes at §8 (on-read not materialized; mobility Supervisor-scoped), §7.3b (Onarım v1's 4th action), §2.5 (new patch type), and §3.2 (V8/V14 landed) — never contradicting §10 silently (CLAUDE.md rule 5). `docs/ROADMAP.md`/`docs/TODO.md` mark M4 complete and move materialized-analytics-views/live-location-map-layer/⚡-Otomatik-düzelt into the post-M4 backlog. All milestones M0–M4 are now complete.

## 2026-07-17 — 009-field-execution-sim: separate visit_realization table + continuous location-ping stream (both diverge from the planner's recommendation), mocked notifications, seeder-only notes
- **Decision:** M3's realized-visit data is a **separate `visit_realization` table** (1:1 with `planned_visit` via a unique FK), not columns added directly to `planned_visit` as the planner initially recommended — the user asked for this split (2026-07-17) to keep "the promise" (`planned_visit`) and "reality" cleanly separated, especially since GPS data turned out to be a growing continuous stream rather than a single point. That stream is a new **`merchandiser_location_ping`** table (plain `lat`/`lng` doubles, no NetTopologySuite `geography`, `RecordedAt` timestamp) — the user explicitly chose to pull M4's live-location-layer *data groundwork* forward into M3 rather than seed one check-in point per visit, after being asked directly whether M3 should stay scoped to a single point or build the continuous-ping pipeline now. `PlannedVisit.status` (Done/Missed/Skipped, already defined in spec 005 but never populated until now) remains the single source of truth for outcome — `visit_realization` only carries `CheckInAt`/`CheckOutAt`/`ActualMinutes`/`OutcomeReason`. A visit's check-in location is derived at read time as the nearest ping to `CheckInAt` (not stored redundantly). Task results type `TaskInstance.ResultJson` (reserved since spec 008) via a pure `Evo.Domain.Tasks.TaskResult` record set (None/Photo/Form) with seeded object keys + fake URLs for photos (no real MinIO upload — mobile capture is deferred). Notification receipts are mocked via a real `notification` table + a thin `INotificationDispatcher` that writes one row per assigned merchandiser when a route publishes successfully (log-and-continue on dispatcher failure — never blocks the publish result); no real FCM delivery. Notes are **seeder-produced only** — no field-agent create-note API, since mobile capture is deferred (Q4, matches the existing "Mobile app deferred" decision below).
- **Why:** `visit_realization` as a separate table keeps history-shaped data (which may need its own retention/lifecycle later) out of the row that represents the plan itself, and avoids widening `planned_visit` with columns that are null for the vast majority of (future) rows. The continuous ping stream reflects real operational value the user wants sooner rather than deferring the whole location story to M4 — but the **panel's live-map visualization of that stream stays M4**; M3 only ships the data pipeline (seeder + `GET /merchandisers/{id}/location-history`) so M4 doesn't have to build the schema from scratch. Mocking notifications via a real table (not just a log line) lets the panel's future analytics read real rows instead of parsing logs. Seeder-only notes match the existing mobile-deferred posture — there is no legitimate write path for a field agent yet.
- **Alternatives rejected:** Realized columns on `planned_visit` (planner's original recommendation) — rejected per user feedback once the location-history requirement surfaced; a single `CheckInLat`/`CheckInLng` column pair per visit — rejected for the same reason, the user wants location *history*, not a snapshot. NetTopologySuite `geography` for pings — deferred until a spatial query actually needs it (none does in M3). Building the panel's live-location map layer now that the pipeline exists — deferred to M4 to avoid scope creep beyond what was asked (the data pipeline, not the visualization).
- **Consequences:** `docs/DATABASE.md`/`docs/API.md`/`docs/ARCHITECTURE.md` updated for the 4 new tables (`visit_realization`, `merchandiser_location_ping`, `note`, `notification`) and 4 new/extended endpoints. `PlanGenerationService` gained a seeder-only `MaterializeHistoryAsync` (bypasses `RegenerateFutureAsync`'s today-clamp) — discovered mid-implementation that seeded route stops' `EffectiveFrom = today` meant no past-dated membership ever existed, so the seeder now backdates stops before materializing history (a real bug caught by actually running the seeder, not just code review). `EVO-Route-Planning-Design.md` flagged where M3 diverges from its original realized-visit shape (never contradict §10 silently, CLAUDE.md rule 5). `agent_location` (design §6.2, M4) is effectively superseded by `merchandiser_location_ping` — DATABASE.md's schema-status table notes this rather than leaving two competing tables implied.

## 2026-07-17 — 008-tasks-rules: M2 scope confirmations (effect-ops, arithmetic order, materialization) and simulate/route + Conflict Center stay deferred
- **Decision:** M2's Rule engine ships with 4 effect ops only — `IncludeTask`, `ExcludeTask`, `SetMinutes`, `ScaleMinutes` — deferring `SetFrequency`, `SetModules`, `PatchModule` to a later spec (Clarification Q1). Minutes-ladder arithmetic evaluates rules low→high by `(Scope, Priority, EffectiveFrom)`: `ScaleMinutes` multiplies the running value, `SetMinutes` replaces it outright, so a higher-priority `SET` wins unconditionally and a higher-priority `SCALE` multiplies whatever lower layers produced (Q8); same-scope/same-priority ties break on newest `EffectiveFrom`. `TaskInstance` rows are **materialized** by `PlanGenerationService` for every future visit (not resolved-on-read), matching the existing `PlannedVisit` horizon model — needed for deadline/OVERDUE tracking on one-off tasks (Q7). A "one-off targeted task" is a `TaskTemplate` with `recurrence=Once` + `targetChain`/`targetFormat` + `validUntil` as its deadline — no separate Campaign entity (Q3, per design §2.8 v0.5 decision). Both `POST /simulate/route` and the Conflict Center/Sorun Merkezi stay deferred out of M2 (Q4/Q5) — see rationale below.
- **Why:** The engine's core job is replacing the flat `service_minutes` fallback with Σ resolved task minutes; the deferred effect-ops (module composition) and admin CRUD pages are a different, larger story (module-stack editor) that would double M2's scope without being load-bearing for the resolver itself. `POST /simulate/route` is a *consumer* of the resolver (a what-if over a candidate `stores[]` set for route-building/rebalancing), not a prerequisite — it becomes a thin call once the resolver exists. The Conflict Center is a cross-route *triage/aggregation* surface (a browsable queue of warnings across the region); M2's aggregate impact preview (`GET /rules/impact`) plus the existing per-day V2 (>450) warning chip already satisfy "never block, always justify" *at the point of edit* — a cross-route browsing UI is an M3/M4 monitoring concern, not a gate on shipping rule resolution.
- **Alternatives rejected:** Building the full effect-op set (SET_FREQUENCY/SET_MODULES/PATCH_MODULE) now while domain context is fresh — rejected as scope creep with no M2 consumer. Folding `POST /simulate/route` or the Conflict Center into M2 to "finish the story" — rejected per the dependency analysis above; both ship cleanly as later specs once the resolver is stable.
- **Consequences:** `docs/API.md`/`docs/DATABASE.md` updated for the 3 new tables + 6 endpoints. `EVO-Route-Planning-Design.md`'s M1 "visit duration = flat fallback" description is superseded — flagged in `docs/DATABASE.md` rather than silently diverging (CLAUDE.md rule 5). Standalone Yönetim admin pages (task-template list, rule matrix UI) also deferred — `POST /rules` + the scope-modal (creates rules from context) + the seeder cover M2's data-creation needs (Q6).

## 2026-07-17 — 007-schedule-drag-resize client: reflow mirror, store-permanent resize scope, ported prototype layout after live browser testing
- **Decision:** `reflow.ts` re-implements `DayScheduler`'s pack-and-push-past-breaks algorithm client-side, purely for the live rubber-band preview while dragging — the server-side `DayScheduler` remains the actual source of truth; the client copy only has to be visually close during a drag, not authoritative. Drag-edge-to-extend-duration commits directly via `UpdateStop.serviceMinutes` (store-permanent scope) rather than opening a patch form — dated/route/format-scoped duration overrides are M2 (task/rule engine) territory. The drop-decision logic (same-day move -> TimeShift prefill, cross-day move -> MoveVisit prefill, resize -> UpdateStop payload) was extracted into a pure `dropDecision.ts` function so it's unit-testable without simulating pointer events.
- **Why:** A full two-day live reflow (removing the dragged item from the source day's array while inserting it into the target day's array, both re-rendering per pointer-move) breaks index alignment between the reflowed array and the day's rendered visit list — caught as a real bug during implementation. Cross-day drags render a floating ghost in the target column instead of a live two-day reflow; the actual repack happens for real once the MoveVisit patch is created and the plan refetches.
- **Live browser testing findings (not just static review):** after two rounds of "this is broken" reports, actually driving the app via Chrome automation (not just reading code) showed the drag/resize/cross-day mechanisms all worked correctly end-to-end the whole time — what was missing was the prototype's time-axis (hour labels down the grid) and person-cell row, both completely absent, making it impossible to tell what a drag would do or land on. Ported the prototype's real `sched-grid` CSS grid (110px person-cell | 36px time-axis | 5 day columns) and `.hline` hour gridlines to fix the actual problem instead of continuing to guess at drag-handler bugs that didn't exist. Lesson: when a report is "X doesn't work at all" but static code review finds no obvious defect, prefer live-testing the actual browser over further speculative code changes.
- **Consequences:** `dropDecision.ts`/`reflow.ts` are covered by unit tests (drop→payload wiring, reflow math); no Playwright drag-simulation test (per spec Clarification — dnd pointer simulation is flaky, component/unit tests preferred). The schedule pane's visual structure is now a faithful 1:1 port of the prototype's grid for a single focused route; it does not (and structurally cannot, given a route has 0-1 active assignment) render the prototype's multi-route/multi-person stacked rows — that would require rendering multiple routes at once, out of scope here.

## 2026-07-17 — 007-schedule-drag-resize: MoveVisit as a new PatchType (not an overloaded TimeShift); TimeShift made real
- **Decision:** Cross-day drag (moving a visit to a different weekday) is realized as a new `PatchType.MoveVisit = 6` rather than adding a target-date field to `TimeShift`. One patch row carries `{fromDate, toDate, startMinutes?}` in the existing `params_json`; `PatchResolver.Apply` — which only ever evaluates one date at a time (SKIP > TIME_SHIFT > ADD > REASSIGN) — resolves it as two ordinary per-date effects off its existing per-date invocation: a SKIP on `fromDate`, an ADD (with the real `RouteStopId`/minutes/sequence, looked up via a new `StopMeta` dictionary) on `toDate`. Also: `TimeShift` (type 5) was a documented no-op — the resolver comment claimed "DayScheduler applies the window later" but neither read `params_json`. Fixed by adding `ProjectedVisit.PinnedStart`, set by the resolver's TimeShift phase and honored by `DayScheduler` as a "no-earlier-than" anchor that reflows every visit after it.
- **Why:** No existing patch type fits a two-date effect, and `Apply`'s pure per-date signature is the resolver's core invariant — changing it to see multiple dates at once would ripple through `PlanGenerationService`'s date loop and every existing patch type's semantics. A single MoveVisit row keeps "one patch = one mandatory expiry = one audit/journal entry = atomic" intact, and auto-revert on expiry is free (the resolver just stops applying either half once `EndsOn` lapses — no compensating action needed, identical to every other patch type).
- **Alternatives rejected:** Two linked SkipStore+AddStore patches (two rows, two expiries that can drift apart, worse audit story — a partial revert could leave a visit missing from both dates). Overloading `TimeShift` with an optional target-date field (no new enum value, but forks one type into two different mechanics and reads confusingly in the decision journal — "Zaman Kaydır" for what's actually a day-move). Changing `PatchResolver.Apply` to accept a date range and resolve multi-date effects internally (bigger blast radius — every existing caller and test assumes single-date resolution).
- **Consequences:** `docs/API.md`/`docs/DATABASE.md` document the `params_json` shapes for both types; `EVO-Route-Planning-Design.md` §2.5 flagged with a build note (never contradict the design log silently, CLAUDE.md rule 5) rather than silently diverging. No DB migration — `patch.type` has no CHECK constraint and `params_json` is already `nvarchar(max)`. `PlannedVisitDto` gained `routeStopId` so the panel can correlate a dragged block to its stop without a second lookup. `UpdateStop.serviceMinutes` gained a 5-minute snap + `[10,240]` clamp (previously unclamped) to back the drag-edge-to-extend-duration interaction (client-side "store-permanent" scope only per spec 007 Clarification #4 — dated/route/format duration scopes stay deferred to M2's task/rule engine).

## 2026-07-17 — 006-planner-ui: geo API + batch reorder folded into the UI spec, library choices, visual-parity pass added as Phase 9
- **Decision:** The planner UI spec (006) owns two small backend additions rather than splitting a separate geo-API spec: `GET /stores/geo` (bulk lat/lng + chain/category + active-route flag + 6-month revenue, since 005's `StoreSummaryDto` carries no coordinates) and `POST /routes/{id}/stops:reorder` (batch sequence update, since 005 only exposed per-stop `PATCH` and a drag-drop reorder needs one call, not N). Frontend stack: MapLibre GL JS (vector rendering, better clustering than Leaflet for hundreds of pins), dnd-kit (schedule/stop drag), Zustand (shared workspace selection/filter store) + TanStack Query (server cache, invalidated on every mutation for live health/schedule refresh), react-i18next (`tr.json`, i18n-ready per CLAUDE.md), Recharts (declarative, minimal custom SVG needed for the 3 health visuals — visx's low-level control wasn't worth the extra code for an internal tool).
- **Why:** The UI's flagship pane (map) was literally unbuildable against 005's API as shipped — no coordinates on any list endpoint. Keeping the geo endpoint in 006 (not a separate spec) avoided an extra checkpoint cycle for a two-endpoint addition the UI can't function without.
- **Alternatives rejected:** Leaflet (simpler but weaker at hundreds of pins), react-dnd (older, dnd-kit is the modern default), React Context instead of Zustand+Query (too much manual cache-invalidation boilerplate for a workspace this stateful), Recharts alternatives (visx too low-level for 3 simple charts).
- **Consequences:** Explicitly deferred out of 006 (later specs): Conflict Center/Sorun Merkezi, `POST /simulate/route`, history timeline, live-location layer, Onarım workbench, full-canvas 6-tab table, Effective/Base toggle, numbered map markers + route polylines. After Phase 5, the user flagged that the built panes didn't visually/logically match `evo-planner-prototype-v0.5.html` — Phases 1-5 used generic inline styles rather than rigorously porting the prototype's actual CSS. Added **Phase 9 — visual-parity pass** to 006 (spec Clarification #15): finish functional Phases 6-8 first, then a dedicated pane-by-pane pass against the prototype's real CSS before closing the spec.
- **Related bugfix, same session:** WebApplicationFactory-based API tests (`StoreEndpointTests`, `RouteEndpointTests`, and 10 others) were booting against the same `EvoDb` the local dev server uses; several wipe `Routes`/`RouteStops`/etc. for isolation, so every `dotnet test` run silently erased the seeder's demo data. Added `EvoApiTestFactory` redirecting those tests to a dedicated `EvoDb_ApiTests` database (mirroring the already-isolated `EvoDb_RoutingTests` tests), with a static lock serializing the one-time migration across the ~12 affected test classes (each gets its own factory instance via xUnit's `IClassFixture`, racing the same `CREATE DATABASE` otherwise).

## 2026-07-17 — decision_journal lands in 005 (not deferred further)
- **Decision:** `decision_journal` (Kind/Description/Reason/Objective/ErrorsJson/AuthorId) ships
  in spec 005 as its own table, distinct from `audit_log` — publish-with-errors overrides write
  a row here, not to the generic audit table.
- **Why:** The publish gate ("never block, always justify") is core to this spec's domain rules;
  a Route can't publish past an Error finding without a recorded reason+objective, so the journal
  had to exist the moment the publish endpoint did.
- **Consequences:** `docs/DATABASE.md` documents it alongside `route`/`route_stop`/etc. No read
  endpoint exists yet for `decision_journal` (only written, and read directly by tests) — a
  `GET`/listing surface is deferred to the planner-UI spec if the human wants one.

## 2026-07-17 — route_change_log realized as a facade over audit_log (not a new table)
- **Decision:** `Evo.Api.Audit.IRouteChangeLog` wraps spec 003's generic `IAuditWriter`,
  writing with `EntityType="Route"` — no new `route_change_log` table.
- **Why:** Consistent with the 2026-07-16 decision that collapsed `route_change_log` and
  `admin_audit_log` into one generic `audit_log` table before either owning entity existed.
  Now that Route exists, the facade is the "typed query helper" that decision already promised.
- **Consequences:** Route-history queries go through `audit_log` filtered by `EntityType`/
  `EntityKey`, same as any other entity's audit trail — no schema change, no migration.

## 2026-07-17 — M1-core validation subset for spec 005 (rest deferred)
- **Decision:** Spec 005 implements V1/V2 (450-min rule), V3 (geo-scope), V5 (revenue), V6
  (SERVICE-mix cap), V7 (time-window/ban), V9 (mandatory patch expiry), V12 (visit overlap).
  V8 and V16 are deferred without a named successor spec; V10/V11 (task/rule-derived duration)
  wait on the M2 task/rule engine; V13/V15 (travel-time-dependent) wait on the OSRM/geo layer;
  V14 (leave/Onarım workbench) waits on M4.
- **Why:** The deferred rules all depend on modules that don't exist yet (task/rule engine,
  travel-time integration, leave management) — implementing them now would mean stubbing their
  dependencies, not really implementing the rule.
- **Consequences:** `RouteValidator.Evaluate` and the `/publish` endpoint only ever surface this
  subset; `docs/DATABASE.md` and `EVO-Route-Planning-Design.md`'s validation table should be
  read alongside this note so the gap doesn't read as an oversight.

## 2026-07-17 — M1 visit duration = service_minutes fallback, not task-sum (spec 005)
- **Decision:** `PlanGenerationService` resolves each visit's minutes as
  `route_stop.service_minutes ?? store.default_service_minutes ?? settings.default_service_minutes`
  — never `Σ task.duration` from the design's Rules engine, because that engine is M2.
- **Why:** Route/Assignment/scheduling needed to ship in M1 without waiting on Task/Rule/M2; a
  fallback chain lets the pure `DayScheduler`/450-min logic work today with a real, planner-
  editable number.
- **Consequences:** Once M2 lands, `PlanGenerationService`'s minutes-resolution step gets a
  fourth option ahead of the fallbacks (task-sum takes priority when Rules exist for a store);
  no schema change needed on `route_stop` — `service_minutes` still means "planner override".

## 2026-07-17 — Planner UI split out of spec 005; 005 is the M1 backend core only
- **Decision:** Spec 005 ("route-planning-core") delivers Route/RouteStop/Assignment/Patch/
  PlannedVisit entities, the scheduling engine, validation, and the full REST API — but no
  panel UI (map/schedule grid/table, lasso, live health card, simulate). `merchandiser` also
  ships here, correcting `docs/DATABASE.md`'s prior (inaccurate) attribution to 002-auth-roles.
- **Why:** Matches the 001–004 backend-first rhythm this project has followed for every prior
  spec; the drag-heavy planner UI is a large, separately-reviewable unit of work that depends on
  the API surface being stable first.
- **Consequences:** The next M1 spec is the planner UI, built against 005's generated TS client.
  `POST /simulate/route` is deferred to that spec (or a geo-focused one) since it needs the
  panel's what-if interaction model to be meaningful.

## 2026-07-16 — Real EVO sales sync source remains an open customer-IT question (spec 004)
- **Decision:** Spec 004 ships only an `IStoreSyncSource` abstraction + a deterministic
  `FakeStoreSyncSource` for dev/seed/test — no real connector to the EVO sales system (live SQL
  connection, file drop, or API) exists. Same seam pattern as spec 002's `AddEvoAuthentication`
  Entra extension point.
- **Why:** How EVO's backend actually reaches the sales system — which DB/view/API, field→column
  mapping, source auth, full-refresh-vs-incremental — is one of the 9 open customer-IT questions
  from the tech-stack review. Building against a guessed schema now risks a wrong contract.
- **Consequences:** M0 platform foundation is complete with store data flowing entirely from fake
  data. The real source, store-disappearance policy (auto-deactivate vs tombstone vs flag), and
  wall-clock sync scheduling (vs the current configurable interval) all stay open — revisit once
  customer IT answers land. See `specs/004-store-sync/spec.md` Open questions.

## 2026-07-16 — chain modeled as a real lookup entity (deviation from planner recommendation)
- **Decision:** `chain(id, name)` is a real EF entity with `store.chain_id` FK, upserted by sync
  (find-or-create by name). The planner had recommended a denormalized `chain` string column on
  `store` instead, since no chain-management feature exists yet to own a `chain` table.
- **Why (human's call, overriding the recommendation):** chain is foundational structure —
  chain-scoped Rules, map color-coding, and chain filters all appear in the design doc (§2.9/§6.1)
  — not speculative. Modeling it as a real entity from the first synced store avoids a later
  string→FK migration + de-duplication pass once a chain-management feature does land.
- **Consequences:** `chain` ships now with exactly one consumer (store sync) and no
  chain-management UI/API — same shape spec 003's `audit_log` collapse avoided, but here the human
  chose the opposite tradeoff deliberately. `docs/DATABASE.md` documents this as outside design §5.

## 2026-07-16 — Store geography via NetTopologySuite now; no spatial queries until M1
- **Decision:** `store.Location` is a SQL Server `geography` `Point` (SRID 4326) via
  `Microsoft.EntityFrameworkCore.SqlServer.NetTopologySuite`, with a spatial index added via raw
  SQL in the `AddStores` migration (EF Core doesn't emit `CREATE SPATIAL INDEX` automatically).
  No spatial query endpoints (bbox, lasso, in-scope, overlap) exist in spec 004 — the point is
  only written and read back.
- **Why:** Storing the real point now means M1's spatial features (the map, lasso-add, geo-scope
  enforcement) need no data backfill — the PostgreSQL→SQL Server `geography` mapping decided in
  principle in spec 001 gets its first real implementation here.
- **Consequences:** `docs/DATABASE.md`'s PG→SQL Server mapping table now documents the concrete
  realization. `NetTopologySuite` is wired on every `UseSqlServer` call site (Api, Seeder); the
  test suite needed a dedicated database (`EvoDb_StoreSyncTests`) since `FakeStoreSyncSource`'s
  deterministic `EvoStoreId`s would otherwise collide across test runs sharing the dev DB.

## 2026-07-16 — Sync overwrites synced fields, preserves planner-owned fields, never auto-deactivates
- **Decision:** `StoreSyncService` overwrites `Name`, `ChainId`, `Location`, `Channel`,
  `Province`/`District`/`Neighborhood`, `Category`, `Format`, and revenue/flags on every run, but
  never touches `DefaultServiceMinutes` or `Active` (planner-owned). Stores present in the DB but
  absent from a sync batch are left completely untouched — no auto-deactivate, no delete.
- **Why:** Matches the design doc's planner-set vs sync-set field split and the project-wide
  no-delete rule. Guessing a disappearance policy (deactivate? tombstone? flag for review?) without
  knowing whether the real feed is full-refresh or incremental would likely be wrong.
- **Consequences:** `store_revenue` retains only the latest 12 months (older rows pruned each
  sync) — confirm this window still suits the panel's revenue math once M2 needs it. Fixed
  `store_type` taxonomy (codes 1–6, migration-seeded, not admin-editable) — a per-chain taxonomy
  was explicitly reverted in the design doc.

## 2026-07-16 — decision_journal deferred to M1
- **Decision:** The `decision_journal` table (design §11.3/§755 — the "why" behind
  publish-with-errors, repairs, and permanents; distinct from the generic `audit_log`, which
  records the "what") is out of scope for spec 003. It ships with M1 alongside Routes/Patches,
  the first entities it has anything to record decisions about.
- **Why:** Nothing exists yet for a publish-gate override to override — building it now would be
  speculative and likely need rework once Routes/Patches define the real shape of what's overridden.
- **Consequences:** `docs/AUTH.md`/`docs/API.md` do not mention it; flag it explicitly in the M1
  spec's clarifications so it isn't silently dropped.

## 2026-07-16 — Generic append-only audit_log replaces route_change_log/admin_audit_log for now
- **Decision:** Spec 003 built one generic `audit_log` table (`ActorId`, `OccurredAt`,
  `EntityType`, `EntityKey`, `Event`, `BeforeJson`/`AfterJson`) instead of the design doc's two
  separate tables (`route_change_log`, `admin_audit_log`, design §5/§2.7). Write-only via
  `IAuditWriter` (no update/delete). Currently used by `UsersController` and
  `AuthController.change-password`; `route_change_log`/`admin_audit_log` become typed facade
  queries over this same table once Routes/Settings exist.
- **Why:** Neither design-doc table has an owning entity yet (Route, Setting) — building two
  near-identical, mostly-empty tables now would be premature; a single generic table lets
  security-relevant actions (user lifecycle events) get recorded starting today.
- **Alternatives rejected:** two separate physical tables now (structurally identical, no
  consumers yet); event-sourcing/outbox (over-engineered for a single VM, 2 roles); DB triggers
  (invisible, hard to test, can't cleanly capture the acting user).
- **Consequences:** `docs/DATABASE.md` documents this deviation against design §5. No schema
  change expected when Routes/Settings land — just query-layer facades.

## 2026-07-16 — Unified API error shape (AddProblemDetails + IExceptionHandler, stable code, prod hides details)
- **Decision:** Every non-2xx API response uses one shape: `code` (stable English key), `title`/
  `detail` (English, dev-facing), `userTitle`/`userMessage` (Turkish, see the entry below),
  `status`, `traceId`, no RFC 7807 `instance`, `errors={field:[msg]}` on validation failures.
  Built entirely on ASP.NET Core's built-in pipeline: `AddProblemDetails(CustomizeProblemDetails)`
  normalizes every framework-generated ProblemDetails; a domain-exception taxonomy
  (`EvoException` → `NotFoundException` 404, `ConflictException` 409, `EvoValidationException`
  422) is mapped by an `IExceptionHandler`; a custom `InvalidModelStateResponseFactory` renders
  model-binding failures (400) in the same shape. Unhandled exceptions never leak
  message/stack outside `Development`. Spec 002's `AuthController`/`UsersController` are
  retrofitted onto this shape in the same spec (003).
- **Why:** No hand-rolled middleware needed — the built-in customization hooks cover every case
  (auth short-circuits, model-binding, thrown exceptions) without duplicating framework
  machinery. `EvoValidationException` (422) vs model-binding (400) — same `code`, different
  status — distinguishes "well-formed but violates a domain rule" from "malformed request."
- **Consequences:** `docs/API.md` documents the shape; `docs/AUTH.md`'s formerly-interim shape
  section now points here. The 15 pre-existing spec 001/002 tests needed exactly one assertion
  updated (change-password wrong-current-password: 400→422) — everything else asserted
  content-type/status only, not shape internals, confirming the retrofit was low-risk as planned.

## 2026-07-16 — Error responses carry Turkish userTitle/userMessage from an in-code catalog, not a DB table
- **Decision:** The unified error shape (spec 003) gained `userTitle`/`userMessage` fields
  (Turkish, user-facing) alongside the existing `title`/`detail` (English, developer-facing).
  These are resolved from `Evo.Domain.Errors.UserErrorMessages` — a static in-code dictionary
  keyed by the stable `code`, with a generic fallback for unmapped codes — attached to every
  error response via `EvoProblemDetails.Finalize`. The panel displays `userMessage` directly and
  maintains no translation map of its own.
- **Why:** Raised mid-implementation (after the spec 003 Phase 1 checkpoint) — the human wants
  user-facing error text manageable "from the backend" without a database round-trip on every
  error response (explicitly rejected: "no db is bad, for every error we connect to db"). An
  in-code catalog is standard practice (Stripe/GitHub-style): error text is part of the API
  contract, deploy-reviewed like any other code change, and doesn't add a DB dependency to the
  failure path — important since the DB itself may be why a request failed.
- **Alternatives rejected:** a DB-backed `error_message` table (runtime-editable, but couples the
  error path to the database and needs a lookup/cache layer); repurposing `title`/`detail` as the
  user-facing fields (would have required reworking the already-committed Phase 1 error-shape
  work; additive fields kept that work intact).
- **Consequences:** Phase 4 (panel) simplified — the originally-planned client-side Turkish
  `code`→message map (`panel/src/api/errorMessages.ts`) is dropped; the panel's `ApiError` parser
  just surfaces the backend-provided `userMessage`. Every new `ErrorCodes` entry going forward
  needs a matching `UserErrorMessages` catalog entry (falls back to a generic Turkish message
  otherwise, so nothing breaks if forgotten — but the UX degrades to generic text).

## 2026-07-16 — Local ASP.NET Identity now; AD/Entra as an extension seam; JWT + rotating refresh
- **Decision:** Spec 002 implements local ASP.NET Identity auth (JWT bearer access token in
  panel memory, rotating refresh token in an httpOnly cookie) as the must-have baseline. AD/Entra
  SSO gets a documented extension seam (`AddEvoAuthentication` in
  `backend/src/Evo.Api/Auth/AuthenticationExtensions.cs`) — zero real Entra/OIDC code. Auth
  errors use ASP.NET Core's built-in `ProblemDetails` as an interim shape; spec 003 (error-audit)
  will unify it project-wide — this is a known, accepted cross-spec dependency, not a silent gap.
- **Why:** Whether the customer wants AD/Entra is one of the 9 open customer-IT questions;
  building it now risks throwaway work. Local Identity unblocks everything downstream (roles,
  authorization, seeded test accounts) without waiting on that answer.
- **Alternatives rejected:** Building a working Entra OIDC flow now (premature — no customer
  confirmation); third-party IdP/IdentityServer (overkill for 2 roles on a single VM);
  cookie-only session auth (bearer semantics are reusable by the deferred mobile app later).
- **Consequences:** See `docs/AUTH.md` for the full token model, endpoint list, and the
  step-by-step Entra plug-in guide. Field agents have no account-creation API — seeder-only,
  since mobile is deferred (consistent with the mobile-deferred decision below). The committed
  dev JWT signing key (`JwtSettings.WellKnownDevSigningKey`) follows the same "commit a
  clearly-labeled, code-enforced dev-only secret" pattern already used for the dev SQL Server
  password (spec 001) — `Program.cs` refuses to start with that value outside `Development`.

## 2026-07-15 — MinIO remapped to host ports 9010/9011
- **Decision:** `docker-compose.dev.yml` maps MinIO to host ports 9010 (API) / 9011 (console) instead of the default 9000/9001.
- **Why:** Ports 9000/9001 were already bound by another local project's container on the dev machine.
- **Consequences:** Local-only; document actual ports in `docker-compose.dev.yml` comments and README. No effect on deployed environments.

## 2026-07-15 — Panel pins TypeScript ~5.9, uses eslint+prettier (not the Vite template defaults)
- **Decision:** `npm create vite@latest -- --template react-ts` (current version) scaffolds `oxlint` and a TypeScript 6.0.x pre-release. Replaced with eslint (flat config) + prettier per CLAUDE.md conventions, and pinned `typescript` to `^5.9` (stable).
- **Why:** `openapi-typescript`'s peer dependency requires `typescript ^5.x`; TS 6.0.x isn't out of preview and broke `npm install`. eslint+prettier is the CLAUDE.md-mandated toolchain.
- **Consequences:** Revisit the TS pin when 6.x stabilizes and `openapi-typescript` supports it.

## 2026-07-15 — Swashbuckle for OpenAPI generation (not NSwag)
- **Decision:** `Swashbuckle.AspNetCore` (+ `Swashbuckle.AspNetCore.Cli` as a local dotnet tool) generates the OpenAPI doc. A post-build MSBuild target (`GenerateOpenApiDoc` in `Evo.Api.csproj`, Debug config only) runs `dotnet tool run swagger tofile` to emit `contracts/openapi.json` on every build. Replaced ASP.NET Core's built-in `Microsoft.AspNetCore.OpenApi`/`AddOpenApi()` (which was in the webapi template) since it duplicates Swashbuckle's job.
- **Why:** Most common ASP.NET Core OpenAPI generator, broad tooling support, plays cleanly with `openapi-typescript` on the panel side (Task 9) rather than coupling client generation to NSwag's own templates.
- **Alternatives rejected:** NSwag — can generate the TS client directly, but heavier toolchain and less flexible for this project's controller-based API.
- **Consequences:** `contracts/openapi.json` is regenerated by `dotnet build backend/Evo.sln`; CI (Task 14) must include a drift check (regenerate, fail if `git diff` isn't empty).

## 2026-07-15 — Backend targets .NET 10 SDK, not .NET 8, for spec 001 scaffold
- **Decision:** Only .NET 10 SDK (10.0.302) was available on the dev machine; scaffolded `backend/` targets .NET 10, pinned via `backend/global.json`, instead of the .NET 8 named in the tech-stack Rev. 2 decision above.
- **Why:** Installing .NET 8 side-by-side required an interactive sudo install the human deferred; unblocking spec 001 was prioritized over exact version match.
- **Alternatives rejected:** Blocking spec 001 until .NET 8 is installed.
- **Consequences:** Revisit before production/customer deployment — confirm which .NET version the customer's IT actually supports (see 9 open customer-IT questions) and retarget if needed. Nothing in spec 001's scope (health endpoint, EF Core wiring) is .NET-8-specific.

<!-- Append-only. Never delete entries. Newest first.
     NOTE: the design doc §10 "Decided" table is the authoritative log of ~40 product/UX
     decisions (roles, grid style, patch model, no-delete lifecycle, publish gate, table mode…).
     This file records BUILD decisions made after design v0.5. Never contradict §10 silently. -->

## 2026-07-15 — Mobile app deferred; field behavior seeded/mocked; direct-to-DB seeder
- **Decision:** No React Native app in current scope. Field-agent behavior (check-ins, visit outcomes, task results, notes) is produced by the `Evo.Seeder` console app writing realistic fake data directly to the DB (Bogus, Turkish locale, `demo`/`scale` profiles); agent-facing API responses are mocked where the panel needs live interaction. Every spec that adds tables extends the seeder in the same spec.
- **Why:** Focus the build on the planner panel — the product's core; the mobile surface is read-only and can be simulated cheaply.
- **Alternatives rejected:** Building mobile in parallel (splits focus, needs device testing); API-level fixtures only (doesn't exercise real DB constraints/queries the way seeded rows do).
- **Consequences:** Planned-vs-realized, analytics, and Onarım develop against seeded outcomes; mobile revived from backlog later — its API contract already exists in docs/API.md so nothing blocks it.

## 2026-07-15 — SQL Server replaces PostgreSQL/PostGIS from the design doc
- **Decision:** Database is SQL Server (tech stack Rev. 2, customer standard). Design doc §5 was written assuming PostgreSQL + PostGIS + JSONB.
- **Why:** Customer corporate standard; their team maintains it (EVO-Teknoloji-Yigini.pdf).
- **Alternatives rejected:** PostgreSQL — technically preferred (PostGIS, JSONB, partial indexes) but conflicts with customer ops.
- **Consequences:** §5 schema must be adapted in spec 003/later: `geography` → SQL Server geography type; `jsonb` → JSON in nvarchar(max) + `ISJSON` checks (GIN index on rule.condition needs a computed-column strategy); partial unique indexes → filtered unique indexes (supported); `text[]` districts → JSON or child table. Flag any §5 feature that doesn't map cleanly.

## 2026-07-15 — Tech stack Rev. 2 adopted (see EVO-Teknoloji-Yigini.pdf)
- **Decision:** .NET 8 (ASP.NET Core Web API + EF Core), React+TS panel, React Native (Expo) Android app, OpenAPI contract-first with generated TS clients, MinIO photos, OSRM travel times, FCM notifications, ASP.NET Identity (+AD/Entra option), Docker or IIS deployment.
- **Why:** Customer ecosystem alignment (backend/DB); most mature ecosystems for the drag-heavy panel (React) and offline sync (React Native/WatermelonDB).
- **Alternatives rejected:** Blazor Server (latency on drag interactions), Blazor WASM (weak library ecosystem), MAUI (immature offline sync/photo upload libraries).
- **Consequences:** Clients never hand-write API types; single VM scale ceiling accepted (~75k visits/day — no microservices); 9 customer-IT questions still open and may adjust deployment/identity details.

## 2026-07-15 — AI engineering OS installed; process rules in CLAUDE.md
- **Decision:** Spec-driven build with platform specs first (001-scaffold → 002-auth → 003-error-audit → 004-store-sync), linear (no parallel sessions), checkpoints every phase.
- **Why:** Cross-cutting layers must exist before 10+ modules reference them; solo developer learning the workflow.
- **Consequences:** No module work until M0 complete.
