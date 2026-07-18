# Tasks: Analytics & Onarım (010-analytics-onarim)

<!-- Granularity rule: each task ≈ 2–5 minutes, doable with NO project context.
     Every task names exact files and a concrete verification step. [P] = parallelizable with adjacent [P].
     Q1-Q10 CONFIRMED 2026-07-18. Q1/Q5 diverge from the planner's recommendation (user chose ALL 8
     §8 metrics incl. mobility/override-rate, AND per-visit cross-person Onarım distribution via a new
     CrossReassignVisit patch type) — see spec.md Clarifications for the full rationale.
     Q10 (live-location map layer) stays OUT of these tasks (confirmed deferred).
     Backend targets .NET 10; DB is SQL Server; tests use the isolated EvoApiTestFactory/EvoDb_ApiTests
     pattern (see spec 009 tasks). Regenerate contracts/openapi.json via `dotnet build backend/Evo.sln`. -->

## Phase 1 — Absence model + V14/V8 validators + seeder (backend)

### Task 1: AbsenceReason enum
- Files: `backend/src/Evo.Infrastructure/People/AbsenceReason.cs` (new)
- Do: `public enum AbsenceReason : byte { SickLeave = 1, AnnualLeave = 2, Unpaid = 3, Other = 9 }`. Turkish UI labels live in panel i18n; identifiers stay English (CLAUDE.md).
- Verify: `dotnet build backend/Evo.sln` compiles.
- Status: [x]

### Task 2: Absence entity
- Files: `backend/src/Evo.Infrastructure/People/Absence.cs` (new)
- Do: `public class Absence { public Guid Id; public Guid MerchandiserId; public DateOnly StartDate; public DateOnly EndDate; public AbsenceReason Reason; public string? Note; public Guid? CreatedBy; public DateTimeOffset CreatedAt; }`. `EndDate` inclusive. No delete — absences are historical facts (project no-delete rule).
- Verify: `dotnet build backend/Evo.sln` compiles.
- Status: [x]

### Task 3: Configure Absence in DbContext
- Files: `backend/src/Evo.Infrastructure/EvoDbContext.cs`
- Do: add `DbSet<Absence> Absences`; in `OnModelCreating`: `ToTable("absence")`, FK→`Merchandiser` (`OnDelete(DeleteBehavior.Cascade)`), index on `(MerchandiserId, StartDate, EndDate)` (the V14/Onarım hot path). Optional FK→`AspNetUsers` on `CreatedBy` (`OnDelete(NoAction)`, nullable).
- Verify: `dotnet build backend/Evo.sln` compiles.
- Status: [x]

### Task 4: Migration for absence
- Files: migration under `backend/src/Evo.Infrastructure/Migrations/` (generated)
- Do: `dotnet ef migrations add AddAbsence --project backend/src/Evo.Infrastructure --startup-project backend/src/Evo.Api`
- Verify: migration file creates `absence` with the index from Task 3; `dotnet build backend/Evo.sln` regenerates `contracts/openapi.json` without error.
- Status: [x]

### Task 5: Absence DTOs + create/list endpoints
- Files: `backend/src/Evo.Api/People/Dtos/AbsenceDtos.cs` (new); `backend/src/Evo.Api/Controllers/MerchandisersController.cs` (where `/merchandisers/{id}/day` lives — `grep -rn "merchandisers/{id}/day" backend/src/Evo.Api`)
- Do: `public record AbsenceDto(Guid Id, Guid MerchandiserId, DateOnly StartDate, DateOnly EndDate, AbsenceReason Reason, string? Note, DateTimeOffset CreatedAt);` and `public record CreateAbsenceRequest(DateOnly StartDate, DateOnly EndDate, AbsenceReason Reason, string? Note);`. Add `[HttpPost("{id:guid}/absences")]` (Supervisor only — `[Authorize(Roles = "Supervisor")]`, 422 if `EndDate < StartDate`) and `[HttpGet("{id:guid}/absences")]` (newest-first). POST writes an `audit_log` entry via `IAuditWriter` `entityType=Absence`.
- Verify: `dotnet build backend/Evo.sln`; endpoints appear in `contracts/openapi.json` after build.
- Status: [x]

### Task 6: AbsenceValidator (pure, V14)
- Files: `backend/src/Evo.Domain/Scheduling/AbsenceValidator.cs` (new)
- Do: pure static `Evaluate` taking, per visit, a plain input record `{ Guid MerchandiserId, Guid StoreId, DateOnly Date, int StartMinutes }` plus `IReadOnlyList<(Guid MerchandiserId, DateOnly Start, DateOnly End)> absences` and `IReadOnlyList<(Guid StoreId, DateOnly Start, DateOnly End)> closedStores`; return a `V14` `ValidationFinding(Code:"V14", Severity: Error, Message, Scope: visit scope)` when the merchandiser has an absence covering `Date` OR the store is closed on `Date`. No `Evo.Infrastructure` reference (layering rule — the caller maps entities down to these plain inputs, same as V6's `IsServiceCategory`).
- Verify: `dotnet build backend/Evo.sln`.
- Status: [x]

### Task 7 [P]: AbsenceValidator unit tests
- Files: `backend/tests/Evo.Tests/Scheduling/AbsenceValidatorTests.cs` (new)
- Do: three cases — visit inside an absence window → V14 Error; visit at a ClosedTemp store on that date → V14 Error; clean visit → no finding. Assert code/severity/scope.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~AbsenceValidatorTests` passes.
- Status: [x]

### Task 8: UtilizationValidator (pure, V8)
- Files: `backend/src/Evo.Domain/Scheduling/UtilizationValidator.cs` (new)
- Do: pure static `Evaluate(int weeklyPlannedMinutes, int weeklyCapacityMinutes, double lowerBandPct, double upperBandPct)` → a `V8` Warning finding when `weeklyPlannedMinutes / weeklyCapacityMinutes` is outside `[lower, upper]` (design defaults 0.90–1.05); else none. Message distinguishes under- vs over-allocation.
- Verify: `dotnet build backend/Evo.sln`.
- Status: [x]

### Task 9 [P]: UtilizationValidator unit tests
- Files: `backend/tests/Evo.Tests/Scheduling/UtilizationValidatorTests.cs` (new)
- Do: under-band (e.g. 80%) → V8 under; in-band (95%) → none; over-band (110%) → V8 over; assert band-edge inclusivity.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~UtilizationValidatorTests` passes.
- Status: [x]

### Task 10: Wire V14 into the plan/validate projection
- Files: `backend/src/Evo.Api/Controllers/RoutesController.cs` (plan + validate projection); helper as needed
- Do: after the existing findings are built for `GET /routes/{id}/plan` and `POST /routes/{id}/validate`, load active absences for the route's assigned merchandiser(s) and active `store_flag` ClosedTemp windows for the route's stores, map them to `AbsenceValidator`'s plain inputs, call it per future visit, and merge the returned `V14` findings into each day's `Findings`. Never hard-block (findings only — the publish gate already treats Errors as override-with-reason).
- Verify: `dotnet build backend/Evo.sln`; `grep -n "AbsenceValidator" backend/src/Evo.Api/Controllers/RoutesController.cs`.
- Status: [x]

### Task 11: Wire V8 into route health/validate
- Files: `backend/src/Evo.Api/Controllers/RoutesController.cs` (health or validate projection); read band bounds from `ISettingsProvider`
- Do: add `settings` keys `utilization_band_lower` (0.90) and `utilization_band_upper` (1.05) — extend the settings seed defaults (`grep -rn "plan_horizon_weeks" backend/src` to find the seed list) and add them there. Compute each assigned merchandiser's weekly planned minutes vs `daily_work_minutes × working days`, call `UtilizationValidator`, surface V8 on `POST /routes/{id}/validate` (and include it in the health payload if trivial).
- Verify: `dotnet build backend/Evo.sln`; the two new settings keys appear in the seeded defaults.
- Status: [x]

### Task 12: Integration test — V14 surfaces on a colliding plan
- Files: `backend/tests/Evo.Tests/Routing/AbsenceV14EndpointTests.cs` (new)
- Do: using `EvoApiTestFactory`/`EvoDb_ApiTests`, seed a route + active assignment + a future planned visit, insert an `absence` covering that visit's date, call `POST /routes/{id}/validate`, assert a `V14` Error finding scoped to that visit is returned; a control run without the absence returns none.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~AbsenceV14EndpointTests` passes.
- Status: [x]

### Task 13: Seeder — AbsenceSeederModule (colliding disruptions)
- Files: `backend/src/Evo.Seeder/Modules/AbsenceSeederModule.cs` (new); register in `backend/src/Evo.Seeder/Program.cs` after `RouteSeederModule`/`FieldExecutionSeederModule`
- Do: implement `ISeederModule`; idempotent (skip if `db.Absences.Any()`). Pick ≥2 currently-assigned merchandisers and insert future-dated absences (e.g. a 2–3 day window inside the plan horizon) that overlap at least one of their route's future planned visits; also set ≥1 `store_flag` ClosedTemp window on a store that is on an active route within the horizon (reuse the existing StoreFlag entity — `grep -rn "ClosedTemp" backend/src`). Turkish `Note` via Bogus tr locale.
- Verify: `dotnet run --project backend/src/Evo.Seeder -- --profile demo` then `dotnet run ... --profile demo` again (idempotent, no duplicate absences); `absence` has ≥2 rows.
- Status: [x]

### Task 14: Seeder verification — disruptions actually collide
- Files: none (verification task)
- Do: after seeding, hit `POST /routes/{id}/validate` (or a quick EF query in a test) for a route whose assignee has a seeded absence and confirm `V14` appears; note the route id(s) in the checkpoint message for the manual test script.
- Verify: at least one seeded route returns `V14`.
- Status: [x]

<!-- CHECKPOINT after Phase 1: build + all new tests green; commit; note the V14 route id(s) for the human. -->

## Phase 2 — Plan-health analytics read API (backend)

### Task 15: PlanHealth DTOs
- Files: `backend/src/Evo.Api/Analytics/Dtos/PlanHealthDtos.cs` (new)
- Do: `public record RoutePlanHealthDto(Guid RouteId, string RouteCode, string RouteName, string Province, double CompletionPct, int PlannedMinutes, int RealizedMinutes, double DurationVariancePct, double UtilizationPct, string UtilizationBand, double TaskCompliancePct, IReadOnlyDictionary<string,int> PatchLoad, double StabilityScore, int AssignmentTurnover, double OverrideRatePct, double PlanHealthScore);` and a wrapper `public record PlanHealthReportDto(string? Region, DateOnly From, DateOnly To, IReadOnlyList<RoutePlanHealthDto> Routes);`.
- Verify: `dotnet build backend/Evo.sln`.
- Status: [x]

### Task 16: PlanHealthService — completion % + duration variance (planned-vs-realized)
- Files: `backend/src/Evo.Api/Analytics/PlanHealthService.cs` (new); interface `IPlanHealthService`
- Do: for a route + date window, join `planned_visit` → `visit_realization`; `completionPct = Done / (Done+Missed+Skipped)` from `planned_visit.status`; `plannedMinutes = Σ (PlannedEnd−PlannedStart)`; `realizedMinutes = Σ visit_realization.ActualMinutes`; `durationVariancePct = (realized−planned)/planned`. Pure LINQ aggregation over existing tables (Q9 on-read).
- Verify: `dotnet build backend/Evo.sln`.
- Status: [x]

### Task 17: PlanHealthService — utilization band + task compliance
- Files: `backend/src/Evo.Api/Analytics/PlanHealthService.cs`
- Do: `utilizationPct = weekly planned minutes / weekly capacity`; `utilizationBand` via `UtilizationValidator` bounds (under/ok/over). `taskCompliancePct = Done / (Done+Overdue+Missed)` from `task_instance.status` for the route's visits in-window.
- Verify: `dotnet build backend/Evo.sln`.
- Status: [x]

### Task 18: PlanHealthService — patch load + assignment turnover
- Files: `backend/src/Evo.Api/Analytics/PlanHealthService.cs`
- Do: `patchLoad` = count of `patch` rows for the route in-window grouped by `PatchType` (string keys). `assignmentTurnover` = count of `assignment` rows for the route with `EndDate` inside a trailing 12-month window.
- Verify: `dotnet build backend/Evo.sln`.
- Status: [x]

### Task 19: PlanHealthService — override rate
- Files: `backend/src/Evo.Api/Analytics/PlanHealthService.cs`
- Do: `overrideRatePct` = `task_instance` rows for the route's visits in-window with `OverrideScope=INSTANCE` (an instance override, per spec 008) divided by total `task_instance` rows in-window. Design §8: "high rate → the rule's default is wrong; suggest promoting the common override to the rule" — the ratio only, no auto-promotion suggestion in v1.
- Verify: `dotnet build backend/Evo.sln`.
- Status: [x]

### Task 20: MobilityDto + MobilityService (per-person route/reshuffle count vs regional median)
- Files: `backend/src/Evo.Api/Analytics/Dtos/MobilityDtos.cs` (new); `backend/src/Evo.Api/Analytics/MobilityService.cs` (new); interface `IMobilityService`
- Do: `public record MerchandiserMobilityDto(Guid MerchandiserId, string Name, int DistinctRoutesHeld, int IntraRouteReshuffles, double RegionalMedianRoutesHeld, bool Outlier);`. For a region + trailing-months window: `DistinctRoutesHeld` = count of distinct `assignment.RouteId` for that merchandiser in-window; `IntraRouteReshuffles` = count of `route_change_log`-facade `STOP_MOVED`/reorder events on routes they held in-window (best-effort — reuse the same `audit_log` query pattern as `StabilityService`). `RegionalMedianRoutesHeld` = median `DistinctRoutesHeld` across all merchandisers in the region. `Outlier` = true when a merchandiser's combined routes-held + reshuffles sits meaningfully above the regional median (e.g. > median × 1.5) — design §8: "Outlier → possible mobbing; surfaced to upper management, not the supervisor being measured". Since EVO has no senior-management role, this endpoint is Supervisor-scoped like every other analytics endpoint here (Q8 divergence — flagged in DECISIONS.md, not silently role-gated).
- Verify: `dotnet build backend/Evo.sln`.
- Status: [x]

### Task 21 [P]: MobilityService unit/integration test
- Files: `backend/tests/Evo.Tests/Analytics/MobilityServiceTests.cs` (new)
- Do: seed 3 merchandisers in a region with 1, 1, and 4 distinct route-holds respectively in the window; assert the 4-route merchandiser is flagged `Outlier=true` and the regional median is computed correctly (median of [1,1,4] = 1).
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~MobilityServiceTests` passes.
- Status: [x]

### Task 22: GET /analytics/mobility endpoint
- Files: `backend/src/Evo.Api/Controllers/AnalyticsController.cs`; register `IMobilityService` DI in `Program.cs`
- Do: `[HttpGet("mobility")]` with `region`, `months` (default 12); returns `IReadOnlyList<MerchandiserMobilityDto>` via `IMobilityService`. Supervisor only.
- Verify: `dotnet build backend/Evo.sln`; endpoint present in `contracts/openapi.json`.
- Status: [x]

### Task 23: StabilityService — stability score from the route_change_log facade
- Files: `backend/src/Evo.Api/Analytics/StabilityService.cs` (new); interface `IStabilityService`
- Do: query the `route_change_log` facade over `audit_log` (`IRouteChangeLog` / `audit_log` where `EntityType="Route"` and `EntityKey=routeId`) for structural events (stop add/remove/move, frequency change — NOT patches, which are healthy flexibility) in a trailing 12-month window; `stabilityScore = 100 − Σ weighted changes` (clamp ≥0). Encode per-event weights as named constants (documented, not magic literals). Reuse this in PlanHealthService for the `StabilityScore` field.
- Verify: `dotnet build backend/Evo.sln`.
- Status: [x]

### Task 24: PlanHealthService — composite planHealthScore
- Files: `backend/src/Evo.Api/Analytics/PlanHealthService.cs`
- Do: `planHealthScore` = equal-weighted normalized product of `stabilityScore/100`, `completionPct`, and an in-band utilization factor (1.0 in band, penalized outside) — per spec Open question default; keep the weighting in one clearly-named helper so it is easy to retune.
- Verify: `dotnet build backend/Evo.sln`.
- Status: [x]

### Task 25: GET /analytics/plan-health endpoint
- Files: `backend/src/Evo.Api/Controllers/AnalyticsController.cs` (new); register DI for `IPlanHealthService`/`IStabilityService` in `Program.cs`
- Do: `[Authorize(Roles = "Supervisor")]` `[HttpGet("plan-health")]` with `region` (province), `from`, `to` query params (default: last 4 weeks); returns `PlanHealthReportDto` with routes ranked by `PlanHealthScore` descending.
- Verify: `dotnet build backend/Evo.sln`; endpoint in `contracts/openapi.json`.
- Status: [x]

### Task 26: GET /analytics/stability endpoint
- Files: `backend/src/Evo.Api/Controllers/AnalyticsController.cs`
- Do: `[HttpGet("stability")]` with `region`; returns per-route `{routeId, routeCode, stabilityScore}` via `IStabilityService` (design §9 endpoint). Supervisor only.
- Verify: `dotnet build backend/Evo.sln`; endpoint present.
- Status: [x]

### Task 27: GET /routes/{id}/evidence endpoint (store-level evidence chain)
- Files: `backend/src/Evo.Api/Controllers/RoutesController.cs`; DTO in `backend/src/Evo.Api/Analytics/Dtos/PlanHealthDtos.cs`
- Do: `public record RouteEvidenceDto(Guid RouteId, int Weeks, IReadOnlyList<StoreEvidenceDto> Stores, bool CausalityDisclaimer);` and `public record StoreEvidenceDto(Guid StoreId, string StoreName, int Planned, int Done, int Missed, int Skipped, double DurationVariancePct);`. `[HttpGet("{id:guid}/evidence")]` with `weeks` (default 4); per store on the route, aggregate `planned_visit.status` counts + minutes variance over the trailing window; `CausalityDisclaimer=true` always (UI renders the "kanıt, nedensellik değil" note). Supervisor only.
- Verify: `dotnet build backend/Evo.sln`; endpoint present.
- Status: [x]

### Task 28: Integration test — plan-health over a known seeded fixture
- Files: `backend/tests/Evo.Tests/Analytics/PlanHealthEndpointTests.cs` (new)
- Do: with `EvoApiTestFactory`, seed a route with a known planned/realized mix (e.g. 8 Done / 1 Missed / 1 Skipped, actual minutes set, at least one `TaskInstance` with `OverrideScope=INSTANCE`) and assert `GET /analytics/plan-health` returns `completionPct=0.8`, a sane `durationVariancePct`, non-null stability/utilization/task-compliance, and `overrideRatePct` > 0. Also assert routes come back ranked by `planHealthScore`.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~PlanHealthEndpointTests` passes.
- Status: [x]

### Task 29 [P]: Integration test — stability + evidence
- Files: `backend/tests/Evo.Tests/Analytics/StabilityEvidenceTests.cs` (new)
- Do: seed a route, write a couple of structural `audit_log` Route events, assert `GET /analytics/stability` reflects the deduction; assert `GET /routes/{id}/evidence` returns per-store counts and `CausalityDisclaimer=true`.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~StabilityEvidenceTests` passes.
- Status: [x]

<!-- CHECKPOINT after Phase 2: build + tests green; commit; ask any weighting/band confirmations. -->

## Phase 3 — Onarım workbench backend

### Task 30: Onarım DTOs
- Files: `backend/src/Evo.Api/Onarim/Dtos/OnarimDtos.cs` (new)
- Do: `DisruptionDto(Guid Id, string Kind /* Absence|StoreClosure */, string Label, DateOnly Start, DateOnly End, int AffectedVisitCount)`; `AffectedVisitDto(Guid PlannedVisitId, Guid RouteId, string RouteCode, Guid StoreId, string StoreName, DateOnly Date, int StartMinutes, int PlannedMinutes, IReadOnlyList<CandidateDto> Candidates)`; `CandidateDto(Guid MerchandiserId, string Name, Guid? RouteId, bool Available, int CapacityMinutesAfterMove, bool WithinCapacity, string RegionProximity, string Reasoning, int Rank)`; `ApplyOnarimRequest(string Reason, string Objective, IReadOnlyList<OnarimDecisionDto> Decisions)`; `OnarimDecisionDto(Guid PlannedVisitId, OnarimAction Action, DateOnly? TargetDate, Guid? TargetMerchandiserId, Guid? TargetRouteId)` with `enum OnarimAction : byte { Skip = 1, MoveDay = 2, ReassignRoute = 3, ReassignPerson = 4 }`. `CandidateDto.RouteId` is populated when the candidate's own active route is the reassignment target for `ReassignPerson`.
- Verify: `dotnet build backend/Evo.sln`.
- Status: [x]

### Task 31: CrossReassignVisit — new PatchType + params shape
- Files: `backend/src/Evo.Domain/Scheduling/PatchType.cs` (locate via `grep -rn "enum PatchType" backend/src`)
- Do: add `CrossReassignVisit = 7` to the existing `PatchType` enum (current values: SkipStore/SkipDay/SkipRange/AddStore/ReassignTemp/TimeShift/MoveVisit — confirm exact numbering before adding, never renumber existing values). `params_json` shape: `{"sourceRouteId":"...","targetRouteId":"...","plannedVisitId":"...","targetMerchandiserId":"..."}`. Document alongside `MoveVisit`'s params shape (same file/region) since they're structurally analogous (one crosses dates, this one crosses routes).
- Verify: `dotnet build backend/Evo.sln`; existing `PatchType` values unchanged (`grep -n "SkipStore = \|MoveVisit = " backend/src/Evo.Domain/Scheduling/PatchType.cs` shows unchanged numbers).
- Status: [x]

### Task 32: PatchResolver — resolve CrossReassignVisit (paired skip-source/add-target across two routes)
- Files: `backend/src/Evo.Infrastructure/Routing/PatchResolver.cs` (locate via `grep -rn "class PatchResolver" backend/src`)
- Do: `PatchResolver.Apply` is invoked once per route per date (single-route, per-date signature — confirmed unchanged from spec 007). For `CrossReassignVisit`: when resolving the SOURCE route on the patch's active date, treat it as a SKIP effect for that one `plannedVisitId`'s store (remove it from that route's projected visits for the date). When resolving the TARGET route on the same date, treat it as an ADD effect — inject a `ProjectedVisit` for the source visit's store/minutes, assigned to `targetMerchandiserId`, sourced from the original `TaskInstance` set (reuse the same resolved-task lookup `MoveVisit`'s ADD path already does — `grep -n "case PatchType.MoveVisit" backend/src/Evo.Infrastructure/Routing/PatchResolver.cs` to find the precedent). Both halves read from the SAME patch row (one `Id`, one `EndsOn`, one audit trail) — the resolver just applies a different half depending on which route it's currently resolving, exactly like `MoveVisit` applies a different half depending on which DATE it's currently resolving.
- Verify: `dotnet build backend/Evo.sln`.
- Status: [x]

### Task 33 [P]: PatchResolver CrossReassignVisit unit tests
- Files: `backend/tests/Evo.Tests/Routing/PatchResolverTests.cs` (existing file — `grep -rn "class PatchResolverTests" backend/tests`, add tests) or a new `CrossReassignVisitPatchTests.cs` if the existing file is large
- Do: three cases — resolving the SOURCE route on the active date omits the reassigned visit; resolving the TARGET route on the active date includes it (correct store/minutes/merchandiser); resolving either route OUTSIDE the patch window (before start / after `EndsOn`) shows neither effect (auto-revert). Mirror the existing `MoveVisit` test structure exactly (same file/pattern, just routes instead of dates).
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~CrossReassignVisit` passes.
- Status: [x]

### Task 34: Dual-route regeneration for CrossReassignVisit
- Files: `backend/src/Evo.Infrastructure/Routing/PlanGenerationService.cs` (or wherever `CrossReassignVisit` patches get created — likely `OnarimService`, Task 42)
- Do: when a `CrossReassignVisit` patch is created, call `IPlanGenerationService.RegenerateFutureAsync` for BOTH `sourceRouteId` and `targetRouteId` — mirror the existing dual-regeneration already present in `POST /routes/{id}/stops/{sid}:move` (`grep -n "RegenerateFutureAsync" backend/src/Evo.Api/Controllers/RoutesController.cs` to find that precedent and copy the pattern).
- Progress: `PlanGenerationService.GenerateAsync` now loads target-side `CrossReassignVisit` patches (those whose `RouteId` column points at the source but whose parsed `ParamsJson.TargetRouteId` names this route) and passes `currentRouteId` into `PatchResolver.Apply`, so regenerating either the source OR the target route independently now resolves the correct half. The remaining piece — actually calling `RegenerateFutureAsync` for both route ids at the moment a `CrossReassignVisit` patch is created — belongs in `OnarimService.ApplyAsync` (Task 42), since that's where the patch row is written.
- Verify: `dotnet build backend/Evo.sln`.
- Status: [x] (call-site pairing landed in `OnarimService.ApplyAsync`, Task 42; verified by Task 47's integration test)

### Task 35: Disruption identity helper
- Files: `backend/src/Evo.Api/Onarim/DisruptionSource.cs` (new)
- Do: a small helper that enumerates current disruptions as a uniform `(Guid Id, kind, label, start, end)` — an `Absence` row (Id = absence id, kind=Absence) or a `StoreFlag` ClosedTemp window (Id = flag id, kind=StoreClosure). One place both Onarım endpoints resolve a disruption id back to its affected merchandiser/store + window.
- Verify: `dotnet build backend/Evo.sln`.
- Status: [x]

### Task 36: GET /onarim/disruptions
- Files: `backend/src/Evo.Api/Controllers/OnarimController.cs` (new)
- Do: `[Authorize(Roles = "Supervisor")]` `[HttpGet("disruptions")]` with optional `region`; list active/future absences + ClosedTemp closures via `DisruptionSource`, each with its `AffectedVisitCount` (count of future `planned_visit` rows colliding — reuse the same collision logic as V14). Supervisor only.
- Verify: `dotnet build backend/Evo.sln`; endpoint present.
- Status: [x]

### Task 37: Affected-visit query
- Files: `backend/src/Evo.Api/Onarim/OnarimService.cs` (new); interface `IOnarimService`
- Do: `GetAffectedVisitsAsync(Guid disruptionId)` — resolve the disruption, return future `planned_visit` rows that collide (absence → visits of that merchandiser in the window; closure → visits at that store in the window), projected to the pre-candidate shape.
- Verify: `dotnet build backend/Evo.sln`.
- Status: [x]

### Task 38: Candidate ranking (pure, deterministic)
- Files: `backend/src/Evo.Domain/Onarim/CandidateRanker.cs` (new, pure)
- Do: pure static `Rank(...)` taking a plain input per candidate merchandiser `{ Guid Id, string Name, bool OnLeaveThatDay, int CurrentDayMinutes, int DailyCapacity, bool SameProvince, int? HomeDistanceBucket }` + the visit's `PlannedMinutes`; compute `capacityMinutesAfterMove = DailyCapacity − (CurrentDayMinutes + PlannedMinutes)`, `withinCapacity = capacityAfterMove ≥ 0 && !OnLeaveThatDay`. Rank: available+within-capacity first, then by SameProvince, then HomeDistanceBucket asc, then most spare capacity; produce a human `Reasoning` string per candidate. Deterministic tie-break by `Id`. No `Evo.Infrastructure` reference (layering rule).
- Verify: `dotnet build backend/Evo.sln`.
- Status: [x]

### Task 39 [P]: CandidateRanker unit tests
- Files: `backend/tests/Evo.Tests/Onarim/CandidateRankerTests.cs` (new)
- Do: an on-leave candidate ranks last with `Available=false`; a same-province with capacity outranks an out-of-province one; an over-capacity candidate is `WithinCapacity=false`; tie-break is deterministic. Assert `Reasoning` is non-empty.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~CandidateRankerTests` passes.
- Status: [x]

### Task 40: OnarimService — assemble affected visits + ranked candidates
- Files: `backend/src/Evo.Api/Onarim/OnarimService.cs`
- Do: for each affected visit, gather candidate merchandisers (active, assigned in the same region — EXCLUDING the disrupted visit's own current route/person), map each to `CandidateRanker`'s plain input (compute their current planned minutes on the visit's date from `planned_visit`, same-province, home-distance bucket via the existing home_location if trivial else null), call the ranker, return `AffectedVisitDto` with ranked `Candidates` — each `CandidateDto.RouteId` set to that candidate's own currently-assigned active route (the `ReassignPerson` target route).
- Verify: `dotnet build backend/Evo.sln`.
- Status: [x]

### Task 41: GET /onarim/disruptions/{id}/affected-visits
- Files: `backend/src/Evo.Api/Controllers/OnarimController.cs`
- Do: `[HttpGet("disruptions/{id}/affected-visits")]` → `OnarimService.GetAffectedWithCandidatesAsync`. Supervisor only.
- Verify: `dotnet build backend/Evo.sln`; endpoint present.
- Status: [x]

### Task 42: OnarimService — apply decisions as windowed patches (existing engine + CrossReassignVisit)
- Files: `backend/src/Evo.Api/Onarim/OnarimService.cs`
- Do: `ApplyAsync(Guid disruptionId, ApplyOnarimRequest req, Guid actorId)` — per decision, create a `patch` row: `Skip` → `SkipStore` for that store/date; `MoveDay` → `MoveVisit` (`fromDate`=visit date, `toDate`=`TargetDate`, existing engine); `ReassignRoute` → `ReassignTemp` (target = `TargetMerchandiserId`, window = disruption span, existing engine) — de-duplicate to one ReassignTemp per route even if multiple visits chose it; `ReassignPerson` → the new `CrossReassignVisit` (Tasks 31–34) with `sourceRouteId` = the visit's current route, `targetRouteId` = `TargetRouteId`, `plannedVisitId`, `targetMerchandiserId` = `TargetMerchandiserId` — one `CrossReassignVisit` patch per visit (no de-duplication; each is a single-visit move). Then regenerate ALL affected route(s) via `IPlanGenerationService` (both sides for any `CrossReassignVisit` decisions — Task 34), and write ONE `decision_journal` entry (`Kind=OnarimRepair`, `Reason`/`Objective` from the request, `ErrorsJson` = the V14 codes resolved). Undecided visits are left untouched (stay flagged).
- Verify: `dotnet build backend/Evo.sln`.
- Status: [x]

### Task 43: POST /onarim/disruptions/{id}/apply
- Files: `backend/src/Evo.Api/Controllers/OnarimController.cs`
- Do: `[HttpPost("disruptions/{id}/apply")]` — 422 if `Reason`/`Objective` missing (override-with-reason gate), else call `OnarimService.ApplyAsync` with the current user id; return the updated affected-visits list (decided rows now resolved). Supervisor only.
- Verify: `dotnet build backend/Evo.sln`; endpoint present.
- Status: [x]

### Task 44: Register Onarım DI
- Files: `backend/src/Evo.Api/Program.cs`
- Do: register `IOnarimService`→`OnarimService`.
- Verify: `dotnet build backend/Evo.sln`.
- Status: [x]

### Task 45: Integration test — Onarım apply reflows the plan + clears V14
- Files: `backend/tests/Evo.Tests/Onarim/OnarimApplyTests.cs` (new)
- Do: seed a route + assignment + future visits + an `absence` colliding with 2 visits; call affected-visits (assert 2 rows with ranked candidates); apply `MoveDay` for one and `Skip` for the other (with reason/objective); assert patches were created (`SkipStore` + `MoveVisit`), the plan regenerated, a `decision_journal` `OnarimRepair` row exists, and re-validating the route no longer returns V14 for the two decided visits.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~OnarimApplyTests` passes.
- Status: [x]

### Task 46 [P]: Integration test — apply without reason/objective is 422
- Files: `backend/tests/Evo.Tests/Onarim/OnarimApplyTests.cs` (same file, extra test)
- Do: assert `POST .../apply` with empty `Reason` returns 422 and writes no patches/journal row.
- Verify: same filter passes.
- Status: [x]

### Task 47: Integration test — ReassignPerson applies a CrossReassignVisit and reflows both routes
- Files: `backend/tests/Evo.Tests/Onarim/OnarimApplyTests.cs` (same file, extra test)
- Do: seed TWO routes with active assignments + a future visit on route A whose merchandiser has a seeded absence; call affected-visits, confirm at least one candidate has a non-null `RouteId` (route B's merchandiser); apply `ReassignPerson` targeting that candidate; assert a `CrossReassignVisit` patch was created, route A's plan no longer has that visit for the date, route B's plan gains it (correct store/minutes/merchandiser), and re-validating route A no longer returns V14 for that visit.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~OnarimApplyTests` passes.
- Status: [x]

<!-- CHECKPOINT after Phase 3: build + tests green; commit; regenerate openapi.json; ask any ranking/weighting questions. -->

## Phase 4 — Panel: analytics page + evidence strip

### Task 48: Regenerate the TS client
- Files: `panel/src/api/generated/schema.ts` (generated)
- Do: `cd panel && npm run generate-api-client` (backend must be built so `contracts/openapi.json` is current).
- Verify: `git diff --stat panel/src/api/generated/schema.ts` shows the new analytics/onarim/absence endpoints.
- Status: [x]

### Task 49: Analytics query hooks
- Files: `panel/src/analytics/api/queries.ts` (new)
- Do: TanStack Query hooks `usePlanHealth(region, from, to)` and `useStability(region)` calling the generated client (thin fetch wrappers like `panel/src/planner/api/queries.ts`).
- Verify: `cd panel && npm run lint` passes; `npx tsc --noEmit` (or `npm run build`) type-checks.
- Status: [x]

### Task 50: Plan-health metric formatting helpers
- Files: `panel/src/analytics/format.ts` (new) + `panel/src/analytics/format.test.ts`
- Do: pure helpers — pct formatting, utilization-band → color/label, variance sign formatting. Unit-test them.
- Verify: `cd panel && npm test -- analytics/format` passes.
- Status: [x]

### Task 51: PlanHealthTable component
- Files: `panel/src/analytics/components/PlanHealthTable.tsx` (new) + `.test.tsx`
- Do: renders routes ranked by plan-health score with columns (completion %, variance, utilization band pill, task compliance, patch load, stability, turnover, override rate %). Reuse prototype CSS tokens (`panel/src/theme/tokens.ts`). Vitest asserts rows render sorted and the band pill maps correctly.
- Verify: `cd panel && npm test -- PlanHealthTable` passes.
- Status: [x]

### Task 52: MobilityTable component
- Files: `panel/src/analytics/components/MobilityTable.tsx` (new) + `.test.tsx`; query hook `useMobility(region, months)` in `panel/src/analytics/api/queries.ts`
- Do: renders per-merchandiser distinct-routes-held + reshuffle count vs the regional median, with `Outlier` rows visually flagged (framed as "gözden geçir" — review — not punitive, per design §8's anti-mobbing intent). Vitest asserts outlier rows render distinctly.
- Verify: `cd panel && npm test -- MobilityTable` passes.
- Status: [x]

### Task 53: AnalyticsPage + route + nav entry
- Files: `panel/src/analytics/AnalyticsPage.tsx` (new); `panel/src/App.tsx` (add `/analytics` route, ProtectedRoute); add a nav link (topbar/gear per design §6.0)
- Do: region picker + `PlanHealthTable` + `MobilityTable` + a few summary metric cards. Turkish strings via react-i18next (`panel/src/i18n`).
- Verify: `cd panel && npm run build` succeeds; manual: `/analytics` loads and lists routes + mobility for a region.
- Status: [x]

### Task 54: Evidence strip in the Bilgi tab
- Files: `panel/src/planner/components/panel/RouteDetailPanel.tsx` (Bilgi tab) or a new `EvidenceStrip.tsx` in the same folder; query hook `useRouteEvidence(routeId, weeks)`
- Do: render per-store planned/done/missed/skipped counts + variance for the focused route, with the explicit "Kanıt, nedensellik değil" (evidence, not causation) note. Small, read-only.
- Verify: `cd panel && npm run build`; manual: opening a route's Bilgi tab shows the strip + disclaimer.
- Status: [x]

### Task 55 [P]: i18n strings for analytics
- Files: `panel/src/i18n/tr.json` (or wherever `tr` strings live — `grep -rn "tr.json\|resources" panel/src/i18n`)
- Do: add Turkish labels for plan-health columns, utilization bands, and the evidence disclaimer.
- Verify: no missing-key warnings when rendering `/analytics` and the Bilgi strip.
- Status: [x]

<!-- CHECKPOINT after Phase 4: build + Vitest green; commit; give the human a 1-min manual test script for /analytics + the Bilgi strip. -->

## Phase 5 — Panel: Onarım workbench

### Task 56: Onarım query + mutation hooks
- Files: `panel/src/onarim/api/queries.ts` + `panel/src/onarim/api/mutations.ts` (new)
- Do: `useDisruptions(region)`, `useAffectedVisits(disruptionId)`, and `useApplyOnarim()` (invalidates the affected-route plan/health queries on success).
- Verify: `cd panel && npm run lint`; type-checks.
- Status: [x]

### Task 57: V14 surfacing + ✨ Onarım entry point
- Files: `panel/src/planner/components/schedule/VisitBlock.tsx` and/or the findings display; a small `OnarimLaunchButton`
- Do: when a visit/day carries a `V14` finding, render the 🔴 marker and an **✨ Onarım** action that opens the workbench modal for that disruption. Reuse existing finding-chip styling.
- Verify: `cd panel && npm run build`; manual: a V14 visit shows the Onarım entry point.
- Progress note: implemented as a global topbar launcher (`✨ Onarım` button, badge = total affected-visit
  count across all open disruptions) rather than a per-`VisitBlock` marker — `VisitBlock.tsx` currently has
  no findings plumbing at all (findings only reach `HealthCard`/`PublishModal` today, and `FindingDto.scope`
  matching a visit id would need new prop-threading through `SchedulePane`). The workbench itself (Task 58)
  already lists every affected visit per disruption with its own row, so the per-visit marker's job — "tell
  the supervisor which visits need attention" — is covered at the workbench's entry list rather than inline
  on the schedule grid. Threading a per-block 🔴 marker through `SchedulePane`/`VisitBlock` is a reasonable
  follow-up polish item, not re-opened here.
- Status: [x]

### Task 58: OnarimWorkbench modal — affected-visit rows
- Files: `panel/src/onarim/OnarimWorkbench.tsx` (new)
- Do: modal listing one row per affected visit (route/store/date/planned minutes) with, per row, a decision control: Skip / Move day (date picker) / Reassign whole route (existing `ReassignRoute`) / **Reassign this visit to a person** (new `ReassignPerson` — candidate picker, sends `TargetMerchandiserId` + candidate's own `RouteId` as `TargetRouteId`). Candidates shown ranked with their `Reasoning` and a capacity/availability badge (from `CandidateDto`). Undecided rows stay visibly flagged.
- Verify: `cd panel && npm run build`.
- Status: [x]

### Task 59: Decision-row state + apply (reason/objective capture)
- Files: `panel/src/onarim/OnarimWorkbench.tsx` + `panel/src/onarim/decisionState.ts` (pure, new) + `decisionState.test.ts`
- Do: extract the per-row decision reducer into a pure `decisionState.ts` (add/change/clear a row decision, list undecided) and unit-test it. On Apply, require a `reason` + `objective` (override-with-reason), post via `useApplyOnarim`, then close + refetch.
- Verify: `cd panel && npm test -- onarim/decisionState` passes.
- Status: [x]

### Task 60 [P]: OnarimWorkbench component test
- Files: `panel/src/onarim/OnarimWorkbench.test.tsx` (new)
- Do: render with mock affected-visits, assert candidates render ranked, choosing an action enables the row, and Apply is disabled until reason/objective are filled.
- Verify: `cd panel && npm test -- OnarimWorkbench` passes.
- Status: [x]

### Task 61: i18n strings for Onarım
- Files: `panel/src/i18n/tr.json`
- Do: Turkish labels — Onarım, actions (Atla / Gün değiştir / Rotayı devret), candidate reasoning template, reason/objective fields.
- Verify: no missing-key warnings in the workbench.
- Status: [x]

### Task 62: Playwright smoke — open workbench → decide → apply
- Files: `panel/e2e/onarim.spec.ts` (new)
- Do: against seeded data (a route with a seeded absence → V14), open the Onarım workbench, pick a resolution for one row, fill reason/objective, apply, assert the modal closes and the schedule refetches (V14 gone for the decided row). Follow the existing e2e auth/setup pattern.
- Verify: `cd panel && npx playwright test onarim` passes.
- Status: [x]

<!-- CHECKPOINT after Phase 5: build + Vitest + Playwright green; commit; give the human a 1-min manual test script for Onarım. -->

## Phase 6 — Docs + close-out

### Task 63: Update docs/DATABASE.md
- Files: `docs/DATABASE.md`
- Do: flip the schema-status `agent_location` row note and add an `absence` row (M4, spec 010); add a section documenting `absence` (windowed leave, seeded + minimal manual endpoint) and note V8/V14 are now implemented; note analytics are on-read (no analytics table) — a deliberate deviation from design §9's materialized-views sketch.
- Verify: the new table + V8/V14 + on-read-analytics note are present.
- Status: [x]

### Task 64: Update docs/API.md
- Files: `docs/API.md`
- Do: replace the placeholder `Analytics | GET /analytics/stability | M4` row with the real M4 inventory: `/analytics/plan-health` (incl. `overrideRatePct`), `/analytics/stability`, `/analytics/mobility`, `/routes/{id}/evidence`, `/merchandisers/{id}/absences` (GET/POST), and the `/onarim/*` endpoints (disruptions, affected-visits, apply — including the `ReassignPerson` action and `CrossReassignVisit` patch type) with their request/response shapes and Supervisor scoping. Note the `/analytics/mobility` Supervisor-scoping divergence from design §8's senior-management-only framing.
- Verify: all M4 endpoints listed; spec column reads 010.
- Status: [x]

### Task 65: Update docs/ARCHITECTURE.md
- Files: `docs/ARCHITECTURE.md`
- Do: fill the "Analytics reader" component row (now LANDED, on-read aggregation in `Evo.Api/Analytics`, no materialized views); update the Validation service row (V8/V14 now implemented via `UtilizationValidator`/`AbsenceValidator`); add an Onarım row (decision workbench, ranks-not-decides, writes existing patches + one journal entry); add the M4 spec-010 cross-cutting summary line.
- Verify: V8/V14/analytics/Onarım all reflected.
- Status: [x]

### Task 66: Update docs/DECISIONS.md
- Files: `docs/DECISIONS.md`
- Do: add a newest-first entry for spec 010 — the on-read-vs-materialized analytics decision (Q9); shipping ALL 8 §8 metrics including mobility-per-person/override-rate Supervisor-scoped despite the design's senior-management-only framing (Q1/Q8 — user override of the planner's narrower recommendation, with rationale: EVO's 2-role model has no senior-management tier, framed as outlier-surfacing not punitive); Onarım's new `CrossReassignVisit` patch type enabling per-visit cross-person distribution (Q5 — also a user override, reusing `MoveVisit`'s date-pairing pattern but across routes instead); V8/V14 landing; the live-location layer staying deferred (Q10). Include Why / Alternatives rejected / Consequences.
- Verify: entry present at top with the standard structure.
- Status: [x]

### Task 67: Flag divergences in EVO-Route-Planning-Design.md
- Files: `EVO-Route-Planning-Design.md`
- Do: add build-notes (never contradict §10 silently, CLAUDE.md rule 5) at §8 (analytics on-read not materialized; mobility-per-person Supervisor-scoped, not senior-management-gated — no such role exists), §7.3b (Onarım v1 adds per-visit `ReassignPerson`/`CrossReassignVisit` beyond the original three patch types), §2.5/Patch types (document `CrossReassignVisit` alongside `MoveVisit`), and §3.2 (V8/V14 now implemented; V14 collision source = seeded `absence` + `store_flag` ClosedTemp).
- Verify: the four build-notes are present.
- Status: [x]

### Task 68: Update docs/ROADMAP.md + docs/TODO.md
- Files: `docs/ROADMAP.md`, `docs/TODO.md`
- Do: check the two M4 bullets `[x]` with the spec reference `010-analytics-onarim` + a one-line summary covering all 8 metrics + the CrossReassignVisit Onarım capability; move materialized analytics views, ⚡ Otomatik düzelt, and the live-location map layer into the post-M4 backlog (not silently dropped) — mobility/override-rate and per-visit cross-person Onarım are DONE, not deferred, so remove them from the backlog list. Tick the M4 TODO line.
- Verify: M4 shows done; only the still-deferred items are listed in the backlog.
- Status: [x]

### Task 69: Update CLAUDE.md "Current focus"
- Files: `CLAUDE.md`
- Do: update the Current focus block — M4 complete, all milestones done; list the post-M4 backlog. Keep the deferred-items list accurate.
- Verify: reflects M4 done.
- Status: [x]

### Task 70: Full-suite verification + seeder round-trip
- Files: none (verification)
- Do: `dotnet test backend/Evo.sln` (all green), `cd panel && npm test` + `npx playwright test` (all green), `dotnet run --project backend/src/Evo.Seeder -- --profile demo` twice (idempotent). Confirm `git diff contracts/openapi.json` is committed (CI drift check).
- Verify: backend + panel + e2e all green; seeder idempotent; openapi committed. Run `/end-session` (final phase of the spec) instead of a normal checkpoint.
- Status: [x]
