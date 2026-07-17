# Tasks: Schedule drag / resize / cross-day move (007-schedule-drag-resize)

<!-- Granularity: each task ≈ 2–5 min, doable with NO project context. Exact files + verification.
     [P] = parallelizable with adjacent [P] tasks. HARD STOP (CLAUDE.md rule 3d) at each phase end. -->

---

## Phase 1 — Backend: make same-day TimeShift real

### Task 1.1: Add PinnedStart to ProjectedVisit
- Files: `backend/src/Evo.Domain/Scheduling/PatchResolver.cs`
- Do: Add a trailing `TimeOnly? PinnedStart = null` parameter to the `ProjectedVisit` record (positional).
  Because it is defaulted/last, existing positional constructions keep compiling.
- Verify: `dotnet build backend/Evo.sln` compiles (record change only).
- Status: [x]

### Task 1.2: Create the pure PatchParams JSON helper
- Files: `backend/src/Evo.Domain/Scheduling/PatchParams.cs` (new)
- Do: Add `public static class PatchParams` with `record TimeShiftParams(int StartMinutes)` and
  `record MoveVisitParams(DateOnly FromDate, DateOnly ToDate, int? StartMinutes)`, plus
  `bool TryParse<T>(string? json, out T? value)` wrappers using `System.Text.Json`
  (`PropertyNameCaseInsensitive = true`); catch/return false on null/empty/malformed JSON (never throw).
- Verify: `dotnet build backend/Evo.sln` compiles.
- Status: [x]

### Task 1.3: TimeShift sets PinnedStart in PatchResolver
- Files: `backend/src/Evo.Domain/Scheduling/PatchResolver.cs`
- Do: Replace the no-op TIME_SHIFT comment block with a loop over applicable `PatchType.TimeShift` patches:
  `PatchParams.TryParse<TimeShiftParams>(patch.ParamsJson, out var p)`; for each `result[i]` whose
  `StoreId == patch.StoreId`, set `result[i] = result[i] with { PinnedStart =
  TimeOnly.FromTimeSpan(TimeSpan.FromMinutes(p.StartMinutes)) }`. Skip patches that fail to parse. Keep the
  phase between the SKIP and ADD loops (SKIP > TIME_SHIFT > ADD).
- Verify: `dotnet build backend/Evo.sln` compiles.
- Status: [x]

### Task 1.4: DayScheduler honors a pinned start + reflows
- Files: `backend/src/Evo.Domain/Scheduling/DayScheduler.cs`
- Do: Change the `orderedVisits` tuple type to
  `(Guid RouteStopId, Guid StoreId, int Minutes, TimeOnly? PinnedStart)`. In the loop, compute
  `var start = pinnedStart is { } pin && pin > cursor ? pin : cursor;` then apply the existing break-push,
  then `cursor = end`. (A pin only ever delays; earlier-than-cursor clamps to cursor.)
- Verify: `dotnet build backend/Evo.sln` compiles.
- Status: [x]

### Task 1.5: Thread PinnedStart through PlanGenerationService
- Files: `backend/src/Evo.Infrastructure/Routing/PlanGenerationService.cs`
- Do: In the `DayScheduler.ScheduleDay(...)` call, change the projection to
  `ordered.Select(v => (v.RouteStopId, v.StoreId, v.Minutes, v.PinnedStart)).ToList()`.
- Verify: `dotnet build backend/Evo.sln` compiles.
- Status: [x]

### Task 1.6 [P]: DayScheduler pinned-start unit tests
- Files: `backend/tests/Evo.Tests/Scheduling/DaySchedulerTests.cs` (extend or create)
- Do: Add tests: (a) a visit with `PinnedStart = 10:00` in a day starting 09:00 starts at 10:00 and the next
  visit reflows after it; (b) a pin earlier than the cursor clamps to the cursor; (c) a pin overlapping a
  break pushes past the break.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~DaySchedulerTests` green.
- Status: [x]

### Task 1.7 [P]: PatchResolver TimeShift unit tests
- Files: `backend/tests/Evo.Tests/Scheduling/PatchResolverTests.cs`
- Do: Add tests: a TimeShift patch with `ParamsJson={"startMinutes":600}` sets `PinnedStart` on the matching
  store's visit; a malformed `ParamsJson` leaves `PinnedStart` null (no throw).
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~PatchResolverTests` green.
- Status: [x]

### Task 1.8: PlanGenerationService end-to-end TimeShift test
- Files: `backend/tests/Evo.Tests/Routing/` (new `PlanGenTimeShiftTests.cs`, follow existing PlanGen test setup)
- Do: Seed a route with two sequential stops; add an active TimeShift patch pinning the first store later;
  regenerate; assert the stored `PlannedStart` of that store's visit equals the pin and the second visit's
  start moves accordingly.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~PlanGenTimeShift` green.
- Status: [x]

> **CHECKPOINT** after Phase 1: summarize, show `dotnet test backend/Evo.sln` count, commit
> `feat(007): real same-day TimeShift resolution in the scheduling engine`, END TURN.

---

## Phase 2 — Backend: cross-day MoveVisit patch type

### Task 2.1: Add PatchType.MoveVisit = 6
- Files: `backend/src/Evo.Domain/Scheduling/PatchType.cs`
- Do: Add `MoveVisit = 6,` to the enum.
- Verify: `dotnet build backend/Evo.sln` compiles; add a one-line xUnit assert `((byte)PatchType.MoveVisit)
  == 6` in `PatchResolverTests` (guards the wire value).
- Status: [x]

### Task 2.2: Add StopMeta + extend PatchResolver.Apply signature
- Files: `backend/src/Evo.Domain/Scheduling/PatchResolver.cs`
- Do: Add `public record StopMeta(Guid RouteStopId, int Minutes, int Sequence);`. Add an optional last
  parameter `IReadOnlyDictionary<Guid, StopMeta>? stopMetaByStoreId = null` to `Apply`; inside, coalesce to
  an empty dictionary.
- Verify: `dotnet build backend/Evo.sln` compiles (existing single-arg callers still valid).
- Status: [x]

### Task 2.3: MoveVisit remove-on-FromDate (SKIP phase)
- Files: `backend/src/Evo.Domain/Scheduling/PatchResolver.cs`
- Do: In the SKIP phase, add a loop over applicable `MoveVisit` patches; if
  `PatchParams.TryParse<MoveVisitParams>(patch.ParamsJson, out var mp)` and `mp.FromDate == date`,
  `result.RemoveAll(v => v.StoreId == patch.StoreId)`.
- Verify: `dotnet build backend/Evo.sln` compiles.
- Status: [x]

### Task 2.4: MoveVisit add-on-ToDate (ADD phase)
- Files: `backend/src/Evo.Domain/Scheduling/PatchResolver.cs`
- Do: In the ADD phase, add a loop over applicable `MoveVisit` patches; if parsed and `mp.ToDate == date`
  and `patch.StoreId` has an entry in `stopMetaByStoreId`, add a `ProjectedVisit(meta.RouteStopId,
  storeId, date, meta.Minutes, patch.CoverMerchandiserId ?? default merchandiser, PlannedVisitSource.Patch,
  patch.Id, PinnedStart: mp.StartMinutes is {} sm ? TimeOnly.FromTimeSpan(TimeSpan.FromMinutes(sm)) : null)`.
  Skip if no stop meta (defensive).
- Verify: `dotnet build backend/Evo.sln` compiles.
- Status: [x]

### Task 2.5: Build stopMetaByStoreId in PlanGenerationService + pass it
- Files: `backend/src/Evo.Infrastructure/Routing/PlanGenerationService.cs`
- Do: Before the date loop, build `var stopMeta = stops.ToDictionary(s => s.StoreId, s => new
  PatchResolver.StopMeta(s.Id, <minutes as computed for baseline>, s.Sequence));` (reuse the same minutes
  fallback: `s.ServiceMinutes ?? store.DefaultServiceMinutes ?? settings.DefaultServiceMinutes`). Pass
  `stopMeta` as the new `Apply` argument. Note: a store maps to at most one active stop (one-active-route),
  so the dictionary key is safe.
- Verify: `dotnet build backend/Evo.sln` compiles.
- Status: [x]

### Task 2.6: Update existing PatchResolverTests call sites
- Files: `backend/tests/Evo.Tests/Scheduling/PatchResolverTests.cs`
- Do: No signature change needed for existing calls (new arg is optional) — confirm they still compile; if
  any test now needs stop meta, pass an inline dictionary.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~PatchResolverTests` green.
- Status: [x]

### Task 2.7 [P]: MoveVisit resolver unit tests (core)
- Files: `backend/tests/Evo.Tests/Scheduling/MoveVisitResolverTests.cs` (new)
- Do: Tests: (a) on `FromDate` the store's visit is removed; (b) on `ToDate` it is injected with the stop
  meta's minutes + routeStopId + pinned start; (c) on an unrelated in-window date nothing changes.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~MoveVisitResolver` green.
- Status: [x]

### Task 2.8 [P]: MoveVisit auto-revert + priority + edge tests
- Files: `backend/tests/Evo.Tests/Scheduling/MoveVisitResolverTests.cs`
- Do: Tests: (a) with `date > EndsOn` (patch not applicable) both halves are gone — baseline stands;
  (b) a same-store `SkipStore` on `ToDate` still removes the injected visit (SKIP after MoveVisit-add? —
  assert documented order: SkipStore in SKIP phase removes baseline; MoveVisit-add in ADD phase re-adds, so
  the injected visit survives a SkipStore — assert the actual resolved order and lock it); (c) the
  `ToDate`-already-visited coalesce (two same-stop entries collapse when keyed by RouteStopId — assert the
  resolved list has the injected one).
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~MoveVisitResolver` green.
- Status: [x]

### Task 2.9: PlanGenerationService end-to-end MoveVisit test
- Files: `backend/tests/Evo.Tests/Routing/PlanGenMoveVisitTests.cs` (new)
- Do: Seed a route + stop; add an active MoveVisit patch (fromDate=an occurrence, toDate=another weekday);
  regenerate; assert the `planned_visit` row exists on `toDate` (correct minutes) and is absent on `fromDate`.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~PlanGenMoveVisit` green.
- Status: [x]

> **CHECKPOINT** after Phase 2: summarize, show test count, commit
> `feat(007): cross-day MoveVisit patch type (skip-here + add-there) in PatchResolver`, END TURN.

---

## Phase 3 — Backend: API / DTO / contract plumbing

### Task 3.1: Validate ParamsJson in CreatePatch
- Files: `backend/src/Evo.Api/Controllers/RoutesController.cs` (`CreatePatch`)
- Do: After the `EndsOn` null check, add: if `Type == TimeShift`, require `StoreId != null` and
  `PatchParams.TryParse<TimeShiftParams>(ParamsJson, …)` else throw `EvoValidationException`
  (`paramsJson`/`storeId` keys). If `Type == MoveVisit`, require `StoreId != null`,
  `PatchParams.TryParse<MoveVisitParams>(…)`, and `mp.FromDate != mp.ToDate` (400 otherwise).
- Verify: `dotnet build backend/Evo.sln` compiles.
- Status: [ ]

### Task 3.2: Add RouteStopId to PlannedVisitDto + populate
- Files: `backend/src/Evo.Api/Routing/Dtos/PlanDtos.cs`,
  `backend/src/Evo.Api/Controllers/RoutesController.cs` (`GetPlan`),
  `backend/src/Evo.Api/Controllers/MerchandisersController.cs` (`GetDay`)
- Do: Add `Guid RouteStopId` to the `PlannedVisitDto` record; pass `v.RouteStopId` in both `new
  PlannedVisitDto(...)` constructions.
- Verify: `dotnet build backend/Evo.sln` compiles.
- Status: [ ]

### Task 3.3: Snap/clamp serviceMinutes in UpdateStop
- Files: `backend/src/Evo.Api/Controllers/RoutesController.cs` (`UpdateStop`)
- Do: Where `request.ServiceMinutes is { } minutes`, snap to nearest 5 and clamp `[10,240]` before
  `stop.ServiceMinutes = ...` (`Math.Clamp((int)(Math.Round(minutes/5.0)*5), 10, 240)`).
- Verify: `dotnet build backend/Evo.sln` compiles.
- Status: [ ]

### Task 3.4 [P]: CreatePatch + UpdateStop validation tests
- Files: `backend/tests/Evo.Api.Tests/Routes/PatchParamsValidationTests.cs` (new),
  `backend/tests/Evo.Api.Tests/Routes/` (extend an UpdateStop test file)
- Do: Tests: CreatePatch returns 400 for a TimeShift/MoveVisit with null/garbage params and for a
  MoveVisit with `fromDate == toDate`; UpdateStop persists `237 → 235`, `500 → 240`, `3 → 10`.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~PatchParamsValidation` and the UpdateStop
  test green.
- Status: [ ]

### Task 3.5: Regenerate the contract + TS client
- Files: `contracts/openapi.json`, `panel/src/api/generated/schema.ts` (generated)
- Do: `dotnet build backend/Evo.sln` (regenerates openapi.json), then
  `cd panel && npm run generate-api-client`.
- Verify: `git diff contracts/openapi.json` shows `MoveVisit`/`routeStopId`; `schema.ts` shows
  `routeStopId` on `PlannedVisitDto`; `cd panel && npm run build` green.
- Status: [ ]

### Task 3.6: Docs — API / DECISIONS / DATABASE / design flag
- Files: `docs/API.md`, `docs/DECISIONS.md`, `docs/DATABASE.md`, `EVO-Route-Planning-Design.md`
- Do: API.md — TimeShift/MoveVisit `ParamsJson` shapes, `PlannedVisitDto.routeStopId`, UpdateStop
  snap/clamp. DECISIONS.md — the `MoveVisit = 6` decision + rejected alternatives (from spec.md). DATABASE.md
  — note no schema change; `patch.Type = 6` semantics. Design doc — flag the §2.5 patch-type list gains
  MoveVisit (CLAUDE.md rule 5: never contradict the design log silently).
- Verify: `git diff` shows the four doc updates; grep `MoveVisit` present in each.
- Status: [ ]

### Task 3.7: Full backend + panel build green
- Files: —
- Do: `dotnet test backend/Evo.sln`; `cd panel && npm run build`.
- Verify: backend suite all green (report count); panel build succeeds.
- Status: [ ]

> **CHECKPOINT** after Phase 3: summarize, show test count + contract diff, commit
> `feat(007): CreatePatch param validation, PlannedVisitDto.routeStopId, UpdateStop clamp, contract regen`,
> END TURN.

---

## Phase 4 — Client: pure geometry / reflow / payload math (Vitest, no UI)

### Task 4.1: dragMath.ts
- Files: `panel/src/planner/schedule/dragMath.ts` (new)
- Do: Export `pxToMinutes(px)`, `minutesToPx(min)` (using `PX_PER_MINUTE` from `position.ts`),
  `snapMinutes(min, step=5)`, `clampStart(startMin, durationMin, dayStart, dayEnd)`,
  `clampDuration(min)` → snap-5 then clamp `[10,240]`.
- Verify: file compiles under `npm run build` (after Task 4.2 test also runs).
- Status: [ ]

### Task 4.2 [P]: dragMath.test.ts
- Files: `panel/src/planner/schedule/dragMath.test.ts` (new)
- Do: Assert `snapMinutes(237)===235`, `clampDuration(500)===240`, `clampDuration(3)===10`, `clampStart`
  keeps a block inside 09:00–18:00 (e.g. a late start clamps so end ≤ dayEnd).
- Verify: `cd panel && npm test -- dragMath` green.
- Status: [ ]

### Task 4.3: reflow.ts (client mirror of DayScheduler)
- Files: `panel/src/planner/schedule/reflow.ts` (new)
- Do: Export `reflowDay(visits: {startMin,durationMin}[], changedIndex, newStartMin, newDurationMin,
  breaks)` returning `{startMin,endMin}[]`: pin the changed visit at `max(newStartMin, prevEnd)`, then pack
  every later visit sequentially, each pushed past any overlapping break (same rule as `DayScheduler`).
  Import break windows from `breaks.ts`.
- Verify: compiles.
- Status: [ ]

### Task 4.4 [P]: reflow.test.ts
- Files: `panel/src/planner/schedule/reflow.test.ts` (new)
- Do: Assert: moving visit 0 later slides visits 1..n after it; a change colliding with the lunch break
  pushes the block past 13:30; a `newStartMin` earlier than the predecessor's end clamps to that end.
- Verify: `cd panel && npm test -- reflow` green.
- Status: [ ]

### Task 4.5: patchPayload.ts
- Files: `panel/src/planner/schedule/patchPayload.ts` (new)
- Do: Export `buildTimeShiftPatch`, `buildMoveVisitPatch`, `buildResizeUpdate` returning
  `components['schemas']['CreatePatchRequest']` / `UpdateStopRequest`. TimeShift: type 5,
  `paramsJson=JSON.stringify({startMinutes})`. MoveVisit: type 6,
  `paramsJson=JSON.stringify({fromDate,toDate,startMinutes})`, `startsOn = min(fromDate,toDate)`. Resize:
  `{serviceMinutes}`.
- Verify: compiles.
- Status: [ ]

### Task 4.6 [P]: patchPayload.test.ts
- Files: `panel/src/planner/schedule/patchPayload.test.ts` (new)
- Do: Assert each builder emits the exact `type` and a `paramsJson` that `JSON.parse`s to the expected
  object; MoveVisit `startsOn === min(fromDate,toDate)`.
- Verify: `cd panel && npm test -- patchPayload` green.
- Status: [ ]

### Task 4.7: Shared day-bounds constants
- Files: `panel/src/planner/schedule/position.ts` (or a small `gridConstants.ts`)
- Do: Export `DAY_START_MINUTES = 9*60`, `DAY_END_MINUTES = 18*60` so `SchedulePane`, `dragMath`, and
  `reflow` share one source (SchedulePane currently defines them locally — re-import).
- Verify: `cd panel && npm run build` green; SchedulePane imports the shared constants.
- Status: [ ]

> **CHECKPOINT** after Phase 4: summarize, show `npm test` green for the 4 new suites, commit
> `feat(007): pure drag/reflow/payload math for the schedule grid (Vitest)`, END TURN.

---

## Phase 5 — Client: drag / resize interaction + live rubber-band preview

### Task 5.1: Draggable VisitBlock + bottom-edge resize handle
- Files: `panel/src/planner/components/schedule/VisitBlock.tsx`
- Do: Add pointer-based drag (onPointerDown/Move/Up) reporting a vertical delta and a bottom-edge resize
  zone (last ~6px) reporting a height delta; expose `onDragStart/onDragMove/onDrop` + `onResize*` callbacks
  (state lifted to SchedulePane). Add a `readOnly` prop that disables all handlers.
- Verify: `cd panel && npm run build` green; block still renders.
- Status: [ ]

### Task 5.2: Past-week read-only guard
- Files: `panel/src/planner/components/schedule/SchedulePane.tsx`
- Do: Compute `const isPast = week.from < currentWeek().from;` pass `readOnly={isPast}` to every
  `VisitBlock`; show a small `t('planner.pastWeekReadOnly', …)` hint in the pane head when `isPast`.
- Verify: navigate to a past week in the running panel — blocks are not draggable; current/future weeks are.
- Status: [ ]

### Task 5.3: Per-day drop zones (cross-day target detection)
- Files: `panel/src/planner/components/schedule/SchedulePane.tsx`
- Do: Give each day-cell a ref/index; during a drag, hit-test the pointer x against the day cells to
  determine the hovered target day; highlight it (border/background). Track `{sourceDayIndex,
  targetDayIndex}` in pane drag state.
- Verify: dragging over another column highlights it (visual check in running panel).
- Status: [ ]

### Task 5.4: Live rubber-band reflow preview
- Files: `panel/src/planner/components/schedule/SchedulePane.tsx`, `VisitBlock.tsx`
- Do: On each drag/resize move, compute `reflowDay(...)` for the affected day and render that day's
  downstream blocks at ghost positions (dashed/translucent), with the dragged block following the cursor
  snapped via `snapMinutes`. For a cross-day hover, preview the block in the target column. Revert to query
  data when the drag ends without commit.
- Verify: dragging a block slides the ones below it live (visual check); releasing without saving snaps back.
- Status: [ ]

### Task 5.5: Live day-total recolor (warning-only)
- Files: `panel/src/planner/components/schedule/SchedulePane.tsx`
- Do: During preview, recompute the affected day's minutes from the reflowed set and apply `loadClass`
  (`over` when >450). Never block/prevent the drop.
- Verify: dragging so a day exceeds 450 turns the day-total red mid-drag; the drop still completes.
- Status: [ ]

### Task 5.6: Drop routing — same-day / cross-day / resize
- Files: `panel/src/planner/components/schedule/SchedulePane.tsx`
- Do: On drop, decide: bottom-edge resize → call `useUpdateStop` with `buildResizeUpdate` (clamped minutes);
  same-day move (source day === target day) → open `PatchForm` prefilled TimeShift (storeId, startsOn=visit
  date, startMinutes=snapped drop start); cross-day → open `PatchForm` prefilled MoveVisit (storeId,
  fromDate, toDate, startMinutes). Wire `routeStopId`/`storeId` from `PlannedVisitDto`.
- Verify: each drop type opens the right form / fires the right mutation (manual check + Phase 6 tests).
- Status: [ ]

> **CHECKPOINT** after Phase 5: summarize, give a 1-minute manual UI test script (drag within a day →
> reflow + TimeShift form; drag to another day → MoveVisit form; resize bottom edge → duration change; past
> week inert; >450 recolors), commit `feat(007): schedule drag/resize interaction + live reflow preview`,
> ask the human to run it, END TURN.

---

## Phase 6 — Client: PatchForm extension, wiring, tests, docs

### Task 6.1: Pre-fillable PatchForm + MoveVisit option
- Files: `panel/src/planner/components/editing/PatchForm.tsx`
- Do: Accept optional `prefill?: { type; storeId; startsOn; startMinutes?; fromDate?; toDate? }`; initialize
  state from it; add `{ value: 6, label: t('planner.patchMoveVisit','Ziyareti Taşı (MoveVisit)') }` to
  `PATCH_TYPE_OPTIONS`. When type is TimeShift/MoveVisit, show read-only context (new start / from→to days)
  and build `paramsJson` via `patchPayload.ts` on save. Keep the mandatory-expiry `endsOn`/`expiryInvalid`
  guard untouched.
- Verify: `cd panel && npm run build` green; opening the form from a drop shows prefilled values.
- Status: [ ]

### Task 6.2: Wire drop → mutation through existing hooks
- Files: `panel/src/planner/components/schedule/SchedulePane.tsx`, `panel/src/planner/api/mutations.ts`
- Do: Ensure the TimeShift/MoveVisit save calls `useCreatePatch` with the built `CreatePatchRequest`
  (incl. `paramsJson`) and the resize calls `useUpdateStop`; both already invalidate
  `route`/`plan`/`health`/`stores-geo`. Confirm `paramsJson` flows through `planner.createPatch` unchanged.
- Verify: after saving a TimeShift/MoveVisit, the grid re-materializes and the block appears re-timed/moved.
- Status: [ ]

### Task 6.3 [P]: Drop→payload / wiring Vitest
- Files: `panel/src/planner/components/schedule/dropWiring.test.ts` (new, or colocate)
- Do: With the mutation hooks mocked, assert: a same-day drop passes a TimeShift `CreatePatchRequest` (type
  5, parseable params); a cross-day drop passes a MoveVisit request (type 6, correct from/to/startsOn); a
  resize drop calls `useUpdateStop` with clamped minutes.
- Verify: `cd panel && npm test -- dropWiring` green.
- Status: [ ]

### Task 6.4 [P]: i18n strings
- Files: `panel/src/i18n/locales/tr.json`
- Do: Add keys for move/time-shift labels, over-450 warning, past-week read-only hint, MoveVisit option —
  all referenced via `t()` in the components (no hardcoded literals).
- Verify: `cd panel && npm run lint` green; grep confirms no new hardcoded Turkish literals in the touched
  components.
- Status: [ ]

### Task 6.5: Final lint + test + build + docs
- Files: `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`
- Do: ARCHITECTURE.md — schedule drag/resize + the client `reflow.ts` mirror of `DayScheduler`. ROADMAP.md —
  mark schedule editing landed for M1. DECISIONS.md — client reflow-mirror + duration-as-store-permanent.
  Then run `npm run lint`, `npm test`, `npm run build`.
- Verify: all three panel commands green; `git diff` shows the three doc updates.
- Status: [ ]

> **CHECKPOINT (final phase)** after Phase 6: summarize the whole spec, show full backend + panel test
> results, give the final 1-minute manual UI test script, then run **/end-session** (per CLAUDE.md rule 3d).
