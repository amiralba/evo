# Spec: Route Planning Core (backend)   (slug: 005-route-planning-core)

<!-- First M1 feature module. Owned by: planner. Built on the M0 platform (specs 001-004).
     This spec is the BACKEND foundation of route planning: entities, scheduling engine,
     validation, publish gate, API, seeder. The single-page planner UI (map/schedule/table,
     drag-drop, live health card) is a SEPARATE, later M1 panel spec — see Non-goals. -->

## Problem & goal
M0 gave us authenticated Supervisors (002), a unified error/audit layer (003), and synced **stores**
(004). Nothing yet lets a Supervisor turn those stores into a *plan*: there is no Route, no way to put
a store on a route, no way to assign a person, no calendar of visits, and no notion of the 450-minute
working day or the Baseline+Patch model the whole product rests on.

This spec builds the **backend core of route planning**: the entities (Merchandiser, Route, RouteStop,
Assignment, Patch, PlannedVisit, plus a minimal Settings and DecisionJournal), the **scheduling engine**
(baseline expansion from frequency + weekday mask, statutory breaks, the 450-minute rule, Baseline ⊕
active-Patch resolution), the **live validation** rule set, the **publish gate** (override-with-reason →
Decision Journal → atomic PlannedVisit materialization), the REST endpoints the future panel will call,
and the seeder + contract/client updates. It stops short of the drag-heavy single-page planner UI, which
is its own subsequent M1 spec.

Two structural realities from M0 shape this spec:
- **No `Merchandiser` entity exists yet.** Only `ApplicationUser` (Identity, with the `FieldAgent` role)
  and `RefreshToken` were built in 002; `docs/DATABASE.md`'s claim that `merchandiser` shipped in 002 is
  inaccurate. Assignments target a merchandiser, so this spec creates the `merchandiser` entity
  (design §5) wrapping a `user_id`.
- **Tasks & Rules are M2.** `TaskTemplate`, `Rule`, and `TaskInstance` do not exist yet, so the
  engine's "visit duration = Σ task minutes" cannot be wired in this spec. In M1-core a visit's duration
  is `RouteStop.service_minutes ?? Store.default_service_minutes ?? settings default`. The task-sum
  wiring is an explicit M2 hand-off point.

Success = a Supervisor can (via API) create a DRAFT route with a province/district geo-scope, bulk-add
in-scope unassigned stores to it (the one-active-route rule DB-enforced), set per-stop
frequency/duration/sequence, assign a merchandiser (reason required, history preserved), preview the
generated plan for a date range (baseline ⊕ active patches, statutory breaks inserted, 450-minute
findings attached), add an expiry-mandatory patch, publish (errors passable only with a written
justification recorded to the Decision Journal, then future PlannedVisits materialized atomically), and
read a merchandiser's day; the seeder produces realistic routes/assignments/visits by running the real
engine; and the full backend suite stays green.

## Brainstorm results
- **Chosen scope split:** this spec is **backend-only** (entities + engine + validation + publish + API
  + seeder + contract/client), matching the 001-004 backend-first rhythm. The single-page planner
  (map, time-accurate schedule grid, table workspace, drag-drop, live health card, lasso, simulate) is a
  **separate later M1 spec** that renders over these endpoints. *(Rejected: building UI in the same spec —
  the drag-heavy workspace is large enough to be its own spec and would bloat this one past any sane
  checkpoint cadence.)*
- **Chosen engine shape:** pure, EF-free domain functions in `Evo.Domain/Scheduling/` (frequency→dates
  expansion, day/break/450 scheduling, Baseline ⊕ Patch resolution, validation rule evaluation) that are
  unit-tested in isolation, wrapped by an `Evo.Infrastructure` orchestration service that loads rows and
  upserts PlannedVisits. *(Rejected: engine logic inside the DbContext/controllers — untestable without a
  DB, and the design's test-critical arithmetic — CLAUDE rule 4 — deserves pure unit tests.)*
- **Chosen duration source (M1):** `RouteStop.service_minutes ?? Store.default_service_minutes ??
  settings.default_service_minutes`. The Σ-task-minutes chain is an M2 hand-off. *(Rejected: blocking this
  spec on M2's TaskTemplate/Rule — would stall the whole route model behind the rules engine.)*
- **Chosen patch auto-revert:** patches never mutate baseline rows; the engine simply **stops applying**
  a patch once `date > ends_on`. A nightly background service extends the rolling PlannedVisit horizon and
  advances patch status (PENDING→ACTIVE→EXPIRED). *(Rejected: a delete/undo job that rewrites baseline —
  the design's whole point is that revert is "don't apply expired patches at generation time.")*
- **Chosen audit path:** structural events (stop added/removed/moved, frequency changed, assigned,
  unassigned, patched, published) are written through a typed `IRouteChangeLog` facade over spec 003's
  generic `audit_log` table — no new physical audit table (per `docs/DECISIONS.md` 2026-07-16).
- **Chosen validation set (M1-core):** V1, V2 (450 warn), V3 (province/district hard block; polygon
  soft-scope deferred to the geo/panel spec), V4 (one-active-route — DB filtered-unique + service check),
  V5 (revenue < target warn), V6 (SERVICE mix warn), V7 (time_window / banned_until block), V9 (patch
  expiry required), V12 (same-person/day overlap error). Nothing hard-blocks publish except the pure
  data-integrity structurals V3/V4 (design §3.2 v0.5 severity note).
- **Later (out of 005 scope):** the planner UI (map/grid/table/drag/health card); task/rule-driven
  durations and V10/V11 (M2); travel-time layer and V13/V15 (needs OSRM, design Open Q#1); leave entity
  and V14/Onarım workbench (M4); patch-churn V16, utilization-band V8; `POST /simulate/route` what-if
  (panel/geo spec); notifications on publish (M3 — mobile deferred); the Settings admin page + draft→
  confirm flow (later — this spec seeds defaults read-only); polygon lasso / bbox / overlap / home-to-
  route spatial queries (geo/panel spec).

## User stories
- As a Supervisor, I can create a DRAFT route with a name, province, and optional district list, so I have
  a container to plan into.
- As a Supervisor, I can bulk-add unassigned, in-scope stores to a route in one call, and the system
  refuses (or offers "move here") any store already on another active route, so the one-store-one-route
  rule can never be violated.
- As a Supervisor, I can set a stop's frequency (daily / weekly / 2×-week via weekday mask / biweekly),
  duration override, and visit sequence, so the plan reflects real service patterns.
- As a Supervisor, I can assign a merchandiser to a route with a required reason, closing any prior
  assignment, so route staffing has a full dated history (the old "seat" audit value).
- As a Supervisor, I can preview a route's generated plan for a date range and see per-day planned minutes
  vs 450, statutory breaks, and any validation findings, before anything is published.
- As a Supervisor, I can add an exception (patch) with a mandatory expiry and see it reflected in the
  effective plan, with automatic revert when it expires — no one has to remember to undo it.
- As a Supervisor, I can publish a route: pending changes materialize into future PlannedVisits
  atomically; if the plan has 🔴 errors I can still publish, but only by recording a written
  justification + business objective to the Decision Journal.
- As a Supervisor, I can move a store from one route to another in a single call that atomically closes
  the old membership, opens the new one, and regenerates both routes' future visits.
- As the system, I run the scheduling engine nightly to extend the rolling visit horizon and expire
  patches, so the plan stays current without manual regeneration.
- As the developer, I can seed realistic routes/assignments/visits by running the real engine against the
  synced fake stores, exercising the true plan-generation path on every demo seed.

## Acceptance criteria (testable)

### Schema — people & route structure
- [ ] `merchandiser` entity: `Id Guid PK`, `UserId Guid FK→AspNetUsers` (unique), `HomeLocation geography
      Point? (SRID 4326)`, `HiredOn DateOnly?`, `Active bool DEFAULT true`; index on `UserId`. No delete —
      active toggle only; deactivation is **blocked while the merchandiser holds an active assignment**.
- [ ] `route` entity: `Id Guid PK`, `RouteCode string UNIQUE` (e.g. `ANK-04`), `Name`, `Province`,
      `DistrictsJson nvarchar(max)?` (JSON array), `GeoScope geography MultiPolygon? (SRID 4326)`,
      `Status tinyint (RouteStatus: Draft/Active/Inactive)`, `Version int DEFAULT 1`, `RevenueTarget
      decimal(18,2) DEFAULT 1250000`, `DailyWorkMinutes int DEFAULT 450`, `CreatedBy Guid?`, timestamps.
- [ ] `route_stop` entity: `Id Guid PK`, `RouteId FK`, `StoreId FK`, `Frequency tinyint (Daily/Weekly/
      Biweekly)`, `WeekdayMask smallint` (Mon = bit 0), `BiweeklyAnchor DateOnly?`, `ServiceMinutes int?`
      (falls back to store default), `Sequence int`, `TimeWindowStart TimeOnly?`, `TimeWindowEnd
      TimeOnly?`, `EffectiveFrom DateOnly`, `EffectiveTo DateOnly?`. **Filtered unique index on `StoreId`
      WHERE `EffectiveTo IS NULL`** → one active route per store, DB-enforced.
- [ ] Migration `AddRouting1` creates the three tables above (with the filtered unique index) and applies
      cleanly to the compose SQL Server.

### Schema — assignment, patch, visits, decisions, settings
- [ ] `assignment` entity: `Id Guid PK`, `RouteId FK`, `MerchandiserId FK`, `StartDate DateOnly`,
      `EndDate DateOnly?`, `Reason tinyint (NewHire/Resignation/Swap/Coverage/Restructure)`, `CreatedBy
      Guid?`. Two filtered unique indexes: on `RouteId` WHERE `EndDate IS NULL`, and on `MerchandiserId`
      WHERE `EndDate IS NULL`.
- [ ] `patch` entity: `Id Guid PK`, `RouteId FK`, `Type tinyint (SkipStore/SkipRange/AddStore/
      ReassignTemp/TimeShift)`, `StoreId Guid? FK`, `CoverMerchandiserId Guid? FK`, `StartsOn DateOnly`,
      `EndsOn DateOnly NOT NULL`, `ParamsJson nvarchar(max)?`, `Status tinyint (Pending/Active/Expired/
      Cancelled)`, `Reason string?`, `CreatedBy Guid?`. Index on `(RouteId, Status, EndsOn)`.
- [ ] `planned_visit` entity: `Id Guid PK`, `RouteId`, `RouteStopId`, `StoreId`, `MerchandiserId?`,
      `VisitDate DateOnly`, `PlannedStart DateTimeOffset?`, `PlannedEnd DateTimeOffset?`, `Source tinyint
      (Baseline/Patch)`, `PatchId Guid?`, `Status tinyint (Planned/Done/Missed/Skipped)`. Unique
      `(RouteStopId, VisitDate)`; index `(MerchandiserId, VisitDate)`.
- [ ] `decision_journal` entity: `Id Guid PK`, `Kind tinyint (PublishOverride/Repair/Permanent)`,
      `Description string`, `Reason string`, `Objective string`, `ErrorsJson nvarchar(max)?`, `AuthorId
      Guid?`, `CreatedAt DateTimeOffset`. Append-only.
- [ ] `setting` entity: `Key string PK-part`, `RegionId string PK-part` (empty string `""` = global, non-empty = region override — non-nullable to keep a clean composite key), `ValueJson
      nvarchar(max)`; migration-seeded defaults for `daily_work_minutes` (450), `default_service_minutes`
      (30), `break_blocks` (lunch 12:30–13:30, tea 10:30–10:45, tea 15:00–15:15), `day_start` (09:00),
      `over_450_tolerance_minutes` (0), `service_mix_cap_pct` (20), `plan_horizon_weeks` (6),
      `snap_minutes` (5). Read via an `ISettingsProvider`; **no admin/edit endpoint or draft→confirm flow
      in this spec.**
- [ ] Migration `AddRouting2` creates the five tables above (with both assignment filtered-unique indexes
      and the settings `HasData` seed) and applies cleanly.

### Scheduling engine (pure, `Evo.Domain/Scheduling/`)
- [ ] Frequency expansion: given a RouteStop's frequency + weekday mask + biweekly anchor and a date
      range, projects the correct visit dates — daily = every working day, weekly/2×-week = masked
      weekdays, biweekly = masked weekdays where `weeks_between(anchor, date) % 2 == 0`. Unit-tested,
      no DB.
- [ ] Day scheduler: given a day's ordered visits (each with resolved minutes) + settings, assigns each
      visit a `PlannedStart`/`PlannedEnd` from `day_start`, reserving the three non-editable statutory
      break blocks (60 lunch + 2×15 tea) so visits flow around them; computes **daily planned minutes
      excluding breaks** and returns V1 (<450) / V2 (>450 + tolerance) findings. Unit-tested.
- [ ] Patch resolution: given baseline projected visits + a set of patches, applies only patches whose
      window contains the date, in priority order **SKIP > TIME_SHIFT > ADD > REASSIGN**, producing the
      effective visit list; a patch with `date > EndsOn` is never applied (auto-revert). Unit-tested for
      baseline ⊕ patch across the expiry boundary.
- [ ] Duration resolution (M1): a visit's minutes = `RouteStop.ServiceMinutes ?? Store.DefaultService
      Minutes ?? settings.default_service_minutes`. (Σ-task-minutes is documented as the M2 replacement
      point.) Unit-tested.

### Validation
- [ ] A pure validation evaluator produces `ValidationFinding(Code, Severity(Error/Warning/Info),
      Message, Scope)` for the M1-core set: V1, V2, V3 (province/district), V4, V5, V6, V7, V9, V12.
- [ ] V3 (store province/district outside route scope) and V4 (store already on another active route) are
      **hard blocks** at write (structural — `ConflictException`/`EvoValidationException` → unified error
      shape); all other findings are warnings/errors that surface but never hard-block publish.
- [ ] The same evaluator is reachable via a `POST /api/v1/routes/{id}/validate` endpoint (for future live
      UI) and is run inside publish.

### Audit
- [ ] An `IRouteChangeLog` facade writes structural events (`STOP_ADDED`, `STOP_REMOVED`, `STOP_MOVED`,
      `FREQ_CHANGED`, `ASSIGNED`, `UNASSIGNED`, `PATCHED`, `PUBLISHED`) as `audit_log` rows
      (`entityType="Route"`, `entityKey=route id`) via spec 003's `IAuditWriter` — no new audit table.

### Plan generation & background job
- [ ] A `PlanGenerationService` regenerates a route's **future** PlannedVisits for the rolling horizon
      (baseline ⊕ active patches, breaks, statuses) idempotently — re-running for the same route/date
      leaves past rows untouched and upserts future rows by `(RouteStopId, VisitDate)`.
- [ ] A `PlanHorizonBackgroundService : BackgroundService` runs nightly (interval configurable, default
      24h): extends the horizon for all ACTIVE routes and advances patch status
      (Pending→Active→Expired) by date; failures are logged and never crash the host.

### API (all `/api/v1`, Supervisor-only unless noted)
- [ ] `POST /routes` creates a DRAFT route (auto-assigns a `RouteCode` if not supplied) → 201.
- [ ] `GET /routes` (paged/filtered by province/status) and `GET /routes/{id}` (with stops, current
      assignment, active patches) → 200; unknown id → 404 unified shape.
- [ ] `PATCH /routes/{id}` renames / edits target / **activates** (Draft→Active requires an active
      assignment, else 409) / **deactivates** (Active→Inactive releases stops to pool by setting
      `EffectiveTo`) — no delete endpoint anywhere.
- [ ] `POST /routes/{id}/stops:bulk` adds stops (validates V3/V4; returns per-store accepted vs
      rejected-with-reason), `PATCH /routes/{id}/stops/{stopId}` edits frequency/duration/sequence,
      `POST /routes/{id}/stops/{stopId}:move` atomically moves a store to another route (closes old,
      opens new, regenerates both, writes two change-log events).
- [ ] `POST /routes/{id}/assignment` reassigns (reason required; closes prior, opens new, repoints future
      visits, logs `ASSIGNED`/`UNASSIGNED`).
- [ ] `POST /routes/{id}/patches` creates a patch (expiry mandatory — missing `EndsOn` → 422 V9).
- [ ] `GET /routes/{id}/plan?from=&to=` returns the effective plan (baseline ⊕ active patches) with breaks
      and per-day findings; `GET /routes/{id}/health` returns revenue vs target, per-weekday minutes vs
      450, category mix, and finding counts.
- [ ] `POST /routes/{id}/publish` computes pending changes; if 🔴 errors are present it requires
      `reason` + `objective` (else 422) and writes a `decision_journal` row; then materializes future
      PlannedVisits atomically and writes a `PUBLISHED` change-log row. (No notifications — M3.)
- [ ] `GET /merchandisers/{id}/day?date=` returns that merchandiser's PlannedVisits for the date (the
      future mobile day view) — readable by Supervisor (and by the agent themselves once mobile lands).

### Seed + integration + docs
- [ ] The seeder creates `merchandiser` rows wrapping seeded FieldAgent users, `route`s per profile
      (demo ≈ 5, scale ≈ 50), assigns each to a merchandiser, adds in-scope route_stops from synced
      stores (respecting one-active-route), then **runs `PlanGenerationService`** to materialize
      PlannedVisits — not by inserting visit rows directly. Idempotent (re-seed keeps counts stable).
- [ ] `contracts/openapi.json` + the panel TS client regenerated to include the new route/assignment/
      patch/plan/publish/merchandiser-day operations. **No panel UI built in 005.**
- [ ] Docs updated: `docs/DATABASE.md` (flip route/route_stop/assignment/patch/planned_visit/settings +
      add merchandiser & decision_journal rows to migrated; correct the inaccurate "merchandiser shipped
      in 002" note), `docs/ARCHITECTURE.md` (mark Plan Generator + Validation service as landed for M1
      core), `docs/API.md` (add the new endpoints), `docs/DECISIONS.md` (record the M1-core scope split,
      the merchandiser-in-005 decision, the M1 duration source, the validation-subset choice, the
      RouteChangeLog-as-facade realization, decision_journal landing here).
- [ ] Full backend suite (`dotnet test backend/Evo.sln`) green — prior 001–004 tests plus the new 005
      engine/validation/endpoint tests.

## Clarifications
<!-- All 14 rows CONFIRMED by the human 2026-07-16 (review of the highest-impact questions). These are
     now settled decisions, not working assumptions — implementation may proceed against them. -->
| # | Question | Final decision (CONFIRMED 2026-07-16) |
|---|---|---|
| 1 | Is this spec backend-only, with the planner UI as a separate later M1 spec? | CONFIRMED: yes — entities/engine/validation/publish/API/seeder/contract here; the map/schedule/table drag-drop UI is a separate later M1 spec. |
| 2 | Build a `merchandiser` entity now (design §5), wrapping `ApplicationUser`? (None exists — 002 only built `ApplicationUser`.) | CONFIRMED: build it now — `merchandiser(id, user_id FK→ApplicationUser, home_location, hired_on, active)`, **1:1 with a FieldAgent-role user**, as the Assignment target. Also **correct** the inaccurate `docs/DATABASE.md` row claiming merchandiser shipped in 002 (done in Task 47). |
| 3 | Visit-duration source in M1 (no Tasks/Rules yet)? | CONFIRMED: `RouteStop.ServiceMinutes ?? Store.DefaultServiceMinutes ?? settings default`; Σ-task/rule-minutes is the M2 hand-off. |
| 4 | Which validation rules are in M1-core scope? | CONFIRMED: V1, V2, V3(province/district), V4, V5, V6, V7, V9, V12. Deferred: V8, V10, V11, V13, V14, V15, V16. |
| 5 | Build the `settings` table now, or hardcode defaults? | CONFIRMED: minimal migration-seeded `setting` table read via `ISettingsProvider`; **no admin UI / draft→confirm flow** in this spec. |
| 6 | Does publish send notifications? | CONFIRMED: no — mobile deferred; publish only materializes visits + journals overrides. |
| 7 | Is the nightly horizon/patch-expiry background job in this spec? | CONFIRMED: yes — a `PlanHorizonBackgroundService` (horizon extension + patch expiry), configurable interval, default 24h. |
| 8 | RouteChangeLog — new physical table or facade over `audit_log`? | CONFIRMED: typed `IRouteChangeLog` facade over spec 003's generic `audit_log` — no new table (DECISIONS 2026-07-16). |
| 9 | Rolling PlannedVisit horizon length? | CONFIRMED: 6 weeks, from `settings.plan_horizon_weeks`; past rows frozen, only future upserted. |
| 10 | Route activation prerequisite? | CONFIRMED: Draft→Active requires an active Assignment (else 409); other validation failures surface but never hard-block. |
| 11 | Route geo-scope storage? | CONFIRMED: `Province string` + `DistrictsJson` (JSON array) + nullable `GeoScope` polygon; V3 checks province/district only, polygon point-in-polygon defers to the geo/panel spec. |
| 12 | Region modeling (design §5 `region_id`)? | CONFIRMED: no `Region` entity — just `Province string` on Route (matching Store). |
| 13 | `POST /simulate/route` what-if in scope? | CONFIRMED: deferred to the later geo/panel spec. |
| 14 | Seeder route/assignment/visit counts per profile? | CONFIRMED: demo ≈ 5 routes, scale ≈ 50; one merchandiser per route; stops from synced stores; visits via the real engine; `plan_horizon_weeks=6`. |

## Non-goals
- **No planner UI** — no map, no time-accurate schedule grid, no table workspace, no drag-drop, no live
  health card rendering, no lasso/simulate. Endpoints + regenerated client only; the UI is a later M1 spec.
- **No task/rule-driven durations** — `TaskTemplate`/`Rule`/`TaskInstance` and V10/V11 are M2. M1 uses
  `service_minutes` fallbacks only.
- **No travel-time layer** — no OSRM, no per-pair overrides, no V13/V15. (Design Open Q#1.)
- **No leave/absence entity, no Onarım workbench, no V14** — M4.
- **No notifications on publish** — M3 (mobile deferred).
- **No Settings admin page / draft→confirm governance flow** — this spec only seeds defaults, read-only.
- **No spatial query endpoints** — no bbox / unassigned-in-scope / polygon lasso / overlap / home-to-route
  distance; the `GeoScope` polygon is stored but V3 only checks province/district (geo/panel spec).
- **No `POST /simulate/route`** — geo/panel spec.
- **No delete anywhere** — routes/stores/people activate/deactivate only; history stays attached to
  `route_code`.
- **No patch-churn (V16) or utilization-band (V8) analytics** — M4 analytics.

## Open questions (product decisions — flag at review, do not guess)
- **Statutory break placement vs "visit interrupted by lunch."** Design §3.3 says a visit spanning lunch
  is *one* visit interrupted, not two. For M1-core the engine reserves fixed break blocks and flows visits
  around them (a visit that would overlap a break is pushed after it) — the true "split across lunch"
  rendering is a panel concern. Confirm this simplification is acceptable for the backend engine.
- ~~**V3 geo strictness (design Open Q#4).**~~ RESOLVED 2026-07-16 (Clarification #11): province/district
  hard-block only in 005; polygon point-in-polygon (soft-scope) waits for the geo/panel spec.
- **SERVICE mix cap (design Open Q#3):** fixed % or minutes-weighted? This spec seeds a fixed 20% count
  cap for V6; confirm whether minutes-weighting is wanted before M4.
- **Revenue for a moved store mid-month (design Open Q#7).** The atomic move regenerates both routes'
  future visits; how revenue attainment is split between old/new route is a health-calc question — deferred
  until the health panel needs it (recommend pro-rata by days).
- **decision_journal was deferred *to* M1** (DECISIONS 2026-07-16) — it lands here. Confirm the field set
  (`kind`, `description`, `reason`, `objective`, `errors[]`, `author`, `at`) matches what the eventual
  publish/Onarım/permanent flows need, or whether more is required.
- ~~**Merchandiser ↔ ApplicationUser cardinality.**~~ RESOLVED 2026-07-16 (Clarification #2): 1:1 with a
  FieldAgent-role user (enforced by the unique index on `merchandiser.user_id`); no supervisor-as-
  merchandiser or multi-user-per-merchandiser case in scope.
