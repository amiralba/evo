# Spec: Store Sync (Store Master Data Ingestion)   (slug: 004-store-sync)

## Problem & goal
Every feature module downstream (routes, the map/pool, task resolution, revenue health) is anchored on
**stores** — but no store data exists in the system yet. Stores are not authored inside EVO; they are
**master data owned by an external EVO sales system** and must be *ingested*, not hand-entered. This is
the fourth and final M0 platform spec: it lands the store data model and a repeatable, idempotent
**sync pipeline** that pulls store master data (identity, chain, location, format, category, monthly
revenue, ban flags) into SQL Server, so M1 (routes/map/pool) and M2 (tasks/rules) have real stores to
build on.

The real upstream source is still an **open customer-IT question** (which EVO DB/view/API, field
mapping, auth, incremental-vs-full). So 004 ships the sync as an **abstraction** (`IStoreSyncSource`)
with a deterministic `FakeStoreSyncSource` for dev/seed/test and a documented extension seam — the
same "build the seam now, wire the real thing when customer-IT answers land" pattern spec 002 used for
AD/Entra. 004 also deliberately builds **only the data + ingestion + minimal read surface**: it
populates every synced table (including `store_revenue` and BANNED `store_flag`s) but builds **no
consuming logic** — visit-blocking, route-health, spatial lasso/overlap queries, and task resolution
are all M1/M2's job.

Success = the store schema (with a real `chain` lookup, a fixed `store_type` format taxonomy, and a
SQL Server `geography` point) is migrated; an idempotent sync service upserts stores/chains/revenue/
flags from `IStoreSyncSource` (overwriting synced fields, never touching planner-owned fields, never
auto-deactivating stores that vanish from a feed); a Supervisor can trigger a sync via an
audit-logged `POST /api/v1/stores/sync` that returns a run summary; a nightly `BackgroundService`
runs the same service on a timer; a Supervisor can page/filter stores via `GET /api/v1/stores` and
read one store (with revenue snapshots + flags) via `GET /api/v1/stores/{id}`; the demo seeder
populates stores by running a **real sync** against the fake source; and the backend suite stays green.

## Brainstorm results
- **Chosen approach (source):** an `IStoreSyncSource` abstraction returning a batch of source records +
  a `FakeStoreSyncSource` (Bogus, Turkish, **deterministic** — stable `evo_store_id`s across runs so
  upsert stays idempotent) used by dev/seed/test. A clearly-commented extension seam documents how the
  real EVO source plugs in. *(Rejected: hand-coding directly against a presumed EVO schema now — the
  source is an open customer-IT question; guessing the schema wastes work and risks a wrong contract.)*
- **Chosen approach (seed):** the seeder **triggers a real sync run** through the actual
  ingestion/upsert service against `FakeStoreSyncSource` — it does NOT insert store rows directly. This
  exercises the real code path on every demo seed and keeps one write path for stores. *(Rejected:
  seeder writing store rows straight to the DbSet — would leave the ingestion path untested by seeding
  and create a second, divergent way to create stores.)*
- **Chosen approach (geo):** SQL Server `geography` `Point` (SRID 4326) via **NetTopologySuite** +
  spatial index, populated now from source lat/lng — but **no spatial query endpoints** in 004 (bbox,
  lasso, in-scope, overlap all defer to M1). Storing the point now means M1's spatial features need no
  data backfill. *(Rejected: storing bare lat/lng doubles now — would force a migration + backfill when
  M1 needs real spatial predicates.)*
- **Chosen approach (format taxonomy):** a fixed, migration-seeded `store_type(code, label)` lookup
  (codes 1–6 = Jet/M/MM/3M/4M/5M, applied globally to all chains per design §5 v0.3 decision);
  `store.format` is a `tinyint` FK to it, **not admin-editable**. *(Rejected: per-chain format taxonomy
  — explicitly reverted in the design doc; rejected: a free `smallint` with no lookup — loses the
  human-readable labels the panel needs.)*
- **Chosen approach (chain) — ADJUSTED from recommendation, see Clarification #9:** a **real `chain`
  lookup table** (`id`, `name`) with `store.chain_id` FK, upserted by sync — NOT a denormalized
  `chain` string column. Built properly now even though no chain-management feature owns it yet.
- **Chosen approach (triggers):** BOTH an on-demand Supervisor-only `POST /api/v1/stores/sync`
  (audit-logged via spec 003's `IAuditWriter`, returns a run summary) AND a nightly `BackgroundService`
  timer calling the same underlying `IStoreSyncService`. One service, two entry points.
- **Chosen approach (field ownership):** sync **overwrites** synced fields (name, chain, location,
  channel, category, format, revenue, flags) every run; **never touches** planner-owned
  `default_service_minutes` or the operational `active` toggle; stores absent from a feed are **left
  untouched** (no auto-deactivate — disappearance policy deferred).
- **Later (out of 004 / M1–M2 scope):** spatial query endpoints (bbox / unassigned-in-scope / lasso /
  overlap) and the map layer (M1); visit-blocking from BANNED flags and `time_window`/`banned_until`
  validation (M1); route-health / revenue-target / category-mix calculations (M2); task resolution from
  `format` via Rules (M2); the store detail panel + pool UI (M1); planner store mutations (edit
  `default_service_minutes`, activate/deactivate) (M1); the store-disappearance / tombstone policy;
  incremental (delta) sync; the real `IStoreSyncSource` implementation (blocked on customer-IT).

## User stories
- As a Supervisor, I can trigger a store sync on demand and see a summary (how many stores/chains
  created vs updated, revenue rows, flags), so I can refresh master data without waiting for the night.
- As the system, I sync stores automatically every night so the pool/map/routes always reflect current
  master data without anyone remembering to run it.
- As a planner (future M1 consumer), when a store's format or revenue changes upstream it is overwritten
  on the next sync, but the service minutes and active/inactive state *I* set are never clobbered.
- As a Supervisor, I can page and filter stores by province/district/active/format and open one store to
  see its recent revenue and any ban flags, so I can inspect what synced.
- As the developer, I can wire the real EVO source later by implementing `IStoreSyncSource` behind a
  documented seam, without touching the ingestion, endpoints, or schema.

## Acceptance criteria (testable)
### Data foundation
- [ ] NetTopologySuite is enabled on every `UseSqlServer(...)` call site (Api, Seeder, tests) via
      `x => x.UseNetTopologySuite()`; `geography` columns map to `NetTopologySuite.Geometries.Point`.
- [ ] `store_type` lookup entity (`Code tinyint PK`, `Label string`) is **migration-seeded** (EF
      `HasData`) with exactly codes 1–6 = `Jet`, `M`, `MM`, `3M`, `4M`, `5M`; present in both seed
      profiles; not writable by any endpoint.
- [ ] `chain` lookup entity (`Id Guid PK`, `Name string`, unique index on `Name`) exists;
      `store.chain_id` is a FK to it (nullable — a store may sync before its chain is known, but sync
      always resolves/creates the chain first).
- [ ] `store` entity: `Id Guid PK`, `EvoStoreId string UNIQUE`, `Name`, `ChainId Guid? FK`, `Channel
      string?`, `Province`, `District`, `Neighborhood string?`, `Location geography Point (SRID 4326,
      spatial index)`, `Category tinyint (StoreCategory: Potential/HighValue/Service)`, `Format tinyint
      FK→store_type.Code`, `DefaultServiceMinutes int? (planner-owned)`, `Active bool DEFAULT true
      (operational, planner-owned)`, `AttributesJson nvarchar(max)?`, `SyncedAt DateTimeOffset`. Indexes:
      unique on `EvoStoreId`, btree on `(Province, District)`, spatial on `Location`.
- [ ] `store_revenue` entity: composite PK `(StoreId, Month)`, `Revenue decimal(18,2)`; only the most
      recent **12 months** per store are retained (older rows pruned on sync).
- [ ] `store_flag` entity: `Id Guid PK`, `StoreId Guid FK`, `Type tinyint (StoreFlagType:
      Banned/ClosedTemp)`, `Reason string?`, `StartsOn DateOnly`, `EndsOn DateOnly?`, `CreatedBy
      string?`; index on `StoreId`.
- [ ] Migration `AddStores` creates all of the above (with the `store_type` `HasData` seed and the
      spatial index) and applies cleanly to the compose SQL Server.

### Sync source + ingestion service
- [ ] `IStoreSyncSource.FetchAsync(ct)` returns a batch of immutable source records
      (`StoreSyncRecord` with `EvoStoreId`, `Name`, `ChainName`, `Channel`, `Province`, `District`,
      `Neighborhood`, `Latitude`, `Longitude`, `Category`, `Format`, and nested revenue/flag records);
      the interface carries a documented **extension seam** comment for the real EVO source.
- [ ] `FakeStoreSyncSource` produces **deterministic** Turkish fake stores (fixed Bogus seed → stable
      `EvoStoreId`s like `EVO-00001…`, so re-running sync updates the same rows, never duplicates);
      store count is a constructor parameter (small for demo, large for scale).
- [ ] `IStoreSyncService.RunAsync(ct)` pulls from `IStoreSyncSource` and, in one pass: upserts chains by
      `Name` (create-if-missing); upserts stores by `EvoStoreId` — **overwriting** name, chain, location,
      channel, province/district/neighborhood, category, format, and `SyncedAt`, while **preserving**
      `DefaultServiceMinutes` and `Active` on existing rows; upserts `store_revenue` by `(StoreId,
      Month)` and prunes to the latest 12 months; replaces the store's `store_flag`s from the feed.
      Stores present in the DB but **absent** from the batch are left completely untouched (no
      deactivate, no delete).
- [ ] `RunAsync` returns a `StoreSyncRunSummary` (`StartedAt`, `DurationMs`, `ChainsCreated`,
      `StoresCreated`, `StoresUpdated`, `RevenueRowsUpserted`, `FlagsUpserted`).
- [ ] A backend test proves: (a) first run creates N stores; (b) a second run with a changed name +
      revenue updates the same store (count stable) and overwrites those fields; (c) a store whose row
      had `DefaultServiceMinutes` and `Active=false` set keeps both after a sync that changes its synced
      fields; (d) revenue retention caps at 12 months; (e) a store removed from the batch is **not**
      deactivated.

### Triggers
- [ ] `POST /api/v1/stores/sync` — `[Authorize(Roles = Supervisor)]` — runs `IStoreSyncService.RunAsync`,
      writes an audit row via `IAuditWriter` (`entityType="StoreSync"`, `event="run"`, `after` = the run
      summary), and returns the `StoreSyncRunSummary`. A Field agent → 403; unauthenticated → 401 (both
      in the spec-003 unified error shape).
- [ ] A `StoreSyncBackgroundService : BackgroundService` runs the same `IStoreSyncService` on a nightly
      timer (interval configurable via `appsettings` `StoreSync:IntervalHours`, default 24; resolves the
      scoped service in its own DI scope; failures are logged and do not crash the host).

### Read endpoints
- [ ] `GET /api/v1/stores?province=&district=&active=&format=&page=&pageSize=` — `[Authorize]` — returns
      a `PagedResult<StoreSummaryDto>` filtered by any supplied filter, newest-`SyncedAt` first,
      `pageSize` capped at 200.
- [ ] `GET /api/v1/stores/{id}` — `[Authorize]` — returns a `StoreDetailDto` including the store's
      revenue snapshots and flags; unknown id → 404 in the unified error shape.
- [ ] **No** map/spatial/bbox/unassigned/summary/task-plan endpoints are added (all deferred to M1/M2).

### Seed + integration + docs
- [ ] `StoreSyncSeederModule` seeds stores by calling `IStoreSyncService.RunAsync` against
      `FakeStoreSyncSource` (demo = small readable count; scale = large count) — **not** by inserting
      store rows directly; idempotent (re-running the seed updates the same stores, count stable). The
      seeder's DI is wired with `IStoreSyncSource` + `IStoreSyncService` + `UseNetTopologySuite`.
- [ ] `contracts/openapi.json` regenerated to include `/api/v1/stores`, `/api/v1/stores/{id}`, and
      `/api/v1/stores/sync`; the panel TS client regenerated (grep finds the `stores` operations). **No
      panel store UI is built in 004.**
- [ ] Docs updated: `docs/DATABASE.md` (schema-status flips `store, store_revenue, store_flag,
      store_type` → migrated; add a `chain` row; document the SQL Server geography/NetTopologySuite
      adaptation); `docs/ARCHITECTURE.md` (mark the Store Sync worker COMPLETE and note the on-demand +
      nightly dual trigger); `docs/API.md` (add the three store endpoints); `docs/DECISIONS.md`
      (records: chain-as-real-entity **deviation from planner recommendation**; geography via
      NetTopologySuite now / no spatial endpoints yet; fixed `store_type` taxonomy; sync overwrite vs
      planner-owned field split + no-auto-deactivate; sync source remains an open customer-IT question).
- [ ] The full backend suite (`dotnet test backend/Evo.sln`) is green — prior spec 001/002/003 tests
      plus the new 004 tests.

## Clarifications
<!-- Answers provided by the human before planning. #9 was ADJUSTED from the planner recommendation. -->
| # | Question | Answer |
|---|---|---|
| 1 | Sync source approach? | `IStoreSyncSource` abstraction + `FakeStoreSyncSource` (dev/seed/test) + a documented extension seam for the real source. The real source stays an open customer-IT question after 004 ships. *(recommended default — confirmed)* |
| 2 | How does the seeder create stores? | The seeder triggers a **real sync run** through the actual ingestion/upsert code (against `FakeStoreSyncSource`) rather than writing store rows directly — exercises the real path, single write path. *(confirmed)* |
| 3 | Geo storage? | SQL Server `geography` `Point` (SRID 4326) via NetTopologySuite + spatial index now, populated from source lat/lng, but **no spatial query endpoints** in 004 (M1's job). *(confirmed)* |
| 4 | Format taxonomy? | Fixed, migration-seeded `store_type(code, label)` lookup, codes 1–6; `store.format` references it as `tinyint`; not admin-editable. *(confirmed)* |
| 5 | Sync triggers? | BOTH a Supervisor-only `POST /api/v1/stores/sync` (audit-logged via spec 003's `IAuditWriter`, returns a run summary) AND a nightly `BackgroundService` timer calling the same underlying service. *(confirmed)* |
| 6 | Read endpoints? | Minimal — `GET /api/v1/stores` (paged; filters province/district/active/format) and `GET /api/v1/stores/{id}` (with revenue snapshots + flags). Everything map/route/task-dependent (bbox, unassigned, summary, task-plan) defers to M1/M2. *(confirmed)* |
| 7 | `store_flag` (BANNED) + `store_revenue`? | Sync and populate both tables now, but build **no consuming logic** (no visit-blocking, no route-health calcs) — that's M1/M2's job. *(confirmed)* |
| 8 | Field ownership split? | Sync overwrites synced fields (name, chain, location, channel, category, format, revenue, flags) every run; **never** touches planner-owned `default_service_minutes` or the operational `active` toggle; stores missing from a feed are left untouched (no auto-deactivate; disappearance policy deferred). *(confirmed)* |
| 9 | Chain modeling? | **ADJUSTED — differs from the planner's recommendation.** Planner recommended a denormalized `chain` string column (no owning feature exists yet, so a lookup table looked speculative). The human overrode this: build a **real `chain(id, name)` lookup table with `store.chain_id` FK now**, done properly. Rationale: chain is treated as *foundational* structure (chain-level Rules, chain color-coding on the map, chain filters all appear in the design §2.9/§6.1), not speculative — modeling it as a real entity from the first store row avoids a later string→FK migration and de-dupe. |
| 10 | KVKK handling? | None needed — store master data (name, address, revenue) is **business data, not personal data** (KVKK). Note it in the spec; revisit only if a future feed carries store-manager personal contact fields. *(confirmed)* |

## Non-goals
- No spatial query endpoints (bbox, in-scope, unassigned, lasso, overlap, home-to-route distance) and no
  map layer — the `geography` point is stored but only *read back*, never queried spatially (M1).
- No consuming logic on synced data: no BANNED/`time_window` visit-blocking, no route-health /
  revenue-target / category-mix / minutes calculations, no task resolution from `format` (M1/M2).
- No planner store-mutation surface: no endpoint to edit `default_service_minutes` or to
  activate/deactivate a store (M1); no store create/delete API ever (no delete anywhere — active toggle
  only, and even that toggle is M1).
- No chain-management feature/UI (the `chain` table is populated by sync only in 004).
- No panel store UI (list page, detail panel, pool) — read endpoints + regenerated client only.
- No incremental/delta sync, no store-disappearance / tombstone policy, no cross-source conflict merge.
- No real `IStoreSyncSource` implementation (seam + `FakeStoreSyncSource` only — blocked on customer-IT).
- No KVKK-specific handling — store master data is business data (Clarification #10).

## Open questions
- **The real sync source is a GENUINELY OPEN customer-IT question even after 004 ships.** 004 delivers
  only the `IStoreSyncSource` seam + `FakeStoreSyncSource`. The real implementation (which EVO DB / view
  / API endpoint, exact field→column mapping, auth to the source, full-refresh vs incremental/delta,
  how chain identity is expressed upstream, the true nightly window) is blocked on the same customer-IT
  answers that block AD/Entra (spec 002). Flag at review; the seam is designed to absorb it with no
  schema/endpoint change.
- **Store-disappearance policy is deferred.** 004 leaves stores absent from a feed untouched. Whether a
  vanished store should auto-deactivate, tombstone, or flag for planner review needs a product decision
  (and depends on whether the real feed is full-refresh or delta) — revisit with the real source.
- **Revenue retention = latest 12 months** (per design §5). Confirm this is the right window for the
  panel's 6-month sparkline + 6-month revenue-target math (M2) before the real source lands.
- **Nightly schedule.** 004 uses a configurable interval (`StoreSync:IntervalHours`, default 24) rather
  than a wall-clock cron time, to avoid a scheduling dependency in M0. If the customer needs a specific
  wall-clock window (e.g. 03:00 after the upstream EVO batch), revisit when the real source is wired.
