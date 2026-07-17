# Architecture

<!-- Owned by: architect. Kept current by: coordinator.
     Source: EVO-Route-Planning-Design.md §9 + EVO-Teknoloji-Yigini.pdf Rev. 2. -->

## Overview
Modular monolith on a single strong VM. ASP.NET Core Web API serves a React single-page planner (supervisors) and a React Native Android app (field agents, offline-first). OpenAPI contract is the single source of truth — TypeScript clients are generated, never hand-written. No microservices, no Kubernetes.

```
React panel (planner SPA)      [mobile: DEFERRED — seeded/mocked]
        │  generated TS client
        ▼
        ASP.NET Core Web API (.NET 10 — see Folder structure note; OpenAPI via Swashbuckle)
        ├─ Store Sync worker (nightly + on-demand, from EVO sales DB)
        ├─ Plan Generator (baseline ⊕ patches → PlannedVisits; expires patches)
        ├─ Validation service (same rules live in UI + enforced at write)
        ├─ Geo service (in-scope, lasso, overlap, home-to-route distance)
        └─ Analytics reader (materialized views, nightly refresh)
        ▼
        SQL Server        MinIO (photos)        OSRM (travel times)        FCM
```

## Components
| Component | Responsibility | Tech |
|---|---|---|
| Web API | REST endpoints per design §9; auth; validation | ASP.NET Core 10 (see Folder structure note), EF Core |
| Plan Generator | **LANDED for M1-core (spec 005).** Pure engine (`FrequencyExpander`/`DayScheduler`/`PatchResolver`) in `Evo.Domain/Scheduling`, EF-free and fully unit-tested; orchestration (`PlanGenerationService`, `Evo.Infrastructure/Routing`) regenerates future `planned_visit` rows on any stop/assignment/patch/publish mutation, upserting by `(RouteStopId, VisitDate)`, past visits frozen; nightly `PlanHorizonBackgroundService` (`Evo.Api/Routing`) advances patch status (Pending→Active→Expired) and extends the horizon for every Active route. | Background service (async, per-route) |
| Validation service | **LANDED for M1-core (spec 005).** Pure evaluators in `Evo.Domain/Scheduling`: `RouteValidator` (V3 geo-scope, V5 revenue, V6 SERVICE-mix cap, V7 time-window/ban), `OverlapValidator` (V12), plus V1/V2 from `DayScheduler` and V9 (mandatory patch expiry) enforced at the patch-create endpoint. Deferred: V8, V13/V15 (travel/OSRM), V14 (leave/Onarım, M4), V16. | `Evo.Domain/Scheduling` (pure) |
| Task/Rule engine | **LANDED (spec 008).** Pure `TaskResolver` (`Evo.Domain/Tasks`) mirrors the scheduling engine's design: EF-free, fully unit-tested, takes a store's attributes + the active `TaskTemplate`/`Rule` set for a date and returns resolved tasks with a per-task source trace (template default → chain/format/route/store rule → instance override). `TaskPlanProvider` (`Evo.Infrastructure/Tasks`) loads templates/rules and calls the resolver; `PlanGenerationService` now sets each visit's duration to Σ resolved task minutes (replacing the flat `service_minutes` fallback as the primary path — an explicit `RouteStop.ServiceMinutes` still wins as a manual override) and materializes one `TaskInstance` row per resolved task per future visit. Same resolver backs `GET /stores/{id}/task-plan` (UI trace/Rule Inspector) and `GET /rules/impact` (aggregate preview, no-persist) — "one engine, one source of truth for UI + generation + validation" (design §9). | `Evo.Domain/Tasks` (pure) + `Evo.Infrastructure/Tasks` |
| Store Sync | **COMPLETE (spec 004).** Ingest of stores/chains/format/category/revenue/flags by `evo_store_id`, both nightly (`StoreSyncBackgroundService`, configurable interval) and on-demand (`POST /stores/sync`, Supervisor-only, audit-logged). Real source is an `IStoreSyncSource` extension seam — only `FakeStoreSyncSource` exists; the real EVO sales DB connection is blocked on customer-IT questions (same as the Entra seam). | `BackgroundService` + `IStoreSyncService` |
| Panel | **LANDED for M1 (spec 006, functional phases).** Single-page workspace at `/planner`: Map \| Schedule split + Table selection strip, all rendered over ONE shared Zustand `workspaceStore` (province/focus/selection/layout) + TanStack Query cache (server state, invalidated on every mutation for live health/schedule updates). MapLibre GL store layer (province-scoped, category/route color coding, lasso multi-select); time-accurate schedule grid with prev/next week nav; live health card (Recharts: revenue bar, weekday-minutes bar w/ 450 line, category donut); selection editing (checkbox-list multi-select + bulk-add, dnd-kit sortable stop reorder via batch endpoint, stop edit, move-store, patch create); publish review modal with override-with-reason gate. Schedule pane ported the prototype's real `sched-grid` layout (spec 007) — a time-axis column with hourly labels, a person-cell header (assignee/route/week-load bar), and hour gridlines — plus draggable/resizable visit blocks: same-day vertical drag pins a new start time (`TimeShift` patch), cross-day drag moves the visit to another weekday (`MoveVisit` patch, skip-source + add-target off one patch row), and the bottom-edge handle resizes duration as a permanent per-store change (`UpdateStop`). A client-side `reflow.ts` mirrors the backend's `DayScheduler` to live-preview same-day reflows while dragging; cross-day drags show a floating ghost in the target column instead (index alignment breaks once an item leaves one day's array mid-preview). The detail panel's Görevler tab (spec 008) shows the resolved task list per store/date (duration + source pill, expandable Rule Inspector trace) and a scope modal (this-visit/this-store/all-format duration edits with a live impact preview before saving). Turkish strings via react-i18next (`panel/src/i18n`). | React + TS, generated client, MapLibre GL, dnd-kit, Zustand, TanStack Query, Recharts, react-i18next |
| Field execution simulation | **LANDED (spec 009).** Everything downstream of the field (planned-vs-realized, task results, notes, notification receipts) works against seeded/mocked data since the mobile app is deferred. `visit_realization` (1:1 with `planned_visit`) + a continuous `merchandiser_location_ping` stream (pulled forward from M4's live-location groundwork per user decision — see `docs/DECISIONS.md`) supply realized timing/GPS; `Evo.Domain.Tasks.TaskResult` (pure, None/Photo/Form) types `TaskInstance.ResultJson`; `note`/`notification` tables back a supervisor inbox and a mocked `INotificationDispatcher` fired on publish. `FieldExecutionSeederModule` produces ~85/8/7 Done/Missed/Skipped outcomes, realistic check-in jitter, a dense ping stream, typed task results, notes, and notification receipts over a rolling past window — via a new seeder-only `IPlanGenerationService.MaterializeHistoryAsync` (bypasses the today-clamp so history routes through the same real engine, not hand-inserted rows). Panel: schedule blocks color by outcome with a planned-vs-realized tooltip, Görevler shows task results, and a Notes inbox modal (Acknowledge/Resolve) with an open-count badge. | `Evo.Domain/Tasks` (`TaskResult`) + `Evo.Infrastructure/Routing`, `/People`, `/Notes`, `/Notifications` + React/TS panel |
| Mobile | **DEFERRED.** No real app; field behavior is entirely seeded/mocked (see Field execution simulation row) | (later: React Native/Expo) |
| Seeder | `Evo.Seeder` console app — realistic Turkish fake data (stores, routes, merchandisers, visits, outcomes) written directly to DB; profiles: `demo` (small, readable) and `scale` (~hundreds of stores) | .NET console + Bogus |
| Identity | 2 roles (Supervisor all-regions, Field agent read-only); JWT + rotating refresh cookie | ASP.NET Identity, AD/Entra extension seam (spec 002, COMPLETE) |

## Data flow
Planner edit → validation (live) → draft state → Yayınla (publish gate: errors need written justification) → atomic apply → Plan Generator regenerates affected future visits → notify affected agents (spec 009: mocked `INotificationDispatcher` writes a `notification` row per assigned merchandiser — real FCM push remains M3+ backlog) → agents' apps sync (deferred, seeded/mocked per Field execution simulation row).

## Folder structure
```
backend/
  Evo.sln
  src/Evo.Api/             ASP.NET Core Web API (controllers, Program.cs, Swashbuckle)
  src/Evo.Api/Auth/        JWT/refresh-token services, JwtSettings, AuthenticationExtensions (Entra seam)
  src/Evo.Api/Errors/      EvoProblemDetails customizer, EvoExceptionHandler, ValidationProblem factory
  src/Evo.Api/Audit/       IAuditWriter/AuditWriter, audit-log DTOs, AuditLogController
  src/Evo.Api/Stores/      StoreSyncBackgroundService, store read DTOs (StoresController lives in Controllers/)
  src/Evo.Domain/          Cross-cutting domain logic (Errors, Exceptions, Auth Roles) — NOT persisted entities (see Folder structure note below)
  src/Evo.Domain/Errors/   ErrorCodes, UserErrorMessages (in-code Turkish catalog, no DB table)
  src/Evo.Domain/Exceptions/  EvoException taxonomy (NotFoundException, ConflictException, EvoValidationException)
  src/Evo.Infrastructure/  EF Core (EvoDbContext) + all persisted entities, colocated with their EF config
  src/Evo.Infrastructure/Stores/       Store, Chain, StoreType, StoreRevenue, StoreFlag entities
  src/Evo.Infrastructure/Stores/Sync/  IStoreSyncSource seam, FakeStoreSyncSource, IStoreSyncService
  src/Evo.Domain/Tasks/           Pure TaskResolver + RuleMatcher (spec 008) + TaskResult (spec 009), EF-free
  src/Evo.Infrastructure/Tasks/   TaskTemplate/Rule/TaskInstance entities, ITaskPlanProvider
  src/Evo.Infrastructure/Routing/VisitRealization.cs, VisitOutcomeReason.cs (spec 009)
  src/Evo.Infrastructure/People/MerchandiserLocationPing.cs (spec 009)
  src/Evo.Infrastructure/Notes/    Note entity + enums (spec 009)
  src/Evo.Infrastructure/Notifications/  Notification entity (spec 009)
  src/Evo.Api/Notifications/      INotificationDispatcher + MockNotificationDispatcher (spec 009)
  src/Evo.Seeder/          Bogus-based console app — writes test data directly to DB
  tests/Evo.Tests/         xUnit (WebApplicationFactory integration tests)
panel/
  src/api/                 Thin fetch wrappers + api/generated/ (gitignored, never hand-edited) + errors.ts (typed ApiError parser)
  src/auth/                AuthContext, ProtectedRoute, in-memory session store
  src/pages/               Login, Dashboard
  src/theme/                Design tokens extracted from evo-planner-prototype-v0.5.html
  e2e/                      Playwright specs + artifacts/ (baseline screenshots)
contracts/  openapi.json (committed, source of truth) + README.md (regeneration steps)
docs/ specs/ .claude/
(mobile/ deferred — see docs/DECISIONS.md)
```
Backend targets **.NET 10**, not the .NET 8 named in the Stack section above — only .NET 10 SDK
was available when spec 001 was scaffolded (see `docs/DECISIONS.md`, 2026-07-15).

**Layering rule:** `Evo.Domain` must never reference `Evo.Infrastructure` (entities/EF types) —
it stays pure/testable and infrastructure-free. Spec 005's `RouteValidator` needed to distinguish
SERVICE-category stops (V6) without depending on `Evo.Infrastructure.Stores.StoreCategory`, so its
`StopEval` input carries a plain `bool IsServiceCategory` instead; the caller (infrastructure/API
layer) maps the real enum down to that bool before invoking the validator. Follow the same pattern
for any future pure-`Evo.Domain` logic that needs to reason about an `Evo.Infrastructure` type.

## Cross-cutting concerns (platform specs — build first)
- Auth: spec 002 — COMPLETE. ASP.NET Identity, 2 roles, AD/Entra extension seam (see docs/AUTH.md).
- Error handling: spec 003 — COMPLETE. Shared ProblemDetails shape everywhere (`code`/`title`/`detail`/`userTitle`/`userMessage`/`traceId`/`errors`); panel consumes it directly (see docs/API.md).
- Audit: spec 003 — COMPLETE. Single generic append-only `audit_log` table (deviation from design doc's RouteChangeLog + admin_audit_log split — see docs/DECISIONS.md); supervisor-only `GET /audit-log`.
- Store master data: spec 004 — COMPLETE. `IStoreSyncSource` extension seam (mirrors the Entra seam) + `FakeStoreSyncSource` for dev/seed/test; idempotent `IStoreSyncService` upsert (overwrites synced fields, preserves planner-owned fields, never auto-deactivates); nightly `BackgroundService` + on-demand Supervisor endpoint; minimal `GET /stores`/`GET /stores/{id}` read surface. **M0 platform foundation is now COMPLETE** — M1 feature modules (Routes/Patches) build on this.
- Route planning core: spec 005 — COMPLETE (backend only). `Merchandiser`/`Route`/`RouteStop`/`Assignment`/`Patch`/`PlannedVisit`/`DecisionJournalEntry`/`Setting` schema with DB-enforced one-active-route and one-active-assignment constraints; pure scheduling engine; full route lifecycle API (create/stops/assignment/patches/plan/health/validate/publish); seeder extended with a real-engine route seeder. **The drag/drop planner UI (map/schedule grid/table, lasso, simulate) is a separate, not-yet-started M1 spec** — this spec deliberately stopped at the API boundary.
- Tasks & Rules (M2): spec 008 — COMPLETE. `TaskTemplate`/`Rule`/`TaskInstance` schema; pure `TaskResolver` (membership + minutes ladder + instance override, store>route>format>chain>global specificity); `PlanGenerationService` integration (visit duration = Σ resolved task minutes, `TaskInstance` materialization, format-change re-resolution); 6 endpoints (`task-templates`, `stores/{id}/task-plan`, `rules` CRUD + impact preview, `task-instances/{id}` scope edit, `tasks/adhoc`); seeder extended; panel Görevler tab + scope modal + Rule Inspector trace. Deferred out of M2: `POST /simulate/route`, Conflict Center/Sorun Merkezi, module-stack editor (`SET_MODULES`/`PATCH_MODULE`), standalone Yönetim admin pages — see `docs/DECISIONS.md`.
- Field execution simulation (M3): spec 009 — COMPLETE. `visit_realization` (1:1 with `planned_visit`, separate table per user override of the planner's recommendation) + continuous `merchandiser_location_ping` stream (pulls M4's live-location groundwork forward, panel visualization still deferred); typed `TaskResult` payloads (None/Photo/Form, seeded object keys not real MinIO uploads); `note`/`notification` schema + supervisor inbox + mocked `INotificationDispatcher` on publish; `FieldExecutionSeederModule` (past history via a new seeder-only `MaterializeHistoryAsync`, ~85/8/7 outcome distribution, dense location pings, task results, notes, notifications); panel outcome coloring + tooltip + Görevler results + Notes inbox. Deferred out of M3: real mobile app/live agent API, real MinIO/FCM, out-of-route visits/analytics, planned-vs-realized analytics (Planning-Evidence panel → M4), the live-location map layer (data pipeline exists, rendering is M4) — see `docs/DECISIONS.md`.
- Contract pipeline: spec 001 — OpenAPI → generated TS clients, regenerated on API change
- Config/secrets: appsettings + env vars; never committed
- KVKK: content-free FCM payloads; photo/location retention policy per customer answers (open question); store master data carries no personal data (spec 004)
