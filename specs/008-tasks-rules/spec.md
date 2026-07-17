# Spec: Tasks & Rules   (slug: 008-tasks-rules)

<!-- Copy this folder to specs/NNN-feature-name/ per feature. Owned by: planner. -->

## Problem & goal

Today a visit's duration is a single hand/derived number: `PlanGenerationService` uses
`RouteStop.ServiceMinutes ?? Store.DefaultServiceMinutes ?? settings.DefaultServiceMinutes`
(a flat fallback, `PlanGenerationService.cs` lines 82–87). The design (§2.3, §2.8–2.10, §2.9
resolution chain) says the truth is: **a visit's work is a list of Tasks, and its duration is the
sum of those tasks' resolved minutes** — where tasks are attached by attribute matching (chain /
format Jet·M·MM·3M·4M·5M / category / channel / province / route / store) and their minutes are
resolved through a layered Rule ladder (template default → chain/format → route → store →
per-instance override), with date-limited rules auto-expiring like patches.

M2 replaces the flat fallback with this Rule-resolution engine and materializes the resulting
per-visit task lists (`TaskInstance` rows), so that:
- when a small Migros syncs in, its default task set materializes with zero clicks;
- a planner can see **why** a store costs N minutes (per-task source trace = "Rule Inspector");
- a planner can create one-off targeted tasks (survey/campaign) that attach to visits before a
  deadline and escalate to OVERDUE;
- editing a duration writes the right scope (instance override / store rule / format rule) with an
  **aggregate impact preview** before saving (never auto-decide; §6.4).

Success: `PlanGenerationService` computes visit minutes as Σ resolved task minutes; the planner's
**Görevler** tab (currently an M2-pending empty state, `RouteDetailPanel.tsx` line 92) shows the
resolved task list with source traces; and the seeder produces realistic templates, rules, and
task instances.

## Brainstorm results

- **Chosen approach:** a **pure domain resolution engine** (`Evo.Domain.Tasks.TaskResolver`, mirroring
  how `DayScheduler`/`FrequencyExpander`/`PatchResolver` are pure and unit-testable) that takes a store's
  attributes + the active template/rule set for a date and returns an ordered `ResolvedTask[]` with a
  per-task **source trace**. `PlanGenerationService` calls it per projected visit to get minutes and to
  upsert `TaskInstance` rows; `GET /stores/{id}/task-plan` exposes the same trace to the UI. One engine,
  one source of truth for UI + generation + validation (design §9 "same rule set exposed to UI and write").
- **Alternatives rejected:**
  - *Precompute a store→minutes cache table* — rejected: date-limited rules make it a time-varying
    function; a pure resolver evaluated per-date is simpler and matches the patch model already in use.
  - *Store task lists as manual per-store links* — rejected by design §2.10 ("attached by attribute
    matching, never manual linking"). One concept (Rule), not two.
  - *A separate Campaign entity* — rejected by design §2.8 v0.5 decision (campaign = `ONCE` template +
    `target` + `valid_until`). One-off targeted tasks reuse TaskTemplate/TaskInstance.
- **Later (out of v1/M2 scope):** module stack editor (`FOTOĞRAF`/`FORM`/`KONTROL`/`BİLGİ` composition
  and the `PATCH_MODULE` effect), the Yönetim admin pages (task-template list + store-type rule matrix
  UI), `SET_FREQUENCY` / `SET_MODULES` effects, override-rate analytics, task-result payloads (field
  execution — that is M3), and the drag-edge "Apply-to-all" scope toast on the schedule grid (M2 does the
  **modal** scope flow; the grid toast can reuse it later).

## User stories

- As a supervisor, when I open a visit's **Görevler**, I see each task with its duration **and its
  source** (template default / chain rule / format rule / route rule / store rule / manual override), so I
  understand why this store costs N minutes.
- As a supervisor, I can change a task's duration and choose the **scope** — only this visit, this store
  from now on, or all stores of this format — and see an **impact preview** (# stores, # visits/week,
  Δ min/week, # days pushed over 450) before I save.
- As a supervisor, generated visit durations automatically equal the sum of their resolved task minutes,
  so I never hand-type a number and durations self-update when a store's format changes or a rule changes.
- As a supervisor, I can create a **one-off targeted task** (e.g. "salça survey, Migros MM, due 12 Jul"),
  and it attaches to matching stores' next suitable visit before the deadline; if no visit exists before
  the deadline it is flagged.
- As a supervisor, a date-limited rule (e.g. "today only, Migros MM shelf work = 60 dk") overrides the
  permanent rule while active and auto-expires afterward, exactly like a patch.

## Acceptance criteria (testable)

Resolution engine (pure domain, unit tests in `Evo.Tests/Tasks/`):
- [ ] `TaskResolver.Resolve(store, templates, rules, date)` returns the set of INCLUDE'd templates minus
      EXCLUDE'd ones, each with resolved minutes and an ordered source trace.
- [ ] Priority ordering is enforced: **store > route > format > chain > global**; the most specific
      matching rule wins (`TaskResolverTests.MoreSpecificScopeWins`).
- [ ] `SET_MINUTES` sets an absolute value; `SCALE_MINUTES` multiplies the running value; a chain of
      scale-then-set resolves in priority order (`TaskResolverTests.ScaleThenSetArithmetic`).
- [ ] A date-limited rule active on `date` overrides an overlapping permanent rule; outside its window the
      permanent value returns (`TaskResolverTests.DatedRuleOverridesPermanentWhileActive`).
- [ ] `EXCLUDE_TASK` removes a template even if a lower-priority rule INCLUDE'd it
      (`TaskResolverTests.ExcludeWinsOverInclude` — exclude at higher/equal specificity).
- [ ] A template with `target = {format: MM}` only appears for MM stores; empty target = all stores.
- [ ] A `valid_until`-expired template never appears in a resolution for a date past its expiry.
- [ ] Visit total = Σ resolved task minutes; a per-`INSTANCE` override replaces one task's minutes for one
      visit only.

Plan generation integration (`Evo.Tests/Routing/`):
- [ ] `PlanGenerationService` sets each `PlannedVisit` duration = Σ resolved task minutes (replacing the
      flat `ServiceMinutes` fallback), and upserts one `TaskInstance` per resolved task per future visit.
- [ ] When a store's `Format` changes and the route is regenerated, its visit durations and task instances
      re-resolve automatically (`PlanGenFormatChangeReresolvesTests`).
- [ ] `RouteStop.ServiceMinutes`, when set, still wins as an explicit manual override (design §2.9 last
      line) — regeneration honors it and marks the source as `Manual`.
- [ ] Regeneration never touches past visits/task instances (horizon-only, matching existing behavior).

API (`Evo.Tests/Tasks/` endpoint tests):
- [ ] `GET /task-templates` returns the active catalog.
- [ ] `GET /stores/{id}/task-plan?date=` returns the resolved task set with per-task source trace and the
      visit total.
- [ ] `POST /rules` creates a rule (condition → effect, scope, priority, effective_from/to) and returns it;
      Supervisor-only; writes an `admin_audit_log` entry (design §2.14, entity = RULE).
- [ ] `GET /rules` lists rules; `PATCH /task-instances/{id}` applies a modal edit with
      `scope ∈ {INSTANCE, STORE_RULE, FORMAT_RULE}` — INSTANCE writes an override, STORE_RULE/FORMAT_RULE
      create/update a Rule and trigger regeneration of affected routes.
- [ ] `GET /rules/impact?scope=&condition=&effect=` returns the aggregate impact preview
      (stores, visits/week, Δmin/week, days over 450) WITHOUT persisting anything.
- [ ] `POST /tasks/adhoc` creates a one-off targeted task (`recurrence=ONCE`, target filter, deadline) and
      returns the count of stores it will attach to.
- [ ] Rule create/edit that alters durations surfaces V10 (day > 450) as a **Warning**, not a block
      (design §3.2 V10; never-block principle).

Panel (`panel/`, Vitest + one Playwright check):
- [ ] The **Görevler** tab renders the resolved task list for the focused visit/store with each row's
      duration + source pill (replacing the M2-pending empty state).
- [ ] A duration edit opens the scope modal (this visit / this store / all {format}); choosing a scope
      shows the impact preview and, on confirm, calls the right endpoint and the schedule/health refresh.
- [ ] Seeder: `--profile demo` produces ≥6 task templates, a realistic rule set (format scale rules +
      a couple store/route exceptions + one dated rule + one adhoc survey), and materialized task instances
      on future visits; `dotnet run --project backend/src/Evo.Seeder -- --profile demo` completes and the
      Görevler tab shows non-empty task lists.

## Clarifications

<!-- Filled by the clarify step BEFORE planning. Q asked → answer given. -->
| # | Question | Answer |
|---|---|---|
| 1 | Which Rule `effect` ops are in M2 scope vs deferred? | **CONFIRMED.** M2 = `INCLUDE_TASK`, `EXCLUDE_TASK`, `SET_MINUTES`, `SCALE_MINUTES`. Defer `SET_FREQUENCY`, `SET_MODULES`, `PATCH_MODULE`. |
| 2 | What exactly does the Rule Inspector show in M2? | **CONFIRMED.** Per-task read-only provenance (şablon → chain → format → route → store → override) with the arithmetic (e.g. "20 × 1.5 → 30, store rule → 60"), matching design §6.4 mock. No editing from the inspector — edits go through the scope modal. |
| 3 | What is a "one-off targeted task" operationally? | **CONFIRMED.** A `TaskTemplate` with `recurrence=ONCE` + `target {format?/chain?}` + `valid_until`/deadline; on generation it attaches one `TaskInstance` to the nearest suitable visit before the deadline; OVERDUE if not done by deadline. Created via `POST /tasks/adhoc`. |
| 4 | Does `POST /simulate/route` land in M2? | **CONFIRMED — NO, stays deferred.** See "Scope decision" below. |
| 5 | Does the Conflict Center / Sorun Merkezi land in M2? | **CONFIRMED — NO, stays deferred.** M2 surfaces rule-impact V10 warnings inline (impact preview + existing plan warnings); a dedicated center is not a dependency. See "Scope decision". |
| 6 | Are the Yönetim admin pages (template list + rule matrix UI) in M2? | **CONFIRMED — NO.** M2 delivers the engine + panel Görevler tab + scope-modal editing (which creates rules from context, design §2.9 "created from within the route/panel"). The standalone Yönetim CRUD pages are a later spec; seeder + `POST /rules` cover data creation for M2. |
| 7 | Do we materialize `TaskInstance` rows now, or resolve on read only? | **CONFIRMED — materialize.** Future `TaskInstance` rows are written in `PlanGenerationService` (design §3.1 step 8, §2.10) — needed for deadlines/OVERDUE and consistency with the PlannedVisit horizon model. Resolve-on-read is used only by the `task-plan` preview endpoint. |
| 8 | Scale-vs-set arithmetic order when both match at different priorities? | **CONFIRMED.** Evaluate low→high priority, applying each op to the running value (scale multiplies, set replaces); a higher-priority `SET_MINUTES` wins outright, a higher-priority `SCALE_MINUTES` multiplies whatever lower layers produced. Ties (same scope, same priority) broken by newest `effective_from`. |

## Non-goals

- No module-stack editor / `FOTOĞRAF`·`FORM`·`KONTROL`·`BİLGİ` composition, no `PATCH_MODULE` effect (later).
- No task **result** payloads / field execution (photos, form answers) — that is M3 (seeded/mocked).
- No standalone Yönetim admin pages (task-template list, store-type rule matrix UI) — later spec.
- No `SET_FREQUENCY` / `SET_MODULES` effects in M2.
- No `POST /simulate/route`, no Conflict Center / Sorun Merkezi (both stay deferred — see below).
- No schedule-grid drag-edge "Apply-to-all" scope toast (M2 ships the modal scope flow only).
- No change to the Baseline+Patch model, the 450-min rule, or the publish gate (M2 feeds them minutes).

## Scope decision — simulate/route and Conflict Center (per planning brief)

**`POST /simulate/route` — stays deferred.** Rule resolution does not depend on it and it does not depend
on rule resolution being finished-differently. Simulate is a *what-if* over a candidate `stores[]` set
(design §9) used when building/rebalancing routes; it is a consumer of the resolver, not a prerequisite.
Folding it in would widen M2 with a new endpoint + UI surface that belongs to a route-building/rebalancing
story, diluting the "replace the minutes fallback" core. Recommendation: build it in a later spec once the
resolver exists (it becomes a thin call: `stores[] → Σ resolved minutes + revenue`).

**Conflict Center / Sorun Merkezi — stays deferred.** The key dependency question: does the resolver's
ranked/narrowed output *need* a Conflict Center to be usable? **No.** The design's "never block, always
justify" surface for rule changes is the **aggregate impact preview** (design §6.4/§7.5.2 Rule-change
Impact Preview) — which M2 *does* build — plus the existing per-day V1/V2/V10 warning chips already on the
plan (`GET /routes/{id}/plan` returns findings). A Conflict Center is a cross-route *aggregation/triage*
surface (a queue of all outstanding warnings across the region) — valuable, but it is an M3/M4 monitoring
concern, not a gate on shipping rule resolution. M2 makes conflicts *visible at the point of edit*; the
Center makes them *browsable across routes*. Ship M2 without it.

## Open questions
- Q1–Q8 confirmed by user 2026-07-17; all recommended answers accepted as-is. No open questions remain
  before Phase 1.
