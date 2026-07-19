# EVO — Cleanup & Hardening Backlog (from the 2026-07-19 audit)

Source reports (same folder): `EVO-Audit-Report.md` (main) and `EVO-Database-Report.md` (DB deep-dive).
All file:line references in the reports were verified against `prototype-parity-rebuild` @ `02f45d2` — if the repo has moved on, re-check line numbers before editing.

Work items reference report sections (e.g. "§A2" = main report section A2, "DB §2.1" = database report section 2.1). Do items as separate, small Claude Code sessions — one checklist block per session is about right. Mark `[x]` only with run-proof (build + tests green) per CLAUDE.md rule 3b.

---

## 0. DECISIONS (human-only — resolve BEFORE starting sessions that depend on them)

Mark exactly one option per decision. Sessions must log the chosen option in `docs/DECISIONS.md` and must STOP and ask if a needed decision is unmarked.

**D1 — The dead pre-rebuild React tree (§A2, ~4,552 LOC + 11 client fns + 5–6 deps + ~20 test files):**
- [X] D1a. DELETE the tree (recommended — git keeps history; the keep-rationale is stale)
- [X] D1b. KEEP as migration target (then: fix stale comment in `PlannerPage.tsx:9-12`, declare `@dnd-kit/utilities` in package.json, and mark the tree clearly)

**D2 — Prototype engine endgame (§G item 6; quality finding 3.1):**
- [X] D2a. Migrate pane-by-pane back into React over time (conflicts with D1a — the components ARE the dead tree; if D1a chosen, migration means rewriting)
- [X] D2b. ADOPT engine.js as product code: move into `src/` as TS, bring under eslint/tests, escape all interpolations (pairs fine with D1a)

**D3 — Seeder modules (§A3.1, DB §6.1):**
- [X] D3a. RE-REGISTER Route/FieldExecution/Absence seeder modules (recommended — Onarım, analytics and e2e need the data; keep panel-built routes via profiles)
- [X] D3b. DELETE the three modules + `MaterializeHistoryAsync`, and fix the 4 docs that claim they run

---

## 1. Cleanup sessions (the "vibe-coding residue" — mostly mechanical once D1–D3 are marked)

### Session C1 — Safe deletions (no decisions needed; §A1) — DONE 2026-07-19, branch `cleanup/c1-safe-deletions`
- [x] Delete `backend/src/Evo.Domain/Class1.cs` + `backend/src/Evo.Infrastructure/Class1.cs`
- [x] Delete `getNotifications()` from `panel/src/api/planner.ts` (+ now-unused type imports)
- [x] Delete `useStability()` + `getStability()` (panel analytics api) — backend endpoint stays
- [x] Delete unused exports in `panel/src/theme/tokens.ts` (`loadStatusColors`, `fontFamily`, `tokens`)
- [x] Delete `panel/src/assets/{hero.png,react.svg,vite.svg}`, `panel/public/icons.svg`
- [x] Un-export `toFeatureCollection` in `storeLayer.ts`; drop unused default export in `panel/src/i18n/index.ts`
- [x] Add `"extract-prototype": "node scripts/extract-prototype.mjs"` to panel package.json (§A3.5)
- [x] Verify: panel `npm run lint && npm test && npm run build`; backend `dotnet build && dotnet test`
  (Vitest 133/133, panel build green, backend build 0 errors; pre-existing failures NOT from C1: 1 eslint
  parse error in `public/evo-prototype/engine.js` [untouched, present at HEAD] and 9–10 weekend-date/flaky
  backend tests [same set fails with Class1.cs restored; run on a Sunday])

### Session C2 — Execute D1 (dead tree) — only after D1 marked
- [ ] If D1a: delete the tree per §A2 list (everything except `map/storeLayer.ts`), the 11 dead client fns in `planner.ts`, dead deps (`@dnd-kit/*`, `@turf/*`, `recharts`, `zustand`), dead tests, `useRouteEvidence`/`getRouteEvidence`, i18n keys only the tree used (§A3 note: keep backend endpoints — they're contract-intentional, §A4)
- [ ] If D1b: stale-comment fix + declare `@dnd-kit/utilities` + quarantine note
- [ ] Log in `docs/DECISIONS.md`; verify full panel suite + build

### Session C3 — Execute D3 (seeder) — only after D3 marked
- [ ] Re-register or delete modules; fix `--wipe` no-op (`Program.cs:51-54`)
- [ ] Fix the 4 stale doc claims (ARCHITECTURE.md:95, DATABASE.md:141+151, ROADMAP.md:71-72, panel/e2e/README.md:8)
- [ ] If D3a: run seeder demo profile, verify routes/visits/absences appear

### Session C4 — Playwright + bridge tests (§E.3, §E.4; depends on D1/D2)
- [ ] Rewrite the 4 broken specs (`planner-core`, `tasks-tab`, `onarim`, `field-execution`) against the prototype DOM — add `data-testid`s via bridges; refresh e2e artifacts
- [ ] Unit-test `publishBridge.ts` diff logic (highest data-corruption-risk untested code)

### Session C5 — Docs truth pass (§F)
- [ ] Log the prototype-verbatim pivot in `docs/DECISIONS.md`; describe `PrototypeHost`/bridges in `docs/ARCHITECTURE.md`
- [ ] Fix ARCHITECTURE.md:71 (generated client IS tracked), stale seeder claims (if not done in C3), CLAUDE.md test counts + Onarım "shipped" claims

---

## 2. P0 — Trust & safety (main report §G)
- [ ] TimeProvider + Istanbul-aware "today" + FakeTimeProvider in tests → kills the 11 weekend failures + the 00:00–03:00 window (§B.3, §E.1, DB §1.1)
- [ ] CI: add SQL Server service container to backend job; `global.json` rollForward (§E.2, §E.7)
- [ ] XSS: escape backend strings at bridge boundary + engine.js render paths; CSP + HSTS + real AllowedHosts (§C H1/H2)
- [ ] Rate-limit login/refresh; shorten access token or token-version revocation (§C M1/M2)

## 3. P2 — Scale readiness (DB report §7 checklist has the full list)
- [ ] `(RouteId, VisitDate)` + `(StoreId, VisitDate)` indexes on planned_visit (DB §2.1/2.2)
- [ ] Analytics: region required, set-based aggregation, output cache; then `route_day_stats` (DB §3.1, §7.1)
- [ ] Batch plan endpoint + react-query caching → collapse 44-request boot (§D.1)
- [ ] Transactions per mutation + AuditWriter fix + rowversion (§B.4, DB §3.6/1.5)
- [ ] Regeneration queue (202) + hardened nightly job + lazy patch expiry (§D.9/10, DB §4.3)
- [ ] AsNoTracking sweep, DbContext pooling + retry, pagination, plan-span clamp (DB §3.5/3.8/3.12)

## 4. P3 — Correctness bugs (cheap, real; DB report §5)
- [ ] Chain-targeting fix incl. `string?`→`Guid?` type (DB §5.1)
- [ ] Guid.Empty sentinel collision (DB §1.4)
- [ ] V14 in the publish gate (DB §5.2)
- [ ] 450 + 42-day constants → settings (§B.2)
- [ ] task_instance orphans on deactivate; MerchandiserId refresh on reassign (DB §4.4)
- [ ] Cascade → Restrict on route/visit family (DB §1.2)

## 5. P4 — KVKK & lifecycle (before real agent data)
- [ ] Retention policy + jobs: pings, absence (special-category), audit log (DB §4.1)
- [ ] Partition/archival plan; confirm customer SQL Server edition (DB §4.2)
- [ ] True scale seed profile (≥2k routes / 1M visits) and re-validate hot endpoints (DB §6.2)
