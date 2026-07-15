# Spec: Solution Scaffold   (slug: 001-solution-scaffold)

## Problem & goal
No production code exists. Create the repo skeleton every later spec builds on: .NET solution, React panel, contract-generation pipeline, test harnesses, CI, and the design-token extraction from the prototype. Success = a developer (or agent) can run backend + panel locally, tests pass, and changing an API endpoint regenerates the TS client.

## User stories
- As the developer, I can run `dotnet run` and `npm run dev` and see a health endpoint consumed by the panel through the GENERATED client.
- As the developer, I can run backend and panel test suites with one command each.
- As a future spec, I can add an endpoint and get a typed TS client function without writing types by hand.

## Acceptance criteria (testable)
- [ ] `backend/`: .NET 8 solution — Api / Domain / Infrastructure / Tests projects; EF Core wired to SQL Server (LocalDB or container for dev); one `GET /api/v1/health` endpoint; 1+ passing xUnit test
- [ ] OpenAPI doc generated at build (Swashbuckle or NSwag — decide, log in DECISIONS.md)
- [ ] `panel/`: Vite + React + TS strict; eslint + prettier; Vitest running; Playwright installed with 1 smoke test; calls `/health` via the generated client
- [ ] `contracts/`: `npm run generate-api-client` regenerates the TS client from the OpenAPI doc; generated code gitignored or clearly marked, never hand-edited
- [ ] Design tokens extracted from `evo-planner-prototype-v0.5.html` CSS into `panel/src/theme/` (colors, spacing, typography)
- [ ] `docker-compose.dev.yml`: SQL Server + MinIO for local dev
- [ ] CI (GitHub Actions or equivalent): build + test both sides on push
- [ ] Root README: how to run everything
- [ ] `Evo.Seeder` console project scaffolded: Bogus wired, `--profile demo|scale` + `--wipe` args, `SeederModule` plug-in interface for future specs (no entities to seed yet)

## Clarifications
| # | Question | Answer |
|---|---|---|
| 1 | SQL Server version? | OPEN (customer IT q#5) — use latest LTS container for dev; keep EF Core provider-agnostic where free |
| 2 | CI system? | OPEN — assume GitHub Actions; swap later if customer requires |
| 3 | Monorepo? | Yes — backend/ panel/ mobile/ contracts/ in one repo (solo dev, atomic contract changes) |

## Non-goals
- No auth (spec 002), no error shape (spec 003), no domain entities beyond health check
- NO mobile app (deferred indefinitely — field behavior seeded/mocked); no OSRM/FCM/MinIO integration code (compose service only)

## Open questions
- Customer IT answers may change: deployment target (Docker vs IIS), SQL Server version, .NET internal standards
