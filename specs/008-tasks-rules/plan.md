# Plan: Tasks & Rules (008-tasks-rules)

<!-- Owned by: architect/planner. Design decisions for THIS feature only;
     project-wide changes go to docs/ARCHITECTURE.md etc. -->

## Approach

Build a **pure domain resolution engine** and wire it into the existing plan-generation pipeline,
then expose it read-only + editable through the API and the planner's Görevler tab.

1. **Domain (`Evo.Domain/Tasks/`)** — new pure types, no EF/DB dependency, mirroring the existing
   `Evo.Domain/Scheduling/` style (`DayScheduler`, `FrequencyExpander`, `PatchResolver`,
   `RouteValidator` are all pure and heavily unit-tested):
   - `TaskEffectOp` enum (`IncludeTask`, `ExcludeTask`, `SetMinutes`, `ScaleMinutes` for M2).
   - `RuleScopeLevel` enum with explicit specificity ordering (`Global < Chain < Format < Route < Store`).
   - `StoreAttributes` record (chain id, format, category, channel, province) — the match surface.
   - `TaskRuleInput` / `TaskTemplateInput` records (plain data the resolver consumes).
   - `ResolvedTask` (templateId, code, minutes, ordered `SourceTraceStep[]`) and `SourceTraceStep`
     (layer label + op + before/after minutes) — this IS the Rule Inspector payload.
   - `TaskResolver.Resolve(StoreAttributes, templates, rules, date, instanceOverrides)` → `ResolvedTask[]`.
   - `RuleMatcher` helper: does a rule's condition match a store on a date (attribute + window check).

2. **Infrastructure (`Evo.Infrastructure/Tasks/`)** — EF entities + provider:
   - `TaskTemplate`, `Rule`, `TaskInstance` entities + `EvoDbContext` DbSets + config + a migration.
   - `ITaskPlanProvider` / `TaskPlanProvider`: loads active templates + rules from the DB, calls the pure
     `TaskResolver`, returns `ResolvedTask[]` for a store+date. Used by both the API and PlanGeneration.
   - Extend `PlanGenerationService`: replace the flat minutes fallback (lines 82–87) with
     `TaskPlanProvider` output (Σ resolved minutes); upsert `TaskInstance` rows per future visit;
     honor `RouteStop.ServiceMinutes` as an explicit manual override.

3. **API (`Evo.Api/`)** — new `TaskTemplatesController`, `RulesController`, and additions to
   `StoresController` (`GET /stores/{id}/task-plan`) + a `TaskInstancesController`. DTOs generated into
   the OpenAPI contract → regenerate the TS client. Supervisor-only auth; rule writes emit
   `admin_audit_log` entries via the spec 003 audit facade.

4. **Seeder (`Evo.Seeder/Modules/TaskRuleSeederModule.cs`)** — templates, rules (format scale rules,
   store/route exceptions, a dated rule, an adhoc survey), registered in `Program.cs`; runs AFTER the
   store + route seeders so instances materialize onto seeded future visits.

5. **Panel (`panel/src/planner/`)** — replace the Görevler empty state with a `TasksTab` that fetches
   `GET /stores/{id}/task-plan`, renders rows with duration + source pill, and a duration-edit scope modal
   (`TaskScopeModal`) that previews impact (`GET /rules/impact`) and posts to the right endpoint. New
   TanStack Query hooks + Zustand wiring reusing 006's patterns.

## Contracts touched

New tables (docs/DATABASE.md): `task_template`, `rule`, `task_instance`. Reuse `admin_audit_log` (003).
New endpoints (docs/API.md): `GET /task-templates`, `GET /stores/{id}/task-plan`, `GET|POST /rules`,
`GET /rules/impact`, `PATCH /task-instances/{id}`, `POST /tasks/adhoc`. `PlanGenerationService` output
semantics change (minutes now = Σ tasks) — note in docs/ARCHITECTURE.md scheduling section.
Decisions to log (docs/DECISIONS.md): effect-op scope for M2, scale/set arithmetic order, priority
tie-break, materialize-vs-resolve-on-read, simulate/route + Conflict Center deferral rationale.

## Risks

- **Regeneration cost:** rule edits at format scope can touch many routes. Mitigate: `GET /rules/impact`
  is read-only (no writes); actual regeneration is scoped to affected route ids and reuses the existing
  horizon-only upsert. Watch for N+1 on template/rule loads — load once per generation run and pass to the
  pure resolver.
- **Frozen-history invariant:** `TaskInstance` upsert must mirror `PlannedVisit`'s "future dates only,
  past frozen" rule or history diverges. Tests must assert past instances untouched.
- **Source-of-truth drift:** the panel's inline day-total must come from the same resolver output the
  server uses (design §9). Preview math (impact) lives server-side; the panel only renders it.
- **Migration ordering:** new FKs (`task_instance.planned_visit_id`, `rule.task_template_id NULL`) —
  ensure nullable where design says (adhoc instances float; whole-set rules have null template).
