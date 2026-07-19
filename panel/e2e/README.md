# E2E tests

Prerequisites (all must be running before `npx playwright test`):

1. Dev dependencies: `docker compose -f ../docker-compose.dev.yml up -d` (SQL Server + MinIO)
2. Backend: `dotnet run --project ../backend/src/Evo.Api` (http://localhost:5076)
3. Seeded data: `dotnet run --project ../backend/src/Evo.Seeder -- --profile demo` (creates the
   bootstrap Supervisor `admin@evo.local` / `Demo1234!` plus stores, merchandisers and task
   templates/rules — routes are NOT seeded; specs that need routes must create them via the panel/API)

`npx playwright test` starts the panel dev server itself (see `webServer` in `playwright.config.ts`,
proxying `/api` to :5076) — you don't need to run `npm run dev` separately.

The suite runs SERIALLY on purpose (`workers: 1`): every spec drives the same live dev backend/DB.
All specs target the hosted v0.5 prototype's DOM (stable ids: `#railList`, `#publishBtn`,
`#inboxBtn`, …) — see `helpers.ts` for the login/boot/publish primitives. Boot-gate rule: never
interact before `.evo-proto-root` reaches `opacity: 1` — the engine paints MOCK data first and
the host only reveals it after the real backend load (`openPlanner` handles this).

- `smoke` / `auth` — unauthenticated redirect; seeded-Supervisor login.
- `planner-core` — the core loop, end-to-end real: Yeni rut draft → pool-pick a store → assign a
  person → Aktifleştir → Yayınla (publishBridge writes createRoute/bulkAddStops/reassign/publish)
  → assert the route survives the backend round-trip; then deactivates it (store returns to the
  pool) and publishes again, so the suite stays rerunnable on the small seeded pool.
- `tasks-tab` — Görevler tab shows backend-resolved tasks (GET /stores/{id}/task-plan) for a
  pool store focused from the rail.
- `inbox` — Saha tab renders backend notes (resolving persists via PATCH /notes/{id}); Sorunlar
  tab renders plan issues. Replaces the old `onarim`/`field-execution` specs, whose flows died
  with the prototype pivot + seeder decision D3b (outcome coloring has no data path; the Onarım
  workbench only opens from engine-mock disruptions — backend Onarım has no panel bridge yet).
