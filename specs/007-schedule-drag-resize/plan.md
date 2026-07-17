# Plan: Schedule drag / resize / cross-day move (007-schedule-drag-resize)

<!-- Owned by: architect/planner. Extends spec 005's scheduling engine + spec 006's schedule pane. -->

## Approach

Build the **engine truth first, then the interaction** — the same order 005/006 followed. The scheduler
must actually honor TimeShift and MoveVisit before the UI can meaningfully drive them, and the client
reflow preview is a *mirror* of `DayScheduler`'s packing rules, so the backend rule is the reference
implementation.

1. **Backend — real same-day TimeShift (Phase 1).** Add `PinnedStart` to `ProjectedVisit`; a pure
   `PatchParams` JSON helper; make `PatchResolver`'s TIME_SHIFT phase set `PinnedStart` from a TimeShift
   patch's `ParamsJson`; make `DayScheduler` honor a pinned start as a "no-earlier-than" anchor and reflow
   downstream; thread it through `PlanGenerationService`.
2. **Backend — cross-day MoveVisit (Phase 2).** Add `PatchType.MoveVisit = 6`; extend `PatchResolver.Apply`
   with an optional `stopMetaByStoreId` map; remove-on-`fromDate` (SKIP phase) + add-on-`toDate` (ADD phase,
   with real stop id/minutes/pinned start); build the map in `PlanGenerationService`. No migration.
3. **Backend — API/DTO/contract (Phase 3).** Validate `ParamsJson` for TimeShift/MoveVisit in `CreatePatch`;
   expose `PlannedVisitDto.routeStopId`; snap/clamp `UpdateStop.serviceMinutes`; regenerate
   `contracts/openapi.json` + `schema.ts`; docs.
4. **Client — pure math (Phase 4).** `dragMath.ts` (px↔min, snap, clamp), `reflow.ts` (client mirror of
   `DayScheduler`), `patchPayload.ts` (TimeShift/MoveVisit/resize builders) — all Vitest, no React.
5. **Client — interaction + live preview (Phase 5).** Draggable/resizable `VisitBlock`; per-day drop zones;
   live rubber-band ghost reflow in `SchedulePane`; live day-total recolor; past-week read-only guard; drop
   handlers routing to PatchForm (same-day/cross-day) or `useUpdateStop` (resize).
6. **Client — PatchForm + wiring + tests + docs (Phase 6).** Pre-fillable `PatchForm` (+ MoveVisit option);
   drop→mutation wiring via existing hooks; Vitest for payload + wiring; i18n; docs.

Backend files under `backend/src/Evo.Domain/Scheduling/` (pure engine) and
`backend/src/Evo.Api/…` (controllers/DTOs). Client files under `panel/src/planner/schedule/` (pure math)
and `panel/src/planner/components/schedule/` + `.../editing/PatchForm.tsx`.

## Contracts touched

- **Changed (additive):** `PatchType` enum gains `MoveVisit = 6`; `PlannedVisitDto` gains `routeStopId`;
  `CreatePatchRequest.paramsJson` now meaningful for TimeShift/MoveVisit. Backend files:
  `backend/src/Evo.Domain/Scheduling/{PatchType,PatchResolver,DayScheduler,PatchParams}.cs`,
  `ProjectedVisit`/`ScheduledVisit` records, `backend/src/Evo.Infrastructure/Routing/PlanGenerationService.cs`,
  `backend/src/Evo.Api/Routing/Dtos/PlanDtos.cs`, `backend/src/Evo.Api/Controllers/RoutesController.cs`
  (`CreatePatch`, `GetPlan`, `UpdateStop`), `backend/src/Evo.Api/Controllers/MerchandisersController.cs`.
- **Regenerated:** `contracts/openapi.json`, `panel/src/api/generated/schema.ts`.
- **Consumed unchanged:** `POST /routes/{id}/patches`, `PATCH /routes/{id}/stops/{stopId}`,
  `GET /routes/{id}/plan`, `GET /routes/{id}/health` (005); the `useCreatePatch`/`useUpdateStop` mutation
  hooks + query invalidation (006).
- **No migration:** `patch.Type` is an unconstrained `byte`; `patch.ParamsJson` is already `nvarchar(max)`.

## Risks

- **Reflow drift (client vs. server).** The client `reflow.ts` must produce the *same* ordering/break-push
  as `DayScheduler`, or the ghost preview lies about the committed result. Mitigation: implement `reflow.ts`
  from the same rules, unit-test both against matching fixtures, and remember the server is the source of
  truth (the preview reverts to query data on cancel; the committed plan re-materializes through the engine).
- **`MoveVisit` onto an already-visited day.** The `(RouteStopId, ToDate)` upsert key coalesces — no crash,
  but the two visits merge. Documented + tested as an accepted edge; not silently wrong.
- **`PinnedStart` earlier than predecessors.** Deliberately clamps to the running cursor (a pin can only
  delay). Documented so it isn't read as a bug when a drag "snaps back."
- **Signature change to `PatchResolver.Apply`.** Existing tests + `PlanGenerationService` call sites must be
  updated in the same phase; the new param defaults to empty so the change is one line per caller.
- **Enum value on the wire.** `MoveVisit = 6` must round-trip through OpenAPI → `schema.ts`; a guard test
  pins the numeric value, and the contract is regenerated in Phase 3.
- **Drag UX flakiness in tests.** Explicitly not e2e-tested; all logic is extracted into pure functions
  (Phase 4) so the risky pixel math is covered by deterministic Vitest, and only the thin pointer-handler
  glue is untested (matches clarification #7).
- **Past-week guard vs. WeekNavigator.** The navigator already lets users reach past weeks (006); the guard
  must key off the *displayed* week, not "today," so a past week is inert but still viewable.
