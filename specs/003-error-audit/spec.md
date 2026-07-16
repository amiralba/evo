# Spec: Error Shape & Audit Log   (slug: 003-error-audit)

## Problem & goal
Two cross-cutting platform concerns must exist before any feature module ships so modules can lean on
them instead of reinventing them:

1. **A single, project-wide API error shape.** Spec 002 shipped auth on ASP.NET Core's built-in
   `Problem(...)` as a flagged *interim* shape. Feature modules (Routes, Patches, Stores) will return
   validation failures, not-found, and conflict errors constantly; they need one predictable JSON body
   with a **stable machine-readable `code`** the Turkish panel can translate, structured field-level
   `errors`, and a `traceId` for support — with production hiding all exception internals.

2. **A generic, append-only audit trail.** The design calls for two append-only audit tables —
   `RouteChangeLog` (§2.7: structural route events, actor/timestamp/before/after) and `admin_audit_log`
   (§ schema: Turkey-wide setting/template/rule mutations). Rather than build two near-identical tables
   before their owning entities (Routes, Settings) even exist, this spec builds **one generic
   `audit_log`** table + an append-only write service now, so security-relevant actions are recorded
   from day one (starting with user-management events from spec 002). `RouteChangeLog` and
   `admin_audit_log` become typed query facades over it once their entities land.

Success = every API error across the backend emits the unified shape (with `code` + `traceId`, no
stack traces in production); user create/activate/deactivate/change-password actions write real audit
rows; a Supervisor can page/filter the audit log via one API endpoint; spec 002's auth/users endpoints
are retrofitted onto the new shape; and the existing 15 backend tests still pass.

## Brainstorm results
- **Chosen approach (error shape):** Customize ASP.NET Core's **built-in** error pipeline — no
  hand-rolled middleware. `AddProblemDetails(CustomizeProblemDetails)` normalizes every generated
  ProblemDetails (adds `traceId`, ensures a `code`, drops the RFC 7807 `instance` field); an
  `IExceptionHandler` maps a small **domain-exception taxonomy** (`EvoException` →
  `NotFoundException`/`ConflictException`/`EvoValidationException`) to statuses + codes and catches
  everything else as a generic `500 code=internal_error` (details hidden outside Development); a
  customized `[ApiController]` `InvalidModelStateResponseFactory` renders model-binding 400s in the
  same shape with `errors = { field: [messages] }`. `title`/`detail` stay English/dev-facing; the
  panel translates the stable English `code` (e.g. `auth.invalid_credentials`) to Turkish.
  *(Rejected: hand-rolled exception middleware — duplicates framework machinery; rejected: raw
  ProblemDetails with no `code` — forces the panel to string-match English `detail`, which is
  brittle and un-translatable; rejected: returning localized Turkish strings from the API — couples
  the backend to one UI locale and breaks the mobile client later.)*
- **Chosen approach (audit):** ONE generic `audit_log` table (`actor_id`, `occurred_at`,
  `entity_type`, `entity_key`, `event`, `before` JSON, `after` JSON) + an append-only `IAuditWriter`
  service + tests, now. `RouteChangeLog` / `admin_audit_log` become typed facades/queries over it once
  Routes/Settings exist. *(Rejected: build `RouteChangeLog` and `admin_audit_log` as two separate
  tables now — they don't have owning entities yet and are structurally identical; rejected: an
  event-sourcing / outbox framework — massively over-engineered for a single VM and 2 roles;
  rejected: DB triggers — invisible, hard to test, and can't capture the acting user cleanly.)*
- **Later (out of v1 / this spec's scope):** the `decision_journal` (§755 — the *why* behind
  publish-with-errors / repairs / permanents) ships with **M1** alongside Routes/Patches as a distinct
  consumer; a **panel audit-log viewer UI** (this spec ships the backend read endpoint only); typed
  `RouteChangeLog` / `admin_audit_log` facade queries (built with their entities); audit-log retention
  / archival policy; audit export (CSV/Excel).

## User stories
- As a developer building a feature module, I can throw `NotFoundException` / `ConflictException` /
  `EvoValidationException` and get the correct HTTP status + unified error body automatically, so I
  never hand-format error responses.
- As a panel developer, every API error gives me a stable `code` I map to a Turkish message and a
  `traceId` I can show for support, so users never see an English stack trace.
- As a Supervisor, when I create, activate, deactivate, or a user changes their password, the action is
  recorded with who/when/before/after, so account changes are accountable.
- As a Supervisor, I can page through and filter the audit log by `entityType` via an API, so a future
  viewer (and support today) can inspect what changed.
- As a security reviewer, production API errors never leak exception messages or stack traces — only a
  generic message, `code=internal_error`, and a `traceId`.

## Acceptance criteria (testable)
### Error shape
- [ ] Unified error body for every non-2xx API response: JSON with `code` (stable English key),
      `title`, `detail` (English/dev-facing), `status`, `traceId`, **`userTitle`/`userMessage`**
      (Turkish, user-facing — see below); **no `instance` field**; validation failures additionally
      carry `errors = { field: [messages] }`.
- [ ] **`userTitle`/`userMessage`** (Turkish) are attached to every error response via an in-code
      catalog (`UserErrorMessages`, keyed by `code`, with a generic fallback for unmapped codes) — not
      a database table (error text is part of the API contract, deploy-reviewed like any other code
      change; a DB round-trip on the error-response path is a liability, especially when the DB itself
      may be why the request failed). The panel displays these fields directly; it never maintains its
      own translation map. *(Mid-implementation amendment — see Clarifications #8.)*
- [ ] `traceId` is `Activity.Current?.Id ?? HttpContext.TraceIdentifier` and is present on every error.
- [ ] A domain-exception taxonomy exists: abstract `EvoException` (carries `Code`, optional `Errors`),
      `NotFoundException` → 404, `ConflictException` → 409, `EvoValidationException` → **422** (with
      `errors`; distinct from model-binding 400s — see below). An `IExceptionHandler` maps each to its
      status + `code`.
- [ ] Any **unhandled** exception → `500` with `code=internal_error`, `traceId`, and a generic
      title/detail — **no stack trace or exception message** outside the `Development` environment
      (verified by a test running under a non-Development environment).
- [ ] Model-binding / data-annotation failures render in the unified shape with `code=validation_error`
      and `errors` populated (customized `InvalidModelStateResponseFactory`, not the default).
- [ ] Implementation uses `AddProblemDetails(CustomizeProblemDetails)` + `IExceptionHandler` +
      `ApiBehaviorOptions.InvalidModelStateResponseFactory` — **no bespoke exception middleware**.

### Audit log
- [ ] Table `audit_log` exists via migration `AddAuditLog` with columns `Id`, `ActorId (nullable)`,
      `OccurredAt`, `EntityType`, `EntityKey`, `Event`, `BeforeJson (nullable)`, `AfterJson (nullable)`;
      indexes on `EntityType`, (`EntityType`,`EntityKey`), and `OccurredAt`.
- [ ] An append-only `IAuditWriter.WriteAsync(entityType, entityKey, event, before?, after?, actorId?)`
      inserts one row, serializing `before`/`after` to JSON and resolving the actor from the current
      user when `actorId` is omitted; the service exposes **no update or delete** operation.
- [ ] `UsersController` create / activate / deactivate and `AuthController` change-password each write a
      real audit row (`entityType="User"`, `event` = created/activated/deactivated/password_changed;
      password events never store secret material in `before`/`after`).
- [ ] Supervisor-only `GET /api/v1/audit-log?entityType=&page=&pageSize=` returns a paged, newest-first
      list filterable by `entityType`; a Field agent gets 403; unauthenticated gets 401 (both in the
      unified error shape).
- [ ] The demo seeder profile writes a few illustrative audit rows idempotently (per the CLAUDE.md
      "every spec that adds a table extends the seeder" rule); the scale profile writes none.

### Retrofit + integration
- [ ] Spec 002's `AuthController` (login/refresh/change-password) and `UsersController` are retrofitted
      onto the unified shape (interim `Problem(...)` calls carry a stable `code`, e.g.
      `auth.invalid_credentials`, `auth.account_inactive`, `auth.locked_out`).
- [ ] The existing 15 backend tests still pass after the retrofit (they assert content-type + status,
      not shape internals); `dotnet test backend/Evo.sln` is fully green.
- [ ] `contracts/openapi.json` regenerated to include `/api/v1/audit-log`; `docs/API.md` documents the
      unified error shape + the audit endpoint; `docs/AUTH.md`'s "Error shape (interim)" section is
      updated to point at the now-unified shape.
- [ ] `docs/DECISIONS.md` records: (a) the deviation collapsing `RouteChangeLog` + `admin_audit_log`
      into one generic `audit_log`; (b) the unified error-shape decision; (c) the `decision_journal`
      deferral to M1. `docs/DATABASE.md` documents the `audit_log` table.

### Panel (consume the shape — no viewer UI)
- [ ] A typed `ApiError` parser reads the unified body (`code`, `userTitle`, `userMessage`, `errors`,
      `traceId`) from a `problem+json` response; the existing login error display renders
      `userMessage` directly — **no client-side Turkish message map** (the backend now owns all
      user-facing text via `UserErrorMessages`, see Clarification #8). Vitest covers the parser.
- [ ] No panel audit-log viewer UI is built (out of scope for 003).

## Clarifications
<!-- Answers provided by the human before planning (bundle accepted as recommended defaults). -->
| # | Question | Answer |
|---|---|---|
| 1 | Audit infra scope? | Build ONE generic reusable `audit_log` table now (`actor_id`, `occurred_at`, `entity_type`, `entity_key`, `event`, before/after JSON) + append-only write service + tests. `RouteChangeLog`/`admin_audit_log` become typed facades/queries over it once their entities land. Log this collapse-of-two-tables-into-one as a deviation in `docs/DECISIONS.md`. |
| 2 | Retrofit `UsersController` (create/activate/deactivate/change-password) to write real audit entries? | Yes — in scope. |
| 3 | Read surface? | Yes — a minimal supervisor-only `GET /api/v1/audit-log` (paged, filterable by `entity_type`) backend endpoint now. No panel viewer UI in 003. |
| 4 | `decision_journal`? | Out of scope for 003 — a documented future-consumer note only; ships with M1 alongside Routes/Patches. |
| 5 | Error shape? | Confirmed as proposed: add a stable machine-readable `code` (English stable key, e.g. `auth.invalid_credentials`, panel translates to Turkish; `title`/`detail` stay English/dev-facing); `errors = { field: [msg] }` for validation failures; `traceId` from `Activity.Current?.Id ?? HttpContext.TraceIdentifier`; omit RFC 7807 `instance`; production hides exception details behind a generic 500 + `code=internal_error` + `traceId` only (no stack/message outside Development). |
| 6 | Implementation approach? | Customize the built-in `IProblemDetailsService` via `AddProblemDetails(CustomizeProblemDetails)`, an `IExceptionHandler` for a domain-exception taxonomy (`EvoException` → `NotFoundException`, `ConflictException`, `EvoValidationException`, etc. mapped to statuses/codes), and a customized `[ApiController]` model-state 400 factory — NOT hand-rolled middleware. |
| 7 | Retrofit spec 002? | Retrofit `AuthController` + `UsersController` onto the new shape within 003; update `docs/AUTH.md`'s "Error shape (interim)" section; re-run the existing 15 backend tests as proof nothing broke (they assert content-type + status, not shape internals — should be safe). |
| 8 | (Mid-implementation, after Phase 1 checkpoint) Should error responses carry separate dev-facing and user-facing text, and where should the user-facing text live/be managed? | Add `userTitle`/`userMessage` (Turkish) fields alongside the existing dev-facing `title`/`detail` — additive, not a rename, so Phase 1's already-committed work needed no rework. Storage: an **in-code dictionary** (`Evo.Domain.Errors.UserErrorMessages`, keyed by `code`, generic fallback for unmapped codes) — not a database table. Standard practice: error text is part of the API contract and should be deploy-reviewed like any other code change; a DB lookup on the error-response path is a liability, especially since the DB itself may be why the request failed. Consequence: **Phase 4 simplifies** — the panel just displays `userMessage` directly; it no longer needs its own `code`→Turkish message map (the originally-planned `panel/src/api/errorMessages.ts` is dropped). |

## Non-goals
- No `decision_journal` (deferred to M1 — the "why" behind publish-with-errors/repairs/permanents).
- No typed `RouteChangeLog` / `admin_audit_log` facade queries (built later with Routes/Settings entities).
- No panel audit-log **viewer** UI (backend read endpoint only); no audit export/CSV; no audit retention/archival policy.
- General panel-wide error notification UX (toast/popup/inline) is an open decision deferred to later
  panel work; Phase 4 here only fixes the login page's error display, not a general pattern.
- No hand-rolled exception middleware; no returning localized Turkish strings from the API.
- No event-sourcing / outbox / message-bus infrastructure; no DB triggers for auditing.
- No update or delete path for audit rows (append-only by design).

## Open questions
- **Panel scope (Phase 4).** Answers scoped 003 to backend + "no panel *viewer* UI," but the whole
  point of a machine `code` is panel translation, and the spec-002 login page currently shows the raw
  `detail` (now English/dev-facing) — a UX regression if left untouched. Phase 4 therefore ships a
  minimal `code`→Turkish parser/map wired into the existing login error only. **If the human wants 003
  strictly backend-only, cut Phase 4** and file it as a fast follow — flag at review.
- **RESOLVED (human, at review):** `EvoValidationException` (domain rule violations) returns **`422`
  Unprocessable Entity** with `code=validation_error` + `errors`. Model-binding / data-annotation
  failures stay **`400`** with `code=validation_error` + `errors`. Same `code`, distinct status: `400`
  = malformed request the client can fix syntactically; `422` = well-formed request that violates a
  domain rule. The panel keys its message off `code`, so both map to the same Turkish text.
- Should audit `before`/`after` be size-capped to guard against huge JSON blobs? Planned: store as-is
  now (`nvarchar(max)`), revisit when Routes (large payloads) land — confirm at review.
