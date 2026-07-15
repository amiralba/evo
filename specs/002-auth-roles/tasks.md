# Tasks: Auth & Roles (002-auth-roles)

<!-- Each task ≈ 2–5 min, zero-context executable. Verify before checking off (rule 3d).
     STOP at each phase end: summarize, commit, wait for human.
     Backend paths follow docs/ARCHITECTURE.md (backend targets .NET 10). Dev SQL Server is the
     docker-compose.dev.yml container from spec 001 (connection string name: EvoDb). -->

## Phase 1 — Identity data foundation

## Task 1: Add Identity + JWT NuGet packages
- Files: `backend/src/Evo.Infrastructure/Evo.Infrastructure.csproj`, `backend/src/Evo.Api/Evo.Api.csproj`
- Do: add `Microsoft.AspNetCore.Identity.EntityFrameworkCore` to Infrastructure; add `Microsoft.AspNetCore.Authentication.JwtBearer` to Api. Match the installed ASP.NET Core major version (.NET 10).
- Verify: `dotnet restore backend/Evo.sln` succeeds; both package refs appear in the csproj files.
- Status: [x]

## Task 2: Role constants
- Files: `backend/src/Evo.Domain/Auth/Roles.cs`
- Do: `public static class Roles` with `public const string Supervisor = "Supervisor";` `public const string FieldAgent = "FieldAgent";` and `public static readonly string[] All = { Supervisor, FieldAgent };`. English identifiers (UI strings stay Turkish elsewhere).
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 3: ApplicationUser entity
- Files: `backend/src/Evo.Infrastructure/Identity/ApplicationUser.cs`
- Do: `public class ApplicationUser : IdentityUser<Guid>` with `string DisplayName`, `bool IsActive = true`, `DateTimeOffset CreatedAt`.
- Verify: `dotnet build` succeeds.
- Status: [x]

## Task 4: RefreshToken entity
- Files: `backend/src/Evo.Infrastructure/Identity/RefreshToken.cs`
- Do: entity `Id (Guid)`, `UserId (Guid)`, `TokenHash (string)`, `ExpiresAt`, `CreatedAt`, `RevokedAt (DateTimeOffset?)`, `ReplacedByTokenHash (string?)`; computed `bool IsActive => RevokedAt is null && ExpiresAt > DateTimeOffset.UtcNow`. Store only the SHA-256 hash, never the raw token.
- Verify: `dotnet build` succeeds.
- Status: [x]

## Task 5: Convert EvoDbContext to IdentityDbContext
- Files: `backend/src/Evo.Infrastructure/EvoDbContext.cs`
- Do: change base to `IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>`; add `DbSet<RefreshToken> RefreshTokens`; in `OnModelCreating` call `base.OnModelCreating(builder)` first, then configure RefreshToken (index on `TokenHash` unique, index on `UserId`).
- Verify: `dotnet build` succeeds.
- Status: [x]

## Task 6: EF migration AddIdentity
- Files: `backend/src/Evo.Infrastructure/Migrations/` (generated)
- Do: `dotnet ef migrations add AddIdentity -p backend/src/Evo.Infrastructure -s backend/src/Evo.Api`.
- Verify: migration file exists and its `Up()` creates `AspNetUsers`, `AspNetRoles`, `AspNetUserRoles`, and `RefreshTokens` tables.
- Status: [x]

## Task 7: Register Identity + password/lockout policy
- Files: `backend/src/Evo.Api/Program.cs`
- Do: `AddIdentityCore<ApplicationUser>(...)` (NOT `AddIdentity` — avoids default cookie schemes) with password `RequiredLength = 8`, `RequireDigit = true`, `RequireUppercase = true`, `RequireNonAlphanumeric = false`; lockout `MaxFailedAccessAttempts = 5`, `DefaultLockoutTimeSpan = 5 min`, `AllowedForNewUsers = true`; then `.AddRoles<IdentityRole<Guid>>().AddEntityFrameworkStores<EvoDbContext>().AddSignInManager().AddDefaultTokenProviders()`.
- Verify: `dotnet build` succeeds; `dotnet run --project backend/src/Evo.Api` starts without error.
- Status: [x]

## Task 8: Identity seeder module (roles + bootstrap admin + demo field agents)
- Files: `backend/src/Evo.Seeder/Modules/IdentitySeederModule.cs`, `backend/src/Evo.Seeder/Program.cs`
- Do: implement the `SeederModule` interface from spec 001; ensure roles `Supervisor` + `FieldAgent` exist; create one bootstrap Supervisor admin using `RoleManager`/`UserManager`, reading email + password from env (`EVO_SEED_ADMIN_EMAIL`, `EVO_SEED_ADMIN_PASSWORD`) with readable non-secret demo defaults for the `demo` profile only; in `demo` profile also create 2–3 `FieldAgent` users. Idempotent (skip if user/role already exists). Register the module in Program.cs. Never commit real secrets.
- Verify: with the compose SQL Server up and migration applied, `dotnet run --project backend/src/Evo.Seeder -- --profile demo` exits 0 and creates the roles + admin; re-running creates no duplicates (query `AspNetUsers` count is stable).
- Status: [x]

**PHASE 1 CHECKPOINT — HARD STOP (rule 3d): summarize + evidence (build, migration file, seeder run output), commit `feat(002): identity data foundation`, numbered questions, then say 'CHECKPOINT — waiting for your go' and END TURN.**

## Phase 2 — Token services + login / refresh / logout

## Task 9: JwtSettings + config binding
- Files: `backend/src/Evo.Api/Auth/JwtSettings.cs`, `backend/src/Evo.Api/appsettings.json`, `backend/src/Evo.Api/appsettings.Development.json`
- Do: settings class (`Issuer`, `Audience`, `SigningKey`, `AccessTokenMinutes = 60`, `RefreshTokenDays = 14`); bind from config section `Jwt`; put a dev-only signing key in `appsettings.Development.json` with a comment that production key comes from env/secret (never committed).
- Verify: `dotnet build` succeeds; add a one-line startup log or assert the bound section is non-empty.
- Status: [x]

## Task 10: JwtTokenService
- Files: `backend/src/Evo.Api/Auth/IJwtTokenService.cs`, `backend/src/Evo.Api/Auth/JwtTokenService.cs`
- Do: `GenerateAccessToken(ApplicationUser user, IEnumerable<string> roles)` → signed JWT with `sub`, `email`/`name`, one `role` claim per role, `exp = now + AccessTokenMinutes`. Register in DI.
- Verify: `dotnet build` succeeds (behavior covered by Task 17 tests).
- Status: [x]

## Task 11: RefreshTokenService (issue / rotate / revoke)
- Files: `backend/src/Evo.Api/Auth/IRefreshTokenService.cs`, `backend/src/Evo.Api/Auth/RefreshTokenService.cs`
- Do: `IssueAsync(userId)` → generate cryptographically-random raw token, store its SHA-256 hash with `ExpiresAt = now + RefreshTokenDays`, return the raw token; `ValidateAndRotateAsync(rawToken)` → look up active token by hash, mark it revoked + set `ReplacedByTokenHash`, issue a new one; `RevokeAsync(rawToken)`; `RevokeAllForUserAsync(userId)`. Register in DI.
- Verify: `dotnet build` succeeds.
- Status: [x]

## Task 12: Auth DTOs
- Files: `backend/src/Evo.Api/Auth/Dtos/LoginRequest.cs`, `LoginResponse.cs`, `MeResponse.cs`, `ChangePasswordRequest.cs`
- Do: `record` types with data annotations — `LoginRequest(Email, Password)`; `LoginResponse(AccessToken, ExpiresAt, MeResponse User)`; `MeResponse(Guid Id, string Email, string DisplayName, string[] Roles)`; `ChangePasswordRequest(CurrentPassword, NewPassword)`.
- Verify: `dotnet build` succeeds.
- Status: [x]

## Task 13: Refresh-cookie helper
- Files: `backend/src/Evo.Api/Auth/RefreshCookie.cs`
- Do: constant cookie name `evo_rt`; `Set(HttpResponse, rawToken, expiresAt)` writing httpOnly + Secure + `SameSite=Strict` + `Path=/api/v1/auth`; `Clear(HttpResponse)`; `TryRead(HttpRequest, out string)`.
- Verify: `dotnet build` succeeds.
- Status: [x]

## Task 14: AuthController — login
- Files: `backend/src/Evo.Api/Controllers/AuthController.cs`
- Do: `[AllowAnonymous] POST /api/v1/auth/login`: find user by email; if not found / `!IsActive` → 401 ProblemDetails; `SignInManager.CheckPasswordSignInAsync(user, pw, lockoutOnFailure: true)`; on lockout → 423/401 ProblemDetails; on success issue access token, `RefreshCookie.Set` with an issued refresh token, return `LoginResponse`. Use built-in `Problem(...)` (interim shape — flag spec 003).
- Verify: `dotnet build` succeeds (behavior in Task 17).
- Status: [x]

## Task 15: AuthController — refresh + logout
- Files: `backend/src/Evo.Api/Controllers/AuthController.cs`
- Do: `[AllowAnonymous] POST /api/v1/auth/refresh`: read cookie via `RefreshCookie.TryRead`; `ValidateAndRotateAsync`; on failure clear cookie + 401; on success set new cookie + return new access token. `[Authorize] POST /api/v1/auth/logout`: revoke current refresh token + `RefreshCookie.Clear`, return 204.
- Verify: `dotnet build` succeeds.
- Status: [x]

## Task 16: Configure authentication + authorization (with Entra seam)
- Files: `backend/src/Evo.Api/Auth/AuthenticationExtensions.cs`, `backend/src/Evo.Api/Program.cs`
- Do: `AddEvoAuthentication(this IServiceCollection, IConfiguration)` calling `AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(...)` (validate issuer/audience/signing key/lifetime, read bearer from Authorization header). Add a clearly-commented `// EXTENSION SEAM: register additional schemes (e.g. Entra/OIDC via .AddMicrosoftIdentityWebApi) here — no OIDC code in v1`. Call it from Program.cs; ensure `app.UseAuthentication()` before `app.UseAuthorization()`.
- Verify: `dotnet run` starts; `curl -i localhost:<port>/api/v1/auth/me` without a token → 401. (Substituted `/auth/logout`, since `/me` isn't implemented until Task 18 — the already-built `[Authorize]` `/auth/logout` endpoint confirms the auth pipeline: 401 without a token.)
- Status: [x]

## Task 17: Backend tests — login / refresh / lockout / logout
- Files: `backend/tests/Evo.Tests/Auth/AuthEndpointTests.cs`
- Do: `WebApplicationFactory` (test DB — sqlite or the compose SQL) seeding a known Supervisor: login success returns access token + `Set-Cookie: evo_rt`; wrong password → 401; 5 wrong attempts → lockout; refresh with the cookie rotates (old token then rejected); logout then refresh → 401.
- Verify: `dotnet test backend/Evo.sln` → these tests pass.
- Status: [x]

**PHASE 2 CHECKPOINT — HARD STOP (rule 3d): summarize + evidence (test output showing login/refresh/lockout/logout), commit `feat(002): jwt auth endpoints`, numbered questions, then say 'CHECKPOINT — waiting for your go' and END TURN.**

## Phase 3 — /me, change-password, user CRUD, Entra docs

## Task 18: AuthController — GET /me
- Files: `backend/src/Evo.Api/Controllers/AuthController.cs`
- Do: `[Authorize] GET /api/v1/auth/me` → resolve current user from `User` claims; return `MeResponse` (id, email, displayName, roles).
- Verify: `dotnet build`; covered by Task 23 test.
- Status: [ ]

## Task 19: AuthController — change-password
- Files: `backend/src/Evo.Api/Controllers/AuthController.cs`
- Do: `[Authorize] POST /api/v1/auth/change-password`: `UserManager.ChangePasswordAsync(currentUser, current, new)` (enforces policy); on Identity failure return ProblemDetails with the error list; on success revoke all refresh tokens for the user (`RevokeAllForUserAsync`) + clear cookie, return 204. No email-reset endpoint.
- Verify: `dotnet build`; covered by Task 23 test.
- Status: [ ]

## Task 20 [P]: UsersController — create + read (supervisor-only)
- Files: `backend/src/Evo.Api/Controllers/UsersController.cs`, `backend/src/Evo.Api/Auth/Dtos/CreateUserRequest.cs`, `UserSummary.cs`
- Do: `[Authorize(Roles = Roles.Supervisor)]`. `POST /api/v1/users` creates a **Supervisor only** (Field agents are seeder-only — reject any other role) with a temporary password; `GET /api/v1/users` (list summaries), `GET /api/v1/users/{id}`. Return `UserSummary(Id, Email, DisplayName, Roles, IsActive)`.
- Verify: `dotnet build`; covered by Task 23 test.
- Status: [ ]

## Task 21 [P]: UsersController — update + activate/deactivate (no delete)
- Files: `backend/src/Evo.Api/Controllers/UsersController.cs`
- Do: `PATCH /api/v1/users/{id}` (update `DisplayName`); `POST /api/v1/users/{id}/activate` and `.../deactivate` toggle `IsActive` (deactivate also revokes that user's refresh tokens). No DELETE endpoint exists.
- Verify: `dotnet build`; covered by Task 23 test.
- Status: [ ]

## Task 22: Entra extension-point documentation
- Files: `docs/AUTH.md` (new), `docs/DECISIONS.md`
- Do: in `docs/AUTH.md` document the token model (60 min access in memory, 14-day rotating refresh cookie), role model, and a step-by-step "How to add AD/Entra later" using the `AddEvoAuthentication` seam (register `.AddMicrosoftIdentityWebApi`, map Entra groups→roles) — noting it is blocked on the 9 open customer-IT questions. Log the decision in `docs/DECISIONS.md` (local Identity now, Entra as extension seam; JWT+refresh; built-in ProblemDetails interim pending 003).
- Verify: both docs updated; `docs/AUTH.md` names the exact extension method and file (`AuthenticationExtensions.cs`).
- Status: [ ]

## Task 23: Backend tests — authorization + user CRUD + me + change-password
- Files: `backend/tests/Evo.Tests/Auth/UsersEndpointTests.cs`, `backend/tests/Evo.Tests/Auth/MeAndPasswordTests.cs`
- Do: Field agent token → any `/users` call returns 403; Supervisor creates a Supervisor (201) then GET lists it; deactivate → user cannot log in; `GET /me` returns correct roles; change-password with correct current succeeds and with wrong current fails (ProblemDetails).
- Verify: `dotnet test backend/Evo.sln` → all these pass.
- Status: [ ]

## Task 24: Regenerate contract + update API docs
- Files: `contracts/openapi.json`, `docs/API.md`
- Do: rebuild so Swashbuckle emits auth + users endpoints into `contracts/openapi.json`; add an `Auth` row and `Users` row to the endpoint inventory in `docs/API.md`; update the Conventions line to record JWT bearer + rotating refresh cookie as the decided scheme (spec 002).
- Verify: `contracts/openapi.json` contains `/api/v1/auth/login` and `/api/v1/users`; `docs/API.md` lists them.
- Status: [ ]

**PHASE 3 CHECKPOINT — HARD STOP (rule 3d): summarize + evidence (test output, regenerated contract diff), commit `feat(002): user management + entra seam + docs`, numbered questions, then say 'CHECKPOINT — waiting for your go' and END TURN.**

## Phase 4 — Panel auth integration

## Task 25: Regenerate the TS client
- Files: `panel/src/api/generated/` (generated)
- Do: with `contracts/openapi.json` updated, run `npm run generate-api-client` from `panel/`.
- Verify: generated types include the auth + users operations (grep the generated folder for `auth/login`).
- Status: [ ]

## Task 26: Auth context/provider
- Files: `panel/src/auth/AuthContext.tsx`
- Do: React context holding `accessToken` (in memory only — never localStorage) + `user`; expose `login(email, pw)`, `logout()`, `refresh()`, `isAuthenticated`. On mount attempt a silent `refresh()` to restore session from the httpOnly cookie.
- Verify: `npm run build` (panel) type-checks; imported without error.
- Status: [ ]

## Task 27: Client wrapper — bearer header + credentials + 401 interceptor
- Files: `panel/src/api/client.ts`
- Do: extend the spec-001 fetch wrapper to attach `Authorization: Bearer <accessToken>` from the auth store and send `credentials: 'include'` (so the refresh cookie flows). On a 401, attempt one silent `POST /api/v1/auth/refresh`; on success retry the original request; on failure clear auth state and redirect to `/login`.
- Verify: `npm run build` type-checks (behavior covered by Task 31).
- Status: [ ]

## Task 28: Login page
- Files: `panel/src/pages/Login.tsx`
- Do: email + password form with Turkish labels (e.g. "E-posta", "Parola", "Giriş yap"); calls `login()`; shows an inline error on 401; redirects to the app root on success.
- Verify: `npm run dev`, open `/login`, form renders; wrong credentials show an error (against a running backend).
- Status: [ ]

## Task 29: Protected-route wrapper + routing
- Files: `panel/src/auth/ProtectedRoute.tsx`, `panel/src/App.tsx` (or router file)
- Do: `ProtectedRoute` renders children only when `isAuthenticated`, else `<Navigate to="/login" />`; wire the router so the existing health/status page sits behind it and `/login` is public. Wrap the app in `AuthProvider`.
- Verify: `npm run dev` — visiting the app root while logged out redirects to `/login`.
- Status: [ ]

## Task 30: Logout control
- Files: `panel/src/App.tsx` (or a header component)
- Do: a "Çıkış" (logout) button that calls `logout()` (POST /auth/logout + clear in-memory token) and redirects to `/login`.
- Verify: `npm run dev` — after login, clicking logout returns to `/login` and a reload stays logged out.
- Status: [ ]

## Task 31: Vitest — auth context + 401 interceptor
- Files: `panel/src/auth/AuthContext.test.tsx`, `panel/src/api/client.test.ts`
- Do: test `login` stores the token in memory and `logout` clears it; test the client interceptor — a 401 triggers one refresh then retry (mocked fetch: 401 → refresh 200 → retry 200), and a failed refresh clears auth + triggers redirect.
- Verify: `npm test` (panel) → these pass.
- Status: [ ]

## Task 32: Playwright — login smoke
- Files: `panel/e2e/auth.spec.ts`
- Do: with backend + seeded admin running, navigate to `/login`, log in with the seeded Supervisor, assert the protected page renders; save a screenshot to `e2e/artifacts/` (visual-verification habit).
- Verify: `npx playwright test auth.spec.ts` → passing; screenshot exists.
- Status: [ ]

## Task 33: Update CLAUDE.md commands + docs
- Files: `CLAUDE.md` (Commands section), `docs/AUTH.md`
- Do: add the seed-admin env vars + login/run commands and a 1-line "how to log in locally" note; confirm `docs/AUTH.md` panel section (context/provider, protected route, 401 interceptor) matches what was built.
- Verify: the commands in CLAUDE.md copy-paste-run (seed admin, run backend, run panel, log in).
- Status: [ ]

**PHASE 4 CHECKPOINT — HARD STOP (rule 3d): summarize + evidence (panel tests, Playwright screenshot, manual login), give the human a 1-minute UI test script (open panel logged out → redirected to /login → log in with seeded admin → protected page → logout → reload stays logged out → console clean), commit `feat(002): panel auth integration`, then run /end-session and END TURN. Do NOT start spec 003.**
