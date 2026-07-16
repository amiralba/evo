# Tasks: Store Sync (004-store-sync)

<!-- Each task ≈ 2–5 min, zero-context executable. Verify before checking off (rule 3d).
     STOP at each phase end: summarize, commit, wait for human.
     Backend paths follow docs/ARCHITECTURE.md (backend targets .NET 10). Dev SQL Server is the
     docker-compose.dev.yml container from spec 001 (connection string name: EvoDb).
     Store entities follow the existing AuditLogEntry/ApplicationUser placement convention:
     entities live in Evo.Infrastructure/Stores/, not Evo.Domain (matches AuditLogEntry in
     Evo.Infrastructure/Audit/). Enums referenced by DTOs live there too — Evo.Api already
     references Evo.Infrastructure.
     Cross-spec deps: writes audit rows via spec 003's Evo.Api.Audit.IAuditWriter; reuses spec 003's
     PagedResult<T> (Evo.Api.Audit.Dtos.PagedResult) and the unified error shape; supervisor role
     constant is Evo.Domain.Auth.Roles.Supervisor (spec 002). -->

## Phase 1 — Store data foundation

## Task 1: Add NetTopologySuite EF package
- Files: `backend/src/Evo.Infrastructure/Evo.Infrastructure.csproj`
- Do: add `<PackageReference Include="Microsoft.EntityFrameworkCore.SqlServer.NetTopologySuite" Version="10.0.10" />` (match the existing `10.0.10` EF package versions in this csproj). This transitively brings in `NetTopologySuite`.
- Verify: `dotnet restore backend/Evo.sln` succeeds; the package ref appears in the csproj.
- Status: [x]

## Task 2: Enable NetTopologySuite on every UseSqlServer call site
- Files: `backend/src/Evo.Api/Program.cs`, `backend/src/Evo.Seeder/Program.cs`
- Do: in each `UseSqlServer(<connString>)` call, add the options lambda `x => x.UseNetTopologySuite()` (i.e. `UseSqlServer(cs, x => x.UseNetTopologySuite())`). Leave the test factory for Task 8's migration/Task 15's tests — those will reuse the Api registration through `WebApplicationFactory`, so no change needed there beyond confirming they run against the compose SQL. Do NOT change connection strings.
- Verify: `dotnet build backend/Evo.sln` succeeds; `grep -r UseNetTopologySuite backend/src` shows both Program.cs files.
- Status: [x]

## Task 3: Store enums + StoreType lookup entity
- Files: `backend/src/Evo.Infrastructure/Stores/StoreCategory.cs`, `backend/src/Evo.Infrastructure/Stores/StoreFlagType.cs`, `backend/src/Evo.Infrastructure/Stores/StoreType.cs`
- Do: `public enum StoreCategory : byte { Potential = 1, HighValue = 2, Service = 3 }` (design §5 `category enum`). `public enum StoreFlagType : byte { Banned = 1, ClosedTemp = 2 }` (design §5 `store_flag.type`). `StoreType` entity: `public byte Code { get; set; }` (PK), `public string Label { get; set; } = "";` — the fixed format taxonomy lookup (Jet/M/MM/3M/4M/5M), seeded in Task 7. XML doc: not admin-editable (spec Clarification #4).
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 4: Chain lookup entity
- Files: `backend/src/Evo.Infrastructure/Stores/Chain.cs`
- Do: entity `public Guid Id { get; set; }` (PK), `public string Name { get; set; } = "";`. XML doc comment: real chain lookup (spec Clarification #9 — adjusted from the recommended denormalized string column; chain is foundational for chain-scoped Rules / map color-coding / filters). Upserted by sync (Task 13); no chain-management feature owns it yet.
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 5: Store entity
- Files: `backend/src/Evo.Infrastructure/Stores/Store.cs`
- Do: entity with `Guid Id` (PK); `string EvoStoreId` (unique upstream key); `string Name`; `Guid? ChainId` (FK→Chain); `string? Channel`; `string Province`; `string District`; `string? Neighborhood`; `NetTopologySuite.Geometries.Point? Location` (SRID 4326); `StoreCategory Category`; `byte Format` (FK→StoreType.Code); `int? DefaultServiceMinutes` (planner-owned — sync never sets); `bool Active` (default true — planner-owned operational toggle, sync never sets); `string? AttributesJson`; `DateTimeOffset SyncedAt`. XML doc on `DefaultServiceMinutes` + `Active`: "planner-owned — never overwritten by sync (spec Clarification #8)".
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 6: StoreRevenue + StoreFlag entities
- Files: `backend/src/Evo.Infrastructure/Stores/StoreRevenue.cs`, `backend/src/Evo.Infrastructure/Stores/StoreFlag.cs`
- Do: `StoreRevenue`: `Guid StoreId`, `DateOnly Month` (composite PK configured in Task 7 — store the first of the month), `decimal Revenue`. `StoreFlag`: `Guid Id` (PK), `Guid StoreId` (FK), `StoreFlagType Type`, `string? Reason`, `DateOnly StartsOn`, `DateOnly? EndsOn`, `string? CreatedBy`. Both append/replace-managed by sync (Task 13); no consuming logic in 004 (spec Clarification #7).
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 7: EF config + DbSets + store_type seed on EvoDbContext
- Files: `backend/src/Evo.Infrastructure/EvoDbContext.cs`
- Do: add DbSets `Stores`, `Chains`, `StoreTypes`, `StoreRevenues`, `StoreFlags` (all `=> Set<T>()`). In `OnModelCreating` (after existing config): configure `StoreType` PK = `Code`, `Label` max length 20, and `HasData` seed exactly `{1,"Jet"},{2,"M"},{3,"MM"},{4,"3M"},{5,"4M"},{6,"5M"}`. `Chain`: `Name` max length 200, unique index on `Name`. `Store`: unique index on `EvoStoreId`; composite index on `(Province, District)`; `Location` configured `HasColumnType("geography")`; string max lengths (`Name` 200, `Province`/`District` 100, `Neighborhood` 150, `Channel` 100, `EvoStoreId` 50); `AttributesJson` `nvarchar(max)`; FK `ChainId → Chain` (no cascade delete), FK `Format → StoreType.Code`. `StoreRevenue`: composite key `(StoreId, Month)`, `Revenue` `decimal(18,2)`. `StoreFlag`: index on `StoreId`. (Spatial index is created in the migration, Task 8.)
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 8: EF migration AddStores
- Files: `backend/src/Evo.Infrastructure/Migrations/` (generated)
- Do: `dotnet ef migrations add AddStores -p backend/src/Evo.Infrastructure -s backend/src/Evo.Api`. Then, in the generated migration, ensure a **spatial index** on `Store.Location` exists — if EF did not emit one, add `migrationBuilder.Sql("CREATE SPATIAL INDEX IX_stores_location ON stores(location);")` in `Up()` (and the matching `DROP` in `Down()`), using the actual generated table/column names.
- Verify: the migration file exists; its `Up()` creates the `store_type` (with 6 seed rows via `InsertData`), `chain`, `store`, `store_revenue`, `store_flag` tables; a spatial index on the location column is present.
- Status: [x]

**PHASE 1 CHECKPOINT — HARD STOP (rule 3d): summarize + evidence (build output, migration file with the 6 store_type seed rows + spatial index), commit `feat(004): store schema + chain/store_type lookups + geography`, numbered questions, then say 'CHECKPOINT — waiting for your go' and END TURN.**

## Phase 2 — Sync source abstraction + ingestion service

## Task 9: Sync source record DTOs
- Files: `backend/src/Evo.Infrastructure/Stores/Sync/StoreSyncRecord.cs`
- Do: in one file, immutable `record` types the source returns: `StoreSyncRevenueRecord(DateOnly Month, decimal Revenue)`; `StoreSyncFlagRecord(StoreFlagType Type, string? Reason, DateOnly StartsOn, DateOnly? EndsOn)`; `StoreSyncRecord(string EvoStoreId, string Name, string? ChainName, string? Channel, string Province, string District, string? Neighborhood, double Latitude, double Longitude, StoreCategory Category, byte Format, IReadOnlyList<StoreSyncRevenueRecord> Revenue, IReadOnlyList<StoreSyncFlagRecord> Flags)`. These are the source-shaped inputs (lat/lng doubles — the service builds the `Point`), decoupled from the `Store` entity.
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 10: IStoreSyncSource interface + extension seam
- Files: `backend/src/Evo.Infrastructure/Stores/Sync/IStoreSyncSource.cs`
- Do: `public interface IStoreSyncSource { Task<IReadOnlyList<StoreSyncRecord>> FetchAsync(CancellationToken ct = default); }`. Add a clearly-marked `// EXTENSION SEAM:` XML/inline doc block explaining the real EVO source (SQL view / API against the EVO sales DB) implements this interface and is registered in place of `FakeStoreSyncSource`; note it is **blocked on the open customer-IT questions** (field→column mapping, source auth, full-vs-incremental) — same pattern as spec 002's `AddEvoAuthentication` Entra seam.
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 11: FakeStoreSyncSource (deterministic Turkish fake)
- Files: `backend/src/Evo.Infrastructure/Stores/Sync/FakeStoreSyncSource.cs`
- Do: `FakeStoreSyncSource : IStoreSyncSource`. Ctor takes `int storeCount`. `FetchAsync` builds `storeCount` `StoreSyncRecord`s with a **fixed Bogus seed** (`new Faker("tr") { Random = new Randomizer(12345) }` or `Randomizer.Seed = new Random(12345)`) so `EvoStoreId`s are stable (`$"EVO-{i:D5}"` for i = 1..count) and re-running yields the same stores. Populate realistic Turkish province/district/neighborhood, a chain name drawn from a fixed small list (`Migros`, `A101`, `BİM`, `ŞOK`, `CarrefourSA`), lat/lng inside Turkey's bounds, `Category` and `Format` (1–6) pseudo-randomly, 6–12 months of revenue, and a BANNED flag on a small deterministic subset. No DB access — pure generation.
- Verify: `dotnet build backend/Evo.sln` succeeds; (behavior covered by Task 15).
- Status: [x] (also required adding a `Bogus` package reference to `Evo.Infrastructure.csproj` — previously only `Evo.Seeder` referenced it)

## Task 12: StoreSyncRunSummary DTO
- Files: `backend/src/Evo.Infrastructure/Stores/Sync/StoreSyncRunSummary.cs`
- Do: immutable `record StoreSyncRunSummary(DateTimeOffset StartedAt, long DurationMs, int ChainsCreated, int StoresCreated, int StoresUpdated, int RevenueRowsUpserted, int FlagsUpserted)`. Returned by the service and by `POST /stores/sync`.
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 13: IStoreSyncService + upsert ingestion logic
- Files: `backend/src/Evo.Infrastructure/Stores/Sync/IStoreSyncService.cs`, `backend/src/Evo.Infrastructure/Stores/Sync/StoreSyncService.cs`
- Do: `IStoreSyncService { Task<StoreSyncRunSummary> RunAsync(CancellationToken ct = default); }`. `StoreSyncService` injects `EvoDbContext` + `IStoreSyncSource`. `RunAsync`: start a stopwatch; `FetchAsync`; **(a) chains** — for each distinct `ChainName`, find-or-create a `Chain` (count creates); **(b) stores** — for each record, look up `Store` by `EvoStoreId`: if missing, create (new Guid, `Active = true`, `DefaultServiceMinutes = null`) and count created; if present, count updated and **do NOT touch** `Active` or `DefaultServiceMinutes`. Either way overwrite `Name`, `ChainId`, `Channel`, `Province`, `District`, `Neighborhood`, `Category`, `Format`, `Location = new Point(lng, lat) { SRID = 4326 }`, `SyncedAt = DateTimeOffset.UtcNow`; **(c) revenue** — upsert `store_revenue` by `(StoreId, Month)`, then prune each store to its latest **12** months; **(d) flags** — remove the store's existing `store_flag`s and re-insert from the record's flags. Stores in the DB but absent from the batch are **left untouched** (never queried for deactivation). One `SaveChangesAsync`; return the summary. Note the `Point` constructor is `(x=longitude, y=latitude)`.
- Verify: `dotnet build backend/Evo.sln` succeeds; (behavior covered by Task 15).
- Status: [x]

## Task 14: Register sync source + service in Api DI
- Files: `backend/src/Evo.Api/Program.cs`
- Do: register `builder.Services.AddScoped<IStoreSyncService, StoreSyncService>();` and `builder.Services.AddSingleton<IStoreSyncSource>(new FakeStoreSyncSource(storeCount: 40));` (or bind the count from `StoreSync:FakeStoreCount` config with a 40 default). Add a `// EXTENSION SEAM` comment: swap `FakeStoreSyncSource` for the real `IStoreSyncSource` here once customer-IT answers land.
- Verify: `dotnet build`; `dotnet run --project backend/src/Evo.Api` starts without error.
- Status: [x]

## Task 15: Backend tests — sync upsert semantics
- Files: `backend/tests/Evo.Tests/Stores/StoreSyncServiceTests.cs`
- Do: using the spec-002/003 test DbContext setup (compose SQL via `WebApplicationFactory`, or a dedicated `EvoDbContext` against the compose connection), run `StoreSyncService` with a small `FakeStoreSyncSource`. Assert: (a) first `RunAsync` creates N stores + the chains; (b) a second run (same fake seed) keeps the store count stable and re-updates the same rows (`StoresUpdated == N`, `StoresCreated == 0`); (c) manually set one store's `DefaultServiceMinutes = 55` and `Active = false`, run again, and assert both are **preserved** while a synced field (e.g. `Name`) is refreshed; (d) a store given 15 revenue months retains only 12 after sync; (e) a store removed from the source batch (use a shrinkable fake or delete one source record) is **not** deactivated (its `Active` unchanged). Use a distinct test database name so it doesn't collide with auth/audit tests.
- Verify: `dotnet test backend/Evo.sln` → these tests pass.
- Status: [x]

**PHASE 2 CHECKPOINT — HARD STOP (rule 3d): summarize + evidence (build, sync-service test output proving overwrite-synced / preserve-planner-fields / 12-month prune / no-auto-deactivate), commit `feat(004): store sync source abstraction + idempotent ingestion`, numbered questions, then say 'CHECKPOINT — waiting for your go' and END TURN.**

## Phase 3 — Sync triggers + read endpoints

## Task 16: Sync endpoint (supervisor-only, audit-logged)
- Files: `backend/src/Evo.Api/Controllers/StoresController.cs`
- Do: `[ApiController] [Route("api/v1/stores")]` controller. `[Authorize(Roles = Roles.Supervisor)] [HttpPost("sync")] public async Task<ActionResult<StoreSyncRunSummary>> Sync(...)`: inject `IStoreSyncService` + `IAuditWriter`; call `RunAsync`; then `await auditWriter.WriteAsync("StoreSync", "sync", "run", after: summary)`; return `Ok(summary)`. Uses `Evo.Domain.Auth.Roles.Supervisor` (spec 002) and spec 003's `IAuditWriter`.
- Verify: `dotnet build`; (behavior covered by Task 20).
- Status: [ ]

## Task 17: Nightly StoreSyncBackgroundService
- Files: `backend/src/Evo.Api/Stores/StoreSyncBackgroundService.cs`, `backend/src/Evo.Api/Program.cs`
- Do: `StoreSyncBackgroundService : BackgroundService` injecting `IServiceScopeFactory` + `ILogger` + `IConfiguration`. In `ExecuteAsync`: read `StoreSync:IntervalHours` (default 24); loop until cancellation — create a DI scope, resolve `IStoreSyncService`, `RunAsync`, log the summary; wrap in try/catch so a failed run is logged and does NOT crash the host; `await Task.Delay(interval, stoppingToken)`. Register with `builder.Services.AddHostedService<StoreSyncBackgroundService>();`. Add a comment that a wall-clock cron window is an open question (spec Open questions) — interval timer is the M0 choice.
- Verify: `dotnet build`; `dotnet run --project backend/src/Evo.Api` starts and logs one startup sync run (or the first-interval schedule) without crashing.
- Status: [ ]

## Task 18: Store read DTOs
- Files: `backend/src/Evo.Api/Stores/Dtos/StoreDtos.cs`
- Do: `record StoreSummaryDto(Guid Id, string EvoStoreId, string Name, string? ChainName, string Province, string District, byte Format, StoreCategory Category, bool Active, DateTimeOffset SyncedAt)`; `record StoreRevenueDto(DateOnly Month, decimal Revenue)`; `record StoreFlagDto(StoreFlagType Type, string? Reason, DateOnly StartsOn, DateOnly? EndsOn)`; `record StoreDetailDto(Guid Id, string EvoStoreId, string Name, string? ChainName, string? Channel, string Province, string District, string? Neighborhood, double? Latitude, double? Longitude, byte Format, StoreCategory Category, int? DefaultServiceMinutes, bool Active, DateTimeOffset SyncedAt, IReadOnlyList<StoreRevenueDto> Revenue, IReadOnlyList<StoreFlagDto> Flags)`. (Lat/lng projected from `Location.Y`/`Location.X`.)
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [ ]

## Task 19: Store read endpoints (list + detail)
- Files: `backend/src/Evo.Api/Controllers/StoresController.cs`
- Do: add `[Authorize] [HttpGet] public async Task<ActionResult<PagedResult<StoreSummaryDto>>> List(string? province, string? district, bool? active, byte? format, int page = 1, int pageSize = 50)`: build an `IQueryable<Store>` (join Chain for the name), apply each supplied filter, order by `SyncedAt` descending, cap `pageSize` at 200, project to `StoreSummaryDto`, return `PagedResult<StoreSummaryDto>` (reuse `Evo.Api.Audit.Dtos.PagedResult`). Add `[Authorize] [HttpGet("{id:guid}")] public async Task<ActionResult<StoreDetailDto>> Get(Guid id)`: load the store with its chain, revenue (latest-month first), and flags; if null → `throw new NotFoundException(...)` (spec 003 taxonomy → 404 unified shape); else project to `StoreDetailDto`.
- Verify: `dotnet build`; (behavior covered by Task 20).
- Status: [ ]

## Task 20: Backend tests — endpoints (sync + list + detail + authz)
- Files: `backend/tests/Evo.Tests/Stores/StoreEndpointTests.cs`
- Do: with the `WebApplicationFactory` (seeded Supervisor + Field agent from the spec-002/003 test helpers): Supervisor `POST /api/v1/stores/sync` → 200 with a `StoreSyncRunSummary` (StoresCreated > 0) and an `audit_log` row `entityType="StoreSync" event="run"`; Field agent `POST /stores/sync` → 403 (`code=forbidden`); unauthenticated → 401 (`code=unauthorized`). After a sync: `GET /api/v1/stores?province=<known>` returns only that province, paging returns the right slice + `total`; `GET /api/v1/stores/{id}` returns revenue + flags; `GET /api/v1/stores/{unknownGuid}` → 404 (`code=not_found`).
- Verify: `dotnet test backend/Evo.sln` → these tests pass.
- Status: [ ]

**PHASE 3 CHECKPOINT — HARD STOP (rule 3d): summarize + evidence (endpoint test output showing sync summary + audit row + authz 403/401 + list filter/paging + detail + 404, and a startup log line from the BackgroundService), commit `feat(004): store sync endpoint + nightly worker + read endpoints`, numbered questions, then say 'CHECKPOINT — waiting for your go' and END TURN.**

## Phase 4 — Seeder + contract + client + docs

## Task 21: StoreSyncSeederModule (seed via a real sync run)
- Files: `backend/src/Evo.Seeder/Modules/StoreSyncSeederModule.cs`
- Do: `StoreSyncSeederModule : ISeederModule`, `Name => "StoreSync"`. In `SeedAsync`, resolve `IStoreSyncService` from the passed `services` provider and call `RunAsync(ct)` — do NOT insert store rows directly (spec Clarification #2). Idempotent by construction (the service upserts against the deterministic fake). No profile guard needed for correctness, but the **store count differs by profile**, which is controlled by which `FakeStoreSyncSource` is registered in Task 22 (demo = small, scale = large). Log the returned summary.
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [ ]

## Task 22: Wire seeder DI (sync source + service) + register module
- Files: `backend/src/Evo.Seeder/Program.cs`
- Do: in the seeder's `ServiceCollection`, register `services.AddScoped<IStoreSyncService, StoreSyncService>();` and a profile-sized fake: `services.AddSingleton<IStoreSyncSource>(new FakeStoreSyncSource(storeCount: profile == SeedProfile.Demo ? 15 : 400));` (compute `storeCount` from the already-parsed `profile`). Add `new StoreSyncSeederModule()` to the `modules` list. Confirm Task 2 already added `UseNetTopologySuite()` to this file's `UseSqlServer` (required now that stores have a `geography` column).
- Verify: with the compose SQL up + `AddStores` applied, `dotnet run --project backend/src/Evo.Seeder -- --profile demo` exits 0 and creates ~15 stores; re-running keeps the store count stable (idempotent upsert) — query `SELECT COUNT(*) FROM stores` before/after.
- Status: [ ]

## Task 23: Regenerate contract + TS client
- Files: `contracts/openapi.json`, `panel/src/api/generated/` (generated)
- Do: rebuild the Api so Swashbuckle emits `/api/v1/stores`, `/api/v1/stores/{id}`, and `/api/v1/stores/sync` into `contracts/openapi.json`; then run `npm run generate-api-client` from `panel/`. **No panel store UI** — client regen only (spec Non-goals).
- Verify: `contracts/openapi.json` contains `/api/v1/stores` and `/api/v1/stores/sync`; `grep -ri stores panel/src/api/generated` finds the generated operations.
- Status: [ ]

## Task 24: Update docs + decisions
- Files: `docs/DATABASE.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DECISIONS.md`
- Do: `docs/DATABASE.md` — flip the schema-status row `store, store_revenue, store_flag, store_type` to ☑ (spec 004), add a `chain` row (☑ 004), and add a note under the PostgreSQL→SQL Server mapping that `geography(Point)` is realized via NetTopologySuite (`UseNetTopologySuite`) with a `CREATE SPATIAL INDEX`, and that `store_type` is a 6-row `HasData` seed. `docs/ARCHITECTURE.md` — mark the "Store Sync worker" COMPLETE (spec 004), noting the dual trigger (on-demand supervisor endpoint + nightly `BackgroundService`) and the `IStoreSyncSource` seam. **Also fix the entity-placement convention:** the source-tree map (line ~45, `src/Evo.Domain/  Entities, domain logic`) implies EF entities live in `Evo.Domain`, but every entity built so far lives in `Evo.Infrastructure` colocated with its EF configuration (spec 002 `ApplicationUser`/`RefreshToken`, spec 003 `AuditLogEntry`, spec 004 `Store` family). Correct the doc to state the actual convention — EF entities live in `Evo.Infrastructure` (colocated with their EF config); `Evo.Domain` holds cross-cutting domain logic (Errors, Exceptions, Auth `Roles`), not persisted entities. `docs/API.md` — add rows for the three store endpoints. `docs/DECISIONS.md` (newest-first) — record: (a) **chain as a real lookup entity — deviation from the planner recommendation** (denormalized string column was recommended; human chose a real `chain(id,name)` FK as foundational, why); (b) `geography` via NetTopologySuite stored now but **no spatial query endpoints** until M1; (c) fixed migration-seeded `store_type` taxonomy (codes 1–6); (d) sync **overwrites synced fields / preserves planner-owned** `default_service_minutes` + `active` / **no auto-deactivate** of vanished stores; (e) the real `IStoreSyncSource` remains an **open customer-IT question** (seam only in 004).
- Verify: all four docs updated; `docs/DATABASE.md` schema-status table shows the store tables + chain as migrated; `docs/ARCHITECTURE.md` source-tree map no longer says entities live in `Evo.Domain` (states `Evo.Infrastructure` colocated with EF config); `docs/DECISIONS.md` names the chain deviation explicitly.
- Status: [ ]

## Task 25: Re-run the full backend suite as regression proof
- Files: none (verification task)
- Do: run the full backend suite and confirm all prior spec 001/002/003 tests still pass alongside the new 004 store tests after the schema + DI additions.
- Verify: `dotnet test backend/Evo.sln` → all green; report the pass count (prior total + new 004 tests).
- Status: [ ]

**PHASE 4 CHECKPOINT — HARD STOP (rule 3d): summarize + evidence (seeder run output showing stable store count on re-run, regenerated contract diff + client grep, full-suite green count), give the human a 1-minute API test script (start backend → POST /api/v1/stores/sync as the seeded Supervisor → GET /api/v1/stores?province=… returns rows → GET /api/v1/stores/{id} shows revenue + flags → check the audit_log row), commit `feat(004): store seeder via real sync + contract + docs`, then run /end-session and END TURN. M0 platform specs are COMPLETE — do NOT start an M1 feature module.**
