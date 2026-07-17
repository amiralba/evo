# E2E tests

Prerequisites (all must be running before `npx playwright test`):

1. Dev dependencies: `docker compose -f ../docker-compose.dev.yml up -d` (SQL Server + MinIO)
2. Backend: `dotnet run --project ../backend/src/Evo.Api` (http://localhost:5076)
3. Seeded data: `dotnet run --project ../backend/src/Evo.Seeder -- --profile demo` (creates the
   bootstrap Supervisor `admin@evo.local` / `Demo1234!` plus demo routes/stores)

`npx playwright test` starts the panel dev server itself (see `webServer` in `playwright.config.ts`,
proxying `/api` to :5076) — you don't need to run `npm run dev` separately.

`planner-core.spec.ts` runs against the live seeded backend (not mocked) and exercises the core
planner flow: login → open workspace → filter to a route → bulk-add a pool store via the checkbox/list
multi-select (not the map lasso — see spec Clarification #10) → confirm the health card updates →
publish (tolerant of both the clean and override-with-reason paths).
