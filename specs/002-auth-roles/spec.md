# Spec: Auth & Roles   (slug: 002-auth-roles)

## Problem & goal
EVO has exactly two roles — **Supervisor** (full planning rights, all regions) and **Field agent**
(read-only + notes). Before any feature module can gate an endpoint or a screen, the platform needs
authentication, role authorization, and a minimal user-management surface. This spec delivers local
ASP.NET Identity auth on the .NET backend and the panel-side plumbing to log in, stay logged in, and
get bounced to a login page on 401 — with a clean, documented seam for AD/Entra SSO later (no OIDC
code now, because that is blocked on the 9 open customer-IT questions).

Success = a seeded Supervisor can log into the panel, the access token is attached to generated-client
calls, a 401 triggers a silent refresh (then redirect if that fails), a Field agent is forbidden from
Supervisor-only endpoints, and a Supervisor can create/deactivate other Supervisor accounts via API.

## Brainstorm results
- **Chosen approach:** JWT bearer + refresh. Access token held in panel memory; refresh token in an
  httpOnly, Secure, SameSite=Strict cookie scoped to `/api/v1/auth`; refresh rotation with server-side
  revocation (RefreshToken table). Local ASP.NET Identity is the identity store; roles are Identity
  Roles (`Supervisor`, `FieldAgent`). Bootstrap admin + Field agents created by the seeder; new
  Supervisors created via supervisor-only `POST /users`. (Rejected: cookie-only session auth — panel
  is an SPA behind a generated typed client and we want bearer semantics reusable by mobile later;
  rejected: third-party IdP / IdentityServer — overkill for 2 roles on a single VM; rejected:
  self-registration — closed user base, admins provision accounts.)
- **Later (out of v1 scope):** real AD/Entra OIDC wiring (extension seam + docs only now); email-based
  password reset; user-admin screens in the panel; per-region permission scoping (design: all
  supervisors see all regions — no scoping by design); MFA.

## User stories
- As a Supervisor, I can log in with email + password and stay logged in across page reloads without
  re-entering credentials, so I can work without friction.
- As a Supervisor, I can create another Supervisor account and deactivate a departed one, so access
  stays current without a developer.
- As any user, when my session expires the panel silently refreshes; if that fails I am sent to the
  login page, so I never see a broken authenticated screen.
- As a Field agent, I am forbidden from Supervisor-only endpoints, so the read-only boundary holds.
- As the developer, I can wire AD/Entra later by following a documented extension seam without
  rewriting the auth stack.

## Acceptance criteria (testable)
- [ ] Backend: ASP.NET Identity wired on `EvoDbContext` (now an `IdentityDbContext`) with `Guid` keys;
      roles `Supervisor` and `FieldAgent` seeded; migration `AddIdentity` creates AspNet* tables +
      `RefreshTokens`.
- [ ] Password policy: min 8 chars, requires digit + uppercase; lockout after 5 failed attempts for
      5 minutes (verified by a test that trips the lockout).
- [ ] `POST /api/v1/auth/login` returns a 60-minute access token + user info and sets an httpOnly
      refresh cookie; wrong password returns 401 ProblemDetails; inactive user cannot log in.
- [ ] `POST /api/v1/auth/refresh` rotates the refresh token (old one revoked, new cookie set) and
      returns a fresh access token; a rotated/old token is rejected.
- [ ] `POST /api/v1/auth/logout` revokes the refresh token and clears the cookie; a refresh after
      logout returns 401.
- [ ] `GET /api/v1/auth/me` (authorized) returns id, email, displayName, roles; unauthenticated → 401.
- [ ] `POST /api/v1/auth/change-password` enforces the password policy and validates the current
      password; no email-reset endpoint exists.
- [ ] Supervisor-only user CRUD: `POST /users` (creates Supervisors only — Field agents are
      seeder-only), `GET /users`, `GET /users/{id}`, `PATCH /users/{id}`, `POST /users/{id}/activate`,
      `POST /users/{id}/deactivate`; **no delete**. A Field agent calling any of these gets 403.
- [ ] A clearly-commented `AddEvoAuthentication` extension seam exists for adding Entra/OIDC later,
      with zero real OIDC/Entra code; the plug-in steps are documented.
- [ ] Auth errors use ASP.NET Core built-in ProblemDetails (interim shape; unified in spec 003 —
      flagged as a cross-spec dependency).
- [ ] `contracts/openapi.json` regenerated to include the auth + users endpoints; TS client regenerated.
- [ ] Panel: a login page, an auth context/provider (access token in memory), a protected-route
      wrapper, a logout control, and a 401→silent-refresh→redirect interceptor in the generated-client
      wrapper. Vitest covers the context + interceptor; a Playwright smoke logs in with the seeded admin.
- [ ] No panel user-admin screens (out of scope); no self-registration path anywhere.

## Clarifications
<!-- Answers provided by the human before planning (bundle accepted as recommended defaults). -->
| # | Question | Answer |
|---|---|---|
| 1 | Token type? | JWT bearer + refresh. Access token in memory; refresh token in httpOnly cookie. |
| 2 | AD/Entra scope now? | Extension point + docs only. Local ASP.NET Identity is the must-have; clean auth-scheme abstraction, zero real Entra/OIDC code (blocked on the 9 open customer-IT questions). |
| 3 | Field agent accounts? | Seeder-only — no API path to create Field agents. |
| 4 | Bootstrap / provisioning? | Seeder creates a bootstrap admin (a Supervisor) + roles; new Supervisors via supervisor-only `POST /users`. |
| 5 | Self-registration? | None — closed user base. |
| 6 | Where do roles live? | ASP.NET Identity Roles table; two roles `Supervisor` / `FieldAgent`. |
| 7 | Password policy? | Identity defaults bumped to min 8 chars, require digit + uppercase; lockout after 5 failed attempts / 5 min. |
| 8 | Token lifetimes? | Access 60 min; refresh 14 days with rotation. |
| 9 | Password reset? | Change-password endpoint only (authenticated); no email reset in v1. |
| 10 | Error shape for auth? | Built-in ASP.NET Core ProblemDetails now; unified in spec 003 (cross-spec dependency flagged). |
| 11 | Endpoint list? | login / refresh / logout / me / change-password + supervisor-only users CRUD with activate/deactivate, no delete. |
| 12 | Panel scope? | Login page + auth context/provider + protected-route wrapper + logout + 401→redirect interceptor in the generated-client wrapper. |
| 13 | Panel user-admin screens? | Not yet — API only. |

## Non-goals
- No AD/Entra/OIDC implementation (seam + docs only); no MFA; no external IdP.
- No email/SMS password reset; no self-registration; no account-recovery flows.
- No Field-agent creation API (seeder-only); no per-region permission scoping (by design, all
  supervisors see all regions).
- No panel user-management screens; no hard delete of users (activate/deactivate only).
- Does NOT define the project-wide unified error shape (spec 003) — uses built-in ProblemDetails in
  the interim.

## Open questions
- Customer-IT answers (the 9 open questions) may replace local Identity with AD/Entra as the primary
  identity source and change SQL Server version / SSO details — the extension seam is designed to
  absorb this, but token lifetimes and cookie policy may need revisiting once known.
- Whether change-password should force-revoke all existing refresh tokens for the user (planned: yes)
  — confirm during review.
