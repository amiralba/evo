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
| Web API | REST endpoints per design §9; auth; validation | ASP.NET Core 8, EF Core |
| Plan Generator | §3 engine: regenerate future PlannedVisits on any baseline/patch/assignment mutation; nightly horizon extension; patch expiry | Background service (async, per-route) |
| Store Sync | Nightly ingest of stores/formats/revenue by `evo_store_id` | Worker service |
| Panel | Single-page workspace: Map \| Schedule \| Table over ONE shared filter/selection state (design §6.0) | React + TS, generated client |
| Mobile | **DEFERRED.** Field behavior simulated: seeder writes visit outcomes/check-ins to DB; agent-facing APIs mocked where the panel needs them | (later: React Native/Expo) |
| Seeder | `Evo.Seeder` console app — realistic Turkish fake data (stores, routes, merchandisers, visits, outcomes) written directly to DB; profiles: `demo` (small, readable) and `scale` (~hundreds of stores) | .NET console + Bogus |
| Identity | 2 roles (Supervisor all-regions, Field agent read-only); JWT + rotating refresh cookie | ASP.NET Identity, AD/Entra extension seam (spec 002, COMPLETE) |

## Data flow
Planner edit → validation (live) → draft state → Yayınla (publish gate: errors need written justification) → atomic apply → Plan Generator regenerates affected future visits → batched FCM notify → agents' apps sync.

## Folder structure
```
backend/
  Evo.sln
  src/Evo.Api/             ASP.NET Core Web API (controllers, Program.cs, Swashbuckle)
  src/Evo.Api/Auth/        JWT/refresh-token services, JwtSettings, AuthenticationExtensions (Entra seam)
  src/Evo.Api/Errors/      EvoProblemDetails customizer, EvoExceptionHandler, ValidationProblem factory
  src/Evo.Api/Audit/       IAuditWriter/AuditWriter, audit-log DTOs, AuditLogController
  src/Evo.Domain/          Entities, domain logic (no infra dependencies)
  src/Evo.Domain/Errors/   ErrorCodes, UserErrorMessages (in-code Turkish catalog, no DB table)
  src/Evo.Domain/Exceptions/  EvoException taxonomy (NotFoundException, ConflictException, EvoValidationException)
  src/Evo.Infrastructure/  EF Core (EvoDbContext), external service clients
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

## Cross-cutting concerns (platform specs — build first)
- Auth: spec 002 — COMPLETE. ASP.NET Identity, 2 roles, AD/Entra extension seam (see docs/AUTH.md).
- Error handling: spec 003 — COMPLETE. Shared ProblemDetails shape everywhere (`code`/`title`/`detail`/`userTitle`/`userMessage`/`traceId`/`errors`); panel consumes it directly (see docs/API.md).
- Audit: spec 003 — COMPLETE. Single generic append-only `audit_log` table (deviation from design doc's RouteChangeLog + admin_audit_log split — see docs/DECISIONS.md); supervisor-only `GET /audit-log`.
- Contract pipeline: spec 001 — OpenAPI → generated TS clients, regenerated on API change
- Config/secrets: appsettings + env vars; never committed
- KVKK: content-free FCM payloads; photo/location retention policy per customer answers (open question)
