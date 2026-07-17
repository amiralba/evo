# Tasks: Tasks & Rules (008-tasks-rules)

<!-- Granularity rule: each task ≈ 2–5 minutes, doable by someone with NO project context.
     Every task names exact files and how to verify. [P] = parallelizable with adjacent [P].
     Q1–Q8 confirmed 2026-07-17 (spec.md). Phase 1 unblocked. -->

## Phase 1 — Domain resolution engine (pure, `Evo.Domain/Tasks/`)

## Task 1 [P]: TaskEffectOp enum
- Files: `backend/src/Evo.Domain/Tasks/TaskEffectOp.cs`
- Do: create `namespace Evo.Domain.Tasks; public enum TaskEffectOp { IncludeTask = 1, ExcludeTask = 2, SetMinutes = 3, ScaleMinutes = 4 }`. (Q1 scope: duration + membership ops only.)
- Verify: `dotnet build backend/src/Evo.Domain` compiles.
- Status: [x]

## Task 2 [P]: RuleScopeLevel enum with specificity order
- Files: `backend/src/Evo.Domain/Tasks/RuleScopeLevel.cs`
- Do: `public enum RuleScopeLevel { Global = 0, Chain = 1, Format = 2, Route = 3, Store = 4 }` — numeric value = specificity (higher wins). Add XML doc citing design §2.9 "store > route > format > chain > global".
- Verify: `dotnet build backend/src/Evo.Domain`.
- Status: [x]

## Task 3 [P]: StoreAttributes record
- Files: `backend/src/Evo.Domain/Tasks/StoreAttributes.cs`
- Do: `public record StoreAttributes(Guid StoreId, Guid? ChainId, byte Format, string Category, string? Channel, string Province, Guid? RouteId)` — the resolver's match surface (RouteId set when resolving in a route context, else null).
- Verify: `dotnet build backend/src/Evo.Domain`.
- Status: [x]

## Task 4 [P]: Input records (template + rule + instance override)
- Files: `backend/src/Evo.Domain/Tasks/TaskResolverInputs.cs`
- Do: define `TaskTemplateInput(Guid Id, string Code, int DefaultMinutes, string? TargetChain, byte? TargetFormat, DateOnly? ValidUntil, bool Active)`; `TaskRuleInput(Guid Id, Guid? TaskTemplateId, RuleScopeLevel Scope, StoreConditionMatch Condition, TaskEffectOp Op, int? SetValue, decimal? ScaleValue, int Priority, DateOnly EffectiveFrom, DateOnly? EffectiveTo)`; `StoreConditionMatch(Guid? ChainId, byte? Format, string? Category, string? Channel, string? Province, Guid? RouteId, Guid? StoreId)`; `InstanceOverrideInput(Guid TaskTemplateId, int Minutes)`.
- Verify: `dotnet build backend/src/Evo.Domain`.
- Status: [x]

## Task 5 [P]: SourceTraceStep + ResolvedTask records
- Files: `backend/src/Evo.Domain/Tasks/ResolvedTask.cs`
- Do: `public record SourceTraceStep(string Layer, TaskEffectOp Op, int BeforeMinutes, int AfterMinutes, Guid? RuleId)`; `public record ResolvedTask(Guid TaskTemplateId, string Code, int Minutes, IReadOnlyList<SourceTraceStep> Trace)`. This is the Rule Inspector payload.
- Verify: `dotnet build backend/src/Evo.Domain`.
- Status: [x]

## Task 6: RuleMatcher (condition + window match)
- Files: `backend/src/Evo.Domain/Tasks/RuleMatcher.cs`
- Do: `public static class RuleMatcher { public static bool Matches(TaskRuleInput rule, StoreAttributes store, DateOnly date); }` — true when every non-null condition field equals the store's value AND `date` in `[EffectiveFrom, EffectiveTo]`. Null condition fields are wildcards.
- Verify: covered by Task 7 tests.
- Status: [x]

## Task 7: RuleMatcher unit tests
- Files: `backend/tests/Evo.Tests/Tasks/RuleMatcherTests.cs`
- Do: tests — format-only condition matches MM store / rejects 5M; store-id condition; date inside/outside window; multi-field AND.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~RuleMatcherTests` green.
- Status: [x]

## Task 8: TaskResolver — template membership (INCLUDE/EXCLUDE + target + valid_until)
- Files: `backend/src/Evo.Domain/Tasks/TaskResolver.cs`
- Do: `public static class TaskResolver { public static IReadOnlyList<ResolvedTask> Resolve(StoreAttributes store, IReadOnlyList<TaskTemplateInput> templates, IReadOnlyList<TaskRuleInput> rules, DateOnly date, IReadOnlyList<InstanceOverrideInput>? overrides = null); }`. Step 1: start from templates that are Active, target-match the store, and not past `ValidUntil` on `date`; apply `INCLUDE_TASK` rules (add template) and `EXCLUDE_TASK` rules (remove) — exclude wins at equal/higher specificity.
- Verify: covered by Task 11 tests.
- Status: [x]

## Task 9: TaskResolver — minutes ladder (SET/SCALE by priority, with trace)
- Files: `backend/src/Evo.Domain/Tasks/TaskResolver.cs`
- Do: for each included template, start at `DefaultMinutes` (trace step "template default"); apply matching SET/SCALE rules ordered low→high by `(Scope, Priority, EffectiveFrom, CreatedAt-proxy)`; SCALE multiplies running value, SET replaces; append a `SourceTraceStep` per applied rule. Round to nearest int minute. (Q8 arithmetic order.)
- Verify: covered by Task 11/12 tests.
- Status: [x]

## Task 10: TaskResolver — per-instance override wins last
- Files: `backend/src/Evo.Domain/Tasks/TaskResolver.cs`
- Do: after the ladder, if an `InstanceOverrideInput` exists for the template, replace minutes and append trace step `Layer="manual (instance)"`.
- Verify: covered by Task 11 tests.
- Status: [x]

## Task 11: TaskResolver core unit tests
- Files: `backend/tests/Evo.Tests/Tasks/TaskResolverTests.cs`
- Do: tests named exactly — `MoreSpecificScopeWins`, `ScaleThenSetArithmetic`, `DatedRuleOverridesPermanentWhileActive`, `ExcludeWinsOverInclude`, `TargetFilterLimitsTemplate`, `ValidUntilExpiredTemplateDropped`, `InstanceOverrideReplacesOneTaskOnly`, `VisitTotalIsSumOfTasks`.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~TaskResolverTests` — all 8 green.
- Status: [x]

## Task 12: TaskResolver trace/arithmetic assertion test
- Files: `backend/tests/Evo.Tests/Tasks/TaskResolverTraceTests.cs`
- Do: assert the design §6.4 example (template 20 → format SCALE ×1.5 → 30 → store SET 60 → 60) produces exactly 3 trace steps with the right before/after minutes and rule ids.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~TaskResolverTraceTests` green.
- Status: [x]

## Phase 2 — Persistence (`Evo.Infrastructure/Tasks/` + migration)

## Task 13 [P]: TaskTemplate entity
- Files: `backend/src/Evo.Infrastructure/Tasks/TaskTemplate.cs`
- Do: entity with `Id, Code, Name, DefaultMinutes, Recurrence (enum EVERY_VISIT/WEEKLY/ONCE), ProofRequired (enum), InstructionsText, ModulesJson (string? — reserved, unused in M2), DefaultDeadlinePolicy (string?), TargetChain (Guid?), TargetFormat (byte?), ValidUntil (DateOnly?), Active bool`.
- Verify: `dotnet build backend/src/Evo.Infrastructure`.
- Status: [x]

## Task 14 [P]: TaskRecurrence + ProofRequired enums
- Files: `backend/src/Evo.Infrastructure/Tasks/TaskRecurrence.cs`, `backend/src/Evo.Infrastructure/Tasks/ProofRequired.cs`
- Do: `enum TaskRecurrence { EveryVisit = 1, Weekly = 2, Once = 3 }`; `enum ProofRequired { None = 0, Photo = 1, Form = 2 }`.
- Verify: `dotnet build backend/src/Evo.Infrastructure`.
- Status: [x]

## Task 15 [P]: Rule entity
- Files: `backend/src/Evo.Infrastructure/Tasks/Rule.cs`
- Do: entity `Id, TaskTemplateId (Guid?), Scope (RuleScopeLevel), ConditionJson (string), EffectJson (string), Priority int, EffectiveFrom DateOnly, EffectiveTo DateOnly?, CreatedBy Guid?, CreatedAt DateTimeOffset`. Condition/effect stored as JSON per design §5 (`rule` table).
- Verify: `dotnet build backend/src/Evo.Infrastructure`.
- Status: [x]

## Task 16 [P]: TaskInstance entity + status enum
- Files: `backend/src/Evo.Infrastructure/Tasks/TaskInstance.cs`, `backend/src/Evo.Infrastructure/Tasks/TaskInstanceStatus.cs`
- Do: `enum TaskInstanceStatus { Pending=1, InProgress=2, Done=3, Overdue=4, Cancelled=5 }`; entity `Id, PlannedVisitId (Guid?), StoreId, MerchandiserId (Guid?), TaskTemplateId, ResolvedMinutes int, OverrideMinutes int?, OverrideScope (enum INSTANCE/STORE_RULE null), Deadline DateOnly?, Status, CancelReason string?, ResultJson string?` (ResultJson reserved for M3).
- Verify: `dotnet build backend/src/Evo.Infrastructure`.
- Status: [x]

## Task 17: Register DbSets + entity config in EvoDbContext
- Files: `backend/src/Evo.Infrastructure/EvoDbContext.cs`
- Do: add `DbSet<TaskTemplate>`, `DbSet<Rule>`, `DbSet<TaskInstance>`; in `OnModelCreating` configure keys, `Rule.TaskTemplateId` nullable FK, `TaskInstance.PlannedVisitId` nullable FK (SetNull on delete), enum→int conversions, index `TaskInstance(PlannedVisitId)` and `Rule(Scope)`.
- Verify: `dotnet build backend/Evo.sln`.
- Status: [x]

## Task 18: EF migration AddTasksRules
- Files: `backend/src/Evo.Infrastructure/Migrations/` (generated)
- Do: `dotnet ef migrations add AddTasksRules --project backend/src/Evo.Infrastructure --startup-project backend/src/Evo.Api`.
- Verify: migration file created; `dotnet build backend/Evo.sln` succeeds; snapshot includes the 3 tables.
- Status: [x]

## Phase 3 — TaskPlanProvider + PlanGeneration integration

## Task 19: ITaskPlanProvider interface
- Files: `backend/src/Evo.Infrastructure/Tasks/ITaskPlanProvider.cs`
- Do: `Task<IReadOnlyList<ResolvedTask>> ResolveAsync(StoreAttributes store, DateOnly date, CancellationToken ct)` and a batch `Task<...> ResolveForStoresAsync(IReadOnlyList<StoreAttributes>, DateOnly, ct)` returning per-store lists (avoids N+1 in generation).
- Verify: `dotnet build backend/src/Evo.Infrastructure`.
- Status: [x]

## Task 20: TaskPlanProvider — load templates/rules, call resolver
- Files: `backend/src/Evo.Infrastructure/Tasks/TaskPlanProvider.cs`
- Do: implement `ITaskPlanProvider`: load Active templates + Rules once, map DB rows → `TaskTemplateInput`/`TaskRuleInput` (parse Condition/Effect JSON), call `TaskResolver.Resolve`. Register in `Evo.Api/Program.cs` DI (`AddScoped`).
- Verify: `dotnet build backend/Evo.sln`; covered by Task 22 tests.
- Status: [x]

## Task 21: Build StoreAttributes from Store + route context in PlanGenerationService
- Files: `backend/src/Evo.Infrastructure/Routing/PlanGenerationService.cs`
- Do: inject `ITaskPlanProvider`; build a `StoreAttributes` per stop store (chain, format, category, channel, province, RouteId = current route).
- Verify: `dotnet build backend/Evo.sln`.
- Status: [x]

## Task 22: Replace flat minutes fallback with Σ resolved task minutes
- Files: `backend/src/Evo.Infrastructure/Routing/PlanGenerationService.cs`
- Do: replace lines 82–87 minutes calc — if `stop.ServiceMinutes` set, keep it (manual override, source Manual); else `minutes = Σ resolver.ResolveAsync(store, date).Minutes`. Batch-resolve per date to avoid N+1.
- Verify: covered by Task 24 tests.
- Status: [x]

## Task 23: Upsert TaskInstance rows per future visit
- Files: `backend/src/Evo.Infrastructure/Routing/PlanGenerationService.cs`
- Do: after building each `PlannedVisit`, upsert one `TaskInstance` per `ResolvedTask` (key = PlannedVisitId+TaskTemplateId); set `ResolvedMinutes`, `Status=Pending`, `Deadline` from ONCE template policy. Delete instances for visits removed. Never touch past-dated instances (mirror the PlannedVisit horizon rule).
- Verify: covered by Task 24/25 tests.
- Status: [x]

## Task 24: PlanGeneration task-minutes integration test
- Files: `backend/tests/Evo.Tests/Routing/PlanGenTaskMinutesTests.cs`
- Do: seed a store + templates + rules in the test DB; regenerate; assert `PlannedVisit` duration == Σ resolved minutes and a `TaskInstance` row exists per resolved task.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~PlanGenTaskMinutesTests` green.
- Status: [x]

## Task 25: Format-change re-resolution + frozen-history tests
- Files: `backend/tests/Evo.Tests/Routing/PlanGenFormatChangeReresolvesTests.cs`
- Do: test `PlanGenFormatChangeReresolvesTests` — change `Store.Format`, regenerate, assert future durations/instances change; assert a past-dated `TaskInstance` is untouched; assert `RouteStop.ServiceMinutes` set still wins.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~PlanGenFormatChangeReresolvesTests` green.
- Status: [x]

<!-- CHECKPOINT after Task 25: backend engine + generation done. Commit, run full backend suite, report. -->

## Phase 4 — API (controllers, DTOs, contract)

## Task 26 [P]: Task-plan + rule DTOs
- Files: `backend/src/Evo.Api/Tasks/Dtos/TaskPlanDtos.cs`
- Do: `TaskPlanDto(Guid storeId, DateOnly date, int visitTotalMinutes, IReadOnlyList<ResolvedTaskDto> tasks)`; `ResolvedTaskDto(Guid templateId, string code, string name, int minutes, IReadOnlyList<SourceTraceStepDto> trace)`; `SourceTraceStepDto(string layer, string op, int before, int after)`.
- Verify: `dotnet build backend/src/Evo.Api`.
- Status: [x]

## Task 27 [P]: Rule + template DTOs
- Files: `backend/src/Evo.Api/Tasks/Dtos/RuleDtos.cs`
- Do: `TaskTemplateDto`, `RuleDto`, `CreateRuleRequest(scope, condition{}, effect{op,value}, priority, effectiveFrom, effectiveTo?)`, `RuleImpactDto(int stores, int visitsPerWeek, int deltaMinutesPerWeek, int daysOver450)`, `PatchTaskInstanceRequest(int minutes, string scope /*INSTANCE|STORE_RULE|FORMAT_RULE*/)`, `AdhocTaskRequest(templateCode, name, minutes, targetChain?, targetFormat?, deadline)`.
- Verify: `dotnet build backend/src/Evo.Api`.
- Status: [x]

## Task 28: TaskTemplatesController — GET catalog
- Files: `backend/src/Evo.Api/Controllers/TaskTemplatesController.cs`
- Do: `[Authorize(Roles=Supervisor)] GET /task-templates` returns active templates as `TaskTemplateDto[]`.
- Verify: `dotnet build`; add to Task 34 test.
- Status: [x]

## Task 29: StoresController — GET /stores/{id}/task-plan
- Files: `backend/src/Evo.Api/Controllers/StoresController.cs`
- Do: add `GET /stores/{id}/task-plan?date=` — build StoreAttributes, call `ITaskPlanProvider`, map to `TaskPlanDto` with per-task trace + visit total. 404 if store missing.
- Verify: `dotnet build`; Task 34 test.
- Status: [x]

## Task 30: RulesController — GET/POST rules
- Files: `backend/src/Evo.Api/Controllers/RulesController.cs`
- Do: `GET /rules` (list), `POST /rules` (create from `CreateRuleRequest`, serialize condition/effect to JSON, set CreatedBy from user). Supervisor-only. Emit `admin_audit_log` entry (entity=RULE) via the 003 audit writer. After create, regenerate affected routes (scope match) via `IPlanGenerationService`.
- Verify: `dotnet build`; Task 35 test.
- Status: [x]

## Task 31: RulesController — GET /rules/impact (no persist)
- Files: `backend/src/Evo.Api/Controllers/RulesController.cs`
- Do: `GET /rules/impact` — compute the aggregate preview (stores matched, visits/week, Δmin/week, days pushed >450) by resolving with-vs-without the candidate rule over the affected stores' upcoming week. MUST NOT write anything.
- Verify: `dotnet build`; Task 36 test asserts no rows persisted.
- Status: [x]

## Task 32: TaskInstancesController — PATCH scope edit
- Files: `backend/src/Evo.Api/Controllers/TaskInstancesController.cs`
- Do: `PATCH /task-instances/{id}` with `scope`: INSTANCE → set `OverrideMinutes`/`OverrideScope=INSTANCE` + recompute that visit's duration; STORE_RULE / FORMAT_RULE → create a Rule at that scope then regenerate affected routes. Audit rule creations.
- Verify: `dotnet build`; Task 37 test.
- Status: [x]

## Task 33: adhoc task endpoint
- Files: `backend/src/Evo.Api/Controllers/TaskInstancesController.cs`
- Do: `POST /tasks/adhoc` — create a `TaskTemplate` (recurrence=ONCE, target, valid_until=deadline), return count of matching active stores; regeneration attaches instances to the nearest visit before deadline.
- Verify: `dotnet build`; Task 38 test.
- Status: [x]

## Task 34: Template + task-plan endpoint tests
- Files: `backend/tests/Evo.Tests/Tasks/TaskPlanEndpointTests.cs`
- Do: test `GET /task-templates` returns seeded templates; `GET /stores/{id}/task-plan` returns tasks with trace + correct visit total; 404 on missing store.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~TaskPlanEndpointTests` green.
- Status: [x]

## Task 35: Rule create tests (auth + audit + regen)
- Files: `backend/tests/Evo.Tests/Tasks/RulesEndpointTests.cs`
- Do: `POST /rules` as Supervisor succeeds + writes an admin_audit_log row + affected route visits re-resolve; non-Supervisor → 403.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~RulesEndpointTests` green.
- Status: [x]

## Task 36: Impact endpoint no-persist test
- Files: `backend/tests/Evo.Tests/Tasks/RuleImpactTests.cs`
- Do: call `GET /rules/impact`; assert returned counts are non-trivial AND `Rules`/`TaskInstance` row counts unchanged before/after.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~RuleImpactTests` green.
- Status: [x]

## Task 37: PATCH task-instance scope tests
- Files: `backend/tests/Evo.Tests/Tasks/TaskInstanceScopeTests.cs`
- Do: INSTANCE scope → only that visit's minutes change; STORE_RULE → a Rule row created and other visits of that store change; FORMAT_RULE → all stores of the format change.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~TaskInstanceScopeTests` green.
- Status: [x]

## Task 38: adhoc + V10-warning tests
- Files: `backend/tests/Evo.Tests/Tasks/AdhocTaskTests.cs`
- Do: `POST /tasks/adhoc` attaches an instance with the deadline to a matching store's next visit; a rule that pushes a day >450 returns V10 as Warning (not blocked) on `GET /routes/{id}/plan`.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~AdhocTaskTests` green.
- Status: [x]

## Task 39: Regenerate OpenAPI contract + TS client
- Files: `backend/contracts/openapi.json`, `panel/src/api/generated/`
- Do: `dotnet build backend/Evo.sln` (regenerates contract) then `cd panel && npm run generate-api-client`.
- Verify: new endpoints present in `contracts/openapi.json`; TS client compiles (`cd panel && npm run build`).
- Status: [x]

<!-- CHECKPOINT after Task 39: API + contract done. Commit, run full backend suite, report. -->

## Phase 5 — Seeder (CLAUDE.md rule: tables added ⇒ seeder extended)

## Task 40: TaskRuleSeederModule — templates
- Files: `backend/src/Evo.Seeder/Modules/TaskRuleSeederModule.cs`
- Do: implement `ISeederModule`; seed ≥6 templates (BEFORE_PHOTO, SHELF_WORK, SKT_CHECK, PRICE_COLLECT, DISPLAY_CHECK, SURVEY) with realistic default_minutes + recurrence + Turkish names.
- Verify: build; Task 44.
- Status: [x]

## Task 41: TaskRuleSeederModule — rules
- Files: `backend/src/Evo.Seeder/Modules/TaskRuleSeederModule.cs`
- Do: seed a realistic rule set — format SCALE rules (MM ×1.3, 4M ×1.6, 5M ×2.0), 1–2 store-specific SET rules, 1 route rule, 1 dated rule (window = this week), 1 EXCLUDE rule.
- Verify: build; Task 44.
- Status: [x]

## Task 42: TaskRuleSeederModule — adhoc survey
- Files: `backend/src/Evo.Seeder/Modules/TaskRuleSeederModule.cs`
- Do: seed one ONCE survey template targeting Migros MM with a deadline ~10 days out.
- Verify: build; Task 44.
- Status: [x]

## Task 43: Register seeder module (after routes) + regenerate instances
- Files: `backend/src/Evo.Seeder/Program.cs`
- Do: register `TaskRuleSeederModule` AFTER `RouteSeederModule`; after seeding rules, trigger `PlanGenerationService.RegenerateFutureAsync` for seeded routes so TaskInstances materialize (or document that first panel load regenerates).
- Verify: `dotnet build backend/Evo.sln`.
- Status: [x]

## Task 44: Run seeder end-to-end
- Files: (none)
- Do: `dotnet run --project backend/src/Evo.Seeder -- --profile demo --wipe`.
- Verify: completes without error; query DB — `task_template` ≥6 rows, `rule` ≥6 rows, `task_instance` non-empty on future dates.
- Status: [x]

<!-- CHECKPOINT after Task 44: data exists. Commit, report seeder counts. -->

## Phase 6 — Panel (Görevler tab + scope modal)

## Task 45 [P]: i18n strings
- Files: `panel/src/i18n/locales/tr.json`
- Do: add keys — `planner.taskSource.*` (template/chain/format/route/store/manual labels), `planner.taskDuration`, `planner.applyScope.thisVisit/thisStore/allFormat`, `planner.impactPreview.*`, `planner.visitTotal`. Remove `planner.tasksComingM2`.
- Verify: `cd panel && npm run lint`.
- Status: [x]

## Task 46 [P]: task-plan query hook
- Files: `panel/src/planner/api/queries.ts`
- Do: add `useStoreTaskPlan(storeId, date)` (TanStack Query → generated `GET /stores/{id}/task-plan`) and `useRuleImpact(params)` (lazy/enabled-on-demand).
- Verify: `cd panel && npm run build` type-checks.
- Status: [x]

## Task 47: TasksTab component (replaces empty state)
- Files: `panel/src/planner/components/panel/TasksTab.tsx`
- Do: render the resolved task list — each row: task name, duration, a source pill (from the last trace step's layer). Footer: visit total + day badge. Loading/empty/error states matching existing panel style.
- Verify: `cd panel && npm run build`.
- Status: [x]

## Task 48: Wire TasksTab into RouteDetailPanel
- Files: `panel/src/planner/components/panel/RouteDetailPanel.tsx`
- Do: replace line 92 empty state with `<TasksTab storeId={...} date={...} />` (store/date from the focused visit selection).
- Verify: `cd panel && npm run build`; Görevler tab renders a list.
- Status: [x]

## Task 49: TaskScopeModal — duration edit + scope choice
- Files: `panel/src/planner/components/panel/TaskScopeModal.tsx`
- Do: opened by clicking a task's duration; radio scope (this visit / this store / all {format}); on scope change fetch `useRuleImpact` and show the preview (stores, visits/week, Δmin/week, days over 450); Save calls `PATCH /task-instances/{id}` with the chosen scope.
- Verify: `cd panel && npm run build`.
- Status: [x]

## Task 50: Refresh schedule/health after save
- Files: `panel/src/planner/components/panel/TaskScopeModal.tsx`, `panel/src/planner/api/queries.ts`
- Do: on save success, invalidate plan + health + task-plan queries so the grid/health/Görevler reflect new minutes.
- Verify: manual — edit a duration, day total updates in the schedule pane.
- Status: [x]

## Task 51: Rule Inspector detail (trace popover)
- Files: `panel/src/planner/components/panel/TasksTab.tsx`
- Do: clicking a source pill expands the full trace (template default → each rule → override) with the arithmetic, per design §6.4/§7.5.2.
- Verify: `cd panel && npm run build`; manual — trace shows the ladder.
- Status: [x]

## Task 52 [P]: TasksTab Vitest
- Files: `panel/src/planner/components/panel/TasksTab.test.tsx`
- Do: mock `GET /stores/{id}/task-plan`; assert rows render with duration + source pill and the visit total is the sum.
- Verify: `cd panel && npm test -- TasksTab` green.
- Status: [x]

## Task 53 [P]: TaskScopeModal Vitest
- Files: `panel/src/planner/components/panel/TaskScopeModal.test.tsx`
- Do: assert scope radios render, impact preview appears on scope select (mocked), Save calls PATCH with the chosen scope.
- Verify: `cd panel && npm test -- TaskScopeModal` green.
- Status: [x]

## Task 54: Playwright — Görevler flow smoke
- Files: `panel/e2e/tasks-tab.spec.ts`
- Do: log in, focus a route/visit, open Görevler, assert a non-empty task list with source pills; open the scope modal and assert the impact preview appears.
- Verify: `cd panel && npx playwright test tasks-tab` green.
- Status: [x]

## Phase 7 — Docs + close-out

## Task 55 [P]: docs/DATABASE.md — new tables
- Files: `docs/DATABASE.md`
- Do: document `task_template`, `rule`, `task_instance` (columns, nullable FKs, indexes) matching the migration.
- Verify: table names/columns match `EvoDbContextModelSnapshot.cs`.
- Status: [x]

## Task 56 [P]: docs/API.md — new endpoints
- Files: `docs/API.md`
- Do: document the 6 new endpoints with request/response shapes + the INSTANCE/STORE_RULE/FORMAT_RULE scope semantics and the never-block V10 behavior.
- Verify: endpoints match the controllers.
- Status: [x]

## Task 57 [P]: docs/DECISIONS.md — M2 decisions
- Files: `docs/DECISIONS.md`
- Do: log — M2 effect-op scope (Q1), scale/set arithmetic order (Q8), priority tie-break, materialize TaskInstances (Q7), simulate/route + Conflict Center deferral rationale. Note the `service_minutes` fallback is now superseded (flag in `EVO-Route-Planning-Design.md` if it documents old behavior).
- Verify: entries reference spec 008.
- Status: [x]

## Task 58 [P]: docs/ARCHITECTURE.md + ROADMAP.md
- Files: `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`
- Do: note the resolver in the scheduling section (minutes now = Σ tasks); tick M2 items in ROADMAP.
- Verify: ROADMAP M2 boxes checked; ARCHITECTURE mentions `TaskResolver`.
- Status: [x]

## Task 59: Full-suite regression + final checkpoint
- Files: (none)
- Do: `dotnet test backend/Evo.sln`; `cd panel && npm test && npm run lint && npm run build`; `npx playwright test`.
- Verify: backend all green (103 prior + new), panel all green. Then run /end-session.
- Status: [x]
