# Architecture

<!-- Owned by: architect. Kept current by: coordinator.
     Source: EVO-Route-Planning-Design.md §9 + EVO-Teknoloji-Yigini.pdf Rev. 2. -->

## Overview
Modular monolith on a single strong VM. ASP.NET Core Web API serves a React single-page planner (supervisors) and a React Native Android app (field agents, offline-first). OpenAPI contract is the single source of truth — TypeScript clients are generated, never hand-written. No microservices, no Kubernetes.

```
React panel (planner SPA)      [mobile: DEFERRED — seeded/mocked]
        │  generated TS client
        ▼
        ASP.NET Core Web API (.NET 8, OpenAPI)
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
| Identity | 2 roles (Supervisor all-regions, Field agent read-only) | ASP.NET Identity, AD/Entra option |

## Data flow
Planner edit → validation (live) → draft state → Yayınla (publish gate: errors need written justification) → atomic apply → Plan Generator regenerates affected future visits → batched FCM notify → agents' apps sync.

## Folder structure
```
(decided in spec 001-solution-scaffold; expected shape)
backend/    ASP.NET Core solution (Api, Domain, Infrastructure, Tests)
panel/      React + TS planner SPA
mobile/     React Native (Expo) app
contracts/  OpenAPI output + client generation config
docs/ specs/ .claude/
```

## Cross-cutting concerns (platform specs — build first)
- Auth: spec 002 — ASP.NET Identity, 2 roles, AD/Entra option
- Error handling: spec 003 — shared ProblemDetails shape everywhere
- Audit: spec 003 — RouteChangeLog (route-level) + admin_audit_log (Turkey-wide mutations); append-only
- Contract pipeline: spec 001 — OpenAPI → generated TS clients, regenerated on API change
- Config/secrets: appsettings + env vars; never committed
- KVKK: content-free FCM payloads; photo/location retention policy per customer answers (open question)
