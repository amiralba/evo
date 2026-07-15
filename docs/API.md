# API Contracts

<!-- Owned by: architect. Contract-first: the OpenAPI document generated from the backend
     is the source of truth; TS clients are GENERATED. This file records conventions +
     endpoint inventory. Representative endpoint sketch: design doc §9. -->

## Conventions
- Base URL: `/api/v1`
- Auth: JWT bearer access token (60 min, in the `Authorization` header) + rotating httpOnly
  refresh cookie (14 days, path-scoped to `/api/v1/auth`) via ASP.NET Identity — decided in spec
  002, see `docs/AUTH.md` for the full token model. Two roles — `Supervisor` (full), `FieldAgent`
  (read-only + notes, seeder-only — no account-creation API).
- Error format (interim, spec 002 auth endpoints): ASP.NET Core's built-in `ProblemDetails`
  (`application/problem+json`). The unified shape below is spec 003's job — auth endpoints will
  move onto it when 003 lands rather than staying a one-off:
```json
{ "type": "...", "title": "...", "status": 422, "detail": "...", "errors": { "field": ["msg"] }, "traceId": "..." }
```
- Validation: same rule set runs live in UI and enforced at write (design §3.2). Validation failures that are overridable return the violation list; publishing past 🔴 errors requires `justification` + actor in the request (design v0.5 publish gate).
- Versioning: URL segment v1; breaking changes need a flagged decision
- Mutations that affect schedules NEVER apply directly — they stage into draft; only `POST /publish` applies (design §10 "Publish gate confirmed")

## Endpoint inventory (from design §9 — implement per module spec)
| Area | Endpoints | Spec |
|---|---|---|
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password` | 002 |
| Users | `POST /users` (Supervisor only), `GET /users`, `GET /users/{id}`, `PATCH /users/{id}`, `POST /users/{id}/activate`, `POST /users/{id}/deactivate` (no delete) | 002 |
| Stores/map | `GET /stores` (bbox/polygon/unassigned filters), `GET /stores/{id}/summary`, `GET /stores/{id}/task-plan` | 004 + M1 |
| Routes | `POST /routes`, `POST /routes/{id}/stops:bulk`, `POST /routes/{id}/stops/{sid}:move` (atomic), `PATCH .../stops/{sid}`, `GET /routes/{id}/plan?from&to`, `GET /routes/{id}/health` | M1 |
| Patches/assignment | `POST /routes/{id}/patches` (expiry REQUIRED), `POST /routes/{id}/assignment` (reason REQUIRED) | M1 |
| Simulation | `POST /simulate/route` (what-if: stores[] → revenue+minutes) | M1 |
| Tasks/rules | `GET /task-templates`, `POST /rules`, `PATCH /task-instances/{id}` (scope param), `POST /tasks/adhoc`, `GET /tasks/overdue` | M2 |
| Mobile | `GET /merchandisers/{id}/day?date=` (flat indexed read) | M3 |
| Analytics | `GET /analytics/stability?region=` | M4 |

## Client generation
`npm run generate-api-client` (panel + mobile) regenerates from the OpenAPI doc; run after ANY backend contract change; generated code is never edited by hand. Pipeline defined in spec 001.
