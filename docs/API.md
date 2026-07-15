# API Contracts

<!-- Owned by: architect. Contract-first: the OpenAPI document generated from the backend
     is the source of truth; TS clients are GENERATED. This file records conventions +
     endpoint inventory. Representative endpoint sketch: design doc §9. -->

## Conventions
- Base URL: `/api/v1`
- Auth: cookie or JWT via ASP.NET Identity (decided in spec 002); two roles — `Supervisor`, `FieldAgent`
- Error format: RFC 7807 ProblemDetails, one shape everywhere (defined in spec 003):
```json
{ "type": "...", "title": "...", "status": 422, "detail": "...", "errors": { "field": ["msg"] }, "traceId": "..." }
```
- Validation: same rule set runs live in UI and enforced at write (design §3.2). Validation failures that are overridable return the violation list; publishing past 🔴 errors requires `justification` + actor in the request (design v0.5 publish gate).
- Versioning: URL segment v1; breaking changes need a flagged decision
- Mutations that affect schedules NEVER apply directly — they stage into draft; only `POST /publish` applies (design §10 "Publish gate confirmed")

## Endpoint inventory (from design §9 — implement per module spec)
| Area | Endpoints | Spec |
|---|---|---|
| Stores/map | `GET /stores` (bbox/polygon/unassigned filters), `GET /stores/{id}/summary`, `GET /stores/{id}/task-plan` | 004 + M1 |
| Routes | `POST /routes`, `POST /routes/{id}/stops:bulk`, `POST /routes/{id}/stops/{sid}:move` (atomic), `PATCH .../stops/{sid}`, `GET /routes/{id}/plan?from&to`, `GET /routes/{id}/health` | M1 |
| Patches/assignment | `POST /routes/{id}/patches` (expiry REQUIRED), `POST /routes/{id}/assignment` (reason REQUIRED) | M1 |
| Simulation | `POST /simulate/route` (what-if: stores[] → revenue+minutes) | M1 |
| Tasks/rules | `GET /task-templates`, `POST /rules`, `PATCH /task-instances/{id}` (scope param), `POST /tasks/adhoc`, `GET /tasks/overdue` | M2 |
| Mobile | `GET /merchandisers/{id}/day?date=` (flat indexed read) | M3 |
| Analytics | `GET /analytics/stability?region=` | M4 |

## Client generation
`npm run generate-api-client` (panel + mobile) regenerates from the OpenAPI doc; run after ANY backend contract change; generated code is never edited by hand. Pipeline defined in spec 001.
