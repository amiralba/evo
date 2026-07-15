# Auth (spec 002-auth-roles)

<!-- Owned by: main agent. Kept current by: coordinator. -->

## Token model

- **Access token:** JWT, HS256, 60-minute lifetime (`Jwt:AccessTokenMinutes`). Claims: `sub`
  (user id), `email`, `name` (display name), one `role` claim per Identity role. Held by the
  panel **in memory only** — never `localStorage` — and attached as `Authorization: Bearer
  <token>` on every API call.
- **Refresh token:** opaque random value (512 bits), 14-day lifetime (`Jwt:RefreshTokenDays`),
  rotated on every use. Sent as an `httpOnly`, `SameSite=Strict` cookie named `evo_rt`, scoped
  to path `/api/v1/auth` (so it's never sent to non-auth endpoints). `Secure` is dropped only in
  `Development` (the panel dev server talks to the API over plain `http://localhost`) — always
  `true` outside Development.
- **Server-side storage:** only the SHA-256 hash of the raw refresh token is ever persisted
  (`RefreshTokens` table, `Evo.Infrastructure.Identity.RefreshToken`). Rotation is optimistic-
  concurrency-safe (`RowVersion`/`rowversion` column) and detects **reuse**: presenting an
  already-rotated (but not yet expired) token revokes every active token for that user — the
  standard response to a leaked refresh token.

## Role model

Two ASP.NET Identity roles, seeded by `Evo.Seeder`'s `IdentitySeederModule`:

| Role | Capabilities |
|---|---|
| `Supervisor` | Full planning rights, all regions. Only role that can create other Supervisor accounts (`POST /api/v1/users`). |
| `FieldAgent` | Read-only + notes (once feature modules exist). **No account-creation API** — Field agents are seeder-only, since the mobile app is deferred (see `docs/DECISIONS.md`). |

No self-registration exists anywhere. A bootstrap Supervisor is created by the seeder
(`EVO_SEED_ADMIN_EMAIL` / `EVO_SEED_ADMIN_PASSWORD`, defaulting to `admin@evo.local` /
`Demo1234!` in the `demo` profile).

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/v1/auth/login` | anonymous | Locks out after 5 failed attempts for 5 min. |
| POST | `/api/v1/auth/refresh` | anonymous (cookie) | Rotates the refresh cookie. |
| POST | `/api/v1/auth/logout` | authenticated | Revokes the current refresh token. |
| GET | `/api/v1/auth/me` | authenticated | Current user + roles. |
| POST | `/api/v1/auth/change-password` | authenticated | Revokes **all** refresh tokens for the user on success (forces re-login everywhere). |
| POST | `/api/v1/users` | Supervisor only | Creates a Supervisor (Field agents: seeder-only, rejected here). |
| GET | `/api/v1/users`, `/api/v1/users/{id}` | Supervisor only | |
| PATCH | `/api/v1/users/{id}` | Supervisor only | Display name only. |
| POST | `/api/v1/users/{id}/activate`, `/deactivate` | Supervisor only | No delete endpoint exists — activate/deactivate only, per the no-delete domain rule. Deactivate also revokes the user's sessions. |

## Error shape (interim)

Auth failures use ASP.NET Core's built-in `Problem(...)` (→ `application/problem+json`). This
is an **interim shape** — spec 003 defines the project-wide unified error shape; when it lands,
these call sites should be updated to match rather than kept as a one-off.

## How to add AD/Entra SSO later

Blocked today on the 9 open customer-IT questions (see `docs/DECISIONS.md`) — no real
Entra/OIDC code exists. When the customer confirms they want it:

1. Add `Microsoft.Identity.Web` (NuGet).
2. In `backend/src/Evo.Api/Auth/AuthenticationExtensions.cs`, `AddEvoAuthentication`, find the
   `// EXTENSION SEAM` comment and register a second scheme there:
   ```csharp
   services.AddMicrosoftIdentityWebApi(configuration.GetSection("Entra"));
   ```
3. Add an `Entra` config section (tenant id, client id, audience) — from env/secret store, never
   committed, same as `Jwt:SigningKey`.
4. Map Entra security-group membership to `Roles.Supervisor` / `Roles.FieldAgent` — either via a
   claims transformation (`IClaimsTransformation`) after the Entra token is validated, or by
   provisioning the corresponding Identity role on first login (JIT provisioning). Decide this
   with the customer once their AD group structure for EVO is known.
5. Existing local-Identity users and JWT-issued tokens keep working unchanged — this only adds a
   second, parallel authentication scheme; nothing here needs to be ripped out.
6. Update the login page's clarifications table entry (`specs/002-auth-roles/spec.md`) and this
   file once real Entra work starts as its own follow-up spec.

## Panel implementation

- `panel/src/auth/session.ts` — framework-agnostic module holding the in-memory access token +
  current user, plus `refreshSession()` (calls `POST /auth/refresh` with `credentials: 'include'`
  so the httpOnly cookie flows). Shared by both the React context and the fetch wrapper below so
  there's exactly one source of truth for "what is the current token."
- `panel/src/auth/AuthContext.tsx` — `AuthProvider`/`useAuth()`. On mount, attempts a silent
  `refreshSession()` to restore a session from the cookie (so a page reload while logged in stays
  logged in). Exposes `login`, `logout`, `isAuthenticated`, `isLoading`, `user`.
- `panel/src/api/client.ts` — `authorizedFetch` attaches `Authorization: Bearer <token>` and
  `credentials: 'include'` to every call. On a 401, it calls `refreshSession()` once and retries
  the original request; if that refresh also fails, it clears the session and redirects to
  `/login` (`window.location.assign`).
- `panel/src/auth/ProtectedRoute.tsx` + `panel/src/App.tsx` — `/login` is public, `/` is wrapped
  in `ProtectedRoute` (redirects to `/login` when not authenticated). `panel/src/pages/Login.tsx`
  is the Turkish-labeled login form; `panel/src/pages/Dashboard.tsx` has the logout ("Çıkış")
  button.

To log in locally: seed the bootstrap Supervisor (see Commands in `CLAUDE.md`), run the backend
and panel, open the panel — it redirects to `/login` — sign in with `admin@evo.local` /
`Demo1234!`.

## Local dev signing key

`appsettings.Development.json` commits a well-known, non-sensitive JWT signing key
(`JwtSettings.WellKnownDevSigningKey` in `backend/src/Evo.Api/Auth/JwtSettings.cs`) so a fresh
clone runs with zero setup. `Program.cs` refuses to start with this exact value outside the
`Development` environment, and also refuses to start with any signing key under 256 bits — so
it can never accidentally become the production key.
