# EVO — Full Codebase Audit

**Branch:** `prototype-parity-rebuild` (HEAD `02f45d2`) · **Date:** 2026-07-19
**Scale target audited against:** 1,000 supervisors (web) + 10,000 field agents (~150k visit records/day, ~4.5M/month)
**Method:** 4 independent deep audits (dead code, database, security, code quality/scalability) run in parallel over a snapshot of the repo, followed by an adversarial verification pass that re-checked the 14 highest-impact claims against the code. **All 14 confirmed, 0 refuted** (3 minor detail corrections, folded in below).
**Companion document:** `EVO-Database-Report.md` — the dedicated DB analysis (schema, indexes, query patterns, retention, business correctness). DB findings are only summarized here.

**Limitations:** panel verified live in-session (vitest 133/133 across 32 files, npm audit clean); backend could not be built in the audit sandbox (NuGet connections were reset by the sandbox network — not a problem with your code), so backend findings are static analysis + git evidence. Nothing in this report modifies your repo.

---

## Executive summary

The refactor left behind a **large, fully-orphaned parallel implementation**: ~4,552 non-test LOC of the pre-rebuild React planner (components, zustand stores, schedule math, the whole Onarım workbench UI), 11 dead functions in the live API client, 5 npm dependencies, 4 of 6 Playwright specs, and 3 unregistered seeder modules. It all still compiles and its unit tests still pass — which means **your green test suite is largely testing UI that no longer ships**. This is the single biggest "vibe coding residue" item and it's cleanly fixable because the boundary is sharp (verified by import-graph trace from `main.tsx`).

The deeper architectural finding: the shipped planner is the **v0.5 prototype running verbatim** — a 3,230-line untyped global `engine.js` in `public/`, outside ESLint, outside TS strict, outside Vitest, with backend data interpolated into `innerHTML` without escaping (a stored-XSS prod blocker). The bridge architecture around it is clever and the decision may have been right for speed, but it is **not recorded in `docs/DECISIONS.md`** and it structurally bypasses the project's own quality rules. Deciding this component's endgame (migrate pane-by-pane vs. formally adopt + harden) is the most important decision on the table.

Security posture is otherwise **strong for this stage**: every endpoint is `[Authorize]`-gated with correct role checks, no raw SQL anywhere, refresh-token handling is genuinely well done (hashed at rest, rotation with reuse detection), secrets guards are in place, error shape is uniform ProblemDetails. The blockers are the XSS above, missing HSTS/CSP/rate-limiting, and the 60-minute JWT revocation window.

Scalability is where the stated target fails hardest — detailed in the DB report. Headlines: `/analytics/plan-health` issues **~1,600 sequential queries for a 200-route region** (~8 per route, verified by count); the planner boot fires **~44 HTTP requests per supervisor** (one `getPlan` per route, each triggering the full findings pipeline); the hottest table (`planned_visit`, ~54M rows/yr) is **missing its two most important indexes**; and the nightly horizon job cannot finish at 10k routes. Everything was validated at ~50-route demo scale; none of it survives 200× that.

**Verdict:** the domain core (scheduling engine, patch resolution, validators) is clean, pure, and well-tested. The access layer (query shapes, indexes, transactions) and the panel's prototype-hosting layer are not production-ready at the stated scale. All of it is fixable with ordinary work — a prioritized plan is at the end, sized for Claude Code sessions.

---

## A. Dead code & refactor leftovers

> Deadness below means **production-unreachable** (traced from `panel/src/main.tsx` and backend entry points). Tests keep much of it green, which is precisely the problem.

### A1. Safe to delete — HIGH confidence (verified individually)

| # | Target | Evidence |
|---|--------|----------|
| 1 | `backend/src/Evo.Domain/Class1.cs`, `backend/src/Evo.Infrastructure/Class1.cs` | Empty project-template stubs; zero references |
| 2 | `panel/src/api/planner.ts:262` `getNotifications()` | Zero callers anywhere, even on `main` |
| 3 | `panel/src/analytics/api/queries.ts:12` `useStability()` + `analytics.ts:24-30` `getStability()` | No consumer on this branch **or** `main` (backend endpoint stays — tested + in contract) |
| 4 | `panel/src/theme/tokens.ts` exports `loadStatusColors` (:59), `fontFamily` (:107), `tokens` (:109) | No importer anywhere |
| 5 | `panel/src/assets/{hero.png, react.svg, vite.svg}` | Vite-template leftovers, zero references |
| 6 | `panel/public/icons.svg` | Bluesky-logo sprite from scaffold; zero references |
| 7 | `panel/src/planner/components/map/storeLayer.ts:19` — un-export `toFeatureCollection` (internal-only) | Used only at :42 |
| 8 | `panel/src/i18n/index.ts:12` — drop unused `default` export | `main.tsx` imports for side effect only |

### A2. The dead tree — one decision, then mechanical deletion (~4,552 LOC)

Commit `c672e3b` ("host v0.5 prototype verbatim at /planner") rewired `/planner` to `PrototypeHost` + 5 bridge modules. Everything below became unreachable (only `map/storeLayer.ts` survives, imported by `prototypeMap.ts:3`):

- `panel/src/planner/components/**` — TopFilterBar, TopSearch, WorkspaceLayout, RouteRail, RailExpandedStops, Toast, editing/* (BulkAddResult, PatchForm, SelectionBar, SelectionListPane, StopEditForm), inbox/NotesInbox, map/{LassoTool, MapPane, StorePopover, lasso, useMapLibre}, panel/* (EvidenceStrip, HealthCard, HistoryTab, ReassignPersonModal, RouteDetailPanel, StopsList, StoreDetailPanel, TaskScopeModal, TasksTab), publish/PublishModal, schedule/{SchedulePane, TableDrawer, VisitBlock}, DecisionJournalModal, HelpModal, NewRouteModal
- `panel/src/planner/schedule/{breaks, dragMath, dropDecision, position, reflow, week}.ts` (only `patchPayload.ts` is live via `publishBridge.ts:2`)
- `panel/src/planner/state/{workspaceStore, toastStore}.ts`, `planner/format.ts`, `planner/planner.css` (819 lines)
- `panel/src/planner/api/{mutations, queries}.ts` — all old react-query hooks unused
- `panel/src/onarim/**` — the entire Onarım workbench UI + its api layer

**The keep-rationale is stale.** `PlannerPage.tsx:9-12` says the tree is kept "for its MapLibre map, which will be portaled … in a later step" — but the map swap already happened (commit `ef54209`, `prototypeMap.ts`), reusing only `storeLayer.ts`.

**Comes along with the tree when deleted:**
- **11 dead functions in the live client** `panel/src/api/planner.ts`: `getRoute`:55, `getHealth`:73, `validateRoute`:78, `reorderStops`:101, `moveStop`:110, `cancelPatch`:128, `getRouteAuditLog`:145, `getDecisionJournal`:150, `getStoreDetail`:190, `getRuleImpact`:212, `updateTaskInstanceScope`:227 (live set: listRoutes, getStoresGeo, getPlan, bulkAddStops, updateStop, createPatch, publishRoute, createRoute, getMerchandisers, updateRoute, reassignRoute, getStoreTaskPlan, getNotes, updateNoteStatus)
- **5 npm dependencies** used only by dead code: `@dnd-kit/core`, `@dnd-kit/sortable`, `@turf/boolean-point-in-polygon`, `@turf/helpers`, `recharts`, `zustand` — removable only together with the tree (`tsc -b` still compiles the dead files). Bonus bug: `@dnd-kit/utilities` is imported (`RailExpandedStops.tsx:3`, `StopsList.tsx:5`) but **not declared** in package.json — works only as a transitive install
- **~20 unit-test files** that test the dead components
- The `useRouteEvidence`/`getRouteEvidence` pair in `panel/src/analytics/api/` (consumer EvidenceStrip is in the dead tree)

**Recommendation:** delete the tree (git keeps history), and log the decision in `docs/DECISIONS.md` per CLAUDE.md rule 5. If you instead keep it as a migration target, fix the stale comment and declare `@dnd-kit/utilities`. Either way it's one decision — don't leave it half-stated.

### A3. Backend/seeder leftovers needing a decision

1. **Unregistered seeder modules (verified):** `Program.cs:60-67` registers only Identity, AuditLog, StoreSync, Merchandiser, TaskRule. `RouteSeederModule.cs`, `FieldExecutionSeederModule.cs`, `AbsenceSeederModule.cs` exist on disk but are never run — so **routes, visits, realizations, pings, notes, notifications, absences are never seeded** on this branch. A comment (:58-59) frames this as intentional ("routes are the planner's work product"), but it contradicts CLAUDE.md's seeder rule, `docs/DATABASE.md:150-151`, `docs/ARCHITECTURE.md:95`, and starves the Onarım/analytics features plus 4 Playwright specs of data. Also `--wipe` is a no-op (`Program.cs:51-54`). Transitively dead: `IPlanGenerationService.MaterializeHistoryAsync` (`PlanGenerationService.cs:41`) — only caller was FieldExecutionSeederModule.
2. **Onarım chain orphaned end-to-end:** backend `OnarimController`/`OnarimService`/`CandidateRanker` are tested and in the contract, but no reachable panel code calls them — the prototype's "Sorunlar" UI runs on **mock data in engine.js** (no bridge references onarim/disruption), and with the seeder modules unregistered nothing produces absences anyway. CLAUDE.md's "Current focus" still describes the Onarım workbench modal as a shipped panel feature. **Decision needed:** wire a bridge, or formally re-defer in DECISIONS.md.
3. **`POST /routes/{id}/stops/{stopId}:move`** (`RoutesController.cs:376`) — no live caller AND no test; the only endpoint violating CLAUDE.md rule 4. Add a test or deprecate.
4. **Empty breaks machinery:** `breaks.ts` `BREAK_BLOCKS = []` (dead tree), plus backend `BreakBlock`/`SettingsProvider.cs:43-61` reading the now-empty seeded `break_blocks` setting — harmless generic mechanism, LOW-priority simplify.
5. **`panel/scripts/extract-prototype.mjs`** — the generator for the prototype slices is not wired into any package.json script. If `evo-planner-prototype-v0.5.html` changes, nothing regenerates. Add `"extract-prototype": "node scripts/extract-prototype.mjs"`. (Do NOT delete — and note knip's "unused file" flag on `engine.js` is a false positive; it loads at runtime via `<script src>`.)

### A4. Intentionally deferred — keep (do not "clean")

Backend endpoints with zero panel callers that match documented deferrals, each tested + in the contract: mobile-sim endpoints (`GET /merchandisers/{id}/day`, `/location-history`, `/notifications`), deferred Yönetim admin surface (`UsersController` ×6, `GET/POST /rules`, `GET /task-templates`, `POST /tasks/adhoc`, `POST /stores/sync`, `GET /auth/me`, `POST /auth/change-password`), and 12 panel-orphaned but contract-intentional route/store/analytics endpoints (`GET /routes/{id}`, `/health`, `/validate`, patch cancel, `stops:reorder`, `GET /stores/{id}`, `/rules/impact`, `PATCH /task-instances/{id}`, `/audit-log`, `/decision-journal`, `/analytics/stability`, `/routes/{id}/evidence`). These lose their panel consumers only because of A2 — keep the backend, fold the panel side into the A2 decision.

**Verified NOT dead (no action):** all 15 DI registrations resolve; no orphaned DTOs; no commented-out blocks >5 lines; no TODO/FIXME markers; `contracts/openapi.json` in sync with controllers (49 paths, 1:1); migrations coherent.

---

## B. Architecture & code quality (backend)

1. **HIGH — God controller.** `RoutesController.cs` is 890 lines with the route state machine (:210-250), validator orchestration (:643-672, :740-762), publish-override + journal writing (:787-848) inline. The "load stops → stores → 6-month revenue → eval → validate" block is **triplicated** (GetHealth :677, Validate :714, Publish :790) and the revenue-window expression appears 5×. Onarım and Analytics got services; Routes predates the pattern. Extract a `RouteService` / eval factory.
2. **HIGH — Constants desync (user-visible correctness).**
   - `RulesController.cs:23` hardcodes `450` for V10 impact previews while everything else reads `settings.DailyWorkMinutes` — a region configured to 480 gets previews contradicting the plan view.
   - The 42-day horizon is hardcoded 7× in RoutesController (:225, :308, :341, :420, :421, :537, :560) while Publish (:832) and the nightly job use `PlanHorizonWeeks * 7` — if `plan_horizon_weeks ≠ 6`, incremental edits regenerate a different horizon than publish, silently dropping tail visits.
3. **HIGH — No `TimeProvider`; fabricated timezone data.** `DateOnly.FromDateTime(DateTime.UtcNow)` in ~20+ places; `PlannedStart` stores Istanbul wall-clock labeled `+00:00` (`PlanGenerationService.cs:158-159`). Between 00:00–03:00 Istanbul, "today" is yesterday: the regeneration clamp can rewrite the already-executed Turkish yesterday (violating frozen history 3h/day) and patch expiry advances late. This is also the root cause of the "11 flaky weekend tests" (§E). One fix serves all: inject `TimeProvider` with Europe/Istanbul semantics, use `FakeTimeProvider` in tests. Full analysis in DB report §1.1.
4. **HIGH — No transactions on multi-step mutations; `AuditWriter` flushes partial state.** Verified end-to-end on `Reassign` (`RoutesController.cs:427-479`): closes current assignment → `_changeLog.WriteAsync` internally calls `SaveChangesAsync` (`AuditWriter.cs:41`, same scoped DbContext) committing the closure → second save can throw on the filtered unique index → 409 returned **with the route left unassigned** and audit showing only "Unassigned". Same split-save shape in Publish and Draft→Active. Zero `BeginTransaction` anywhere. Fix: transaction per mutation endpoint; `AuditWriter` must stop calling SaveChanges itself.
5. **MEDIUM — BulkAddStops N+1 + unhandled race.** Per-store `AnyAsync` in a loop (`RoutesController.cs:282` inside :266) — 300-store lasso = 300 round-trips; concurrent conflict falls through as `DbUpdateException` → generic 500 instead of the ProblemDetails conflict shape (Reassign handles it; this path doesn't).
6. **MEDIUM — Route-code race.** `CountAsync(StartsWith)+1` (`RoutesController.cs:62-64`) duplicates codes under concurrency; `{seq:D2}` breaks past 99 routes/province (target scale implies more).
7. **LOW/MEDIUM — Logging near-absent.** 5 log calls in the whole API; publish, regeneration, auth failures, analytics timings unlogged. Undiagnosable at 1k users. No CancellationTokens on RoutesController actions (long plan queries can't abort).
8. **Positives (verified):** Evo.Domain is genuinely pure (zero package/project refs); DI lifetimes correct (no captive DbContext); zero `.Result`/`.Wait()`/`async void`; nullable enabled and honored; error shape genuinely uniform (ProblemDetails + `EvoExceptionHandler` + ErrorShapeTests — best-in-repo area); contract-first genuinely honored (build target regenerates openapi.json, CI has a contract-drift job, spot-checks in sync).

---

## C. Security

### Prod blockers

1. **H1 — Stored XSS in the shipped planner.** `engine.js` has 82 `innerHTML` assignments interpolating backend strings unescaped: note body `${i.txt}` (:3128), store/route/merchandiser names (:594, :672, :708, :812, :935), flowing in via `backendBridge.ts:69-116`. **No HTML-escape helper exists anywhere in engine.js** (the `esc()` at :2520 is a CSV helper — verification corrected this). Only `tasksBridge.ts` escapes. A route/store/user name or note containing `<img onerror=…>` executes in a supervisor session (in-memory JWT, all-regions). Fix: escape at the bridge boundary (single choke point) + add HTML-escaping in engine.js render paths + CSP.
2. **H2 — `AllowedHosts: "*"`, no HSTS, no CSP, no security headers** (`appsettings.json:9`, Program.cs). CSP is the defense-in-depth that would blunt H1.
3. **M1 — 60-min access token with no revocation.** Deactivate/change-password revoke only refresh tokens; a deactivated all-regions supervisor keeps API access up to 60 min. Shorten to 5–15 min or add a token-version claim.
4. **M2 — No rate limiting on login/refresh.** Identity lockout (5/5min) is per-account; password-spraying 1,000 known `@evo.local` accounts at 4 tries each stays under it. Add ASP.NET rate limiting; also fixes user-enumeration timing on unknown emails.
5. **KVKK retention** — see DB report §4: location pings (~160M rows/yr of employee tracking data), absence reasons (`SickLeave` + free-text note = special-category data under KVKK Art. 6), audit-log PII — all indefinite retention, no policy in code. Tracked as an open customer question in docs (good) but must be resolved before real agent data exists.

### Watch items (fine for dev)

- **L1** dev connection string `sa`/`Local_dev_only!1`/`TrustServerCertificate=True` committed in `appsettings.Development.json` + compose — never promote; prod needs least-priv login + real cert.
- **L3** all seeded FieldAgents share `Demo1234!` in demo **and scale** profiles (`IdentitySeederModule.cs:93,119`) — never seed a real environment with these profiles.
- **M3** no request-size limits; unbounded list endpoints (see §D).
- Deployment checklist: `ASPNETCORE_ENVIRONMENT` must not be Development (exception handler and Swagger are correctly gated on it).

### Verified strengths (no action)

Authorization coverage complete — every controller `[Authorize]`-gated, only Health/login/refresh anonymous by design; IDOR handled (FieldAgent sees only own records; Supervisor all-regions is the documented model); **zero raw SQL** (no injection surface); refresh tokens SHA-256-hashed, 512-bit, rotation + reuse detection + revoke-all on password change; access token in memory only, never localStorage; JWT dev-key guard throws at startup outside Development; generic 500s don't leak; Swagger dev-only; CSRF structurally mitigated (bearer header + `SameSite=Strict` cookie scoped to `/api/v1/auth`); npm prod audit 0 vulnerabilities; .NET packages current; override accountability correctly captured (DecisionJournal + AuditLog with ActorId); no PII in log strings.

---

## D. Scalability (app layer — DB layer in the companion report)

### Panel

1. **HIGH — Planner boot fan-out.** `backendBridge.ts:59-64,132-141`: routes + merchandisers + geo + notes, then **one `getPlan` per active route** — ~44 requests for a 40-route province, repeated on every week-nav and province switch, no client cache (bridges bypass react-query). Each getPlan runs the full server findings pipeline. 1,000 supervisors × morning login = tens of thousands of plan computations. **Fix: batch endpoint** `GET /plans?province=&from=&to=` + react-query caching in the bridge.
2. **HIGH — Full-DOM rebuild per interaction.** `renderAll()` (engine.js:3154) re-renders everything from ~40 call sites; the store pool renders every unrouted store (up to 5,000 from /stores/geo) with no cap/virtualization; drag handlers query all `.day-cell` per dragover event.
3. **MEDIUM — No code splitting.** maplibre-gl (~230KB gz) loads even on /login; recharts ships to users who never open /analytics; dead deps ship. `React.lazy` per route.
4. **MEDIUM — Leaking listeners.** `installProvinceControl` adds an unguarded click listener per PlannerPage mount (`backendBridge.ts:188`) — navigate planner→analytics→planner N times ⇒ province clicks fire N concurrent full reloads. Guard like the map bridge's `wired` flag.
5. **MEDIUM — Silent 200-row truncation.** `planner.ts:50,146,151` fetch page 1 (pageSize 200) of routes/audit-log/journal and never page further — data silently disappears from the UI at scale.
6. **MEDIUM — Monitoring is stale-until-reload.** No polling/SSE/websocket anywhere — check-in/realization data is a load-time snapshot. Needs a deliberate design (e.g. 60s polling on the focused route), currently nothing.
7. **MEDIUM — Non-reentrant global state.** Prototype DOM + engine + MapLibre context retained forever after leaving /planner; state survives logout — second user on the same tab sees the previous user's province/week until reload.

### Backend

8. **CRITICAL — On-read analytics fan-out.** Verified count: `/analytics/plan-health` = **8 queries per route** (visits, realizations, task instances, patches, turnover, stability audit, 2× settings — SettingsProvider uncached), sequential, region optional (null = whole country) ⇒ **~1,603 queries for 200 routes, per request**. Zero caching in the whole repo (no IMemoryCache/OutputCache anywhere). The DECISIONS.md rationale for on-read was written at 50-route demo scale. Fix: require region; set-based GROUP BY per metric; output-cache 60–300s; then the pre-aggregated `route_day_stats` table (DB report §7).
9. **HIGH — Synchronous fan-out regeneration in HTTP requests.** A format/chain-scoped rule create regenerates **every affected route inline** (`RulesController.cs:77-83`, `TaskInstancesController.cs:69-76,110-121`) — at 10k routes, minutes-to-hours inside one request. Design §9 says async per-route. Queue to a background worker, return 202.
10. **HIGH — Nightly job can't finish & dies under IIS.** `PlanHorizonBackgroundService`: interval anchored to process start (runs at deploy, drifts), full country regeneration on every boot, no lock, and on **customer IIS** app-pool idle stops it entirely — patch expiry silently stops advancing. Saving grace (verified): `PatchResolver` applies by date window, so *resolution* stays correct; but patch status lists shown in the UI go stale. Fix: fixed-hour schedule, skip boot run, document IIS AlwaysRunning, and make expiry lazy in the resolver so correctness never depends on the job.
11. **HIGH — Onarım candidate ranking O(agents × visits).** Per affected visit it loads all ~10k assignments + every candidate's visits for the day (~150k rows) — a 5-day absence ≈ 11M row materializations per workbench open. Batch with server-side GROUP BY (DB report §3.4).
12. **MEDIUM — Per-edit 42-day regeneration inline** on every stop drag/patch (MoveStop does it twice serially, :420-421) — edit latency + write contention at 1k supervisors; consider affected-window-only regen.
13. **MEDIUM — Unbounded endpoints:** `/notes` (all ever), `/merchandisers` (all 10k on every planner boot), analytics with `region=null`, `/plan` with unclamped date span, `UsersController.List` N+1 `GetRolesAsync` per user.

---

## E. Tests & CI

1. **HIGH — The "11 weekend flakes" are deterministic, root cause confirmed.** Tests anchor to real `DateTime.UtcNow`; `FrequencyExpander.cs:16-19` skips Sat/Sun; tests that seed a stop and assert visits "today" get zero visits on weekends (`SingleAsync` throws). Verified affected: `PlanGenTaskMinutesTests`, `PlanGenFormatChangeReresolvesTests`, `TaskInstanceScopeTests`, plus RouteEndpoint/AdhocTask/NotificationEndpoint tests; some siblings already carry weekend guards (PlanGenTimeShiftTests:134 etc.), corroborating the diagnosis. One test fails midweek too (`PlanRealizedFieldsTests.cs:35`, today−3). **Fix = §B.3 TimeProvider** + `FakeTimeProvider` pinned mid-week. This permanently ends the "pre-existing flake" that is normalizing a red suite.
2. **HIGH — Backend CI cannot run the suite.** `.github/workflows/ci.yml` backend job has **no SQL Server service container**; most integration tests hardcode `Server=localhost,1433` with no skip logic — they fail, not skip. Either CI backend is red every run or its green is meaningless. Add an `mcr.microsoft.com/mssql/server` service. Also: CI triggers only on push-to-main/PR — this branch gets CI only via PR.
3. **HIGH — Test suite tests the dead UI.** ~20 panel unit-test files exercise A2's dead tree; the shipped planner's only automated coverage is the Playwright suite — and **4 of 6 specs target the deleted UI** (their `data-testid`s exist only in dead components; the prototype DOM has zero testids). `planner-core`, `tasks-tab`, `onarim`, `field-execution` cannot pass; `auth` + `smoke` remain valid. The e2e artifacts (screenshots) depict the old UI. CLAUDE.md's "panel 75/75, Playwright 6/6" predates the rebuild (panel is actually 133/133 vitest now — of largely dead components).
4. **HIGH — `publishBridge.ts` has no unit tests** — the diff logic translating in-memory drags into real patches is the highest data-corruption-risk code in the panel.
5. **MEDIUM — Integration-test copy-paste:** ~14 files duplicate the hardcoded connection string + wipe boilerplate; consolidate into the existing shared fixture or Testcontainers.
6. **Positives:** the three test-critical domain areas (baseline ⊕ patch, 450-min, task-rule arithmetic) are covered by meaningful, assertion-rich tests (PatchResolverTests, DaySchedulerTests, MoveVisit/CrossReassign tests, RuleImpact/PlanGenTaskMinutes). Contract-drift CI job is genuinely good.
7. **Tooling gaps:** `global.json` pins SDK `10.0.302` exactly (blocks any other 10.x machine — use `"rollForward": "latestFeature"`); no `dotnet format`/analyzers enforcement in CI; eslint is `recommended` not `recommendedTypeChecked`; engine.js is outside lint entirely; tsconfig lacks `noUncheckedIndexedAccess` (otherwise strong).

---

## F. Documentation drift (CLAUDE.md rules 5 & 6 violations)

1. The **prototype-verbatim pivot** — the biggest architectural change on the branch (20 commits) — is not in `docs/DECISIONS.md`, and `docs/ARCHITECTURE.md` never mentions `PrototypeHost`/`planner/prototype/`.
2. `docs/ARCHITECTURE.md:71` claims `api/generated/` is gitignored — false, `schema.ts` is tracked.
3. `docs/ARCHITECTURE.md:95`, `docs/DATABASE.md:141,151`, `docs/ROADMAP.md:71-72`, `panel/e2e/README.md:8` all describe the unregistered seeder modules as active.
4. CLAUDE.md "Current focus": test counts stale (see §E.3); describes Onarım workbench + evidence strip as shipped panel features (orphaned, §A3.2); the analytics page's mobility/plan-health tables claim needs re-verification against the live page.
5. Prototype engine's own documented dead code (legacy `renderAdmin`, `presetsData`) now ships to users in `public/` — intentional under "verbatim", worth a note.

---

## G. Prioritized action plan (sized for Claude Code sessions)

**P0 — Trust & safety first (small, high leverage)**
1. `TimeProvider` injection + Istanbul-aware "today" + `FakeTimeProvider` in tests → kills the 11 weekend failures AND the 00:00–03:00 correctness window (§B.3, §E.1, DB §1.1).
2. Add SQL Server service container to CI backend job; un-pin `global.json` with rollForward (§E.2, §E.7).
3. Escape backend strings at the bridge boundary + engine.js render paths; add CSP + HSTS + real AllowedHosts (§C H1/H2).
4. Auth hardening: rate-limit login/refresh; shorten access token or add token-version revocation (§C M1/M2).

**P1 — The two big decisions (do these before more features)**
5. **Dead-tree decision** (§A2): delete ~4,552 LOC + 11 client functions + 5-6 deps + dead tests, or formally keep as migration target. Log in DECISIONS.md. Then rewrite the 4 broken Playwright specs against the prototype DOM (add testids via bridges) and unit-test `publishBridge`.
6. **Prototype endgame decision** (§D.2, quality 3.1): migrate pane-by-pane into React (components exist... unless deleted in #5 — decide together!) vs. adopt engine.js as product code (move into src as .ts, lint it, test the anchor splices). The current halfway state rots fastest. Log in DECISIONS.md.
7. **Seeder decision** (§A3.1): re-register Route/FieldExecution/Absence modules (or delete them + fix the 4 docs claiming they run). Onarım/analytics/e2e all need this data. Fix `--wipe`.

**P2 — Scale readiness (the DB report's top 5 + app layer)**
8. Two indexes on `planned_visit`: `(RouteId, VisitDate)` INCLUDE(...) and `(StoreId, VisitDate)` (DB §2.1/2.2).
9. Analytics: require region, set-based aggregation, output caching; then `route_day_stats` pre-aggregation (DB §7.1).
10. Batch plan endpoint + react-query caching → collapses the 44-request boot (§D.1).
11. Transactions per mutation + rowversion concurrency on route/route_stop/patch; fix AuditWriter flush (§B.4, DB §1.5/3.6).
12. Background regeneration queue (rule fan-out → 202) + fixed-hour hardened horizon job + lazy patch expiry (§D.9/10).
13. `AsNoTracking` sweep (zero usages today), `AddDbContextPool` + `EnableRetryOnFailure`, pagination on notes/merchandisers, plan-span clamp (DB §3.5/3.12).

**P3 — Correctness bugs from the DB report (cheap, real)**
14. Chain-targeting bug: `TargetChain` dropped → chain-scoped templates hit every chain (DB §5.1 — type fix needed too: `string?` vs `Guid?`).
15. `Guid.Empty` sentinel collision silently drops overlapping add-type patch visits (DB §1.4).
16. Publish gate ignores V14 absence-collision Errors — bypasses the mandatory-justification rule (DB §5.2).
17. Constants desync: RulesController 450 + hardcoded 42-day horizon → settings (§B.2).
18. Orphaned task_instance leak on deactivation + stale MerchandiserId on reassign (DB §4.4).

**P4 — KVKK & lifecycle (before real agent data exists)**
19. Retention policy + jobs: location pings, absence reasons (special-category), audit log (DB §4.1).
20. Partitioning/archival plan for the visit family; scale seed profile ≥2k routes / 1M visits to validate any of this (DB §4.2/6.2).

---

*Report produced by a read-only audit; no files in the repository were modified. All file:line references are against branch `prototype-parity-rebuild` at commit `02f45d2`.*
