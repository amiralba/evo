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
- Milestone: M0 — Platform foundation is COMPLETE (4 platform specs). M1 — Route planning core (web
  panel) is COMPLETE (005/006/007). M2 — Tasks & rules is now also COMPLETE: 008-tasks-rules
  (59/59 tasks, 7 phases) is fully checked off and committed to main. Backend suite 131/131, panel
  suite 44/44, Playwright 4/4.
- Active feature: none in progress. Next milestone is M3 — Field execution simulation (seeder-generated
  visit outcomes: done/missed/skipped + reasons, GPS check-in times, task results; mocked agent-facing
  responses where the panel needs them) per `docs/ROADMAP.md` — needs its own `/brainstorm` or `/plan`
  pass to produce `specs/00X-.../tasks.md`, same kickoff pattern as M2.
- Deferred so far, not silently dropped (see docs/DECISIONS.md for rationale/dates): Conflict Center/
  Sorun Merkezi, `POST /simulate/route`, history timeline, live-location layer, Onarım workbench,
  full-canvas 6-tab table, Effective/Base toggle, global search, admin (Yönetim)/inbox pages,
  multi-route/multi-person stacked schedule rows, module-stack editor (`SET_FREQUENCY`/`SET_MODULES`/
  `PATCH_MODULE`), standalone Yönetim admin pages for task-template/rule CRUD.
- Last session summary: Completed 008-tasks-rules (M2). Domain: pure `TaskResolver`/`RuleMatcher` in
  `Evo.Domain/Tasks/` (membership + minutes ladder + instance override, store>route>format>chain>global
  specificity). Persistence: `TaskTemplate`/`Rule`/`TaskInstance` entities + `AddTasksRules` migration.
  `PlanGenerationService` now sets visit duration = Σ resolved task minutes (replacing the flat
  `service_minutes` fallback as primary path) and materializes `TaskInstance` rows per future visit;
  format-change re-resolution confirmed. API: 6 endpoints — `GET /task-templates`, `GET
  /stores/{id}/task-plan`, `GET|POST /rules`, `GET /rules/impact`, `PATCH /task-instances/{id}`,
  `POST /tasks/adhoc`. Seeder: `TaskRuleSeederModule` (6 templates, 8 rules, 1 adhoc survey), ran
  end-to-end. Panel: `TasksTab` (Görevler tab, replaces M2-pending empty state) + `TaskScopeModal`
  (scope edit with impact preview) + Rule Inspector trace popover. Docs (DATABASE/API/ARCHITECTURE/
  DECISIONS/ROADMAP) updated in-session.
