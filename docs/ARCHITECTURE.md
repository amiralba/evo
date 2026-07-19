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
        └─ Analytics reader (LANDED, spec 010 — on-read aggregation, no materialized views)
        ▼
        SQL Server        MinIO (photos)        OSRM (travel times)        FCM
```

## Components
| Component | Responsibility | Tech |
|---|---|---|
| Web API | REST endpoints per design §9; auth; validation | ASP.NET Core 10 (see Folder structure note), EF Core |
| Plan Generator | **LANDED for M1-core (spec 005).** Pure engine (`FrequencyExpander`/`DayScheduler`/`PatchResolver`) in `Evo.Domain/Scheduling`, EF-free and fully unit-tested; orchestration (`PlanGenerationService`, `Evo.Infrastructure/Routing`) regenerates future `planned_visit` rows on any stop/assignment/patch/publish mutation, upserting by `(RouteStopId, VisitDate)`, past visits frozen; nightly `PlanHorizonBackgroundService` (`Evo.Api/Routing`) advances patch status (Pending→Active→Expired) and extends the horizon for every Active route. | Background service (async, per-route) |
| Validation service | **LANDED for M1-core (spec 005); extended M4 (spec 010).** Pure evaluators in `Evo.Domain/Scheduling`: `RouteValidator` (V3 geo-scope, V5 revenue, V6 SERVICE-mix cap, V7 time-window/ban), `OverlapValidator` (V12), `AbsenceValidator` (V14 — visit collides with an `absence` window or a `store_flag` ClosedTemp window), `UtilizationValidator` (V8 — weekly utilization outside the configured band), plus V1/V2 from `DayScheduler` and V9 (mandatory patch expiry) enforced at the patch-create endpoint. Still deferred: V13/V15 (travel/OSRM), V16. | `Evo.Domain/Scheduling` (pure) |
| Task/Rule engine | **LANDED (spec 008).** Pure `TaskResolver` (`Evo.Domain/Tasks`) mirrors the scheduling engine's design: EF-free, fully unit-tested, takes a store's attributes + the active `TaskTemplate`/`Rule` set for a date and returns resolved tasks with a per-task source trace (template default → chain/format/route/store rule → instance override). `TaskPlanProvider` (`Evo.Infrastructure/Tasks`) loads templates/rules and calls the resolver; `PlanGenerationService` now sets each visit's duration to Σ resolved task minutes (replacing the flat `service_minutes` fallback as the primary path — an explicit `RouteStop.ServiceMinutes` still wins as a manual override) and materializes one `TaskInstance` row per resolved task per future visit. Same resolver backs `GET /stores/{id}/task-plan` (UI trace/Rule Inspector) and `GET /rules/impact` (aggregate preview, no-persist) — "one engine, one source of truth for UI + generation + validation" (design §9). | `Evo.Domain/Tasks` (pure) + `Evo.Infrastructure/Tasks` |
| Store Sync | **COMPLETE (spec 004).** Ingest of stores/chains/format/category/revenue/flags by `evo_store_id`, both nightly (`StoreSyncBackgroundService`, configurable interval) and on-demand (`POST /stores/sync`, Supervisor-only, audit-logged). Real source is an `IStoreSyncSource` extension seam — only `FakeStoreSyncSource` exists; the real EVO sales DB connection is blocked on customer-IT questions (same as the Entra seam). | `BackgroundService` + `IStoreSyncService` |
| Panel | **PROTOTYPE-VERBATIM since 2026-07-18** (commit `c672e3b`; decision logged in `docs/DECISIONS.md` 2026-07-19). The `/planner` workspace IS `evo-planner-prototype-v0.5.html`, hosted unchanged: `panel/scripts/extract-prototype.mjs` slices the prototype into `public/evo-prototype/{proto.css, body.html, engine.js}` (run via `npm run extract-prototype` after editing the prototype), and `src/planner/prototype/PrototypeHost.tsx` mounts that DOM once per browser session (boots on mock data at `opacity: 0`, revealed only after the first backend load — e2e must gate on the reveal). Bridge modules wire the real backend behind the prototype's own UI: `backendBridge` (data-in: routes/merchandisers/stores-geo/plan/notes → `window.__evoLoadData`; province + week-nav controls), `publishBridge` (data-out: on Yayınla, pure `computePublishOps` diffs live state vs the load snapshot into createRoute/bulkAddStops/updateStop/patches/reassign/removeStop/store-status/updateRoute ops, applies them, republishes affected routes — unit-tested), `prototypeMap` (replaces the prototype's SVG map with MapLibre GL, reusing `planner/components/map/storeLayer.ts`), `tasksBridge` (Görevler tab ← `GET /stores/{id}/task-plan`), `scheduleBridge` (visit-days/frequency editor on the Bilgi tab), `notesBridge` (inbox Çözüldü → `PATCH /notes/{id}`), coordinated via `afterPanel.ts` post-render hooks. Draft-until-publish is inherited from the prototype's `changes[]` buffer. The pre-pivot React re-implementation (~4.5k LOC workspace components, Zustand stores, dnd-kit/Recharts UI) was production-unreachable and deleted 2026-07-19 (audit decision D1a); the endgame for `engine.js` is adoption as TS product code (decision D2b, pending). NOTE: "verbatim" means the prototype's own dead code (legacy `renderAdmin`, `presetsData`) ships in `public/` and `engine.js` sits outside eslint (1 standing parse error) until D2b lands. | React + TS host, generated client, MapLibre GL, TanStack Query (analytics only), react-i18next |
| Field execution simulation | **LANDED (spec 009).** Everything downstream of the field (planned-vs-realized, task results, notes, notification receipts) works against seeded/mocked data since the mobile app is deferred. `visit_realization` (1:1 with `planned_visit`) + a continuous `merchandiser_location_ping` stream (pulled forward from M4's live-location groundwork per user decision — see `docs/DECISIONS.md`) supply realized timing/GPS; `Evo.Domain.Tasks.TaskResult` (pure, None/Photo/Form) types `TaskInstance.ResultJson`; `note`/`notification` tables back a supervisor inbox and a mocked `INotificationDispatcher` fired on publish. The spec's `FieldExecutionSeederModule` (~85/8/7 Done/Missed/Skipped outcomes via a seeder-only `MaterializeHistoryAsync`) was never registered on this branch and was deleted with it (decision D3b, 2026-07-19) — realized/outcome data now only exists where the panel/API produce it. Panel truth post-pivot (2026-07-19): the outcome-coloring/tooltip UI died with the deleted React tree and no bridge loads realizations — the backend surface is intact but currently dark; notes DO flow: the prototype's Gelen kutusu lists real notes and Çözüldü persists via `notesBridge`. | `Evo.Domain/Tasks` (`TaskResult`) + `Evo.Infrastructure/Routing`, `/People`, `/Notes`, `/Notifications` + React/TS panel |
| Analytics & Onarım | **LANDED (spec 010).** On-read `PlanHealthService`/`MobilityService`/`StabilityService` (`Evo.Api/Analytics`) aggregate live from `planned_visit`/`visit_realization`/`task_instance`/`patch`/`assignment`/`audit_log` — no materialized tables, a deliberate deviation from design §9 (see `docs/DECISIONS.md`, 2026-07-18). `OnarimService` (`Evo.Api/Onarim`) is the absence-repair decision workbench (design §7.3b) — ranks-not-decides via pure `Evo.Domain.Onarim.CandidateRanker`, writes existing patch types plus a new `CrossReassignVisit` (Task 31-34) for per-visit cross-person reassignment, and one `decision_journal` entry per apply. Panel truth post-pivot (2026-07-19): the `/analytics` React page (region picker + plan-health/mobility tables) is real and works but has NO nav entry point — reachable only by URL; the Onarım workbench UI was deleted with the dead tree and the backend Onarım chain has NO panel bridge (the prototype's Sorunlar "✨ Onarım" runs on engine-mock disruptions) — wire a bridge or formally re-defer, decision open (audit §A3.2). | `Evo.Api/Analytics`, `Evo.Api/Onarim`, `Evo.Domain/Onarim` (pure) + React/TS panel |
| Mobile | **DEFERRED.** No real app; field behavior is entirely seeded/mocked (see Field execution simulation row) | (later: React Native/Expo) |
| Seeder | `Evo.Seeder` console app — realistic Turkish fake data (stores, merchandisers, task templates/rules, identity, audit rows) written directly to DB; profiles: `demo` (small, readable) and `scale` (~hundreds of stores). Routes/visits/absences are NOT seeded — they're the planner's work product, built in the panel (decision D3b, 2026-07-19: the never-registered Route/FieldExecution/Absence seeder modules were deleted) | .NET console + Bogus |
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
  src/Evo.Domain/Scheduling/AbsenceValidator.cs, UtilizationValidator.cs (spec 010, pure V14/V8)
  src/Evo.Domain/Onarim/CandidateRanker.cs (spec 010, pure)
  src/Evo.Infrastructure/People/Absence.cs, AbsenceReason.cs (spec 010)
  src/Evo.Api/Analytics/          PlanHealthService, MobilityService, StabilityService, AnalyticsController (spec 010)
  src/Evo.Api/Onarim/             OnarimService, DisruptionSource, OnarimController (spec 010)
  src/Evo.Seeder/          Bogus-based console app — writes test data directly to DB
  tests/Evo.Tests/         xUnit (WebApplicationFactory integration tests)
panel/
  src/api/                 Thin fetch wrappers + api/generated/ (gitignored, never hand-edited) + errors.ts (typed ApiError parser)
  src/auth/                AuthContext, ProtectedRoute, in-memory session store
  src/pages/               Login, Dashboard
  src/planner/             PlannerPage → prototype/ (PrototypeHost + backend/publish/map/tasks/schedule/notes bridges,
                           afterPanel hooks) + schedule/patchPayload.ts + components/map/storeLayer.ts (the two
                           pre-pivot survivors; the rest of the old React workspace was deleted 2026-07-19, D1a)
  src/analytics/           AnalyticsPage (/analytics, URL-only — no nav entry yet) + api/ + tables
  src/theme/               Design tokens extracted from evo-planner-prototype-v0.5.html
  scripts/                 extract-prototype.mjs → public/evo-prototype/{proto.css,body.html,engine.js}
  public/evo-prototype/    The sliced v0.5 prototype the /planner route actually runs
  e2e/                      Playwright specs + artifacts/ (serial, live-backend; see e2e/README.md)
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
- Route planning core: spec 005 — COMPLETE (backend only). `Merchandiser`/`Route`/`RouteStop`/`Assignment`/`Patch`/`PlannedVisit`/`DecisionJournalEntry`/`Setting` schema with DB-enforced one-active-route and one-active-assignment constraints; pure scheduling engine; full route lifecycle API (create/stops/assignment/patches/plan/health/validate/publish); the spec's real-engine route seeder was later deleted without ever being registered (decision D3b, 2026-07-19 — routes are built in the panel, not seeded). **The drag/drop planner UI (map/schedule grid/table, lasso, simulate) is a separate, not-yet-started M1 spec** — this spec deliberately stopped at the API boundary.
- Tasks & Rules (M2): spec 008 — COMPLETE. `TaskTemplate`/`Rule`/`TaskInstance` schema; pure `TaskResolver` (membership + minutes ladder + instance override, store>route>format>chain>global specificity); `PlanGenerationService` integration (visit duration = Σ resolved task minutes, `TaskInstance` materialization, format-change re-resolution); 6 endpoints (`task-templates`, `stores/{id}/task-plan`, `rules` CRUD + impact preview, `task-instances/{id}` scope edit, `tasks/adhoc`); seeder extended; panel Görevler tab + scope modal + Rule Inspector trace. Deferred out of M2: `POST /simulate/route`, Conflict Center/Sorun Merkezi, module-stack editor (`SET_MODULES`/`PATCH_MODULE`), standalone Yönetim admin pages — see `docs/DECISIONS.md`.
- Field execution simulation (M3): spec 009 — COMPLETE. `visit_realization` (1:1 with `planned_visit`, separate table per user override of the planner's recommendation) + continuous `merchandiser_location_ping` stream (pulls M4's live-location groundwork forward, panel visualization still deferred); typed `TaskResult` payloads (None/Photo/Form, seeded object keys not real MinIO uploads); `note`/`notification` schema + supervisor inbox + mocked `INotificationDispatcher` on publish; `FieldExecutionSeederModule` (past history via a new seeder-only `MaterializeHistoryAsync`, ~85/8/7 outcome distribution, dense location pings, task results, notes, notifications); panel outcome coloring + tooltip + Görevler results + Notes inbox. Deferred out of M3: real mobile app/live agent API, real MinIO/FCM, out-of-route visits/analytics, planned-vs-realized analytics (Planning-Evidence panel → M4), the live-location map layer (data pipeline exists, rendering is M4) — see `docs/DECISIONS.md`.
- Analytics & Onarım (M4): spec 010 — COMPLETE. New `absence` table + `AbsenceValidator`(V14)/`UtilizationValidator`(V8); on-read plan-health/stability/mobility/evidence analytics (no materialized tables, deviates from design §9); Onarım decision workbench with a new `CrossReassignVisit` patch type for per-visit cross-person reassignment. All 8 design §8 metrics shipped Supervisor-scoped (no senior-management role exists) — see `docs/DECISIONS.md`. Deferred out of M4: materialized analytics views, live-location map visualization layer, ⚡ "Otomatik düzelt" same-person auto-fix.
- Contract pipeline: spec 001 — OpenAPI → generated TS clients, regenerated on API change
- Config/secrets: appsettings + env vars; never committed
- KVKK: content-free FCM payloads; photo/location retention policy per customer answers (open question); store master data carries no personal data (spec 004)
