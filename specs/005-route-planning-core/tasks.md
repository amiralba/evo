# Tasks: Route Planning Core (005-route-planning-core)

<!-- Each task ≈ 2–5 min, zero-context executable. Verify before checking off (rule 3d).
     STOP at each phase end: summarize + evidence, commit, wait for human (checkpoint protocol).

     CONVENTIONS (confirmed from the existing tree):
     - EF entities live in Evo.Infrastructure, colocated with EF config (like Stores/, Audit/,
       Identity/) — NOT in Evo.Domain. New folders: Evo.Infrastructure/People/ and
       Evo.Infrastructure/Routing/.
     - Pure, EF-free scheduling/validation logic lives in Evo.Domain/Scheduling/ (test-critical per
       CLAUDE rule 4) and takes plain records, never EvoDbContext.
     - Orchestration services (load rows, call engine, upsert) live in Evo.Infrastructure/Routing/.
     - Anything that writes audit rows lives in Evo.Api (IAuditWriter is Evo.Api.Audit; Infrastructure
       must not reference Api).
     - Every UseSqlServer call site already has UseNetTopologySuite() (spec 004 Task 2) — the new
       geography columns (merchandiser.home_location, route.geo_scope) need no extra wiring.
     - Cross-spec deps: Roles.Supervisor (Evo.Domain.Auth), IAuditWriter + PagedResult
       (Evo.Api.Audit), unified error shape + EvoException taxonomy (Evo.Domain.Exceptions, spec 003),
       ApplicationUser (Evo.Infrastructure.Identity, spec 002), Store family (Evo.Infrastructure.Stores,
       spec 004).
     - All entity/enum decisions trace to spec.md acceptance criteria + Clarifications (ASSUMPTIONS). -->

## Phase 1 — Schema pt.1: Merchandiser, Route, RouteStop

## Task 1: Merchandiser enums + entity
- Files: `backend/src/Evo.Infrastructure/People/Merchandiser.cs`
- Do: `public class Merchandiser` with `Guid Id`, `Guid UserId` (FK→`ApplicationUser`), `NetTopologySuite.Geometries.Point? HomeLocation` (SRID 4326), `DateOnly? HiredOn`, `bool Active = true`. XML doc: wraps an Identity FieldAgent user; no delete — active toggle only; deactivation blocked while holding an active assignment (spec Clarification #2).
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 2: Route enums
- Files: `backend/src/Evo.Infrastructure/Routing/RouteStatus.cs`, `backend/src/Evo.Domain/Scheduling/Frequency.cs`
- Do: `public enum RouteStatus : byte { Draft = 1, Active = 2, Inactive = 3 }` (design §4 — no Archived/Deleted) in **Evo.Infrastructure** (entity-only enum). `public enum Frequency : byte { Daily = 1, Weekly = 2, Biweekly = 3 }` (design §2.3) in **Evo.Domain/Scheduling** (namespace `Evo.Domain.Scheduling`) because the pure `FrequencyExpander` (Task 17) consumes it and Domain must not reference Infrastructure — Infrastructure already depends on Domain, so the `RouteStop` entity references it fine. No retroactive enum moves later.
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 3: Route entity
- Files: `backend/src/Evo.Infrastructure/Routing/Route.cs`
- Do: `public class Route` with `Guid Id`, `string RouteCode = ""` (unique permanent identity, e.g. `ANK-04`), `string Name = ""`, `string Province = ""`, `string? DistrictsJson` (JSON array of district names), `NetTopologySuite.Geometries.MultiPolygon? GeoScope` (SRID 4326, nullable), `RouteStatus Status = RouteStatus.Draft`, `int Version = 1`, `decimal RevenueTarget = 1_250_000m`, `int DailyWorkMinutes = 450`, `Guid? CreatedBy`, `DateTimeOffset CreatedAt`, `DateTimeOffset UpdatedAt`. XML doc: identity = `RouteCode`, composition = `Version`; no delete (design §2.2).
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 4: RouteStop entity
- Files: `backend/src/Evo.Infrastructure/Routing/RouteStop.cs`
- Do: `public class RouteStop` with `Guid Id`, `Guid RouteId`, `Guid StoreId`, `Frequency Frequency`, `short WeekdayMask` (Mon = bit 0 … Sun = bit 6), `DateOnly? BiweeklyAnchor`, `int? ServiceMinutes` (overrides store default when set), `int Sequence`, `TimeOnly? TimeWindowStart`, `TimeOnly? TimeWindowEnd`, `DateOnly EffectiveFrom`, `DateOnly? EffectiveTo`. `Frequency` is in `Evo.Domain.Scheduling` (Task 2) — add `using Evo.Domain.Scheduling;`. XML doc: the store's dated membership in a route; `EffectiveTo IS NULL` = active membership (design §2.3).
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 5: EF config + DbSets for Merchandiser/Route/RouteStop
- Files: `backend/src/Evo.Infrastructure/EvoDbContext.cs`
- Do: add DbSets `Merchandisers`, `Routes`, `RouteStops` (`=> Set<T>()`). In `OnModelCreating`: `Merchandiser` — table `merchandiser`, `HomeLocation` `HasColumnType("geography")`, FK `UserId → ApplicationUser` (no cascade), unique index on `UserId`. `Route` — table `route`, `RouteCode` max length 30 + unique index, `Name` max length 200, `Province` max length 100, `DistrictsJson` `nvarchar(max)`, `GeoScope` `HasColumnType("geography")`, `RevenueTarget` `decimal(18,2)`. `RouteStop` — table `route_stop`, FK `RouteId → Route` (cascade) and `StoreId → Store` (no cascade), and the **filtered unique index**: `HasIndex(x => x.StoreId).HasFilter("[effective_to] IS NULL").IsUnique()` (adjust the bracketed column name to the actual generated snake_case column).
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 6: EF migration AddRouting1
- Files: `backend/src/Evo.Infrastructure/Migrations/` (generated)
- Do: `dotnet ef migrations add AddRouting1 -p backend/src/Evo.Infrastructure -s backend/src/Evo.Api`. Inspect the generated `Up()` — confirm the `route_stop` filtered unique index on `store_id` carries `filter: "[effective_to] IS NULL"`; if EF emitted the column name differently, the index filter must match the real column.
- Verify: migration file exists; `Up()` creates `merchandiser`, `route`, `route_stop`; the filtered unique index on `route_stop.store_id` is present with the `IS NULL` filter.
- Status: [x]

## Task 7: Apply AddRouting1 to the dev DB
- Files: none (verification task — requires compose SQL up)
- Do: with `docker compose -f docker-compose.dev.yml up -d` running, `dotnet ef database update -p backend/src/Evo.Infrastructure -s backend/src/Evo.Api`.
- Verify: command exits 0; the three tables exist (e.g. `dotnet ef migrations list` shows `AddRouting1` applied, or query `SELECT name FROM sys.tables` shows `route`, `route_stop`, `merchandiser`).
- Status: [x]

## Task 8: Assert one-active-route constraint holds
- Files: `backend/tests/Evo.Tests/Routing/RouteStopConstraintTests.cs`
- Do: an xUnit integration test (reuse the spec-002/003/004 `WebApplicationFactory`/DbContext test harness against compose SQL, distinct test DB name `EvoDb_RoutingTests`): create a Store, then two Routes; insert a `route_stop` (store→route A, `EffectiveTo = null`) → succeeds; insert a second active `route_stop` for the **same store** (→route B, `EffectiveTo = null`) → assert `SaveChangesAsync` throws (unique-constraint `DbUpdateException`). Then set the first stop's `EffectiveTo` to a date and re-add to route B → succeeds (proves dated membership frees the store).
- Verify: `dotnet test backend/Evo.sln --filter RouteStopConstraintTests` passes.
- Status: [x]

**PHASE 1 CHECKPOINT — HARD STOP (rule 3d): summarize + evidence (build, migration file showing the filtered unique index, `database update` applied, constraint test green), commit `feat(005): merchandiser + route + route_stop schema + one-active-route constraint`, numbered questions, then say 'CHECKPOINT — waiting for your go' and END TURN.**

## Phase 2 — Schema pt.2: Assignment, Patch, PlannedVisit, DecisionJournal, Settings

## Task 9: Assignment enum + entity
- Files: `backend/src/Evo.Infrastructure/Routing/AssignmentReason.cs`, `backend/src/Evo.Infrastructure/Routing/Assignment.cs`
- Do: `public enum AssignmentReason : byte { NewHire = 1, Resignation = 2, Swap = 3, Coverage = 4, Restructure = 5 }` (design §2.4). `Assignment` entity: `Guid Id`, `Guid RouteId`, `Guid MerchandiserId`, `DateOnly StartDate`, `DateOnly? EndDate`, `AssignmentReason Reason`, `Guid? CreatedBy`. XML doc: replaces the seat; `EndDate IS NULL` = current; closed on reassignment (design §2.4).
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 10: Patch enums + entity
- Files: `backend/src/Evo.Domain/Scheduling/PatchType.cs`, `backend/src/Evo.Infrastructure/Routing/PatchStatus.cs`, `backend/src/Evo.Infrastructure/Routing/Patch.cs`
- Do: `public enum PatchType : byte { SkipStore = 1, SkipRange = 2, AddStore = 3, ReassignTemp = 4, TimeShift = 5 }` in **Evo.Domain/Scheduling** (namespace `Evo.Domain.Scheduling`) — the pure `PatchResolver` (Task 21) consumes it. `public enum PatchStatus : byte { Pending = 1, Active = 2, Expired = 3, Cancelled = 4 }` in **Evo.Infrastructure** (entity/status enum, not engine input). No retroactive enum moves later. `Patch` entity: `Guid Id`, `Guid RouteId`, `PatchType Type`, `Guid? StoreId`, `Guid? CoverMerchandiserId`, `DateOnly StartsOn`, `DateOnly EndsOn` (NOT NULL — mandatory expiry, V9), `string? ParamsJson`, `PatchStatus Status = PatchStatus.Pending`, `string? Reason`, `Guid? CreatedBy`. (`PatchType` is in `Evo.Domain.Scheduling` — add `using Evo.Domain.Scheduling;`). XML doc: never mutates baseline; applied at generation time; auto-reverts past `EndsOn` (design §2.5).
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 11: PlannedVisit enums + entity
- Files: `backend/src/Evo.Domain/Scheduling/PlannedVisitSource.cs`, `backend/src/Evo.Infrastructure/Routing/PlannedVisitStatus.cs`, `backend/src/Evo.Infrastructure/Routing/PlannedVisit.cs`
- Do: `public enum PlannedVisitSource : byte { Baseline = 1, Patch = 2 }` in **Evo.Domain/Scheduling** (namespace `Evo.Domain.Scheduling`) — the pure `PatchResolver` (Task 21) consumes it. `public enum PlannedVisitStatus : byte { Planned = 1, Done = 2, Missed = 3, Skipped = 4 }` in **Evo.Infrastructure** (entity/status enum). No retroactive enum moves later. `PlannedVisit` entity: `Guid Id`, `Guid RouteId`, `Guid RouteStopId`, `Guid StoreId`, `Guid? MerchandiserId`, `DateOnly VisitDate`, `DateTimeOffset? PlannedStart`, `DateTimeOffset? PlannedEnd`, `PlannedVisitSource Source = PlannedVisitSource.Baseline`, `Guid? PatchId`, `PlannedVisitStatus Status = PlannedVisitStatus.Planned`. (`PlannedVisitSource` is in `Evo.Domain.Scheduling` — add `using Evo.Domain.Scheduling;`). XML doc: materialized calendar projection; future rows regenerated, past frozen (design §2.6).
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 12: DecisionJournal + Setting entities
- Files: `backend/src/Evo.Infrastructure/Routing/DecisionKind.cs`, `backend/src/Evo.Infrastructure/Routing/DecisionJournalEntry.cs`, `backend/src/Evo.Infrastructure/Routing/Setting.cs`
- Do: `public enum DecisionKind : byte { PublishOverride = 1, Repair = 2, Permanent = 3 }`. `DecisionJournalEntry`: `Guid Id`, `DecisionKind Kind`, `string Description = ""`, `string Reason = ""`, `string Objective = ""`, `string? ErrorsJson`, `Guid? AuthorId`, `DateTimeOffset CreatedAt`. XML doc: the "why" behind publish-with-errors/repairs/permanents; append-only; distinct from `audit_log` (design §11.3, deferred-to-M1 per DECISIONS 2026-07-16). `Setting`: `string Key = ""`, `string RegionId = ""` (empty = global; non-empty = region override — see Task 13), `string ValueJson = ""` (composite key `(Key, RegionId)` configured in Task 13).
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 13: EF config + DbSets + settings seed
- Files: `backend/src/Evo.Infrastructure/EvoDbContext.cs`
- Do: add DbSets `Assignments`, `Patches`, `PlannedVisits`, `DecisionJournal`, `Settings`. In `OnModelCreating`: `Assignment` — table `assignment`, FK `RouteId`/`MerchandiserId` (no cascade), **two filtered unique indexes**: on `RouteId` `HasFilter("[end_date] IS NULL").IsUnique()`, on `MerchandiserId` `HasFilter("[end_date] IS NULL").IsUnique()`. `Patch` — table `patch`, index `(RouteId, Status, EndsOn)`, `Reason` max length 1000, `ParamsJson` `nvarchar(max)`. `PlannedVisit` — table `planned_visit`, unique index `(RouteStopId, VisitDate)`, index `(MerchandiserId, VisitDate)`. `DecisionJournalEntry` — table `decision_journal`, `Description`/`Reason`/`Objective` max length 2000, `ErrorsJson` `nvarchar(max)`. `Setting` — table `setting`, composite primary key `(Key, RegionId)` where `RegionId` is **non-nullable `string` with an empty-string (`""`) sentinel meaning global** (avoids the nullable-key problem; `SettingsProvider` in Task 28 treats `""` as global and a non-empty value as a region override). Change the `Setting.RegionId` property in Task 12 to `string RegionId = ""` accordingly. `Key` max length 100, `RegionId` max length 50, `ValueJson` `nvarchar(max)`; `HasData` seed the global defaults from spec (daily_work_minutes=450, default_service_minutes=30, day_start="09:00", over_450_tolerance_minutes=0, service_mix_cap_pct=20, plan_horizon_weeks=6, snap_minutes=5, break_blocks as a JSON array of {label,start,end}).
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 14: EF migration AddRouting2 + apply
- Files: `backend/src/Evo.Infrastructure/Migrations/` (generated)
- Do: `dotnet ef migrations add AddRouting2 -p backend/src/Evo.Infrastructure -s backend/src/Evo.Api`; confirm the generated `Up()` creates `assignment` (both filtered unique indexes with `IS NULL` filters), `patch`, `planned_visit` (unique `(route_stop_id, visit_date)`), `decision_journal`, `setting` (with the `HasData` seed `InsertData` rows). Then `dotnet ef database update` against compose SQL.
- Verify: migration file shows the two assignment filtered-unique indexes + the settings seed rows; `database update` exits 0; `SELECT * FROM setting` returns the seeded default rows.
- Status: [x]

## Task 15: Assert assignment uniqueness constraints
- Files: `backend/tests/Evo.Tests/Routing/AssignmentConstraintTests.cs`
- Do: integration test (`EvoDb_RoutingTests`): create a Route + two Merchandisers; insert an active assignment (route→M1, `EndDate=null`) → ok; a second active assignment for the **same route** (→M2) → assert throws; close the first (`EndDate` set) then assign M2 → ok. Symmetrically: a merchandiser can't hold two active assignments on two routes at once → assert throws.
- Verify: `dotnet test backend/Evo.sln --filter AssignmentConstraintTests` passes.
- Status: [x]

**PHASE 2 CHECKPOINT — HARD STOP: summarize + evidence (build, AddRouting2 migration showing both assignment filtered-unique indexes + settings seed, `database update` applied, constraint test green), commit `feat(005): assignment + patch + planned_visit + decision_journal + settings schema`, numbered questions, 'CHECKPOINT — waiting for your go', END TURN.**

## Phase 3 — Pure scheduling engine (Evo.Domain/Scheduling/)

## Task 16: SchedulingSettings + break-block records
- Files: `backend/src/Evo.Domain/Scheduling/SchedulingSettings.cs`
- Do: EF-free records the engine consumes: `record BreakBlock(string Label, TimeOnly Start, TimeOnly End)`; `record SchedulingSettings(int DailyWorkMinutes, int DefaultServiceMinutes, TimeOnly DayStart, int Over450ToleranceMinutes, int ServiceMixCapPct, int PlanHorizonWeeks, int SnapMinutes, IReadOnlyList<BreakBlock> Breaks)`. XML doc: mapped from the `setting` table by `SettingsProvider` (Task 30) so the engine never touches EF.
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 17: Frequency expansion
- Files: `backend/src/Evo.Domain/Scheduling/FrequencyExpander.cs`
- Do: `static IEnumerable<DateOnly> ExpandVisitDates(Frequency freq, short weekdayMask, DateOnly? biweeklyAnchor, DateOnly from, DateOnly to)`. Rules: Daily = every Mon–Fri in range (weekend policy: Mon–Fri only for M1; note Saturday is a design Open Q). Weekly/2×-week = dates whose weekday bit is set in `weekdayMask` (Mon=bit 0). Biweekly = masked weekdays where `(ISOWeekNumberDiff(biweeklyAnchor, date)) % 2 == 0` — compute whole-weeks-between via `(date.DayNumber - anchor.DayNumber) / 7`. `Frequency` already lives in `Evo.Domain.Scheduling` (Task 2), so this file references it directly — no cross-project fix or enum move needed.
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 18: Frequency expansion unit tests
- Files: `backend/tests/Evo.Tests/Scheduling/FrequencyExpanderTests.cs`
- Do: assert: daily over a 2-week range yields 10 weekday dates; a Mon+Thu mask yields exactly Mondays and Thursdays; biweekly with an anchor yields visits on alternating matching weeks only (anchor week included, next week skipped); an empty range yields none.
- Verify: `dotnet test backend/Evo.sln --filter FrequencyExpanderTests` passes.
- Status: [x]

## Task 19: ValidationFinding type + day scheduler + statutory breaks + 450 rule
- Files: `backend/src/Evo.Domain/Scheduling/ValidationFinding.cs`, `backend/src/Evo.Domain/Scheduling/DayScheduler.cs`
- Do: FIRST create the shared finding type (needed here and by RouteValidator/tests): `public enum FindingSeverity : byte { Error = 1, Warning = 2, Info = 3 }`; `public record ValidationFinding(string Code, FindingSeverity Severity, string Message, string? Scope = null)` in `Evo.Domain.Scheduling`. Then in `DayScheduler.cs`: `record ScheduledVisit(Guid RouteStopId, Guid StoreId, int Minutes, TimeOnly Start, TimeOnly End)`; `record DayPlan(DateOnly Date, IReadOnlyList<ScheduledVisit> Visits, int PlannedMinutes, IReadOnlyList<ValidationFinding> Findings)`. `static DayPlan ScheduleDay(DateOnly date, IReadOnlyList<(Guid RouteStopId, Guid StoreId, int Minutes)> orderedVisits, SchedulingSettings settings)`: start a cursor at `DayStart`; for each visit, if the visit span `[cursor, cursor+Minutes)` would overlap a `BreakBlock`, advance the cursor to the break's end first (breaks are reserved, non-editable — design §3.3); assign Start/End; sum `PlannedMinutes` **excluding** breaks; emit V1 (`< DailyWorkMinutes` → Warning) and V2 (`> DailyWorkMinutes + Over450ToleranceMinutes` → Warning) findings. Document the "visit interrupted by lunch is one visit, not two" nuance as a deferred panel concern (spec Open questions).
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 20: Day scheduler unit tests
- Files: `backend/tests/Evo.Tests/Scheduling/DaySchedulerTests.cs`
- Do: assert: a day of 6×60min visits starting 09:00 pushes visits around the seeded lunch/tea blocks (no visit span overlaps a break; total span = 360 work + breaks); `PlannedMinutes` excludes breaks; a 400-minute day emits V1; a 470-minute day (tolerance 0) emits V2; a 450-minute day emits neither.
- Verify: `dotnet test backend/Evo.sln --filter DaySchedulerTests` passes.
- Status: [x]

## Task 21: Patch resolution (baseline ⊕ patches)
- Files: `backend/src/Evo.Domain/Scheduling/PatchResolver.cs`
- Do: `record ProjectedVisit(Guid RouteStopId, Guid StoreId, DateOnly Date, int Minutes, Guid? MerchandiserId, PlannedVisitSource Source, Guid? PatchId)`; `record PatchInput(Guid Id, PatchType Type, Guid? StoreId, Guid? CoverMerchandiserId, DateOnly StartsOn, DateOnly EndsOn, string? ParamsJson)`. `static IReadOnlyList<ProjectedVisit> Apply(IReadOnlyList<ProjectedVisit> baseline, IReadOnlyList<PatchInput> patches, DateOnly date)`: consider only patches where `StartsOn <= date <= EndsOn` (past-`EndsOn` patches are never applied — auto-revert). Apply in priority order **SKIP > TIME_SHIFT > ADD > REASSIGN**: SkipStore removes that store's visits on the date; SkipRange removes all visits on the date; ReassignTemp repoints `MerchandiserId`; AddStore injects an extra visit (Source=Patch); TimeShift is carried as a marker (window applied later by DayScheduler). `PatchType` (Task 10) and `PlannedVisitSource` (Task 11) already live in `Evo.Domain.Scheduling`, so this file references them directly — no enum move needed.
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 22: Patch-resolution unit tests
- Files: `backend/tests/Evo.Tests/Scheduling/PatchResolverTests.cs`
- Do: (`ValidationFinding`/`FindingSeverity` already exist from Task 19 — reuse, do not redefine.) Tests: a SkipStore patch removes exactly that store's visit inside its window and **leaves it present the day after `EndsOn`** (auto-revert boundary); a ReassignTemp patch repoints the merchandiser within the window; two conflicting patches resolve in SKIP>ADD priority.
- Verify: `dotnet test backend/Evo.sln --filter PatchResolverTests` passes.
- Status: [x]

**PHASE 3 CHECKPOINT — HARD STOP: summarize + evidence (build + the three engine test classes green — frequency expansion, day/breaks/450, baseline⊕patch across the expiry boundary; these are the CLAUDE rule-4 test-critical paths), commit `feat(005): pure scheduling engine — frequency expansion, breaks/450, patch resolution`, numbered questions, 'CHECKPOINT — waiting for your go', END TURN.**

## Phase 4 — Validation rules + RouteChangeLog facade

## Task 23: Route validation rule evaluators (pure)
- Files: `backend/src/Evo.Domain/Scheduling/RouteValidator.cs`
- Do: EF-free input records + evaluators for the M1-core set. `record StopEval(Guid StoreId, string Province, string District, StoreCategory Category, int Minutes, TimeOnly? WindowStart, TimeOnly? WindowEnd, bool BannedOnDate)`; `record RouteEval(string Province, IReadOnlyList<string> Districts, decimal RevenueTarget, decimal SixMonthRevenue, int ServiceMixCapPct, IReadOnlyList<StopEval> Stops)`. Static methods returning `IReadOnlyList<ValidationFinding>`: `V3_GeoScope` (Error/block if a stop's province≠route province or district∉route districts when districts non-empty), `V4` (Error/block — flagged by caller from the DB unique check), `V5_Revenue` (Warning if `SixMonthRevenue < RevenueTarget`), `V6_ServiceMix` (Warning if SERVICE-category count share > cap %), `V7_TimeWindowBan` (Error if a visit falls outside a store's time window or on a banned date). V1/V2 come from DayScheduler; V12 comes from Task 24. Provide one aggregate `Evaluate(RouteEval)` returning all applicable findings.
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 24: Overlap (V12) evaluator
- Files: `backend/src/Evo.Domain/Scheduling/OverlapValidator.cs`
- Do: `static IReadOnlyList<ValidationFinding> V12_Overlaps(IEnumerable<(Guid MerchandiserId, DateOnly Date, TimeOnly Start, TimeOnly End)> visits)` → for the same merchandiser+date, any pair whose time spans intersect yields an Error finding (design V12). Pure, no DB.
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 25: Validation unit tests
- Files: `backend/tests/Evo.Tests/Scheduling/RouteValidatorTests.cs`
- Do: assert V3 blocks an out-of-province stop and passes an in-scope one; V5 warns when revenue < target; V6 warns when SERVICE share exceeds the cap and not below; V7 blocks a visit outside its time window and on a banned date; V12 flags two overlapping visits for one person/day and not two non-overlapping ones.
- Verify: `dotnet test backend/Evo.sln --filter RouteValidatorTests` passes.
- Status: [x]

## Task 26: IRouteChangeLog facade over audit_log
- Files: `backend/src/Evo.Api/Audit/IRouteChangeLog.cs`, `backend/src/Evo.Api/Audit/RouteChangeLog.cs`
- Do: `enum RouteChangeEvent { StopAdded, StopRemoved, StopMoved, FreqChanged, Assigned, Unassigned, Patched, Published }`. `interface IRouteChangeLog { Task WriteAsync(Guid routeId, RouteChangeEvent evt, object? before, object? after, CancellationToken ct = default); }`. `RouteChangeLog` implements it by delegating to spec 003's `IAuditWriter.WriteAsync(entityType: "Route", entityKey: routeId.ToString(), event: evt.ToString(), before, after)`. XML doc: realizes the design's `route_change_log` as typed facade queries over the generic `audit_log` (DECISIONS 2026-07-16) — no new table.
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 27: Register RouteChangeLog in DI
- Files: `backend/src/Evo.Api/Program.cs`
- Do: `builder.Services.AddScoped<IRouteChangeLog, RouteChangeLog>();` next to the existing `IAuditWriter` registration.
- Verify: `dotnet build`; `dotnet run --project backend/src/Evo.Api` starts without a DI resolution error.
- Status: [x]

**PHASE 4 CHECKPOINT — HARD STOP: summarize + evidence (build, validator tests green, RouteChangeLog wired), commit `feat(005): route validation rules (V1-V7,V9,V12) + route-change-log facade`, numbered questions, 'CHECKPOINT — waiting for your go', END TURN.**

## Phase 5 — Orchestration: SettingsProvider, PlanGenerationService, background job

## Task 28: SettingsProvider
- Files: `backend/src/Evo.Infrastructure/Routing/ISettingsProvider.cs`, `backend/src/Evo.Infrastructure/Routing/SettingsProvider.cs`
- Do: `interface ISettingsProvider { Task<SchedulingSettings> GetAsync(string? regionId = null, CancellationToken ct = default); }`. Implementation reads the `setting` rows: load all global rows (`RegionId == ""`) plus, when `regionId` is non-null/non-empty, the matching region rows; a region row overrides the global row of the same `Key`. Parse each `ValueJson` (numbers, the `day_start` `"HH:mm"`, the `break_blocks` JSON array of `{label,start,end}`) into a `SchedulingSettings` record. Treat the `regionId` param `null` as the global-only (`""`) case. XML doc: this is the only mapping from the EF `setting` table to the EF-free engine record.
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 29: PlanGenerationService
- Files: `backend/src/Evo.Infrastructure/Routing/IPlanGenerationService.cs`, `backend/src/Evo.Infrastructure/Routing/PlanGenerationService.cs`
- Do: `interface IPlanGenerationService { Task<int> RegenerateFutureAsync(Guid routeId, DateOnly from, DateOnly to, CancellationToken ct = default); }`. Implementation injects `EvoDbContext` + `ISettingsProvider`. Steps: load the route, its active `route_stop`s, its current assignment (for `MerchandiserId`), and active patches; for each stop call `FrequencyExpander.ExpandVisitDates`; resolve each visit's minutes = `stop.ServiceMinutes ?? store.DefaultServiceMinutes ?? settings.DefaultServiceMinutes`; per date, order visits by `Sequence`, call `DayScheduler.ScheduleDay`; apply `PatchResolver.Apply` per date; **upsert** `planned_visit` rows by `(RouteStopId, VisitDate)` for dates `>= from` (never touch `VisitDate < today` — past is frozen); delete future baseline visits that no longer project. Return the count of upserted rows. One `SaveChangesAsync`.
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 30: PlanGenerationService integration test
- Files: `backend/tests/Evo.Tests/Routing/PlanGenerationServiceTests.cs`
- Do: integration test (`EvoDb_RoutingTests`, seeded store + route + stop + assignment): first `RegenerateFutureAsync` over a 2-week range materializes the expected number of `planned_visit` rows with `PlannedStart` set and breaks respected; a second run is **idempotent** (count stable, upsert not duplicate); a past-dated visit inserted manually is **not** modified by a regenerate whose `from` is today; adding an active SkipStore patch then regenerating removes that store's visits inside the window and restores them past `EndsOn`.
- Verify: `dotnet test backend/Evo.sln --filter PlanGenerationServiceTests` passes.
- Status: [x]

## Task 31: PlanHorizonBackgroundService
- Files: `backend/src/Evo.Api/Routing/PlanHorizonBackgroundService.cs`, `backend/src/Evo.Api/Program.cs`
- Do: `PlanHorizonBackgroundService : BackgroundService` injecting `IServiceScopeFactory` + `ILogger` + `IConfiguration`. In `ExecuteAsync`: read `Routing:HorizonIntervalHours` (default 24); loop until cancellation — in a DI scope, advance patch statuses by date (`Pending→Active` when `StartsOn<=today`, `Active→Expired` when `today>EndsOn`), then for every ACTIVE route call `RegenerateFutureAsync(route, today, today + settings.PlanHorizonWeeks*7)`; log a summary; try/catch so a failed cycle never crashes the host; `await Task.Delay(interval, stoppingToken)`. Register `builder.Services.AddHostedService<PlanHorizonBackgroundService>();` and `AddScoped<IPlanGenerationService, PlanGenerationService>()` + `AddScoped<ISettingsProvider, SettingsProvider>()`.
- Verify: `dotnet build`; `dotnet run --project backend/src/Evo.Api` starts and logs one horizon cycle (or first-interval schedule) without crashing.
- Status: [x]

## Task 32: Patch-expiry status transition test
- Files: `backend/tests/Evo.Tests/Routing/PatchExpiryTests.cs`
- Do: unit/integration test of the status-advance logic used by the background service (extract it into a small pure/testable method if convenient, e.g. `PatchStatusAdvancer.NextStatus(patch, today)`): a Pending patch whose `StartsOn<=today` becomes Active; an Active patch whose `EndsOn<today` becomes Expired; a Cancelled patch is never changed.
- Verify: `dotnet test backend/Evo.sln --filter PatchExpiryTests` passes.
- Status: [x]

**PHASE 5 CHECKPOINT — HARD STOP: summarize + evidence (build, plan-generation integration test showing idempotent materialization + past-frozen + patch apply/revert, background service startup log, patch-expiry test green), commit `feat(005): plan generation service + nightly horizon/patch-expiry background job`, numbered questions, 'CHECKPOINT — waiting for your go', END TURN.**

## Phase 6 — API endpoints

## Task 33: Route DTOs
- Files: `backend/src/Evo.Api/Routing/Dtos/RouteDtos.cs`
- Do: request/response records: `CreateRouteRequest(string Name, string Province, IReadOnlyList<string>? Districts, string? RouteCode, decimal? RevenueTarget)`; `RouteSummaryDto(Guid Id, string RouteCode, string Name, string Province, RouteStatus Status, int Version, int StopCount, decimal RevenueTarget)`; `RouteStopDto(Guid Id, Guid StoreId, string StoreName, Frequency Frequency, short WeekdayMask, int? ServiceMinutes, int Sequence, DateOnly EffectiveFrom, DateOnly? EffectiveTo)`; `AssignmentDto(Guid MerchandiserId, string MerchandiserName, DateOnly StartDate, AssignmentReason Reason)`; `PatchDto(Guid Id, PatchType Type, Guid? StoreId, DateOnly StartsOn, DateOnly EndsOn, PatchStatus Status)`; `RouteDetailDto(Guid Id, string RouteCode, string Name, string Province, IReadOnlyList<string> Districts, RouteStatus Status, int Version, decimal RevenueTarget, int DailyWorkMinutes, IReadOnlyList<RouteStopDto> Stops, AssignmentDto? CurrentAssignment, IReadOnlyList<PatchDto> ActivePatches)`; `UpdateRouteRequest(string? Name, decimal? RevenueTarget, RouteStatus? Status)`.
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 34: RoutesController — create/list/get
- Files: `backend/src/Evo.Api/Controllers/RoutesController.cs`
- Do: `[ApiController] [Route("api/v1/routes")] [Authorize(Roles = Roles.Supervisor)]`. `POST` — create a DRAFT route; if `RouteCode` omitted, generate one from province prefix + a sequence (e.g. `ANK-<n>`); `CreatedBy` from the user id claim; return `201 CreatedAtAction` with `RouteSummaryDto`. `GET` — `List(string? province, RouteStatus? status, int page=1, int pageSize=50)` → `PagedResult<RouteSummaryDto>` (reuse `Evo.Api.Audit.Dtos.PagedResult`), cap pageSize 200. `GET {id:guid}` — load route + stops (join store name) + current assignment (join merchandiser→user display name) + active patches; null → `throw new NotFoundException(...)`; else `RouteDetailDto`.
- Verify: `dotnet build`; (behavior in Task 42).
- Status: [x]

## Task 35: RoutesController — PATCH (rename/target/activate/deactivate)
- Files: `backend/src/Evo.Api/Controllers/RoutesController.cs`
- Do: `PATCH {id:guid}` taking `UpdateRouteRequest`. Rename / `RevenueTarget` edit update in place. `Status` transitions: `Draft→Active` — require an active Assignment exists, else `throw new ConflictException(...)` (→409); on success set Active and call `RegenerateFutureAsync`. `Active→Inactive` — set Inactive and **release stops to pool**: set `EffectiveTo = today` on the route's active `route_stop`s, delete future `planned_visit`s, write a change-log event. `Inactive→Active` — comes back **empty** (design §4 — stops reassigned manually). No delete endpoint. Bump `Version` on structural transitions. Write appropriate `IRouteChangeLog` events.
- Verify: `dotnet build`; (behavior in Task 42).
- Status: [x]

## Task 36: Stops — bulk add + edit
- Files: `backend/src/Evo.Api/Controllers/RoutesController.cs`, `backend/src/Evo.Api/Routing/Dtos/StopDtos.cs`
- Do: `record BulkAddStopsRequest(IReadOnlyList<Guid> StoreIds, Frequency Frequency, short WeekdayMask, int? ServiceMinutes)`; `record BulkAddResultDto(IReadOnlyList<Guid> Added, IReadOnlyList<RejectedStoreDto> Rejected)`; `record RejectedStoreDto(Guid StoreId, string Reason)`. `POST {id}/stops:bulk` — for each store: **V3** (store province/district must be in route scope, else reject) and **V4** (store already on an active route_stop, else reject with `Reason="on_another_route"`); accepted stores get a new `route_stop` (`EffectiveFrom=today`, sequence appended), write `STOP_ADDED`; regenerate future visits; return `BulkAddResultDto`. `PATCH {id}/stops/{stopId:guid}` — edit `Frequency`/`ServiceMinutes`/`Sequence`; write `FREQ_CHANGED` when frequency changes; regenerate future visits. (Use route attribute `:bulk`/`:move` suffixes via `[HttpPost("{id:guid}/stops:bulk")]`.)
- Verify: `dotnet build`; (behavior in Task 42).
- Status: [x]

## Task 37: Stops — atomic move between routes
- Files: `backend/src/Evo.Api/Controllers/RoutesController.cs`
- Do: `record MoveStopRequest(Guid TargetRouteId)`; `POST {id:guid}/stops/{stopId:guid}:move` — in one transaction: validate the store is in the **target** route's geo-scope (V3, else 409/reject); close the source `route_stop` (`EffectiveTo=today`); open a new `route_stop` on the target route (`EffectiveFrom=today`, copying frequency/minutes/appended sequence); `RegenerateFutureAsync` for **both** routes; write `STOP_MOVED` (or `STOP_REMOVED`+`STOP_ADDED`) change-log events for both. Return the new stop's `RouteStopDto`. The one-active-route filtered unique index guarantees no overlap window.
- Verify: `dotnet build`; (behavior in Task 42).
- Status: [x]

## Task 38: Assignment endpoint
- Files: `backend/src/Evo.Api/Controllers/RoutesController.cs`, `backend/src/Evo.Api/Routing/Dtos/AssignmentDtos.cs`
- Do: `record ReassignRequest(Guid MerchandiserId, DateOnly StartDate, AssignmentReason Reason)`. `POST {id:guid}/assignment` — `Reason` required (model validation → 422 if missing); in a transaction: close the route's current assignment (`EndDate = StartDate`), open a new one, repoint future `planned_visit.MerchandiserId`, write `UNASSIGNED`+`ASSIGNED` change-log events. The two assignment filtered-unique indexes enforce single-active on both sides (a `DbUpdateException` from a merchandiser already assigned elsewhere → map to `ConflictException`/409). Return the new `AssignmentDto`.
- Verify: `dotnet build`; (behavior in Task 42).
- Status: [x]

## Task 39: Patch endpoint (expiry mandatory)
- Files: `backend/src/Evo.Api/Controllers/RoutesController.cs`, `backend/src/Evo.Api/Routing/Dtos/PatchDtos.cs`
- Do: `record CreatePatchRequest(PatchType Type, Guid? StoreId, Guid? CoverMerchandiserId, DateOnly StartsOn, DateOnly? EndsOn, string? ParamsJson, string? Reason)`. `POST {id:guid}/patches` — if `EndsOn` is null → `throw new EvoValidationException(...)` with code for **V9** (patch without expiry) → 422 unified shape; else create the patch (`Status=Pending` or `Active` if `StartsOn<=today`), write `PATCHED`, `RegenerateFutureAsync`, return the `PatchDto`.
- Verify: `dotnet build`; (behavior in Task 42).
- Status: [x]

## Task 40: Plan + health + validate endpoints
- Files: `backend/src/Evo.Api/Controllers/RoutesController.cs`, `backend/src/Evo.Api/Routing/Dtos/PlanDtos.cs`
- Do: `record PlanDayDto(DateOnly Date, IReadOnlyList<PlannedVisitDto> Visits, int PlannedMinutes, IReadOnlyList<FindingDto> Findings)`; `record PlannedVisitDto(Guid StoreId, string StoreName, DateTimeOffset? Start, DateTimeOffset? End, PlannedVisitSource Source)`; `record FindingDto(string Code, FindingSeverity Severity, string Message, string? Scope)`; `record HealthDto(decimal SixMonthRevenue, decimal RevenueTarget, bool RevenueMet, IReadOnlyDictionary<string,int> MinutesByWeekday, IReadOnlyDictionary<string,int> CategoryMix, int ErrorCount, int WarningCount)`. `GET {id:guid}/plan?from=&to=` — read materialized `planned_visit`s in range grouped by date, attach DayScheduler/validator findings, return `PlanDayDto[]`. `GET {id:guid}/health` — compute revenue sum (from `store_revenue`, latest 6 months), per-weekday minutes, category mix %, and finding counts. `POST {id:guid}/validate` — run the full validator over the current draft and return `FindingDto[]` (for live UI).
- Verify: `dotnet build`; (behavior in Task 42).
- Status: [x]

## Task 41: Publish endpoint + merchandiser day
- Files: `backend/src/Evo.Api/Controllers/RoutesController.cs`, `backend/src/Evo.Api/Controllers/MerchandisersController.cs`, `backend/src/Evo.Api/Routing/Dtos/PublishDtos.cs`
- Do: `record PublishRequest(string? Reason, string? Objective)`; `record PublishResultDto(int VisitsMaterialized, bool OverrodeErrors, Guid? DecisionJournalId)`. `POST {id:guid}/publish` — run the validator; if any `FindingSeverity.Error` present, require `Reason`+`Objective` (else `throw new EvoValidationException(...)` → 422) and write a `decision_journal` row (`Kind=PublishOverride`, `ErrorsJson`=the error codes, `AuthorId`=user); then `RegenerateFutureAsync` over the horizon (materialize atomically), write `PUBLISHED`, return `PublishResultDto`. (No notifications — M3.) New `MerchandisersController` `[Authorize] GET api/v1/merchandisers/{id:guid}/day?date=` → that merchandiser's `planned_visit`s for the date as `PlannedVisitDto[]` (Supervisor allowed; agent-self allowed once mobile lands).
- Verify: `dotnet build`; (behavior in Task 42).
- Status: [x]

## Task 42: Endpoint integration tests
- Files: `backend/tests/Evo.Tests/Routing/RouteEndpointTests.cs`
- Do: with `WebApplicationFactory` (seeded Supervisor + Field agent + at least one synced store): Supervisor `POST /routes` → 201; `POST /routes/{id}/stops:bulk` with an in-scope store → accepted, an out-of-scope store → rejected (V3), a store already on another route → rejected (V4); `POST /routes/{id}/assignment` without reason → 422; with reason → 200; `PATCH /routes/{id}` Draft→Active with an assignment → 200, without an assignment (fresh route) → 409; `POST /routes/{id}/patches` without `EndsOn` → 422 (V9), with it → 200; `POST /routes/{id}/publish` on a route with an Error finding and no reason → 422, with reason+objective → 200 and a `decision_journal` row exists; `GET /routes/{id}/plan?from=&to=` returns days with findings; Field agent `POST /routes` → 403; unauthenticated → 401.
- Verify: `dotnet test backend/Evo.sln --filter RouteEndpointTests` passes.
- Status: [x]

**PHASE 6 CHECKPOINT — HARD STOP: summarize + evidence (endpoint tests green covering create/bulk V3-V4/assign-422/activate-409/patch-V9-422/publish-override-journal/plan/authz-403-401), give the human a 1-minute API test script (login as Supervisor → POST /routes → stops:bulk → assignment → PATCH activate → patches → publish → GET plan), commit `feat(005): route/stop/assignment/patch/plan/publish API endpoints`, numbered questions, 'CHECKPOINT — waiting for your go', END TURN.**

## Phase 7 — Seeder, contract/client, docs, regression

## Task 43: MerchandiserSeederModule
- Files: `backend/src/Evo.Seeder/Modules/MerchandiserSeederModule.cs`, `backend/src/Evo.Seeder/Program.cs`
- Do: `MerchandiserSeederModule : ISeederModule`, runs **after** the identity module. For each seeded FieldAgent `ApplicationUser` without a `merchandiser`, create a `Merchandiser` (`UserId`, a Turkish `HomeLocation` point, `HiredOn`, `Active=true`). Idempotent (skip users that already have one). Register in the seeder module list before the route module.
- Verify: `dotnet build backend/Evo.sln`; `dotnet run --project backend/src/Evo.Seeder -- --profile demo` creates one `merchandiser` per FieldAgent; re-run keeps the count stable (`SELECT COUNT(*) FROM merchandiser`).
- Status: [x]

## Task 44: RouteSeederModule — routes + stops + assignments
- Files: `backend/src/Evo.Seeder/Modules/RouteSeederModule.cs`, `backend/src/Evo.Seeder/Program.cs`
- Do: `RouteSeederModule : ISeederModule`, runs after stores + merchandisers. Create `profile == Demo ? 5 : 50` routes with deterministic `RouteCode`s (e.g. `SEED-<n>`), each scoped to a province drawn from existing synced stores; add a handful of in-scope, currently-unassigned stores as `route_stop`s (respect the one-active-route rule — skip already-routed stores); assign each route to a distinct merchandiser (`Reason=NewHire`); set status Active. Idempotent by `RouteCode` (skip if the route already exists). Register in the module list; do NOT insert `planned_visit` rows here (Task 45 does it via the engine).
- Verify: `dotnet build`; `dotnet run --project backend/src/Evo.Seeder -- --profile demo` creates 5 routes with stops + assignments; re-run keeps counts stable.
- Status: [x]

## Task 45: Seeder runs the real engine for visits
- Files: `backend/src/Evo.Seeder/Modules/RouteSeederModule.cs`, `backend/src/Evo.Seeder/Program.cs`
- Do: after creating routes/stops/assignments, resolve `IPlanGenerationService` (+ `ISettingsProvider`) from the seeder DI (register `AddScoped<IPlanGenerationService, PlanGenerationService>()` + `AddScoped<ISettingsProvider, SettingsProvider>()` in `Program.cs`) and call `RegenerateFutureAsync(routeId, today, today + 6*7)` for each seeded Active route — materializing `planned_visit`s through the **real** engine (spec Clarification #14 / the store-sync seeder pattern). Log the total visits materialized.
- Verify: `dotnet run --project backend/src/Evo.Seeder -- --profile demo` exits 0 and populates `planned_visit`; re-run is idempotent (visit count stable for unchanged routes); `SELECT COUNT(*) FROM planned_visit` > 0.
- Status: [x]

## Task 46: Regenerate contract + TS client
- Files: `contracts/openapi.json`, `panel/src/api/generated/` (generated)
- Do: `dotnet build backend/Evo.sln` (Swashbuckle emits the new `/api/v1/routes...`, `/api/v1/merchandisers/{id}/day` operations into `contracts/openapi.json`); then `npm run generate-api-client` from `panel/`. **No panel UI** — client regen only (spec Non-goals).
- Verify: `contracts/openapi.json` contains `/api/v1/routes` and `/api/v1/routes/{id}/publish`; `grep -ri routes panel/src/api/generated` finds the generated operations.
- Status: [x]

## Task 47: Update docs
- Files: `docs/DATABASE.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DECISIONS.md`
- Do: `docs/DATABASE.md` — flip schema-status rows `route, route_stop`, `assignment, patch, planned_visit`, `settings` to ☑ (spec 005); add `merchandiser` (☑ 005, **correcting** the inaccurate "002" attribution — note 002 built only `ApplicationUser`) and `decision_journal` (☑ 005) rows; note the `route_change_log` design table is realized as the `IRouteChangeLog` facade over `audit_log`. `docs/ARCHITECTURE.md` — mark **Plan Generator** and **Validation service** as landed for M1-core (engine in `Evo.Domain/Scheduling`, orchestration + `PlanHorizonBackgroundService` in Evo.Api/Infrastructure), and note the planner UI is a separate later M1 spec. `docs/API.md` — add the new route/stop/assignment/patch/plan/health/validate/publish/merchandiser-day endpoints. `docs/DECISIONS.md` (newest-first) — record: (a) 005 is the **backend core**, planner UI split to a later M1 spec; (b) `merchandiser` entity built in 005 (not 002); (c) M1 visit duration = `service_minutes` fallback, Σ-task-minutes deferred to M2; (d) M1-core validation subset (V1-V7,V9,V12), rest deferred; (e) `route_change_log` realized as facade over `audit_log`; (f) `decision_journal` landed in 005 per the earlier deferral.
- Verify: all four docs updated; `docs/DATABASE.md` schema-status shows the route tables migrated and the merchandiser attribution corrected; `docs/DECISIONS.md` names the UI split + merchandiser-in-005 explicitly.
- Status: [x]

## Task 48: Full backend suite regression
- Files: none (verification task)
- Do: run the whole backend suite; confirm all prior 001/002/003/004 tests still pass alongside the new 005 engine/validation/orchestration/endpoint tests after the schema + DI additions.
- Verify: `dotnet test backend/Evo.sln` → all green; report the pass count (prior total + new 005 tests).
- Status: [x]

**PHASE 7 CHECKPOINT — HARD STOP: summarize + evidence (seeder run output showing routes/assignments/planned_visits with stable counts on re-run, regenerated contract diff + client grep, full-suite green count), give the human the 1-minute API test script, commit `feat(005): route planning seeder via real engine + contract + docs`, then run /end-session and END TURN. This completes the first M1 backend module — the planner UI is the next M1 spec.**
