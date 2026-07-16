# Tasks: Error Shape & Audit Log (003-error-audit)

<!-- Each task ≈ 2–5 min, zero-context executable. Verify before checking off (rule 3d).
     STOP at each phase end: summarize, commit, wait for human.
     Backend paths follow docs/ARCHITECTURE.md (backend targets .NET 10). Dev SQL Server is the
     docker-compose.dev.yml container from spec 001 (connection string name: EvoDb).
     This spec has a cross-spec dependency FROM spec 002 (retrofits AuthController + UsersController). -->

## Phase 1 — Unified error shape

## Task 1: Error code constants
- Files: `backend/src/Evo.Domain/Errors/ErrorCodes.cs`
- Do: `public static class ErrorCodes` with `public const string` entries: `ValidationError = "validation_error"`, `NotFound = "not_found"`, `Conflict = "conflict"`, `Unauthorized = "unauthorized"`, `Forbidden = "forbidden"`, `InternalError = "internal_error"`, and auth keys `AuthInvalidCredentials = "auth.invalid_credentials"`, `AuthAccountInactive = "auth.account_inactive"`, `AuthLockedOut = "auth.locked_out"`. English stable keys; the panel maps them to Turkish (Phase 4). Lives in Domain so both the exception taxonomy and the Api handler reference the same constants.
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 2: Domain exception taxonomy
- Files: `backend/src/Evo.Domain/Exceptions/EvoException.cs`, `NotFoundException.cs`, `ConflictException.cs`, `EvoValidationException.cs`
- Do: abstract `EvoException : Exception` with `public string Code { get; }`, `public int StatusCode { get; }`, and `public IReadOnlyDictionary<string, string[]>? Errors { get; }` (protected ctor sets all). `NotFoundException` → status 404, default `ErrorCodes.NotFound` (ctor optionally takes entity name for the message). `ConflictException` → 409, `ErrorCodes.Conflict`. `EvoValidationException` → **422** (Unprocessable Entity — domain rule violation; distinct from model-binding 400s), `ErrorCodes.ValidationError`, ctor takes `IReadOnlyDictionary<string,string[]> errors`. All English messages.
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 3: ProblemDetails customization + controller problem helper
- Files: `backend/src/Evo.Api/Errors/EvoProblemDetails.cs` (customizer + `ControllerBase` helper), `backend/src/Evo.Api/Program.cs`
- Do: call `builder.Services.AddProblemDetails(options => options.CustomizeProblemDetails = ctx => { ... })` that, for every generated ProblemDetails: sets `ctx.ProblemDetails.Instance = null` (drop RFC 7807 `instance`); sets `ctx.ProblemDetails.Extensions["traceId"] = Activity.Current?.Id ?? ctx.HttpContext.TraceIdentifier`; and if `Extensions["code"]` is not already set, assigns a default `code` by status (401→`unauthorized`, 403→`forbidden`, 404→`not_found`, 409→`conflict`, else `internal_error`). Also add a `ControllerBase` extension `EvoProblem(int status, string code, string title, string? detail = null)` returning an `ObjectResult` with `application/problem+json` and the `code` extension set — used by AuthController later.
- Verify: `dotnet build`; `dotnet run --project backend/src/Evo.Api` starts without error.
- Status: [x]

## Task 4: Global exception handler (domain taxonomy → status + code)
- Files: `backend/src/Evo.Api/Errors/EvoExceptionHandler.cs`, `backend/src/Evo.Api/Program.cs`
- Do: `EvoExceptionHandler : IExceptionHandler` (inject `IProblemDetailsService`, `IHostEnvironment`). For `EvoException`: build a `ProblemDetails` with its `StatusCode`, `Code` (into `Extensions["code"]`), title from the exception type, and `errors` extension when `Errors` is non-null; write via `IProblemDetailsService.TryWriteAsync`. For any other exception: `500`, `code=internal_error`, generic title/detail; include the real message/stack in `detail` ONLY when `env.IsDevelopment()`, otherwise a generic string. Register with `builder.Services.AddExceptionHandler<EvoExceptionHandler>()` and `app.UseExceptionHandler()` (early in the pipeline).
- Verify: `dotnet build`; covered by Task 6 tests.
- Status: [x]

## Task 5: Model-state 400 factory
- Files: `backend/src/Evo.Api/Errors/ValidationProblem.cs`, `backend/src/Evo.Api/Program.cs`
- Do: `builder.Services.Configure<ApiBehaviorOptions>(o => o.InvalidModelStateResponseFactory = ctx => { ... })` producing a `400` ProblemDetails with `Extensions["code"] = ErrorCodes.ValidationError` and `Extensions["errors"] = { field: [messages] }` built from `ctx.ModelState`, returned as `application/problem+json` (the CustomizeProblemDetails hook still adds `traceId` + drops `instance`).
- Verify: `dotnet build`; covered by Task 6 tests.
- Status: [x]

## Task 6: Backend tests — error shape
- Files: `backend/tests/Evo.Tests/Errors/ErrorShapeTests.cs`, `backend/tests/Evo.Tests/Errors/TestThrowController.cs`
- Do: add a test-only controller (registered as an application part on the test `WebApplicationFactory`) with endpoints that throw each exception type and a `[HttpPost]` action with a `[Required]` field for the model-state path. Assert: `NotFoundException`→404 `code=not_found`; `ConflictException`→409 `code=conflict`; `EvoValidationException`→**422** `code=validation_error` with `errors`; invalid model → **400** `code=validation_error` + `errors` (assert the two validation paths differ by status: 422 domain vs 400 model-binding, same `code`); unhandled `throw new Exception()` under a **non-Development** environment → 500 `code=internal_error` with NO exception message/stack in the body but a `traceId` present; assert NO `instance` field on any body.
- Verify: `dotnet test backend/Evo.sln` → these tests pass.
- Status: [x]

**PHASE 1 CHECKPOINT — HARD STOP (rule 3d): summarize + evidence (build, error-shape test output), commit `feat(003): unified api error shape`, numbered questions, then say 'CHECKPOINT — waiting for your go' and END TURN.**

<!-- AMENDMENT (post-Phase-1-checkpoint, spec Clarification #8): added userTitle/userMessage
     (Turkish, in-code UserErrorMessages catalog) to the shape — additive to Task 3's
     EvoProblemDetails.Finalize + Task 4/5's emission points, Task 6 gained assertions for the
     new fields. Committed as a small follow-up before Phase 2 started; see commit history. -->

## Phase 2 — Audit log data foundation

## Task 7: AuditLogEntry entity
- Files: `backend/src/Evo.Infrastructure/Audit/AuditLogEntry.cs`
- Do: entity `Id (Guid)`, `ActorId (Guid?)`, `OccurredAt (DateTimeOffset)`, `EntityType (string)`, `EntityKey (string)`, `Event (string)`, `BeforeJson (string?)`, `AfterJson (string?)`. Append-only — no mutation methods. XML doc comment: this generic table backs the future `RouteChangeLog` / `admin_audit_log` facades (spec 003 deviation).
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [ ]

## Task 8: EF config + DbSet on EvoDbContext
- Files: `backend/src/Evo.Infrastructure/EvoDbContext.cs`
- Do: add `public DbSet<AuditLogEntry> AuditLog => Set<AuditLogEntry>();`; in `OnModelCreating` (after `base.OnModelCreating`) configure `AuditLogEntry`: `EntityType`/`Event` max length 100, `EntityKey` max length 200, `BeforeJson`/`AfterJson` as `nvarchar(max)`; indexes on `EntityType`, composite (`EntityType`,`EntityKey`), and `OccurredAt`.
- Verify: `dotnet build` succeeds.
- Status: [ ]

## Task 9: EF migration AddAuditLog
- Files: `backend/src/Evo.Infrastructure/Migrations/` (generated)
- Do: `dotnet ef migrations add AddAuditLog -p backend/src/Evo.Infrastructure -s backend/src/Evo.Api`.
- Verify: migration file exists and its `Up()` creates the `AuditLog` table with the three indexes.
- Status: [ ]

## Task 10: Append-only audit writer service
- Files: `backend/src/Evo.Api/Audit/IAuditWriter.cs`, `backend/src/Evo.Api/Audit/AuditWriter.cs`, `backend/src/Evo.Api/Program.cs`
- Do: `IAuditWriter.WriteAsync(string entityType, string entityKey, string @event, object? before = null, object? after = null, Guid? actorId = null, CancellationToken ct = default)`. Implementation injects `EvoDbContext` + `IHttpContextAccessor`; serializes `before`/`after` with `System.Text.Json` (null → null); resolves `actorId` from the current user's `sub`/NameIdentifier claim when not passed; sets `OccurredAt = DateTimeOffset.UtcNow`; inserts one row and `SaveChangesAsync`. Expose NO update/delete method. Register `AddScoped<IAuditWriter, AuditWriter>()` and ensure `AddHttpContextAccessor()` is present.
- Verify: `dotnet build`; covered by Task 11 tests.
- Status: [ ]

## Task 11: Backend tests — audit writer
- Files: `backend/tests/Evo.Tests/Audit/AuditWriterTests.cs`
- Do: with a test DbContext (sqlite or the compose SQL, matching the spec-002 test setup), call `WriteAsync("User", key, "created", before: null, after: new {...})`; assert one row exists with serialized `AfterJson`, `OccurredAt` set, and `EntityType`/`Event` populated; assert actor resolution (pass an explicit `actorId` → stored) ; assert the `IAuditWriter` surface has no update/delete member (compile-time / reflection check).
- Verify: `dotnet test backend/Evo.sln` → these tests pass.
- Status: [ ]

## Task 12: Seeder module — demo audit rows
- Files: `backend/src/Evo.Seeder/Modules/AuditLogSeederModule.cs`, `backend/src/Evo.Seeder/Program.cs`
- Do: implement the `SeederModule` interface (spec 001); in the **demo** profile only, insert a handful of illustrative `AuditLogEntry` rows (system actor = `null` ActorId, `entityType="User"`, sample events) idempotently (skip if any `audit_log` rows already exist); the **scale** profile inserts none. Register the module in Program.cs. Satisfies the CLAUDE.md "every spec that adds a table extends the seeder" rule.
- Verify: with the compose SQL up + `AddAuditLog` applied, `dotnet run --project backend/src/Evo.Seeder -- --profile demo` exits 0 and creates the rows; re-running creates no duplicates (row count stable).
- Status: [ ]

**PHASE 2 CHECKPOINT — HARD STOP (rule 3d): summarize + evidence (build, migration file, audit-writer test output, seeder run output), commit `feat(003): generic append-only audit log`, numbered questions, then say 'CHECKPOINT — waiting for your go' and END TURN.**

## Phase 3 — Read endpoint + retrofit spec 002 + docs

## Task 13: Audit-log read endpoint (supervisor-only, paged, filterable)
- Files: `backend/src/Evo.Api/Controllers/AuditLogController.cs`, `backend/src/Evo.Api/Audit/Dtos/AuditLogEntryDto.cs`, `backend/src/Evo.Api/Audit/Dtos/PagedResult.cs`
- Do: `[Authorize(Roles = Roles.Supervisor)] GET /api/v1/audit-log`. Query params `entityType?` (filter), `page = 1`, `pageSize = 50` (cap at 200). Return `PagedResult<AuditLogEntryDto>` (items + `page`, `pageSize`, `total`), newest-first by `OccurredAt`. `AuditLogEntryDto(Id, ActorId, OccurredAt, EntityType, EntityKey, Event, BeforeJson, AfterJson)`.
- Verify: `dotnet build`; covered by Task 16 test.
- Status: [ ]

## Task 14: Retrofit UsersController + change-password to write audit rows
- Files: `backend/src/Evo.Api/Controllers/UsersController.cs`, `backend/src/Evo.Api/Controllers/AuthController.cs`
- Do: inject `IAuditWriter`. In `UsersController`: after a successful create → `WriteAsync("User", userId, "created", after: summary)`; activate → `"activated"`; deactivate → `"deactivated"` (with `before`/`after` IsActive). In `AuthController.change-password`: after success → `WriteAsync("User", userId, "password_changed")` with NO secret material in `before`/`after`.
- Verify: `dotnet build`; audit writes covered by Task 16 test.
- Status: [ ]

## Task 15: Retrofit AuthController + UsersController onto the unified shape
- Files: `backend/src/Evo.Api/Controllers/AuthController.cs`, `backend/src/Evo.Api/Controllers/UsersController.cs`
- Do: replace the interim built-in `Problem(...)` calls with the unified shape: login invalid/not-found → `this.EvoProblem(401, ErrorCodes.AuthInvalidCredentials, ...)`; inactive user → `ErrorCodes.AuthAccountInactive`; lockout → `ErrorCodes.AuthLockedOut`; change-password Identity failures → throw `EvoValidationException` with the Identity error list (so it renders `errors` + `code=validation_error`); user-not-found in Users endpoints → throw `NotFoundException`; duplicate email on create → throw `ConflictException`. Remove the now-stale interim comments.
- Verify: `dotnet build`; behavior covered by Task 16 + the existing spec-002 tests (Task 17).
- Status: [ ]

## Task 16: Backend tests — audit endpoint + audit writes on user actions
- Files: `backend/tests/Evo.Tests/Audit/AuditEndpointTests.cs`
- Do: Supervisor creates a user → `GET /api/v1/audit-log?entityType=User` returns a `created` row for that user; deactivate → a `deactivated` row appears; a Field agent calling `/audit-log` → 403 (unified shape, `code=forbidden`); unauthenticated → 401 (`code=unauthorized`); paging (`page`/`pageSize`) returns the correct slice + `total`.
- Verify: `dotnet test backend/Evo.sln` → these tests pass.
- Status: [ ]

## Task 17: Re-run the existing spec-002 suite as regression proof
- Files: none (verification task)
- Do: run the full backend suite and confirm the 15 pre-existing spec 001/002 tests still pass alongside the new 003 tests after the error-shape + audit retrofit. If any spec-002 test asserted an interim-shape internal that legitimately changed, update that single assertion and note it in the checkpoint summary.
- Verify: `dotnet test backend/Evo.sln` → all green; report the pass count (should be 15 prior + new 003 tests).
- Status: [ ]

## Task 18: Regenerate contract + update docs + decisions
- Files: `contracts/openapi.json`, `docs/API.md`, `docs/AUTH.md`, `docs/DATABASE.md`, `docs/DECISIONS.md`
- Do: rebuild so Swashbuckle emits `/api/v1/audit-log` into `contracts/openapi.json`. In `docs/API.md`: add an `Audit` endpoint row and a "Unified error shape" section (fields `code`/`title`/`detail`/`status`/`traceId`/`errors`, no `instance`, prod 500 behavior). In `docs/AUTH.md`: replace the "Error shape (interim)" section with a pointer to the now-unified shape (spec 003 landed). In `docs/DATABASE.md`: document the `audit_log` table + note it backs future `RouteChangeLog`/`admin_audit_log` facades. In `docs/DECISIONS.md` (newest-first): (a) the deviation collapsing `RouteChangeLog` + `admin_audit_log` into one generic `audit_log`; (b) the unified error-shape decision (`AddProblemDetails` + `IExceptionHandler` + model-state factory, stable `code`, prod-hides-details); (c) the `decision_journal` deferral to M1.
- Verify: `contracts/openapi.json` contains `/api/v1/audit-log`; all four docs updated; `docs/AUTH.md` no longer says the error shape is "interim".
- Status: [ ]

**PHASE 3 CHECKPOINT — HARD STOP (rule 3d): summarize + evidence (audit-endpoint test output, full-suite green count, regenerated contract diff), commit `feat(003): audit read endpoint + spec-002 error-shape retrofit`, numbered questions, then say 'CHECKPOINT — waiting for your go' and END TURN.**

## Phase 4 — Panel consumes the unified error shape (no viewer UI)

<!-- SCOPE NOTE: see spec Open Questions — if the human wants 003 strictly backend-only, SKIP this
     entire phase and file it as a fast follow. Otherwise it is minimal: parse + wire login.
     AMENDED after the Phase 1 checkpoint (spec Clarification #8): the backend now returns
     userTitle/userMessage (Turkish) directly via UserErrorMessages — the panel has NO Turkish
     message map of its own anymore. Original Task 21 (errorMessages.ts) is DROPPED. -->

## Task 19: Regenerate the TS client
- Files: `panel/src/api/generated/` (generated)
- Do: with `contracts/openapi.json` updated (Task 18), run `npm run generate-api-client` from `panel/`.
- Verify: generated types include the `audit-log` operation (grep the generated folder for `audit-log`).
- Status: [ ]

## Task 20: Typed ApiError parser
- Files: `panel/src/api/errors.ts`
- Do: `type ApiError = { code: string; title: string; detail?: string; userTitle: string; userMessage: string; status: number; traceId?: string; errors?: Record<string, string[]> }`; `parseApiError(response: Response): Promise<ApiError>` that reads the `problem+json` body and returns a typed `ApiError`, with a safe fallback (`code: 'internal_error'`, generic Turkish `userTitle`/`userMessage`, the status) if the body is missing/not JSON.
- Verify: `npm run build` (panel) type-checks.
- Status: [ ]

## Task 21: Wire the login page to the unified shape
- Files: `panel/src/pages/Login.tsx` (and `panel/src/api/client.ts` if the wrapper throws raw responses)
- Do: on a failed login, `parseApiError` the response and display `error.userMessage` (Turkish, backend-provided) instead of the hardcoded client-side string; keep the field intact for correct credentials. LOGIN PAGE ONLY — reuse the page's existing inline error element; do NOT introduce a general/app-wide error notification component (toast/popup/inline pattern is an explicitly deferred decision — see spec Non-goals). Do NOT build any audit-log viewer UI.
- Verify: `npm run dev` with the backend running — wrong credentials show the backend's Turkish `userMessage`.
- Status: [ ]

## Task 22: Vitest — parser
- Files: `panel/src/api/errors.test.ts`
- Do: test `parseApiError` returns the typed object incl. `userTitle`/`userMessage`/`errors` for a validation body, and the generic Turkish fallback for a non-JSON/malformed body.
- Verify: `npm test` (panel) → these pass.
- Status: [ ]

**PHASE 4 CHECKPOINT — HARD STOP (rule 3d): summarize + evidence (client regen grep, panel tests, manual wrong-credentials screenshot showing the Turkish message), give the human a 1-minute UI test script (open panel → /login → enter wrong credentials → Turkish error renders → correct credentials log in), commit `feat(003): panel unified-error-shape consumption`, then run /end-session and END TURN. Do NOT start spec 004.**
