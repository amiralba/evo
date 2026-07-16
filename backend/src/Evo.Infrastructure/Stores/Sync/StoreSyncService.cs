using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;

namespace Evo.Infrastructure.Stores.Sync;

public class StoreSyncService : IStoreSyncService
{
    private readonly EvoDbContext _db;
    private readonly IStoreSyncSource _source;

    public StoreSyncService(EvoDbContext db, IStoreSyncSource source)
    {
        _db = db;
        _source = source;
    }

    public async Task<StoreSyncRunSummary> RunAsync(CancellationToken ct = default)
    {
        var startedAt = DateTimeOffset.UtcNow;
        var stopwatch = Stopwatch.StartNew();

        var records = await _source.FetchAsync(ct);

        var chainsCreated = 0;
        var storesCreated = 0;
        var storesUpdated = 0;
        var revenueRowsUpserted = 0;
        var flagsUpserted = 0;

        // (a) chains — find-or-create by name.
        var chainNames = records.Select(r => r.ChainName).Where(n => !string.IsNullOrEmpty(n)).Distinct().ToList();
        var existingChains = await _db.Chains.Where(c => chainNames.Contains(c.Name)).ToDictionaryAsync(c => c.Name, ct);
        foreach (var chainName in chainNames)
        {
            if (!existingChains.ContainsKey(chainName!))
            {
                var chain = new Chain { Id = Guid.NewGuid(), Name = chainName! };
                _db.Chains.Add(chain);
                existingChains[chainName!] = chain;
                chainsCreated++;
            }
        }

        // (b) stores — upsert by EvoStoreId.
        var evoStoreIds = records.Select(r => r.EvoStoreId).ToList();
        var existingStores = await _db.Stores.Where(s => evoStoreIds.Contains(s.EvoStoreId)).ToDictionaryAsync(s => s.EvoStoreId, ct);
        var syncedAt = DateTimeOffset.UtcNow;

        foreach (var record in records)
        {
            var chainId = record.ChainName is null ? (Guid?)null : existingChains[record.ChainName].Id;

            if (!existingStores.TryGetValue(record.EvoStoreId, out var store))
            {
                store = new Store
                {
                    Id = Guid.NewGuid(),
                    EvoStoreId = record.EvoStoreId,
                    Active = true,
                    DefaultServiceMinutes = null,
                };
                _db.Stores.Add(store);
                existingStores[record.EvoStoreId] = store;
                storesCreated++;
            }
            else
            {
                storesUpdated++;
            }

            // Overwrite synced fields; never touch Active or DefaultServiceMinutes (planner-owned).
            store.Name = record.Name;
            store.ChainId = chainId;
            store.Channel = record.Channel;
            store.Province = record.Province;
            store.District = record.District;
            store.Neighborhood = record.Neighborhood;
            store.Category = record.Category;
            store.Format = record.Format;
            store.Location = new Point(record.Longitude, record.Latitude) { SRID = 4326 };
            store.SyncedAt = syncedAt;

            // (c) revenue — upsert by (StoreId, Month), then prune to the latest 12 months.
            var existingRevenue = await _db.StoreRevenues
                .Where(r => r.StoreId == store.Id)
                .ToDictionaryAsync(r => r.Month, ct);

            foreach (var revenueRecord in record.Revenue)
            {
                if (existingRevenue.TryGetValue(revenueRecord.Month, out var existingRow))
                {
                    existingRow.Revenue = revenueRecord.Revenue;
                }
                else
                {
                    var newRow = new StoreRevenue { StoreId = store.Id, Month = revenueRecord.Month, Revenue = revenueRecord.Revenue };
                    _db.StoreRevenues.Add(newRow);
                    existingRevenue[revenueRecord.Month] = newRow;
                }
                revenueRowsUpserted++;
            }

            var monthsToPrune = existingRevenue.Values
                .OrderByDescending(r => r.Month)
                .Skip(12);
            _db.StoreRevenues.RemoveRange(monthsToPrune);

            // (d) flags — replace entirely from the feed.
            var existingFlags = await _db.StoreFlags.Where(f => f.StoreId == store.Id).ToListAsync(ct);
            _db.StoreFlags.RemoveRange(existingFlags);
            foreach (var flagRecord in record.Flags)
            {
                _db.StoreFlags.Add(new StoreFlag
                {
                    Id = Guid.NewGuid(),
                    StoreId = store.Id,
                    Type = flagRecord.Type,
                    Reason = flagRecord.Reason,
                    StartsOn = flagRecord.StartsOn,
                    EndsOn = flagRecord.EndsOn,
                });
                flagsUpserted++;
            }
        }

        await _db.SaveChangesAsync(ct);

        stopwatch.Stop();
        return new StoreSyncRunSummary(startedAt, stopwatch.ElapsedMilliseconds, chainsCreated, storesCreated, storesUpdated, revenueRowsUpserted, flagsUpserted);
    }
}
