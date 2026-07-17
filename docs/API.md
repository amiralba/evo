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
- Error format: unified `application/problem+json` shape (spec 003, implemented — spec 002's auth
  and users endpoints are retrofitted onto it). `code` is the stable English key
  a client switches on; `title`/`detail` are English/developer-facing; `userTitle`/`userMessage`
  are Turkish, curated per `code` in `Evo.Domain.Errors.UserErrorMessages` (an in-code catalog,
  not a DB table — error text is part of the API contract, deploy-reviewed like any other code
  change) — the panel displays these directly and maintains no translation map of its own. No
  RFC 7807 `instance` field. `errors` is present only on validation failures (422 domain-rule
  violations via `EvoValidationException`, or 400 model-binding failures — same `code`, different
  status). Unhandled exceptions never leak details outside `Development`.
```json
{
  "type": "...", "title": "...", "status": 422, "detail": "...",
  "code": "validation_error", "userTitle": "Geçersiz bilgi", "userMessage": "Girdiğiniz bilgilerde bir sorun var...",
  "errors": { "field": ["msg"] }, "traceId": "..."
}
```
- Validation: same rule set runs live in UI and enforced at write (design §3.2). Validation failures that are overridable return the violation list; publishing past 🔴 errors requires `justification` + actor in the request (design v0.5 publish gate).
- Versioning: URL segment v1; breaking changes need a flagged decision
- Mutations that affect schedules NEVER apply directly — they stage into draft; only `POST /publish` applies (design §10 "Publish gate confirmed")

## Endpoint inventory (from design §9 — implement per module spec)
| Area | Endpoints | Spec |
|---|---|---|
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password` | 002 |
| Users | `POST /users` (Supervisor only), `GET /users`, `GET /users/{id}`, `PATCH /users/{id}`, `POST /users/{id}/activate`, `POST /users/{id}/deactivate` (no delete) | 002 |
| Audit | `GET /audit-log?entityType=&page=&pageSize=` (Supervisor only, paged, newest-first) | 003 |
| Stores | `POST /stores/sync` (Supervisor only, audit-logged, on-demand — also runs nightly via a BackgroundService), `GET /stores?province=&district=&active=&format=&page=&pageSize=` (paged), `GET /stores/{id}` (with revenue + flags) | 004 |
| Stores/map | **LANDED (spec 006).** `GET /stores/geo?province=&district=&onRoute=` — any authenticated user; bulk `StoreGeoDto[]` (lat/lng, chain/category/format, active-route id+code if any, 6-month revenue), required `province`, capped at 5000. Feeds the planner map's store layer. Deferred: bbox/polygon spatial query (client-side turf point-in-polygon lasso instead), `GET /stores/{id}/summary`. `GET /stores/{id}/task-plan` landed spec 008 (see Tasks/rules row). | 006 |
| Routes | `POST /routes` (Supervisor only), `GET /routes?province=&status=&page=&pageSize=` (paged), `GET /routes/{id}`, `PATCH /routes/{id}` (rename/target/activate/deactivate — Draft→Active requires an active Assignment else 409; Active→Inactive releases stops + drops future visits; Inactive→Active returns empty) | 005 |
| Route stops | `POST /routes/{id}/stops:bulk` (V3/V4 reject with reason, accepted get regenerated), `PATCH /routes/{id}/stops/{sid}` (`serviceMinutes` **snapped to nearest 5, clamped [10,240] — spec 007**), `POST /routes/{id}/stops/{sid}:move` (atomic, regenerates both routes), `POST /routes/{id}/stops:reorder` (**LANDED, spec 006** — Supervisor only, `ReorderStopsRequest{stopIds}` must exactly match the route's active stops or 422, reassigns `sequence` in one transaction + one audit-log entry, returns `RouteDetailDto`; backs the panel's drag-and-drop stop reorder in a single call instead of N per-stop PATCHes) | 005 / 006 / 007 |
| Assignment | `POST /routes/{id}/assignment` (reason REQUIRED, 422 if missing; 409 if the merchandiser already holds an active assignment elsewhere — DB constraint) | 005 |
| Patches | `POST /routes/{id}/patches` (`endsOn` REQUIRED — V9, 422 if missing). **Spec 007**: `TimeShift` (type 5) requires `storeId` + `paramsJson={"startMinutes":<int>}` (minutes since midnight) — 422 without; `PatchResolver` pins the store's visit start (never earlier than the day's cursor) and `DayScheduler` reflows downstream visits. `MoveVisit` (type 6, new) requires `storeId` + `paramsJson={"fromDate":"yyyy-MM-dd","toDate":"yyyy-MM-dd","startMinutes"?:<int>}`, `fromDate != toDate` (422 otherwise) — resolved as skip-on-fromDate + add-on-toDate off a single patch row (one expiry, one audit entry, auto-reverts together). Both types 422 on missing/malformed `paramsJson`. | 005 / 007 |
| Plan/health/validate | `GET /routes/{id}/plan?from=&to=` (materialized visits + per-day findings — `PlannedVisitDto.routeStopId` added **spec 007**, lets the panel correlate a dragged block to its stop), `GET /routes/{id}/health` (revenue/weekday-minutes/category-mix/finding counts), `POST /routes/{id}/validate` (live findings, no persistence) | 005 / 007 |
| Publish | `POST /routes/{id}/publish` (runs the validator; Error findings require `reason`+`objective` to override — 422 without, journaled to `decision_journal` with; materializes the horizon) | 005 |
| Simulation | `POST /simulate/route` (what-if: stores[] → revenue+minutes) — still deferred (not in 006's MVP cut) | later M1 |
| Tasks/rules | **LANDED (spec 008).** `GET /task-templates` (active catalog). `GET /stores/{id}/task-plan?date=` — resolved tasks for a store/date via `TaskResolver`: `{storeId, date, visitTotalMinutes, tasks:[{templateId, code, name, minutes, trace:[{layer, op, before, after}], taskInstanceId}]}` (`taskInstanceId` null if no materialized `TaskInstance` exists for that date yet — e.g. far future). `GET /rules` (list), `POST /rules` (Supervisor only; body `{taskTemplateId?, scope, condition:{chainId?, format?, category?, channel?, province?, routeId?, storeId?}, effect:{op, setValue?, scaleValue?}, priority, effectiveFrom, effectiveTo?}`; writes an `audit_log` entry `entityType=Rule`; regenerates affected routes' horizon inline before responding). `GET /rules/impact?scope=&taskTemplateId=&chainId=&format=&routeId=&storeId=&op=&setValue=&scaleValue=` — aggregate preview `{stores, visitsPerWeek, deltaMinutesPerWeek, daysOver450}` for a *candidate* (not-yet-created) rule; never persists. `PATCH /task-instances/{id}` body `{minutes, scope}` where `scope` is the literal string `"INSTANCE"` (writes `TaskInstance.OverrideMinutes` for that row only, recomputes that visit's `PlannedEnd`), `"STORE_RULE"`, or `"FORMAT_RULE"` (both create a new store/format-scoped `Rule` from the edit context and regenerate affected routes). `POST /tasks/adhoc` body `{templateCode, name, minutes, targetChain?, targetFormat?, deadline}` — creates a `recurrence=Once` `TaskTemplate` with `validUntil=deadline`, returns `{taskTemplateId, matchingStoreCount}`; regeneration attaches one `TaskInstance` to each matching store's next visit before the deadline. Never-block: a rule edit that pushes a day over 450 min surfaces the existing V2 finding as `Warning` on `GET /routes/{id}/plan`, never blocks the write. Deferred: `GET /tasks/overdue`, standalone Yönetim admin pages (template/rule CRUD UI — `POST /rules` covers creation, no list/edit page yet). | 008 |
| Mobile | `GET /merchandisers/{id}/day?date=` — landed early in 005 (Supervisor: any merchandiser; FieldAgent: self only, else 403) since the route lifecycle needed a merchandiser-scoped read; full mobile sync remains M3 | 005 (early) / M3 |
| Analytics | `GET /analytics/stability?region=` | M4 |

## Client generation
`npm run generate-api-client` (panel + mobile) regenerates from the OpenAPI doc; run after ANY backend contract change; generated code is never edited by hand. Pipeline defined in spec 001.
