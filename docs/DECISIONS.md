# Decisions Log

<!-- Append-only. Never delete entries. Newest first.
     NOTE: the design doc §10 "Decided" table is the authoritative log of ~40 product/UX
     decisions (roles, grid style, patch model, no-delete lifecycle, publish gate, table mode…).
     This file records BUILD decisions made after design v0.5. Never contradict §10 silently. -->

## 2026-07-15 — Mobile app deferred; field behavior seeded/mocked; direct-to-DB seeder
- **Decision:** No React Native app in current scope. Field-agent behavior (check-ins, visit outcomes, task results, notes) is produced by the `Evo.Seeder` console app writing realistic fake data directly to the DB (Bogus, Turkish locale, `demo`/`scale` profiles); agent-facing API responses are mocked where the panel needs live interaction. Every spec that adds tables extends the seeder in the same spec.
- **Why:** Focus the build on the planner panel — the product's core; the mobile surface is read-only and can be simulated cheaply.
- **Alternatives rejected:** Building mobile in parallel (splits focus, needs device testing); API-level fixtures only (doesn't exercise real DB constraints/queries the way seeded rows do).
- **Consequences:** Planned-vs-realized, analytics, and Onarım develop against seeded outcomes; mobile revived from backlog later — its API contract already exists in docs/API.md so nothing blocks it.

## 2026-07-15 — SQL Server replaces PostgreSQL/PostGIS from the design doc
- **Decision:** Database is SQL Server (tech stack Rev. 2, customer standard). Design doc §5 was written assuming PostgreSQL + PostGIS + JSONB.
- **Why:** Customer corporate standard; their team maintains it (EVO-Teknoloji-Yigini.pdf).
- **Alternatives rejected:** PostgreSQL — technically preferred (PostGIS, JSONB, partial indexes) but conflicts with customer ops.
- **Consequences:** §5 schema must be adapted in spec 003/later: `geography` → SQL Server geography type; `jsonb` → JSON in nvarchar(max) + `ISJSON` checks (GIN index on rule.condition needs a computed-column strategy); partial unique indexes → filtered unique indexes (supported); `text[]` districts → JSON or child table. Flag any §5 feature that doesn't map cleanly.

## 2026-07-15 — Tech stack Rev. 2 adopted (see EVO-Teknoloji-Yigini.pdf)
- **Decision:** .NET 8 (ASP.NET Core Web API + EF Core), React+TS panel, React Native (Expo) Android app, OpenAPI contract-first with generated TS clients, MinIO photos, OSRM travel times, FCM notifications, ASP.NET Identity (+AD/Entra option), Docker or IIS deployment.
- **Why:** Customer ecosystem alignment (backend/DB); most mature ecosystems for the drag-heavy panel (React) and offline sync (React Native/WatermelonDB).
- **Alternatives rejected:** Blazor Server (latency on drag interactions), Blazor WASM (weak library ecosystem), MAUI (immature offline sync/photo upload libraries).
- **Consequences:** Clients never hand-write API types; single VM scale ceiling accepted (~75k visits/day — no microservices); 9 customer-IT questions still open and may adjust deployment/identity details.

## 2026-07-15 — AI engineering OS installed; process rules in CLAUDE.md
- **Decision:** Spec-driven build with platform specs first (001-scaffold → 002-auth → 003-error-audit → 004-store-sync), linear (no parallel sessions), checkpoints every phase.
- **Why:** Cross-cutting layers must exist before 10+ modules reference them; solo developer learning the workflow.
- **Consequences:** No module work until M0 complete.
