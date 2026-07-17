# Decisions Log

<!-- Newest first — insert new entries directly below this line -->
## 2026-07-17 — 009-field-execution-sim: separate visit_realization table + continuous location-ping stream (both diverge from the planner's recommendation), mocked notifications, seeder-only notes
- **Decision:** M3's realized-visit data is a **separate `visit_realization` table** (1:1 with `planned_visit` via a unique FK), not columns added directly to `planned_visit` as the planner initially recommended — the user asked for this split (2026-07-17) to keep "the promise" (`planned_visit`) and "reality" cleanly separated, especially since GPS data turned out to be a growing continuous stream rather than a single point. That stream is a new **`merchandiser_location_ping`** table (plain `lat`/`lng` doubles, no NetTopologySuite `geography`, `RecordedAt` timestamp) — the user explicitly chose to pull M4's live-location-layer *data groundwork* forward into M3 rather than seed one check-in point per visit, after being asked directly whether M3 should stay scoped to a single point or build the continuous-ping pipeline now. `PlannedVisit.status` (Done/Missed/Skipped, already defined in spec 005 but never populated until now) remains the single source of truth for outcome — `visit_realization` only carries `CheckInAt`/`CheckOutAt`/`ActualMinutes`/`OutcomeReason`. A visit's check-in location is derived at read time as the nearest ping to `CheckInAt` (not stored redundantly). Task results type `TaskInstance.ResultJson` (reserved since spec 008) via a pure `Evo.Domain.Tasks.TaskResult` record set (None/Photo/Form) with seeded object keys + fake URLs for photos (no real MinIO upload — mobile capture is deferred). Notification receipts are mocked via a real `notification` table + a thin `INotificationDispatcher` that writes one row per assigned merchandiser when a route publishes successfully (log-and-continue on dispatcher failure — never blocks the publish result); no real FCM delivery. Notes are **seeder-produced only** — no field-agent create-note API, since mobile capture is deferred (Q4, matches the existing "Mobile app deferred" decision below).
- **Why:** `visit_realization` as a separate table keeps history-shaped data (which may need its own retention/lifecycle later) out of the row that represents the plan itself, and avoids widening `planned_visit` with columns that are null for the vast majority of (future) rows. The continuous ping stream reflects real operational value the user wants sooner rather than deferring the whole location story to M4 — but the **panel's live-map visualization of that stream stays M4**; M3 only ships the data pipeline (seeder + `GET /merchandisers/{id}/location-history`) so M4 doesn't have to build the schema from scratch. Mocking notifications via a real table (not just a log line) lets the panel's future analytics read real rows instead of parsing logs. Seeder-only notes match the existing mobile-deferred posture — there is no legitimate write path for a field agent yet.
- **Alternatives rejected:** Realized columns on `planned_visit` (planner's original recommendation) — rejected per user feedback once the location-history requirement surfaced; a single `CheckInLat`/`CheckInLng` column pair per visit — rejected for the same reason, the user wants location *history*, not a snapshot. NetTopologySuite `geography` for pings — deferred until a spatial query actually needs it (none does in M3). Building the panel's live-location map layer now that the pipeline exists — deferred to M4 to avoid scope creep beyond what was asked (the data pipeline, not the visualization).
- **Consequences:** `docs/DATABASE.md`/`docs/API.md`/`docs/ARCHITECTURE.md` updated for the 4 new tables (`visit_realization`, `merchandiser_location_ping`, `note`, `notification`) and 4 new/extended endpoints. `PlanGenerationService` gained a seeder-only `MaterializeHistoryAsync` (bypasses `RegenerateFutureAsync`'s today-clamp) — discovered mid-implementation that seeded route stops' `EffectiveFrom = today` meant no past-dated membership ever existed, so the seeder now backdates stops before materializing history (a real bug caught by actually running the seeder, not just code review). `EVO-Route-Planning-Design.md` flagged where M3 diverges from its original realized-visit shape (never contradict §10 silently, CLAUDE.md rule 5). `agent_location` (design §6.2, M4) is effectively superseded by `merchandiser_location_ping` — DATABASE.md's schema-status table notes this rather than leaving two competing tables implied.

## 2026-07-17 — 008-tasks-rules: M2 scope confirmations (effect-ops, arithmetic order, materialization) and simulate/route + Conflict Center stay deferred
- **Decision:** M2's Rule engine ships with 4 effect ops only — `IncludeTask`, `ExcludeTask`, `SetMinutes`, `ScaleMinutes` — deferring `SetFrequency`, `SetModules`, `PatchModule` to a later spec (Clarification Q1). Minutes-ladder arithmetic evaluates rules low→high by `(Scope, Priority, EffectiveFrom)`: `ScaleMinutes` multiplies the running value, `SetMinutes` replaces it outright, so a higher-priority `SET` wins unconditionally and a higher-priority `SCALE` multiplies whatever lower layers produced (Q8); same-scope/same-priority ties break on newest `EffectiveFrom`. `TaskInstance` rows are **materialized** by `PlanGenerationService` for every future visit (not resolved-on-read), matching the existing `PlannedVisit` horizon model — needed for deadline/OVERDUE tracking on one-off tasks (Q7). A "one-off targeted task" is a `TaskTemplate` with `recurrence=Once` + `targetChain`/`targetFormat` + `validUntil` as its deadline — no separate Campaign entity (Q3, per design §2.8 v0.5 decision). Both `POST /simulate/route` and the Conflict Center/Sorun Merkezi stay deferred out of M2 (Q4/Q5) — see rationale below.
- **Why:** The engine's core job is replacing the flat `service_minutes` fallback with Σ resolved task minutes; the deferred effect-ops (module composition) and admin CRUD pages are a different, larger story (module-stack editor) that would double M2's scope without being load-bearing for the resolver itself. `POST /simulate/route` is a *consumer* of the resolver (a what-if over a candidate `stores[]` set for route-building/rebalancing), not a prerequisite — it becomes a thin call once the resolver exists. The Conflict Center is a cross-route *triage/aggregation* surface (a browsable queue of warnings across the region); M2's aggregate impact preview (`GET /rules/impact`) plus the existing per-day V2 (>450) warning chip already satisfy "never block, always justify" *at the point of edit* — a cross-route browsing UI is an M3/M4 monitoring concern, not a gate on shipping rule resolution.
- **Alternatives rejected:** Building the full effect-op set (SET_FREQUENCY/SET_MODULES/PATCH_MODULE) now while domain context is fresh — rejected as scope creep with no M2 consumer. Folding `POST /simulate/route` or the Conflict Center into M2 to "finish the story" — rejected per the dependency analysis above; both ship cleanly as later specs once the resolver is stable.
- **Consequences:** `docs/API.md`/`docs/DATABASE.md` updated for the 3 new tables + 6 endpoints. `EVO-Route-Planning-Design.md`'s M1 "visit duration = flat fallback" description is superseded — flagged in `docs/DATABASE.md` rather than silently diverging (CLAUDE.md rule 5). Standalone Yönetim admin pages (task-template list, rule matrix UI) also deferred — `POST /rules` + the scope-modal (creates rules from context) + the seeder cover M2's data-creation needs (Q6).

## 2026-07-17 — 007-schedule-drag-resize client: reflow mirror, store-permanent resize scope, ported prototype layout after live browser testing
- **Decision:** `reflow.ts` re-implements `DayScheduler`'s pack-and-push-past-breaks algorithm client-side, purely for the live rubber-band preview while dragging — the server-side `DayScheduler` remains the actual source of truth; the client copy only has to be visually close during a drag, not authoritative. Drag-edge-to-extend-duration commits directly via `UpdateStop.serviceMinutes` (store-permanent scope) rather than opening a patch form — dated/route/format-scoped duration overrides are M2 (task/rule engine) territory. The drop-decision logic (same-day move -> TimeShift prefill, cross-day move -> MoveVisit prefill, resize -> UpdateStop payload) was extracted into a pure `dropDecision.ts` function so it's unit-testable without simulating pointer events.
- **Why:** A full two-day live reflow (removing the dragged item from the source day's array while inserting it into the target day's array, both re-rendering per pointer-move) breaks index alignment between the reflowed array and the day's rendered visit list — caught as a real bug during implementation. Cross-day drags render a floating ghost in the target column instead of a live two-day reflow; the actual repack happens for real once the MoveVisit patch is created and the plan refetches.
- **Live browser testing findings (not just static review):** after two rounds of "this is broken" reports, actually driving the app via Chrome automation (not just reading code) showed the drag/resize/cross-day mechanisms all worked correctly end-to-end the whole time — what was missing was the prototype's time-axis (hour labels down the grid) and person-cell row, both completely absent, making it impossible to tell what a drag would do or land on. Ported the prototype's real `sched-grid` CSS grid (110px person-cell | 36px time-axis | 5 day columns) and `.hline` hour gridlines to fix the actual problem instead of continuing to guess at drag-handler bugs that didn't exist. Lesson: when a report is "X doesn't work at all" but static code review finds no obvious defect, prefer live-testing the actual browser over further speculative code changes.
- **Consequences:** `dropDecision.ts`/`reflow.ts` are covered by unit tests (drop→payload wiring, reflow math); no Playwright drag-simulation test (per spec Clarification — dnd pointer simulation is flaky, component/unit tests preferred). The schedule pane's visual structure is now a faithful 1:1 port of the prototype's grid for a single focused route; it does not (and structurally cannot, given a route has 0-1 active assignment) render the prototype's multi-route/multi-person stacked rows — that would require rendering multiple routes at once, out of scope here.

## 2026-07-17 — 007-schedule-drag-resize: MoveVisit as a new PatchType (not an overloaded TimeShift); TimeShift made real
- **Decision:** Cross-day drag (moving a visit to a different weekday) is realized as a new `PatchType.MoveVisit = 6` rather than adding a target-date field to `TimeShift`. One patch row carries `{fromDate, toDate, startMinutes?}` in the existing `params_json`; `PatchResolver.Apply` — which only ever evaluates one date at a time (SKIP > TIME_SHIFT > ADD > REASSIGN) — resolves it as two ordinary per-date effects off its existing per-date invocation: a SKIP on `fromDate`, an ADD (with the real `RouteStopId`/minutes/sequence, looked up via a new `StopMeta` dictionary) on `toDate`. Also: `TimeShift` (type 5) was a documented no-op — the resolver comment claimed "DayScheduler applies the window later" but neither read `params_json`. Fixed by adding `ProjectedVisit.PinnedStart`, set by the resolver's TimeShift phase and honored by `DayScheduler` as a "no-earlier-than" anchor that reflows every visit after it.
- **Why:** No existing patch type fits a two-date effect, and `Apply`'s pure per-date signature is the resolver's core invariant — changing it to see multiple dates at once would ripple through `PlanGenerationService`'s date loop and every existing patch type's semantics. A single MoveVisit row keeps "one patch = one mandatory expiry = one audit/journal entry = atomic" intact, and auto-revert on expiry is free (the resolver just stops applying either half once `EndsOn` lapses — no compensating action needed, identical to every other patch type).
- **Alternatives rejected:** Two linked SkipStore+AddStore patches (two rows, two expiries that can drift apart, worse audit story — a partial revert could leave a visit missing from both dates). Overloading `TimeShift` with an optional target-date field (no new enum value, but forks one type into two different mechanics and reads confusingly in the decision journal — "Zaman Kaydır" for what's actually a day-move). Changing `PatchResolver.Apply` to accept a date range and resolve multi-date effects internally (bigger blast radius — every existing caller and test assumes single-date resolution).
- **Consequences:** `docs/API.md`/`docs/DATABASE.md` document the `params_json` shapes for both types; `EVO-Route-Planning-Design.md` §2.5 flagged with a build note (never contradict the design log silently, CLAUDE.md rule 5) rather than silently diverging. No DB migration — `patch.type` has no CHECK constraint and `params_json` is already `nvarchar(max)`. `PlannedVisitDto` gained `routeStopId` so the panel can correlate a dragged block to its stop without a second lookup. `UpdateStop.serviceMinutes` gained a 5-minute snap + `[10,240]` clamp (previously unclamped) to back the drag-edge-to-extend-duration interaction (client-side "store-permanent" scope only per spec 007 Clarification #4 — dated/route/format duration scopes stay deferred to M2's task/rule engine).

## 2026-07-17 — 006-planner-ui: geo API + batch reorder folded into the UI spec, library choices, visual-parity pass added as Phase 9
- **Decision:** The planner UI spec (006) owns two small backend additions rather than splitting a separate geo-API spec: `GET /stores/geo` (bulk lat/lng + chain/category + active-route flag + 6-month revenue, since 005's `StoreSummaryDto` carries no coordinates) and `POST /routes/{id}/stops:reorder` (batch sequence update, since 005 only exposed per-stop `PATCH` and a drag-drop reorder needs one call, not N). Frontend stack: MapLibre GL JS (vector rendering, better clustering than Leaflet for hundreds of pins), dnd-kit (schedule/stop drag), Zustand (shared workspace selection/filter store) + TanStack Query (server cache, invalidated on every mutation for live health/schedule refresh), react-i18next (`tr.json`, i18n-ready per CLAUDE.md), Recharts (declarative, minimal custom SVG needed for the 3 health visuals — visx's low-level control wasn't worth the extra code for an internal tool).
- **Why:** The UI's flagship pane (map) was literally unbuildable against 005's API as shipped — no coordinates on any list endpoint. Keeping the geo endpoint in 006 (not a separate spec) avoided an extra checkpoint cycle for a two-endpoint addition the UI can't function without.
- **Alternatives rejected:** Leaflet (simpler but weaker at hundreds of pins), react-dnd (older, dnd-kit is the modern default), React Context instead of Zustand+Query (too much manual cache-invalidation boilerplate for a workspace this stateful), Recharts alternatives (visx too low-level for 3 simple charts).
- **Consequences:** Explicitly deferred out of 006 (later specs): Conflict Center/Sorun Merkezi, `POST /simulate/route`, history timeline, live-location layer, Onarım workbench, full-canvas 6-tab table, Effective/Base toggle, numbered map markers + route polylines. After Phase 5, the user flagged that the built panes didn't visually/logically match `evo-planner-prototype-v0.5.html` — Phases 1-5 used generic inline styles rather than rigorously porting the prototype's actual CSS. Added **Phase 9 — visual-parity pass** to 006 (spec Clarification #15): finish functional Phases 6-8 first, then a dedicated pane-by-pane pass against the prototype's real CSS before closing the spec.
- **Related bugfix, same session:** WebApplicationFactory-based API tests (`StoreEndpointTests`, `RouteEndpointTests`, and 10 others) were booting against the same `EvoDb` the local dev server uses; several wipe `Routes`/`RouteStops`/etc. for isolation, so every `dotnet test` run silently erased the seeder's demo data. Added `EvoApiTestFactory` redirecting those tests to a dedicated `EvoDb_ApiTests` database (mirroring the already-isolated `EvoDb_RoutingTests` tests), with a static lock serializing the one-time migration across the ~12 affected test classes (each gets its own factory instance via xUnit's `IClassFixture`, racing the same `CREATE DATABASE` otherwise).

## 2026-07-17 — decision_journal lands in 005 (not deferred further)
- **Decision:** `decision_journal` (Kind/Description/Reason/Objective/ErrorsJson/AuthorId) ships
  in spec 005 as its own table, distinct from `audit_log` — publish-with-errors overrides write
  a row here, not to the generic audit table.
- **Why:** The publish gate ("never block, always justify") is core to this spec's domain rules;
  a Route can't publish past an Error finding without a recorded reason+objective, so the journal
  had to exist the moment the publish endpoint did.
- **Consequences:** `docs/DATABASE.md` documents it alongside `route`/`route_stop`/etc. No read
  endpoint exists yet for `decision_journal` (only written, and read directly by tests) — a
  `GET`/listing surface is deferred to the planner-UI spec if the human wants one.

## 2026-07-17 — route_change_log realized as a facade over audit_log (not a new table)
- **Decision:** `Evo.Api.Audit.IRouteChangeLog` wraps spec 003's generic `IAuditWriter`,
  writing with `EntityType="Route"` — no new `route_change_log` table.
- **Why:** Consistent with the 2026-07-16 decision that collapsed `route_change_log` and
  `admin_audit_log` into one generic `audit_log` table before either owning entity existed.
  Now that Route exists, the facade is the "typed query helper" that decision already promised.
- **Consequences:** Route-history queries go through `audit_log` filtered by `EntityType`/
  `EntityKey`, same as any other entity's audit trail — no schema change, no migration.

## 2026-07-17 — M1-core validation subset for spec 005 (rest deferred)
- **Decision:** Spec 005 implements V1/V2 (450-min rule), V3 (geo-scope), V5 (revenue), V6
  (SERVICE-mix cap), V7 (time-window/ban), V9 (mandatory patch expiry), V12 (visit overlap).
  V8 and V16 are deferred without a named successor spec; V10/V11 (task/rule-derived duration)
  wait on the M2 task/rule engine; V13/V15 (travel-time-dependent) wait on the OSRM/geo layer;
  V14 (leave/Onarım workbench) waits on M4.
- **Why:** The deferred rules all depend on modules that don't exist yet (task/rule engine,
  travel-time integration, leave management) — implementing them now would mean stubbing their
  dependencies, not really implementing the rule.
- **Consequences:** `RouteValidator.Evaluate` and the `/publish` endpoint only ever surface this
  subset; `docs/DATABASE.md` and `EVO-Route-Planning-Design.md`'s validation table should be
  read alongside this note so the gap doesn't read as an oversight.

## 2026-07-17 — M1 visit duration = service_minutes fallback, not task-sum (spec 005)
- **Decision:** `PlanGenerationService` resolves each visit's minutes as
  `route_stop.service_minutes ?? store.default_service_minutes ?? settings.default_service_minutes`
  — never `Σ task.duration` from the design's Rules engine, because that engine is M2.
- **Why:** Route/Assignment/scheduling needed to ship in M1 without waiting on Task/Rule/M2; a
  fallback chain lets the pure `DayScheduler`/450-min logic work today with a real, planner-
  editable number.
- **Consequences:** Once M2 lands, `PlanGenerationService`'s minutes-resolution step gets a
  fourth option ahead of the fallbacks (task-sum takes priority when Rules exist for a store);
  no schema change needed on `route_stop` — `service_minutes` still means "planner override".

## 2026-07-17 — Planner UI split out of spec 005; 005 is the M1 backend core only
- **Decision:** Spec 005 ("route-planning-core") delivers Route/RouteStop/Assignment/Patch/
  PlannedVisit entities, the scheduling engine, validation, and the full REST API — but no
  panel UI (map/schedule grid/table, lasso, live health card, simulate). `merchandiser` also
  ships here, correcting `docs/DATABASE.md`'s prior (inaccurate) attribution to 002-auth-roles.
- **Why:** Matches the 001–004 backend-first rhythm this project has followed for every prior
  spec; the drag-heavy planner UI is a large, separately-reviewable unit of work that depends on
  the API surface being stable first.
- **Consequences:** The next M1 spec is the planner UI, built against 005's generated TS client.
  `POST /simulate/route` is deferred to that spec (or a geo-focused one) since it needs the
  panel's what-if interaction model to be meaningful.

## 2026-07-16 — Real EVO sales sync source remains an open customer-IT question (spec 004)
- **Decision:** Spec 004 ships only an `IStoreSyncSource` abstraction + a deterministic
  `FakeStoreSyncSource` for dev/seed/test — no real connector to the EVO sales system (live SQL
  connection, file drop, or API) exists. Same seam pattern as spec 002's `AddEvoAuthentication`
  Entra extension point.
- **Why:** How EVO's backend actually reaches the sales system — which DB/view/API, field→column
  mapping, source auth, full-refresh-vs-incremental — is one of the 9 open customer-IT questions
  from the tech-stack review. Building against a guessed schema now risks a wrong contract.
- **Consequences:** M0 platform foundation is complete with store data flowing entirely from fake
  data. The real source, store-disappearance policy (auto-deactivate vs tombstone vs flag), and
  wall-clock sync scheduling (vs the current configurable interval) all stay open — revisit once
  customer IT answers land. See `specs/004-store-sync/spec.md` Open questions.

## 2026-07-16 — chain modeled as a real lookup entity (deviation from planner recommendation)
- **Decision:** `chain(id, name)` is a real EF entity with `store.chain_id` FK, upserted by sync
  (find-or-create by name). The planner had recommended a denormalized `chain` string column on
  `store` instead, since no chain-management feature exists yet to own a `chain` table.
- **Why (human's call, overriding the recommendation):** chain is foundational structure —
  chain-scoped Rules, map color-coding, and chain filters all appear in the design doc (§2.9/§6.1)
  — not speculative. Modeling it as a real entity from the first synced store avoids a later
  string→FK migration + de-duplication pass once a chain-management feature does land.
- **Consequences:** `chain` ships now with exactly one consumer (store sync) and no
  chain-management UI/API — same shape spec 003's `audit_log` collapse avoided, but here the human
  chose the opposite tradeoff deliberately. `docs/DATABASE.md` documents this as outside design §5.

## 2026-07-16 — Store geography via NetTopologySuite now; no spatial queries until M1
- **Decision:** `store.Location` is a SQL Server `geography` `Point` (SRID 4326) via
  `Microsoft.EntityFrameworkCore.SqlServer.NetTopologySuite`, with a spatial index added via raw
  SQL in the `AddStores` migration (EF Core doesn't emit `CREATE SPATIAL INDEX` automatically).
  No spatial query endpoints (bbox, lasso, in-scope, overlap) exist in spec 004 — the point is
  only written and read back.
- **Why:** Storing the real point now means M1's spatial features (the map, lasso-add, geo-scope
  enforcement) need no data backfill — the PostgreSQL→SQL Server `geography` mapping decided in
  principle in spec 001 gets its first real implementation here.
- **Consequences:** `docs/DATABASE.md`'s PG→SQL Server mapping table now documents the concrete
  realization. `NetTopologySuite` is wired on every `UseSqlServer` call site (Api, Seeder); the
  test suite needed a dedicated database (`EvoDb_StoreSyncTests`) since `FakeStoreSyncSource`'s
  deterministic `EvoStoreId`s would otherwise collide across test runs sharing the dev DB.

## 2026-07-16 — Sync overwrites synced fields, preserves planner-owned fields, never auto-deactivates
- **Decision:** `StoreSyncService` overwrites `Name`, `ChainId`, `Location`, `Channel`,
  `Province`/`District`/`Neighborhood`, `Category`, `Format`, and revenue/flags on every run, but
  never touches `DefaultServiceMinutes` or `Active` (planner-owned). Stores present in the DB but
  absent from a sync batch are left completely untouched — no auto-deactivate, no delete.
- **Why:** Matches the design doc's planner-set vs sync-set field split and the project-wide
  no-delete rule. Guessing a disappearance policy (deactivate? tombstone? flag for review?) without
  knowing whether the real feed is full-refresh or incremental would likely be wrong.
- **Consequences:** `store_revenue` retains only the latest 12 months (older rows pruned each
  sync) — confirm this window still suits the panel's revenue math once M2 needs it. Fixed
  `store_type` taxonomy (codes 1–6, migration-seeded, not admin-editable) — a per-chain taxonomy
  was explicitly reverted in the design doc.

## 2026-07-16 — decision_journal deferred to M1
- **Decision:** The `decision_journal` table (design §11.3/§755 — the "why" behind
  publish-with-errors, repairs, and permanents; distinct from the generic `audit_log`, which
  records the "what") is out of scope for spec 003. It ships with M1 alongside Routes/Patches,
  the first entities it has anything to record decisions about.
- **Why:** Nothing exists yet for a publish-gate override to override — building it now would be
  speculative and likely need rework once Routes/Patches define the real shape of what's overridden.
- **Consequences:** `docs/AUTH.md`/`docs/API.md` do not mention it; flag it explicitly in the M1
  spec's clarifications so it isn't silently dropped.

## 2026-07-16 — Generic append-only audit_log replaces route_change_log/admin_audit_log for now
- **Decision:** Spec 003 built one generic `audit_log` table (`ActorId`, `OccurredAt`,
  `EntityType`, `EntityKey`, `Event`, `BeforeJson`/`AfterJson`) instead of the design doc's two
  separate tables (`route_change_log`, `admin_audit_log`, design §5/§2.7). Write-only via
  `IAuditWriter` (no update/delete). Currently used by `UsersController` and
  `AuthController.change-password`; `route_change_log`/`admin_audit_log` become typed facade
  queries over this same table once Routes/Settings exist.
- **Why:** Neither design-doc table has an owning entity yet (Route, Setting) — building two
  near-identical, mostly-empty tables now would be premature; a single generic table lets
  security-relevant actions (user lifecycle events) get recorded starting today.
- **Alternatives rejected:** two separate physical tables now (structurally identical, no
  consumers yet); event-sourcing/outbox (over-engineered for a single VM, 2 roles); DB triggers
  (invisible, hard to test, can't cleanly capture the acting user).
- **Consequences:** `docs/DATABASE.md` documents this deviation against design §5. No schema
  change expected when Routes/Settings land — just query-layer facades.

## 2026-07-16 — Unified API error shape (AddProblemDetails + IExceptionHandler, stable code, prod hides details)
- **Decision:** Every non-2xx API response uses one shape: `code` (stable English key), `title`/
  `detail` (English, dev-facing), `userTitle`/`userMessage` (Turkish, see the entry below),
  `status`, `traceId`, no RFC 7807 `instance`, `errors={field:[msg]}` on validation failures.
  Built entirely on ASP.NET Core's built-in pipeline: `AddProblemDetails(CustomizeProblemDetails)`
  normalizes every framework-generated ProblemDetails; a domain-exception taxonomy
  (`EvoException` → `NotFoundException` 404, `ConflictException` 409, `EvoValidationException`
  422) is mapped by an `IExceptionHandler`; a custom `InvalidModelStateResponseFactory` renders
  model-binding failures (400) in the same shape. Unhandled exceptions never leak
  message/stack outside `Development`. Spec 002's `AuthController`/`UsersController` are
  retrofitted onto this shape in the same spec (003).
- **Why:** No hand-rolled middleware needed — the built-in customization hooks cover every case
  (auth short-circuits, model-binding, thrown exceptions) without duplicating framework
  machinery. `EvoValidationException` (422) vs model-binding (400) — same `code`, different
  status — distinguishes "well-formed but violates a domain rule" from "malformed request."
- **Consequences:** `docs/API.md` documents the shape; `docs/AUTH.md`'s formerly-interim shape
  section now points here. The 15 pre-existing spec 001/002 tests needed exactly one assertion
  updated (change-password wrong-current-password: 400→422) — everything else asserted
  content-type/status only, not shape internals, confirming the retrofit was low-risk as planned.

## 2026-07-16 — Error responses carry Turkish userTitle/userMessage from an in-code catalog, not a DB table
- **Decision:** The unified error shape (spec 003) gained `userTitle`/`userMessage` fields
  (Turkish, user-facing) alongside the existing `title`/`detail` (English, developer-facing).
  These are resolved from `Evo.Domain.Errors.UserErrorMessages` — a static in-code dictionary
  keyed by the stable `code`, with a generic fallback for unmapped codes — attached to every
  error response via `EvoProblemDetails.Finalize`. The panel displays `userMessage` directly and
  maintains no translation map of its own.
- **Why:** Raised mid-implementation (after the spec 003 Phase 1 checkpoint) — the human wants
  user-facing error text manageable "from the backend" without a database round-trip on every
  error response (explicitly rejected: "no db is bad, for every error we connect to db"). An
  in-code catalog is standard practice (Stripe/GitHub-style): error text is part of the API
  contract, deploy-reviewed like any other code change, and doesn't add a DB dependency to the
  failure path — important since the DB itself may be why a request failed.
- **Alternatives rejected:** a DB-backed `error_message` table (runtime-editable, but couples the
  error path to the database and needs a lookup/cache layer); repurposing `title`/`detail` as the
  user-facing fields (would have required reworking the already-committed Phase 1 error-shape
  work; additive fields kept that work intact).
- **Consequences:** Phase 4 (panel) simplified — the originally-planned client-side Turkish
  `code`→message map (`panel/src/api/errorMessages.ts`) is dropped; the panel's `ApiError` parser
  just surfaces the backend-provided `userMessage`. Every new `ErrorCodes` entry going forward
  needs a matching `UserErrorMessages` catalog entry (falls back to a generic Turkish message
  otherwise, so nothing breaks if forgotten — but the UX degrades to generic text).

## 2026-07-16 — Local ASP.NET Identity now; AD/Entra as an extension seam; JWT + rotating refresh
- **Decision:** Spec 002 implements local ASP.NET Identity auth (JWT bearer access token in
  panel memory, rotating refresh token in an httpOnly cookie) as the must-have baseline. AD/Entra
  SSO gets a documented extension seam (`AddEvoAuthentication` in
  `backend/src/Evo.Api/Auth/AuthenticationExtensions.cs`) — zero real Entra/OIDC code. Auth
  errors use ASP.NET Core's built-in `ProblemDetails` as an interim shape; spec 003 (error-audit)
  will unify it project-wide — this is a known, accepted cross-spec dependency, not a silent gap.
- **Why:** Whether the customer wants AD/Entra is one of the 9 open customer-IT questions;
  building it now risks throwaway work. Local Identity unblocks everything downstream (roles,
  authorization, seeded test accounts) without waiting on that answer.
- **Alternatives rejected:** Building a working Entra OIDC flow now (premature — no customer
  confirmation); third-party IdP/IdentityServer (overkill for 2 roles on a single VM);
  cookie-only session auth (bearer semantics are reusable by the deferred mobile app later).
- **Consequences:** See `docs/AUTH.md` for the full token model, endpoint list, and the
  step-by-step Entra plug-in guide. Field agents have no account-creation API — seeder-only,
  since mobile is deferred (consistent with the mobile-deferred decision below). The committed
  dev JWT signing key (`JwtSettings.WellKnownDevSigningKey`) follows the same "commit a
  clearly-labeled, code-enforced dev-only secret" pattern already used for the dev SQL Server
  password (spec 001) — `Program.cs` refuses to start with that value outside `Development`.

## 2026-07-15 — MinIO remapped to host ports 9010/9011
- **Decision:** `docker-compose.dev.yml` maps MinIO to host ports 9010 (API) / 9011 (console) instead of the default 9000/9001.
- **Why:** Ports 9000/9001 were already bound by another local project's container on the dev machine.
- **Consequences:** Local-only; document actual ports in `docker-compose.dev.yml` comments and README. No effect on deployed environments.

## 2026-07-15 — Panel pins TypeScript ~5.9, uses eslint+prettier (not the Vite template defaults)
- **Decision:** `npm create vite@latest -- --template react-ts` (current version) scaffolds `oxlint` and a TypeScript 6.0.x pre-release. Replaced with eslint (flat config) + prettier per CLAUDE.md conventions, and pinned `typescript` to `^5.9` (stable).
- **Why:** `openapi-typescript`'s peer dependency requires `typescript ^5.x`; TS 6.0.x isn't out of preview and broke `npm install`. eslint+prettier is the CLAUDE.md-mandated toolchain.
- **Consequences:** Revisit the TS pin when 6.x stabilizes and `openapi-typescript` supports it.

## 2026-07-15 — Swashbuckle for OpenAPI generation (not NSwag)
- **Decision:** `Swashbuckle.AspNetCore` (+ `Swashbuckle.AspNetCore.Cli` as a local dotnet tool) generates the OpenAPI doc. A post-build MSBuild target (`GenerateOpenApiDoc` in `Evo.Api.csproj`, Debug config only) runs `dotnet tool run swagger tofile` to emit `contracts/openapi.json` on every build. Replaced ASP.NET Core's built-in `Microsoft.AspNetCore.OpenApi`/`AddOpenApi()` (which was in the webapi template) since it duplicates Swashbuckle's job.
- **Why:** Most common ASP.NET Core OpenAPI generator, broad tooling support, plays cleanly with `openapi-typescript` on the panel side (Task 9) rather than coupling client generation to NSwag's own templates.
- **Alternatives rejected:** NSwag — can generate the TS client directly, but heavier toolchain and less flexible for this project's controller-based API.
- **Consequences:** `contracts/openapi.json` is regenerated by `dotnet build backend/Evo.sln`; CI (Task 14) must include a drift check (regenerate, fail if `git diff` isn't empty).

## 2026-07-15 — Backend targets .NET 10 SDK, not .NET 8, for spec 001 scaffold
- **Decision:** Only .NET 10 SDK (10.0.302) was available on the dev machine; scaffolded `backend/` targets .NET 10, pinned via `backend/global.json`, instead of the .NET 8 named in the tech-stack Rev. 2 decision above.
- **Why:** Installing .NET 8 side-by-side required an interactive sudo install the human deferred; unblocking spec 001 was prioritized over exact version match.
- **Alternatives rejected:** Blocking spec 001 until .NET 8 is installed.
- **Consequences:** Revisit before production/customer deployment — confirm which .NET version the customer's IT actually supports (see 9 open customer-IT questions) and retarget if needed. Nothing in spec 001's scope (health endpoint, EF Core wiring) is .NET-8-specific.

<!-- Append-only. Never delete entries. Newest first.
     NOTE: the design doc §10 "Decided" table is the authoritative log of ~40 product/UX
     decisions (roles, grid style, patch model, no-delete lifecycle, publish gate, table mode…).
     This file records BUILD decisions made after design v0.5. Never contradict §10 silently. -->

## 2026-07-15 — Mobile app deferred; field behavior seeded/mocked; direct-to-DB seeder
- **Decision:** No React Native app in current scope. Field-agent behavior (check-ins, visit outcomes, task results, notes) is produced by the `Evo.Seeder` console app writing realistic fake data directly to the DB (Bogus, Turkish locale, `demo`/`scale` profiles); agent-facing API responses are mocked where the panel needs live interaction. Every spec that adds tables extends the seeder in the same spec.
- **Why:** Focus the build on the planner panel — the product's core; the mobile surface is read-only and can be simulated cheaply.
- **Alternatives rejected:** Building mobile in parallel (splits focus, needs device testing); API-level fixtures only (doesn't exercise real DB constraints/queries the way seeded rows do).
- **Consequences:** Planned-vs-realized, analytics, and Onarım develop against seeded outcomes; mobile revived from backlog later — its API contract already exists in docs/API.md so nothing blocks it.

## 2026-07-15 — SQL Server replaces PostgreSQL/PostGIS from the design doc
- **Decision:** Database is SQL Server (tech stack Rev. 2, customer standard). Design doc §5 was written assuming PostgreSQL + PostGIS + JSONB.
- **Why:** Customer corporate standard; their team maintains it (EVO-Teknoloji-Yigini.pdf).
- **Alternatives rejected:** PostgreSQL — technically preferred (PostGIS, JSONB, partial indexes) but conflicts with customer ops.
- **Consequences:** §5 schema must be adapted in spec 003/later: `geography` → SQL Server geography type; `jsonb` → JSON in nvarchar(max) + `ISJSON` checks (GIN index on rule.condition needs a computed-column strategy); partial unique indexes → filtered unique indexes (supported); `text[]` districts → JSON or child table. Flag any §5 feature that doesn't map cleanly.

## 2026-07-15 — Tech stack Rev. 2 adopted (see EVO-Teknoloji-Yigini.pdf)
- **Decision:** .NET 8 (ASP.NET Core Web API + EF Core), React+TS panel, React Native (Expo) Android app, OpenAPI contract-first with generated TS clients, MinIO photos, OSRM travel times, FCM notifications, ASP.NET Identity (+AD/Entra option), Docker or IIS deployment.
- **Why:** Customer ecosystem alignment (backend/DB); most mature ecosystems for the drag-heavy panel (React) and offline sync (React Native/WatermelonDB).
- **Alternatives rejected:** Blazor Server (latency on drag interactions), Blazor WASM (weak library ecosystem), MAUI (immature offline sync/photo upload libraries).
- **Consequences:** Clients never hand-write API types; single VM scale ceiling accepted (~75k visits/day — no microservices); 9 customer-IT questions still open and may adjust deployment/identity details.

## 2026-07-15 — AI engineering OS installed; process rules in CLAUDE.md
- **Decision:** Spec-driven build with platform specs first (001-scaffold → 002-auth → 003-error-audit → 004-store-sync), linear (no parallel sessions), checkpoints every phase.
- **Why:** Cross-cutting layers must exist before 10+ modules reference them; solo developer learning the workflow.
- **Consequences:** No module work until M0 complete.
