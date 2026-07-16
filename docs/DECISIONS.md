# Decisions Log

<!-- Newest first — insert new entries directly below this line -->
## 2026-07-16 — decision_journal deferred to M1
- **Decision:** The `decision_journal` table (design §11.3/§755 — the "why" behind
  publish-with-errors, repairs, and permanents; distinct from the generic `audit_log`, which
  records the "what") is out of scope for spec 003. It ships with M1 alongside Routes/Patches,
  the first entities it has anything to record decisions about.
- **Why:** Nothing exists yet for a publish-gate override to override — building it now would be
  speculative and likely need rework once Routes/Patches define the real shape of what's overridden.
- **Consequences:** `docs/AUTH.md`/`docs/API.md` do not mention it; flag it explicitly in the M1
  spec's clarifications so it isn't silently dropped.

## 2026-07-16 — Generic append-only audit_log replaces route_change_log/admin_audit_log for now
- **Decision:** Spec 003 built one generic `audit_log` table (`ActorId`, `OccurredAt`,
  `EntityType`, `EntityKey`, `Event`, `BeforeJson`/`AfterJson`) instead of the design doc's two
  separate tables (`route_change_log`, `admin_audit_log`, design §5/§2.7). Write-only via
  `IAuditWriter` (no update/delete). Currently used by `UsersController` and
  `AuthController.change-password`; `route_change_log`/`admin_audit_log` become typed facade
  queries over this same table once Routes/Settings exist.
- **Why:** Neither design-doc table has an owning entity yet (Route, Setting) — building two
  near-identical, mostly-empty tables now would be premature; a single generic table lets
  security-relevant actions (user lifecycle events) get recorded starting today.
- **Alternatives rejected:** two separate physical tables now (structurally identical, no
  consumers yet); event-sourcing/outbox (over-engineered for a single VM, 2 roles); DB triggers
  (invisible, hard to test, can't cleanly capture the acting user).
- **Consequences:** `docs/DATABASE.md` documents this deviation against design §5. No schema
  change expected when Routes/Settings land — just query-layer facades.

## 2026-07-16 — Unified API error shape (AddProblemDetails + IExceptionHandler, stable code, prod hides details)
- **Decision:** Every non-2xx API response uses one shape: `code` (stable English key), `title`/
  `detail` (English, dev-facing), `userTitle`/`userMessage` (Turkish, see the entry below),
  `status`, `traceId`, no RFC 7807 `instance`, `errors={field:[msg]}` on validation failures.
  Built entirely on ASP.NET Core's built-in pipeline: `AddProblemDetails(CustomizeProblemDetails)`
  normalizes every framework-generated ProblemDetails; a domain-exception taxonomy
  (`EvoException` → `NotFoundException` 404, `ConflictException` 409, `EvoValidationException`
  422) is mapped by an `IExceptionHandler`; a custom `InvalidModelStateResponseFactory` renders
  model-binding failures (400) in the same shape. Unhandled exceptions never leak
  message/stack outside `Development`. Spec 002's `AuthController`/`UsersController` are
  retrofitted onto this shape in the same spec (003).
- **Why:** No hand-rolled middleware needed — the built-in customization hooks cover every case
  (auth short-circuits, model-binding, thrown exceptions) without duplicating framework
  machinery. `EvoValidationException` (422) vs model-binding (400) — same `code`, different
  status — distinguishes "well-formed but violates a domain rule" from "malformed request."
- **Consequences:** `docs/API.md` documents the shape; `docs/AUTH.md`'s formerly-interim shape
  section now points here. The 15 pre-existing spec 001/002 tests needed exactly one assertion
  updated (change-password wrong-current-password: 400→422) — everything else asserted
  content-type/status only, not shape internals, confirming the retrofit was low-risk as planned.

## 2026-07-16 — Error responses carry Turkish userTitle/userMessage from an in-code catalog, not a DB table
- **Decision:** The unified error shape (spec 003) gained `userTitle`/`userMessage` fields
  (Turkish, user-facing) alongside the existing `title`/`detail` (English, developer-facing).
  These are resolved from `Evo.Domain.Errors.UserErrorMessages` — a static in-code dictionary
  keyed by the stable `code`, with a generic fallback for unmapped codes — attached to every
  error response via `EvoProblemDetails.Finalize`. The panel displays `userMessage` directly and
  maintains no translation map of its own.
- **Why:** Raised mid-implementation (after the spec 003 Phase 1 checkpoint) — the human wants
  user-facing error text manageable "from the backend" without a database round-trip on every
  error response (explicitly rejected: "no db is bad, for every error we connect to db"). An
  in-code catalog is standard practice (Stripe/GitHub-style): error text is part of the API
  contract, deploy-reviewed like any other code change, and doesn't add a DB dependency to the
  failure path — important since the DB itself may be why a request failed.
- **Alternatives rejected:** a DB-backed `error_message` table (runtime-editable, but couples the
  error path to the database and needs a lookup/cache layer); repurposing `title`/`detail` as the
  user-facing fields (would have required reworking the already-committed Phase 1 error-shape
  work; additive fields kept that work intact).
- **Consequences:** Phase 4 (panel) simplified — the originally-planned client-side Turkish
  `code`→message map (`panel/src/api/errorMessages.ts`) is dropped; the panel's `ApiError` parser
  just surfaces the backend-provided `userMessage`. Every new `ErrorCodes` entry going forward
  needs a matching `UserErrorMessages` catalog entry (falls back to a generic Turkish message
  otherwise, so nothing breaks if forgotten — but the UX degrades to generic text).

## 2026-07-16 — Local ASP.NET Identity now; AD/Entra as an extension seam; JWT + rotating refresh
- **Decision:** Spec 002 implements local ASP.NET Identity auth (JWT bearer access token in
  panel memory, rotating refresh token in an httpOnly cookie) as the must-have baseline. AD/Entra
  SSO gets a documented extension seam (`AddEvoAuthentication` in
  `backend/src/Evo.Api/Auth/AuthenticationExtensions.cs`) — zero real Entra/OIDC code. Auth
  errors use ASP.NET Core's built-in `ProblemDetails` as an interim shape; spec 003 (error-audit)
  will unify it project-wide — this is a known, accepted cross-spec dependency, not a silent gap.
- **Why:** Whether the customer wants AD/Entra is one of the 9 open customer-IT questions;
  building it now risks throwaway work. Local Identity unblocks everything downstream (roles,
  authorization, seeded test accounts) without waiting on that answer.
- **Alternatives rejected:** Building a working Entra OIDC flow now (premature — no customer
  confirmation); third-party IdP/IdentityServer (overkill for 2 roles on a single VM);
  cookie-only session auth (bearer semantics are reusable by the deferred mobile app later).
- **Consequences:** See `docs/AUTH.md` for the full token model, endpoint list, and the
  step-by-step Entra plug-in guide. Field agents have no account-creation API — seeder-only,
  since mobile is deferred (consistent with the mobile-deferred decision below). The committed
  dev JWT signing key (`JwtSettings.WellKnownDevSigningKey`) follows the same "commit a
  clearly-labeled, code-enforced dev-only secret" pattern already used for the dev SQL Server
  password (spec 001) — `Program.cs` refuses to start with that value outside `Development`.

## 2026-07-15 — MinIO remapped to host ports 9010/9011
- **Decision:** `docker-compose.dev.yml` maps MinIO to host ports 9010 (API) / 9011 (console) instead of the default 9000/9001.
- **Why:** Ports 9000/9001 were already bound by another local project's container on the dev machine.
- **Consequences:** Local-only; document actual ports in `docker-compose.dev.yml` comments and README. No effect on deployed environments.

## 2026-07-15 — Panel pins TypeScript ~5.9, uses eslint+prettier (not the Vite template defaults)
- **Decision:** `npm create vite@latest -- --template react-ts` (current version) scaffolds `oxlint` and a TypeScript 6.0.x pre-release. Replaced with eslint (flat config) + prettier per CLAUDE.md conventions, and pinned `typescript` to `^5.9` (stable).
- **Why:** `openapi-typescript`'s peer dependency requires `typescript ^5.x`; TS 6.0.x isn't out of preview and broke `npm install`. eslint+prettier is the CLAUDE.md-mandated toolchain.
- **Consequences:** Revisit the TS pin when 6.x stabilizes and `openapi-typescript` supports it.

## 2026-07-15 — Swashbuckle for OpenAPI generation (not NSwag)
- **Decision:** `Swashbuckle.AspNetCore` (+ `Swashbuckle.AspNetCore.Cli` as a local dotnet tool) generates the OpenAPI doc. A post-build MSBuild target (`GenerateOpenApiDoc` in `Evo.Api.csproj`, Debug config only) runs `dotnet tool run swagger tofile` to emit `contracts/openapi.json` on every build. Replaced ASP.NET Core's built-in `Microsoft.AspNetCore.OpenApi`/`AddOpenApi()` (which was in the webapi template) since it duplicates Swashbuckle's job.
- **Why:** Most common ASP.NET Core OpenAPI generator, broad tooling support, plays cleanly with `openapi-typescript` on the panel side (Task 9) rather than coupling client generation to NSwag's own templates.
- **Alternatives rejected:** NSwag — can generate the TS client directly, but heavier toolchain and less flexible for this project's controller-based API.
- **Consequences:** `contracts/openapi.json` is regenerated by `dotnet build backend/Evo.sln`; CI (Task 14) must include a drift check (regenerate, fail if `git diff` isn't empty).

## 2026-07-15 — Backend targets .NET 10 SDK, not .NET 8, for spec 001 scaffold
- **Decision:** Only .NET 10 SDK (10.0.302) was available on the dev machine; scaffolded `backend/` targets .NET 10, pinned via `backend/global.json`, instead of the .NET 8 named in the tech-stack Rev. 2 decision above.
- **Why:** Installing .NET 8 side-by-side required an interactive sudo install the human deferred; unblocking spec 001 was prioritized over exact version match.
- **Alternatives rejected:** Blocking spec 001 until .NET 8 is installed.
- **Consequences:** Revisit before production/customer deployment — confirm which .NET version the customer's IT actually supports (see 9 open customer-IT questions) and retarget if needed. Nothing in spec 001's scope (health endpoint, EF Core wiring) is .NET-8-specific.

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
