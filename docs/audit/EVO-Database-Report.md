# EVO — Database Deep-Dive Report

**Branch:** `prototype-parity-rebuild` (HEAD `02f45d2`) · **Date:** 2026-07-19
**Scope:** schema, EF Core usage, what is stored/fetched and how, indexes, transactions, data lifecycle/KVKK, business correctness vs the design doc, and scalability.
**Scale target:** 1,000 supervisors + 10,000 field agents. Working math used throughout: 10k agents × ~15 visits/day ≈ **150k `planned_visit` rows/day (~4.5M/mo, ~54M/yr)**, each with 1 `visit_realization`, 2–5 `task_instance` rows (**300–750k/day**), and a location-ping stream at ~12-min intervals ≈ **450k pings/day (~160M/yr)**. Routes ≈ 10k. Deployment: single strong VM, SQL Server, no microservices.
**Method:** static analysis of `Evo.Domain` entities, `EvoDbContext` + 13 migrations, all API query sites, and the seeder; key findings adversarially re-verified line-by-line (verification corrections folded in).

---

## 0. Table inventory

| Table | PK | FKs (delete behavior) | Indexes | Enum storage | Est. growth |
|---|---|---|---|---|---|
| `route` | Guid | — | UQ `RouteCode` | tinyint | ~10k, static |
| `route_stop` | Guid | RouteId→route (**Cascade**), StoreId (NoAction) | RouteId; **filtered UQ StoreId WHERE EffectiveTo IS NULL** | tinyint | slow |
| `assignment` | Guid | RouteId, MerchandiserId (NoAction) | filtered UQ RouteId / UQ MerchandiserId WHERE EndDate IS NULL | tinyint | slow |
| `patch` | Guid | RouteId→route (**Cascade**) | (RouteId, Status, EndsOn) | tinyint ×2 | unbounded, never purged |
| `planned_visit` | Guid | **only RouteId** (Cascade) — RouteStopId/StoreId/MerchandiserId/PatchId are bare Guids | RouteId; (MerchandiserId, VisitDate); UQ (RouteStopId, VisitDate) | tinyint ×2 | **~4.5M/mo — hottest table** |
| `visit_realization` | Guid | PlannedVisitId (**Cascade**) | UQ PlannedVisitId | tinyint | ~4M/mo |
| `task_instance` | Guid | PlannedVisitId (**SetNull**), TaskTemplateId (NoAction) | PlannedVisitId; TaskTemplateId; filtered UQ (PlannedVisitId, TaskTemplateId) | **int** (inconsistent) | **~10–20M/mo — largest** |
| `merchandiser_location_ping` | Guid | MerchandiserId (**Cascade**) | (MerchandiserId, RecordedAt) | — | **~160M/yr** |
| `AuditLog` | Guid | — | EntityType; (EntityType, EntityKey); OccurredAt | strings | unbounded |
| `decision_journal` | Guid | — | **none beyond PK** | tinyint | slow |
| `absence` | Guid | MerchandiserId (**Cascade**), CreatedBy (NoAction) | (MerchandiserId, StartDate, EndDate) | tinyint | slow |
| `Stores` | Guid | ChainId, Format→StoreTypes (NoAction) | UQ EvoStoreId; (Province, District); Format; spatial (raw SQL) | tinyint | ~50k, static |
| `StoreRevenues` | (StoreId, Month) | — | PK only | — | rolling |
| `StoreFlags` | Guid | — (StoreId not an FK) | StoreId | tinyint | replaced each sync |
| `task_template` / `rule` | Guid | rule.TaskTemplateId (**SetNull**) | UQ Code / Scope + (TaskTemplateId, EffFrom, EffTo) | **int** | small |
| `note`, `notification` | Guid | AuthorId/MerchandiserId (NoAction) | (AnchorType, AnchorId), (Status, Kind) / (MerchandiserId, CreatedAt) | tinyint | notification: ~10k rows **per publish event** |
| `merchandiser`, `setting`, `Chains`, `StoreTypes`, `RefreshTokens` | — | — | UQ UserId / composite PK / UQ Name / — / UQ TokenHash + **rowversion** | — | small |

---

## 1. Schema

**1.1 HIGH — Timezone data is fabricated: Istanbul wall-clock stored as UTC.**
`PlanGenerationService.cs:158-159` — `PlannedStart = new DateTimeOffset(date.ToDateTime(scheduled.Start), TimeSpan.Zero)`: 09:00 Turkish planning time is stored as 09:00 **UTC**. Meanwhile every "today" repo-wide is `DateOnly.FromDateTime(DateTime.UtcNow)` (~20+ sites: `RoutesController.cs:212,259,340,394,468,517,559,687,728,831`, `PlanGenerationService.cs:29`, `OnarimService.cs:27`, `PlanHorizonBackgroundService.cs`). Turkey is UTC+3 year-round, so between 00:00–03:00 Istanbul: the regeneration clamp (`RegenerateFutureAsync`) treats the already-executed Turkish "yesterday" as still-future and can rewrite it (violates the frozen-history rule 3h/day), past-week read-only detection shifts, and patch expiry advances a day late. *Verified: both halves confirmed.*
**Fix:** one injected `TimeProvider`/`IClock` with Europe/Istanbul semantics; store `PlannedStart/End` as `time`/minutes-from-midnight (the offset carries no information for a single-market app) or a correctly-offset `datetimeoffset`. This same fix kills the weekend test flake (main report §E.1).

**1.2 HIGH — "No delete" is app-convention only; cascades can erase history.**
`EvoDbContext.cs:137,156,165,239`: `route → route_stop / patch / planned_visit` and `planned_visit → visit_realization` are all `DeleteBehavior.Cascade`. One `_db.Routes.Remove(...)` or raw DELETE cascade-erases a route's entire audit-relevant history. No controller currently deletes routes (verified — only PlannedVisits/TaskInstances/StoreRevenues/StoreFlags RemoveRange exist), but the schema does not enforce CLAUDE.md's "no delete" rule.
**Fix:** switch those cascades to `Restrict`; arguably nothing in this domain deserves cascade delete.

**1.3 MEDIUM — `planned_visit` referential integrity mostly absent.** Only `RouteId` is an FK; `RouteStopId`, `StoreId`, `MerchandiserId`, `PatchId` are bare Guids (required by the design — patch-added visits use `RouteStopId = Guid.Empty`), so orphan references are structurally possible and the optimizer gets no FK hints. Same for `StoreFlag.StoreId`, `TaskInstance.StoreId/MerchandiserId`. Acceptable trade-off **if documented** — it is not in `docs/DATABASE.md`.

**1.4 MEDIUM (correctness) — `Guid.Empty` sentinel collision silently drops visits.**
`PatchResolver.cs:98` (AddStore) and `:142` (CrossReassignVisit target-side) both emit `RouteStopId: Guid.Empty`. `PlanGenerationService.cs:93,148,150` upserts keyed by `(RouteStopId, Date)` — **two add-type patch visits on the same route+date silently overwrite each other in the dictionary** (verified: the dictionary collapses them *before* SaveChanges, so the observable failure is silent visit loss — and upserts can match the wrong existing `Guid.Empty` row — not a DB error). Scenario: an Onarım cross-reassignment targets route R on Monday; an AddStore patch also targets R Monday → only one visit materializes, no error, no journal trace.
**Fix:** key add-type visits by `(PatchId, Date)` or add a discriminator; make the UQ `(RouteStopId, VisitDate)` index filtered `WHERE RouteStopId <> 0x0`.

**1.5 MEDIUM — No optimistic concurrency except `RefreshToken`.** `Route.Version` exists (`Route.cs:16`) but is never checked; route PATCH, stop edits, reorders are last-write-wins with interleaving possible between read and save (`RoutesController.cs:184-208`). At 1,000 supervisors with shared all-region access this will bite.
**Fix:** `rowversion` on `route`, `route_stop`, `patch`; surface 409 on conflict.

**1.6 MEDIUM — JSON columns lack the promised guards.** `docs/DATABASE.md:16` promises `ISJSON` CHECKs + computed-column indexes for hot keys; zero CHECK constraints exist in any migration. Rules are matched client-side anyway (`TaskPlanProvider.cs:41` loads ALL rules), so JSON indexes are currently moot — but corrupt JSON is either silently skipped (`PatchParams.TryParse`) or **throws at read time and breaks all plan generation** until the bad row is fixed (`TaskPlanProvider.cs:52` for bad EffectJson).

**1.7 LOW — Consistency nits.** Enum storage split (tinyint in spec-005/009 tables, int in spec-008 tables) against DATABASE.md:19's decide-once note; no CHECK constraints on enum ranges (`patch.type = 99` storable); naming split-brain (PascalCase `AuditLog`/`Stores`/... from specs 003/004 vs snake_case spec 005+, vs DATABASE.md:10 mandating snake_case).

**1.8 Verified strengths.** "One active route per store" **is genuinely DB-enforced** (filtered unique `route_stop.StoreId WHERE EffectiveTo IS NULL`, `EvoDbContext.cs:139-141`); same pattern for one-active-assignment per route AND per merchandiser (:149-150); `visit_realization` 1:1 via UQ; `Reassign` catches the unique-index race → 409 (`RoutesController.cs:457-464`) — though see 3.6 for the atomicity hole around it; nvarchar sizes consistently bounded; migrations chain coherent (13, linear, no destructive Up() ops, spatial index correctly raw-SQL'd).

---

## 2. Indexes

**2.1 CRITICAL — `planned_visit` has no `(RouteId, VisitDate)` composite.** *Verified: exact index set on planned_visit is PK(Id), IX(RouteId), IX(MerchandiserId, VisitDate), UQ(RouteStopId, VisitDate) — nothing else.* The hottest query shape in the system — `WHERE RouteId = @id AND VisitDate BETWEEN @from AND @to` — appears at `RoutesController.cs:571-573` (plan view), `:689` (health), `:729-731` (validate), `:858-860` (evidence), `PlanGenerationService.cs:167-169` (every regeneration), `PlanHealthService.cs:57-59`.
**Fix:** `(RouteId, VisitDate)` INCLUDE `(RouteStopId, StoreId, MerchandiserId, PlannedStart, PlannedEnd, Status, Source, PatchId)` — makes plan reads index-only.

**2.2 CRITICAL — no index on `planned_visit.StoreId`.** `StoresController.cs:225-228` (store-detail task plan), `OnarimService.cs:54-57` (store-closure disruptions), `NotesController.cs:77` (visit anchors) — each is a **full clustered scan of a 54M-row/yr table**. Store-detail opens by 1,000 supervisors alone can saturate the VM.
**Fix:** `(StoreId, VisitDate)`.

**2.3 HIGH — Onarım date-first query has no serving index.** `OnarimService.cs:115-117` filters `VisitDate == X` across all candidates — VisitDate is never the leading column of any index → scan. (Restructure the query first — see 3.4.)

**2.4 HIGH — `task_instance` missing the design-specified `(merchandiser_id, status, deadline)` index** (design doc §5). Overdue-feed isn't implemented yet, but this 10–20M rows/mo table has no serving index for it, and analytics already scans it via ID lists (2.5).

**2.5 HIGH — giant in-memory ID lists instead of joins.** `PlanHealthService.cs:62-63,86-88`, `RoutesController.cs:578-580,864-866`, `MerchandisersController.cs:83-85`: `visitIds.Contains(...)` with hundreds–thousands of Guids renders as OPENJSON/giant IN, defeating statistics.
**Fix:** server-side joins (`join v in _db.PlannedVisits … where v.RouteId == id`) — the UQ PlannedVisitId index then serves naturally.

**2.6 MEDIUM — `MobilityService.cs:49-52`** sends up to ~10k *stringified* Guids as an IN-list against `AuditLog.EntityKey` (string). Join to Routes on key + filter province in SQL; better, precompute (§7).

**2.7 MEDIUM — `patch` scanned per regeneration.** `PlanGenerationService.cs:69-71`: every regeneration of every route scans ALL patches (`Type = CrossReassignVisit AND RouteId != @id` — no Type index, table never purged) then JSON-parses each row client-side. O(routes × all-patches-ever) per nightly cycle.
**Fix:** store `TargetRouteId` as a real column (best) or filtered index on Type/Status.

**2.8 LOW —** `decision_journal` has no index (list sorts CreatedAt); `note.CreatedAt` unindexed for its ORDER BY. `absence` index is right for V14 (good).

---

## 3. Query patterns (how you fetch)

**3.1 CRITICAL — analytics on-read N+1.** *Verified count:* `PlanHealthService.GetReportAsync` = 3 fixed queries + **8 per route** (visits, realizations, task instances, patches, turnover, stability-audit, 2× uncached SettingsProvider) ⇒ **~1,603 sequential queries for a 200-route region, per request**; `region=null` (it's optional — `AnalyticsController.cs:26`) does the whole country. `StabilityService.GetRegionStabilityAsync` is a second per-route N+1. The DECISIONS.md 2026-07-18 on-read rationale was validated at 50-route demo scale — it does not survive 200×. A handful of supervisors opening /analytics concurrently takes the VM down.
**Fix (in order):** require `region`; replace per-route loops with one GROUP BY query per metric family; output-cache 60–300s; then the §7 pre-aggregation table.

**3.2 CRITICAL — synchronous fan-out regeneration inside HTTP requests.** `RulesController.Create` (`:77-83`) and `TaskInstancesController` (`:69-76,110-121`) regenerate every affected route inline — a format/chain-scoped rule touches most of the estate → ~10k sequential `RegenerateFutureAsync` calls in one request (times out; the shared DbContext keeps churning). Design §9 explicitly says async per-route.
**Fix:** table-backed queue + background worker; return 202 with a job reference.

**3.3 HIGH — full rule/template reload per day per route.** `PlanGenerationService.cs:111` calls `ResolveForStoresAsync` inside the date loop; `TaskPlanProvider.LoadAsync` (`:34-45`) re-fetches ALL templates + ALL rules each time ⇒ 84 queries + 42 full rule-table materializations per route regeneration; × 10k routes nightly ≈ 800k redundant loads. **Trivially hoistable** — load once per generation.

**3.4 HIGH — Onarım candidate ranking is O(agents × visits) per visit.** `OnarimService.cs:79-96,104-117`: per affected visit it loads all ~10k active assignments + routes + names + **every candidate's planned visits on the target date** (~150k rows). A 5-day absence (~75 visits) ≈ 11M row materializations per workbench open. Plus full `Absences` load (`:76`) and per-disruption N+1 (`DisruptionSource.cs:37-54`).
**Fix:** one server-side `GROUP BY MerchandiserId` day-load query per disruption; load the candidate set once, rank in memory.

**3.5 HIGH — zero `AsNoTracking` in the entire backend** (grep-verified). Every read path fills the change tracker — plan views with thousands of visits, `/stores/geo` `Take(5000)` full entities, analytics loops.
**Fix:** `AsNoTracking()` on all reads (or `QueryTrackingBehavior.NoTracking` default, opting IN to tracking on mutations).

**3.6 HIGH — no transactions; `AuditWriter` commits partial state.** Zero `BeginTransaction`/`TransactionScope` in the codebase. `AuditWriter.WriteAsync` calls `SaveChangesAsync` immediately (`AuditWriter.cs:41`) on the shared scoped DbContext, flushing whatever is pending. *Verified concrete bug:* `Reassign` (`RoutesController.cs:427-479`) closes the current assignment → changelog write **commits the closure** → new assignment insert throws on the filtered unique index → 409 returned, **route left with no assignee**, audit shows only "Unassigned". Same split-save shape in `Publish` (`:833-836` — visits regenerate before journal/changelog) and Draft→Active.
**Fix:** explicit transaction per mutation endpoint; `AuditWriter` enlists instead of saving (or writes via a separate context inside the same transaction).

**3.7 MEDIUM — per-day validator N+1 in plan view.** `GetPlan` calls `BuildV14FindingsAsync` inside the day loop (`RoutesController.cs:631`) — 2 queries × ~30 days per plan fetch; `Validate` (`:732`) already calls it batched. Hoist.

**3.8 MEDIUM — unpaginated fetches on unbounded sets.** `/notes` (all ever + 4 hydration queries), `/merchandisers` (all 10k, fetched on every planner boot), `/merchandisers/{id}/notifications` (all rows forever; and `MockNotificationDispatcher` writes ~10k notification rows per publish event), `/rules`; `/routes/{id}/plan` accepts an unclamped date span; `/stores/geo` caps at 5,000 but as full tracked entities + a full `Chains` dictionary.

**3.9 MEDIUM — row-by-row where set-based belongs.** Reassign future-visit re-owner mutates in memory (`RoutesController.cs:469-474` → `ExecuteUpdateAsync`); deactivation `RemoveRange` (`:234-235`); `StoreSyncService.cs:88-124` does 2 queries per store × 50k stores (~100k queries) + one mega SaveChanges — the nightly sync at real store counts will crawl inside one giant implicit transaction. Zero `ExecuteUpdate/ExecuteDelete` in the repo.

**3.10 LOW —** duplicate-laden IN lists (no `Distinct()` on store IDs: `RoutesController.cs:574`, `MerchandisersController.cs:80`); route-code generation race (`:62-64`, also in main report §B.6); `AddDbContext` without pooling/`EnableRetryOnFailure`/command timeout (`Program.cs:35-36`) — add `AddDbContextPool` + retry + explicit Max Pool Size before load testing, especially given 3.1/3.2 endpoints hold connections for minutes.

---

## 4. Data lifecycle & KVKK (what you store)

**4.1 HIGH — location pings: indefinite-retention employee tracking data.** `merchandiser_location_ping` at ~160M rows/yr is precise per-person location history (joins to `ApplicationUser` identity). No retention job, no policy, nowhere (only StoreSync and PlanHorizon background services exist). Under KVKK this is a compliance exposure, not just disk. Likewise `visit_realization` check-in/out timestamps forever, and **`absence` holds special-category data under KVKK Art. 6** (`SickLeave` reason + free-text note like "Rapor aldı") with by-design no delete.
**Fix:** a retention/anonymization spec — e.g. pings raw 90 days → daily aggregates; absence reason codes minimized, free-text reviewed; document per the customer's KVKK stance (docs/TODO.md already tracks the open question — good — but code has nothing).

**4.2 MEDIUM — no partitioning/archival strategy for the visit family.** `planned_visit` + `visit_realization` + `task_instance` grow ~15–25M rows/mo combined; queries are always narrow date windows. Nothing plans partitioning (note: check the customer's SQL Server edition — open IT question #5 — table partitioning needs 2016 SP1+ on Standard), filegroups, or archival. On one VM this is the difference between working and not in year 2.
**Fix:** monthly partitions on VisitDate (or partitioned views), archive job for visits older than N months.

**4.3 MEDIUM — patch auto-revert rides on a fragile timer.** `PlanHorizonBackgroundService`: `Task.Delay(24h)` anchored to process start (drifts; full-estate run at every deploy), no lock (two instances = double work — plausible with "Docker or IIS both supported"), loads all Pending/Active patches into memory, then regenerates all active routes sequentially — at 10k routes with the 3.3 inefficiency the nightly cycle will not finish in a day. **Saving grace (verified):** `PatchResolver` applies patches by date window (`PatchResolver.cs:39`), so *schedule resolution stays correct* even if statuses lag; but UI patch lists filter Pending/Active and go stale, and under IIS app-pool idle the job stops entirely.
**Fix:** fixed-hour schedule + skip boot run + document IIS AlwaysRunning; make expiry lazy in the resolver/read path so correctness never depends on the job; batch the nightly work.

**4.4 MEDIUM — orphan and stale rows leak.**
- Route deactivation deletes future visits directly (`RoutesController.cs:234-235`); `task_instance.PlannedVisitId` is SetNull and this path (unlike `PlanGenerationService.cs:239-240`) doesn't remove instances ⇒ null-visit Pending tasks accumulate forever and pollute PlanHealth compliance metrics.
- `TaskInstance.MerchandiserId` is stamped at creation and never updated on reassignment (`:469-474` updates only visits) — stale ownership for the future overdue feed.
- `StoreFlags` are replaced each sync, but Onarım closure disruptions reference `StoreFlag.Id` (`DisruptionSource.cs:48-49`) — a sync run mid-workbench-session invalidates the disruption being repaired (apply → NotFound).

**4.5 LOW —** `AuditLog` unbounded with full before/after JSON (proportionate, but include it in the retention policy; append-only is interface-shape only, not DB-enforced).

---

## 5. Business correctness vs design

**5.1 HIGH — chain-targeted task templates ignore their chain. (Verified, including the type bug.)**
`TaskPlanProvider.cs:38` (Evo.Infrastructure/Tasks) and `RulesController.cs:117` build `TaskTemplateInput(..., null /* TargetChain */, t.TargetFormat, ...)`; `TaskResolver.TargetMatches` (`TaskResolver.cs:76-77`) checks only TargetFormat. And the fix needs a type change: `TaskResolverInputs.cs:7` declares `string? TargetChain` while the entity is `Guid?`. Consequence: a chain-scoped template (the design §2.8 campaign mechanism; `CreateAdhoc` sets TargetChain at `TaskInstancesController.cs:101`; the seeder even ships a Migros-chain template, `TaskRuleSeederModule.cs:137`) attaches to **every store of the matching format in every chain** — wrong visit durations, wrong 450-min findings, and `CreateAdhoc`'s reported matchingStoreCount (chain-filtered, `:110-112`) disagrees with what actually materializes. Violates "visit duration = sum of task durations resolved by Rules".

**5.2 MEDIUM — publish gate ignores V14 (and V8). (Verified.)** `Publish` (`RoutesController.cs:788-848`) gates on `RouteValidator.Evaluate` only; `BuildV14FindingsAsync` runs in `/plan` (:631) and `/validate` (:732) but not at publish — and V14 findings are **Error severity** (`AbsenceValidator.cs:23,28`), so absence-collision errors bypass the mandatory reason+objective override entirely. Contradicts design §3.2 ("Errors gate it behind a mandatory written justification") and isn't flagged in DECISIONS.md.

**5.3 MEDIUM — CrossReassignVisit quirks.** Target-side visit keyed `Guid.Empty` → collides with any other add-type patch same route+date (1.4). `OnarimService.cs:236` sets `Status = Active` even for future-dated patches (contrast `RoutesController.CreatePatch:529` which picks Pending/Active correctly) — cosmetic given 4.3's lazy-resolution saving grace, but inconsistent. `ApplyAsync` saves patches+journal atomically (good) but the follow-up regeneration loop isn't atomic with it — crash mid-loop leaves some routes stale until nightly (self-healing; document it).

**5.4 LOW/BY-DESIGN — noted, not bugs.**
- SkipRange clears the day *before* ADD/MOVE phases (`PatchResolver.cs:48-51` vs `:93-129`), so a skipped day still receives explicitly-added visits — literal reading of design §3.1 priority order; ambiguity worth one sentence in the design doc.
- 450-rule counts Σ visit minutes, not wall-clock span with pinned gaps (`DayScheduler.cs:40-50`); breaks `[]` per the 2026-07-18 documented decision.
- Biweekly anchor math: `FrequencyExpander.cs:57` integer division truncates negative deltas — dates *before* the anchor land one week off. Only matters for backdated/simulated history (`MaterializeHistoryAsync` — currently dead code anyway).
- Geography is province/district string matching; GeoScope polygons + spatial index exist but no point-in-polygon check — documented as deferred (DATABASE.md:15), consistent. Store pickers do structurally exclude out-of-scope stores (matches "geography is a constraint").
- `PlanHealthService.cs:80-82` "weeklyCapacity" multiplies daily minutes by distinct dates in the **whole requested range** but compares against the weekly utilization band — numerically right only for 7-day ranges; the analytics page passes arbitrary ranges, making the band flag meaningless there.

---

## 6. Migrations & seeder

**6.1 HIGH — seeder regression (verified):** `Program.cs:60-67` registers 5 modules; `RouteSeederModule`, `FieldExecutionSeederModule`, `AbsenceSeederModule` exist but never run → **no routes/assignments/patches/visits/realizations/pings/notes/notifications/absences are ever seeded** on this branch, contradicting CLAUDE.md's seeder rule and four docs (DATABASE.md:150-151, ARCHITECTURE.md:95, ROADMAP.md:71-72, e2e/README.md:8), and starving Onarım/analytics/e2e of data. `TaskRuleSeederModule.cs:17` even documents it must run after RouteSeederModule. `--wipe` is a stale no-op (`Program.cs:51-54`). Decide: re-register (recommended — the panel-built-routes workflow and seeded history can coexist via profiles) or delete + fix docs.

**6.2 MEDIUM — scale profile is ~1/200th of target.** 20 supervisors / 50 agents / 50 routes / 130 stores-per-city. Every performance conclusion recorded so far (incl. the on-read analytics decision) was validated at demo volume. Build a true scale profile (≥2k routes, ≥1M visits) before trusting any hot endpoint.

**6.3 LOW — migrations clean.** 13 linear migrations, no destructive Up() ops, spatial index via raw SQL correctly, HasData stable. Caveat: user-modified `setting` rows (e.g. `break_blocks`) get rewritten if EF regenerates the HasData diff — standard EF caveat, worth a doc note.

---

## 7. Scalability verdict

**The schema shapes are mostly right** (dated rows, materialized visit calendar, filtered unique constraints encoding real invariants). **The access layer is not scale-ready** — everything was built and validated at 50-route demo scale, and the top offenders are all O(routes) or O(all-visits) per request. Storage itself is not the problem: ~25 GB/yr for the visit family + ~20 GB/yr pings (pre-retention) is fine for one strong VM. **The risk is query shape and job throughput, not disk.**

### Top 5 risks, ranked

1. **On-read analytics N+1 (3.1) + the two missing `planned_visit` indexes (2.1, 2.2).** ~1,600 queries per analytics request; full scans from store-detail and Onarım. First thing that falls over. *Fix now:* both indexes (one migration, zero risk) + region required + GROUP BY aggregation + output cache. *Then:* a `route_day_stats(route_id, date, planned_minutes, done, missed, skipped, task_done, task_total, override_count)` table maintained by the nightly job — a plain table + upsert, fits no-microservices, and reverses the on-read decision only where hot. DECISIONS.md itself says "revisit if/when query volume demands it" — it will.
2. **Synchronous fan-out regeneration (3.2) + per-day rule reload (3.3) + a nightly cycle that can't finish (4.3).** ~800k redundant rule loads per night at 10k routes. Hoist the rule load (1 line), queue regenerations, fix the schedule + IIS semantics.
3. **Location-ping growth with no retention (4.1)** — ~160M KVKK-sensitive rows/yr. Policy + purge/aggregate job before real agent data exists.
4. **Onarım ranking O(agents × visits) (3.4)** — unusable beyond a few hundred agents. Server-side GROUP BY day-loads.
5. **No transactions / no concurrency control (3.6, 1.5)** — the verified Reassign hole + last-write-wins edits become weekly data-integrity incidents at 1,000 supervisors.

### Pre-production checklist (DB layer)

- [ ] `(RouteId, VisitDate)` INCLUDE-covered index + `(StoreId, VisitDate)` on planned_visit (2.1, 2.2)
- [ ] `AsNoTracking` sweep / NoTracking default (3.5)
- [ ] Transactions per mutation; AuditWriter stops self-saving (3.6)
- [ ] `rowversion` on route/route_stop/patch (1.5)
- [ ] Cascade → Restrict on route/visit family (1.2)
- [ ] Chain-targeting fix incl. `Guid?` type (5.1)
- [ ] V14 in the publish gate (5.2)
- [ ] `Guid.Empty` sentinel redesign (1.4)
- [ ] Analytics: region required + set-based + cache; then route_day_stats (3.1, §7.1)
- [ ] Regeneration queue + hardened nightly job + lazy patch expiry (3.2, 4.3)
- [ ] Onarım batch ranking (3.4)
- [ ] Pagination: notes, merchandisers, notifications; plan-span clamp (3.8)
- [ ] `AddDbContextPool` + `EnableRetryOnFailure` + pool sizing (3.10)
- [ ] TimeProvider + Istanbul-correct "today"; PlannedStart storage decision (1.1)
- [ ] Retention policy: pings, absence, audit log (4.1, 4.5)
- [ ] Partition/archive plan for the visit family; confirm SQL Server edition (4.2)
- [ ] Seeder modules re-registered + true scale profile (6.1, 6.2)
- [ ] task_instance orphan cleanup on deactivate; MerchandiserId refresh on reassign (4.4)

---

*Read-only audit; no repository files modified. All references against `prototype-parity-rebuild` @ `02f45d2`.*
