# Project Handbook (CLAUDE.md)

<!-- Read by every agent in every session. Keep short, current, and true. -->

## Project

- **Name:** EVO — Merchandising Route Planning Tool
- **One-line description:** Web tool for planners/supervisors to design, adjust, and monitor field merchandiser routes (stores, visit frequencies, in-store tasks, schedules) on a single-page workspace; field agents consume the plan on mobile.
- **Status:** planning → pre-build (design + v0.5 prototype done; no production code yet)
- **Scale target:** ~1,000 supervisors (web), ~5,000 field agents (Android), ~75k visit records/day. Turkish market (Turkish domain vocabulary, KVKK compliance). Single strong VM — NO microservices, NO Kubernetes.

## Source-of-truth documents (read before designing anything)

- `EVO-Route-Planning-Design.md` — THE system design: concept model (Route/Assignment/Tasks), entities, scheduling engine, state machines, DB schema, UI/UX, workflows, decisions log. Route-planning module only.
- `EVO-Design-Brief-for-Review.md` — original problem statement and requirements.
- `evo-planner-prototype-v0.5.html` — working UI prototype; the interaction model to match.
- `v0.5-change-list.md` — triaged brainstorm results (built / deferred / rejected).
- `EVO-Teknoloji-Yigini.pdf` — tech stack decision + 9 open questions for customer IT.

## Stack (decided — see EVO-Teknoloji-Yigini.pdf, Rev. 2)

- Backend: .NET 8 — ASP.NET Core Web API + EF Core
- Database: SQL Server
- API contract: OpenAPI (Swashbuckle/NSwag); TypeScript clients GENERATED from the contract — clients never hand-write API types
- Web panel: React + TypeScript (heavy drag-drop calendar/map UI)
- Mobile (field agents): **DEFERRED — out of current scope.** Field-agent behavior (check-ins, visit outcomes, task results) is simulated: seed data writes realistic values directly to the DB; any agent-facing API is mocked when the panel needs it. (Planned stack when revived: React Native/Expo, WatermelonDB, FCM.)
- Test data: `Evo.Seeder` console app (Bogus) writes realistic fake data DIRECTLY to the DB — Turkish store names/provinces, routes, merchandisers, visits with outcomes. **Every spec that adds tables must extend the seeder in the same spec.**
- Photo storage: MinIO (S3-compatible) on own server
- Travel time: OSRM + OSM Turkey data (self-hosted, free)
- Identity/AuthZ: ASP.NET Identity + AD/Entra SSO option; two roles only — Supervisor (full, all regions), Field agent (read-only + notes)
- Deployment: Docker (Linux) or customer IIS/Windows — keep both working

## Rules (all agents must follow)

1. **Read before writing.** Check `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, and the relevant section of `EVO-Route-Planning-Design.md` before designing or implementing anything.
2. **Stay in scope.** Work only on the current feature/task. Do not refactor unrelated code.
3. **Proportional process.** Small tasks (bug fixes, tweaks, under ~30 min, no API/DB/architecture change) are done DIRECTLY — implement, verify, go. The full pipeline (brainstorm → spec → plan → review) only for features/modules, triggered via `/brainstorm`, `/plan`, `/review`. When unsure, ask.
3b. **Evidence over claims.** Follow the `verification` skill: nothing is "done" without run proof in this session.
3c. **Cross-cutting concerns are platform specs.** Auth/roles, error shape, audit logging (RouteChangeLog), the OpenAPI contract pipeline, and offline sync framework are platform specs (`specs/00X-...`) built BEFORE feature modules; module specs reference them.
3d. **Checkpoints — HARD STOPS.** Claude Code runs in danger mode (no permission prompts), so these are the ONLY brakes. Mark tasks `[x]` in `specs/NNN-slug/tasks.md` as verified — not batched. At each phase end (or ~10 tasks) you MUST end your turn with the checkpoint protocol:
   1. Summarize what was built + show verification evidence
   2. Commit
   3. If anything UI changed: give the human a 1-minute manual test script (exact clicks + what it should look like) and ask them to run it
   4. Ask any open questions (numbered)
   5. Say "CHECKPOINT — waiting for your go/feedback" and END THE TURN. Never start the next phase in the same response, even if everything passed. At the final phase of a spec, run /end-session instead.
4. **Tests required.** Backend: xUnit; every endpoint and the scheduling engine get tests (baseline ⊕ patch resolution, 450-min rule, task-rule arithmetic are test-critical). Frontend: Vitest + Playwright for planner flows.
5. **Log decisions.** Significant choices → `docs/DECISIONS.md`. The design doc §10 already has a decisions log — never contradict it silently; flag conflicts.
6. **Update docs with code.** API/DB/architecture changes update the matching doc in the same session.
7. **Small context.** Open only relevant files. Delegate exploration to the explorer subagent. Read design-doc SECTIONS, not the whole 763-line file.
8. **Main agent implements.** Subagents research/plan/test/debug/review and report back; they never write feature code. Explore → Plan (report before executing) → Execute → Validate.

## Domain rules the code must respect (from the design)

- **Baseline + Patch, never mutate:** temporary changes are Patches with mandatory expiry; effective schedule = baseline ⊕ active patches; auto-revert on expiry.
- **Never block, always justify:** validation errors don't hard-block publishing — overriding requires a recorded reason + who decided. The system narrows/ranks/previews; the HUMAN decides.
- **One active route per store** — DB-enforced.
- **No delete:** routes and stores only activate/deactivate; history stays attached to `route_code`.
- **Visit duration = sum of task durations** resolved by Rules (store format 1–6: Jet·M·MM·3M·4M·5M), never hand-typed.
- **Geography is a constraint:** pickers physically cannot show out-of-scope stores.
- Domain vocabulary is Turkish (yama=patch, havuz=pool, Onarım=repair workbench) — keep code identifiers English, UI strings Turkish (i18n-ready).

## Conventions

- Code style: C# — .NET defaults + `dotnet format`; TypeScript strict — eslint + prettier
- Commits: conventional commits referencing spec slug (e.g. `feat(002): patch expiry job`)
- Error handling: shared ProblemDetails-based error shape across the whole API (define in platform spec, document in docs/API.md)
- API: contract-first — OpenAPI is the source of truth; regenerate TS clients on change
- Never commit: secrets, connection strings, `appsettings.*.local.json`, `node_modules/`, `bin/`, `obj/`

## Commands

```bash
# Dev dependencies (SQL Server + MinIO)
cp .env.example .env                                       # first time only
docker compose -f docker-compose.dev.yml up -d

# backend/ (.NET 10 — see docs/DECISIONS.md for the .NET 8→10 deviation)
dotnet run --project backend/src/Evo.Api                   # http://localhost:5076
dotnet build backend/Evo.sln                                # also regenerates contracts/openapi.json
dotnet test backend/Evo.sln
dotnet ef migrations add <Name> --project backend/src/Evo.Infrastructure --startup-project backend/src/Evo.Api
dotnet run --project backend/src/Evo.Seeder -- --profile demo   # or: --profile scale --wipe
# seeds the bootstrap Supervisor: admin@evo.local / Demo1234!
# (override via EVO_SEED_ADMIN_EMAIL / EVO_SEED_ADMIN_PASSWORD)

# panel/ (Vite + React + TS strict)
cd panel && npm install
npm run dev                     # http://localhost:5173, proxies /api → backend :5076
npm run lint
npm test                        # Vitest
npx playwright test             # e2e smoke
npm run generate-api-client     # regenerate typed client from contracts/openapi.json
npm run build
```

**Log in locally:** with backend + SQL Server + a seeded Supervisor running, open the panel —
it redirects to `/login`; sign in with `admin@evo.local` / `Demo1234!` (see docs/AUTH.md).

## Current focus

<!-- Coordinator keeps this updated after every session -->
- Milestone: M0 — Platform foundation is COMPLETE (4 platform specs). M1 — the first feature module,
  005-route-planning-core (backend), is now COMPLETE: all 7 phases, 48/48 tasks checked off and committed
  to main.
- Active feature: none in progress — next step is the PLANNER UI spec (map/schedule grid/table workspace,
  lasso multi-select, live health card, drag-drop stop editing) built against 005's generated TS client.
  Not started; needs a `/plan` pass to produce its own `specs/00X-.../tasks.md`. `POST /simulate/route`
  is deferred into that spec.
- Last session summary: Built the full 005-route-planning-core spec (first M1 feature module) across 7
  committed phases. Phase 1: `Merchandiser`/`Route`/`RouteStop` entities + one-active-route-per-store DB
  constraint. Phase 2: `Assignment`/`Patch`/`PlannedVisit`/`DecisionJournalEntry`/`Setting` entities +
  one-active-assignment (both directions) constraints + 8 seeded global settings. Phase 3: a pure,
  EF-free scheduling engine in `Evo.Domain/Scheduling` — `FrequencyExpander`, `DayScheduler` (450-min
  rule, break avoidance), `PatchResolver` (baseline ⊕ patches, SKIP>TIME_SHIFT>ADD>REASSIGN priority).
  Phase 4: `RouteValidator` (V3/V5/V6/V7), `OverlapValidator` (V12), `IRouteChangeLog` facade over
  spec 003's `audit_log`. Phase 5: `SettingsProvider`, `PlanGenerationService` (orchestrates the engine
  into `planned_visit` upserts), nightly `PlanHorizonBackgroundService` (patch-expiry + horizon regen).
  Phase 6: full `RoutesController` (create/list/get/patch/stops-bulk/stops-move/assignment/patches/plan/
  health/validate/publish) + `MerchandisersController`, plus a same-session IDOR fix giving
  `GET /merchandisers/{id}/day` proper self-or-Supervisor authorization. Phase 7: seeder extended with
  `MerchandiserSeederModule`/`RouteSeederModule` (routes materialize through the real engine, not direct
  inserts), contract/TS client regenerated, docs updated, full suite verified at 74/74 (28 prior + 46
  new). Also corrected a prior doc error: `merchandiser` was wrongly attributed to 002-auth-roles in
  docs/DATABASE.md — fixed to 005. Explicitly deferred out of 005 (not "todo" under this spec, but future
  scope): the planner UI itself, `POST /simulate/route`, the M2 task/rule engine, OSRM/travel-time,
  leave/Onarım (M4).
