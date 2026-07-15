# Tasks: Solution Scaffold (001-solution-scaffold)

<!-- Each task ≈ 2–5 min, zero-context executable. Verify before checking off (rule 3d).
     STOP at each phase end: summarize, commit, wait for human. -->

## Phase 1 — Backend skeleton

## Task 1: Create solution and projects
- Files: `backend/Evo.sln`, `backend/src/Evo.Api/`, `backend/src/Evo.Domain/`, `backend/src/Evo.Infrastructure/`, `backend/tests/Evo.Tests/`
- Do: `dotnet new sln` + webapi (Api), classlib (Domain, Infrastructure), xunit (Tests); add all to sln; Api → Infrastructure → Domain references; Tests references Api.
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [ ]

## Task 2: Root gitignore + editorconfig
- Files: `.gitignore`, `.editorconfig`
- Do: .NET + node ignores (bin/ obj/ node_modules/ dist/ appsettings.*.local.json .env); .editorconfig with dotnet defaults + 2-space TS.
- Verify: `git status` shows no bin/obj noise after build.
- Status: [ ]

## Task 3: Health endpoint
- Files: `backend/src/Evo.Api/Program.cs`, `backend/src/Evo.Api/Controllers/HealthController.cs`
- Do: minimal API bootstrap with controllers; `GET /api/v1/health` returns `{ status: "ok", version }`.
- Verify: `dotnet run --project backend/src/Evo.Api` then `curl localhost:<port>/api/v1/health` → 200 JSON.
- Status: [ ]

## Task 4: First xUnit test
- Files: `backend/tests/Evo.Tests/HealthTests.cs`
- Do: WebApplicationFactory integration test: GET /api/v1/health → 200 + status ok.
- Verify: `dotnet test backend/Evo.sln` → 1 passing.
- Status: [ ]

## Task 5: EF Core + SQL Server wiring
- Files: `backend/src/Evo.Infrastructure/EvoDbContext.cs`, `backend/src/Evo.Api/appsettings.Development.json`, `backend/src/Evo.Api/Program.cs`
- Do: add EF Core SqlServer packages; empty EvoDbContext registered with connection string `EvoDb`; no entities yet.
- Verify: `dotnet build` succeeds; app starts without DB present (context registered lazily).
- Status: [ ]

## Task 6: docker-compose for dev dependencies
- Files: `docker-compose.dev.yml`
- Do: services — SQL Server (mcr.microsoft.com/mssql/server, SA password via .env.example) and MinIO; volumes; ports documented in comments.
- Verify: `docker compose -f docker-compose.dev.yml up -d` → both containers healthy; `dotnet ef dbcontext info` connects (after `docker compose` up).
- Status: [ ]

## Task 7: OpenAPI generation at build
- Files: `backend/src/Evo.Api/Program.cs`, `backend/src/Evo.Api/Evo.Api.csproj`
- Do: add Swashbuckle; serve swagger JSON in Development; add build step (or `dotnet swagger tofile`) emitting `contracts/openapi.json`. Log Swashbuckle-vs-NSwag choice in docs/DECISIONS.md.
- Verify: `contracts/openapi.json` exists after build and contains /api/v1/health.
- Status: [ ]

**PHASE 1 CHECKPOINT — STOP: summarize, commit `feat(001): backend skeleton`, wait for human.**

## Phase 2 — Contract pipeline + panel

## Task 8: Panel scaffold
- Files: `panel/` (Vite react-ts template), `panel/.eslintrc*`, `panel/.prettierrc`
- Do: `npm create vite@latest panel -- --template react-ts`; TS strict; eslint+prettier configured.
- Verify: `cd panel && npm run dev` serves; `npm run lint` passes.
- Status: [ ]

## Task 9: Client generation script
- Files: `panel/package.json`, `contracts/README.md`
- Do: add `openapi-typescript` (or NSwag TS) as devDep; script `generate-api-client` reading `contracts/openapi.json` → `panel/src/api/generated/`; mark folder generated (README + eslint-ignore).
- Verify: `npm run generate-api-client` produces typed client containing health endpoint types.
- Status: [ ]

## Task 10: Panel consumes health via generated client
- Files: `panel/src/api/client.ts`, `panel/src/App.tsx`, `panel/vite.config.ts` (proxy)
- Do: thin fetch wrapper using generated types; App shows backend status badge; dev proxy `/api` → backend port.
- Verify: with backend running, `npm run dev` page shows "ok" from live endpoint.
- Status: [ ]

## Task 11: Vitest + first test
- Files: `panel/src/api/client.test.ts`, `panel/package.json`
- Do: Vitest setup; test the client wrapper (mocked fetch: success + non-200 path).
- Verify: `npm test` → passing.
- Status: [ ]

## Task 12: Playwright + smoke test
- Files: `panel/playwright.config.ts`, `panel/e2e/smoke.spec.ts`
- Do: install Playwright (chromium only); smoke test: page loads, status badge visible; screenshot saved to `e2e/artifacts/` (visual-verification baseline habit — design-system skill).
- Verify: `npx playwright test` → passing, screenshot exists.
- Status: [ ]

**PHASE 2 CHECKPOINT — STOP: summarize, commit `feat(001): panel + contract pipeline`, wait for human.**

## Phase 3 — Tokens, CI, docs

## Task 13: Extract design tokens from prototype
- Files: `panel/src/theme/tokens.ts` (or tokens.css)
- Do: read `evo-planner-prototype-v0.5.html` styles; extract used colors (incl. category/chain/severity colors 🟢🔵🟠🔴🟡), spacing scale, font sizes into named tokens with comments mapping to prototype usage.
- Verify: tokens file compiles; spot-check 5 values against prototype CSS (list them in the commit message).
- Status: [ ]

## Task 14 [P]: CI workflow
- Files: `.github/workflows/ci.yml`
- Do: on push/PR — backend build+test; panel lint+test+build; client-generation drift check (regenerate, fail if git diff).
- Verify: `act` run or push → green pipeline (drift check catches a deliberate local change, then revert).
- Status: [ ]

## Task 15 [P]: Root README
- Files: `README.md`
- Do: prerequisites, run backend/panel/compose, test commands, client regeneration, repo layout, links to CLAUDE.md + docs/.
- Verify: follow it top-to-bottom on a clean checkout mentally; every command exists.
- Status: [ ]

## Task 16: Update docs + CLAUDE.md commands
- Files: `CLAUDE.md` (Commands section), `docs/ARCHITECTURE.md` (folder structure), `docs/DECISIONS.md`
- Do: fill real commands; confirm folder structure; log tooling decisions made (Swashbuckle/NSwag, openapi-typescript, monorepo).
- Verify: commands in CLAUDE.md copy-paste-run successfully.
- Status: [ ]

## Task 17: mobile/ placeholder
- Files: `mobile/README.md`
- Do: one paragraph: scaffolded in M3; stack = React Native (Expo) Android, WatermelonDB offline sync.
- Verify: file exists; nothing else in mobile/.
- Status: [ ]

**PHASE 3 CHECKPOINT — STOP: summarize, commit `feat(001): tokens, CI, docs`, run /end-session.**
