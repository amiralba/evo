using Evo.Infrastructure;
using Evo.Infrastructure.Stores;
using Evo.Infrastructure.Stores.Sync;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests.Stores;

/// <summary>
/// Exercises the real StoreSyncService/EvoDbContext against the compose SQL Server, using a
/// dedicated database so it never collides with the auth/audit tests' row counts.
/// </summary>
public class StoreSyncServiceTests
{
    private const string ConnectionString =
        "Server=localhost,1433;Database=EvoDb_StoreSyncTests;User Id=sa;Password=Local_dev_only!1;TrustServerCertificate=True;";

    /// <summary>
    /// Migrates and wipes the store-family tables so each test starts clean — this database is
    /// dedicated to these tests, and FakeStoreSyncSource's EvoStoreIds are the same across tests
    /// (fixed seed), so leftover rows from a previous test would corrupt Created/Updated counts.
    /// </summary>
    private static async Task<EvoDbContext> CreateContextAsync()
    {
        var services = new ServiceCollection();
        services.AddDbContext<EvoDbContext>(options => options.UseSqlServer(ConnectionString, x => x.UseNetTopologySuite()));
        var provider = services.BuildServiceProvider();
        var db = provider.GetRequiredService<EvoDbContext>();
        await db.Database.MigrateAsync();

        await db.StoreFlags.ExecuteDeleteAsync();
        await db.StoreRevenues.ExecuteDeleteAsync();
        await db.Stores.ExecuteDeleteAsync();
        await db.Chains.ExecuteDeleteAsync();

        return db;
    }

    [Fact]
    public async Task FirstRun_CreatesStoresAndChains()
    {
        await using var db = await CreateContextAsync();
        var service = new StoreSyncService(db, new FakeStoreSyncSource(storeCount: 3));

        var summary = await service.RunAsync();

        Assert.Equal(3, summary.StoresCreated);
        Assert.Equal(0, summary.StoresUpdated);
        Assert.True(summary.ChainsCreated > 0);
    }

    [Fact]
    public async Task SecondRun_SameSeed_UpdatesSameRows_CountStable()
    {
        await using var db = await CreateContextAsync();
        var source = new FakeStoreSyncSource(storeCount: 3);
        var service = new StoreSyncService(db, source);
        await service.RunAsync();

        // Corrupt a synced field directly to prove the second run overwrites it.
        var store = await db.Stores.FirstAsync(s => s.EvoStoreId == "EVO-00001");
        store.Name = "CORRUPTED";
        await db.SaveChangesAsync();

        var summary = await service.RunAsync();

        Assert.Equal(0, summary.StoresCreated);
        Assert.Equal(3, summary.StoresUpdated);
        var storeCount = await db.Stores.CountAsync(s => s.EvoStoreId.StartsWith("EVO-0000"));
        Assert.True(storeCount >= 3);

        var refreshed = await db.Stores.FirstAsync(s => s.EvoStoreId == "EVO-00001");
        Assert.NotEqual("CORRUPTED", refreshed.Name);
    }

    [Fact]
    public async Task Resync_PreservesPlannerOwnedFields_ButOverwritesSyncedFields()
    {
        await using var db = await CreateContextAsync();
        var service = new StoreSyncService(db, new FakeStoreSyncSource(storeCount: 3));
        await service.RunAsync();

        var store = await db.Stores.FirstAsync(s => s.EvoStoreId == "EVO-00002");
        store.DefaultServiceMinutes = 55;
        store.Active = false;
        var originalName = store.Name;
        store.Name = "PRE-CHANGE-NAME";
        await db.SaveChangesAsync();

        await service.RunAsync();

        var refreshed = await db.Stores.FirstAsync(s => s.EvoStoreId == "EVO-00002");
        Assert.Equal(55, refreshed.DefaultServiceMinutes);
        Assert.False(refreshed.Active);
        Assert.Equal(originalName, refreshed.Name);
    }

    [Fact]
    public async Task Sync_RetainsOnlyLatest12MonthsOfRevenue()
    {
        await using var db = await CreateContextAsync();
        var service = new StoreSyncService(db, new FakeStoreSyncSource(storeCount: 1));
        await service.RunAsync();

        var store = await db.Stores.FirstAsync(s => s.EvoStoreId == "EVO-00001");

        // Pre-seed extra old months beyond what the fake source generates, so pruning is proven.
        var firstOfThisMonth = new DateOnly(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1);
        for (var i = 13; i <= 20; i++)
        {
            db.StoreRevenues.Add(new StoreRevenue { StoreId = store.Id, Month = firstOfThisMonth.AddMonths(-i), Revenue = 1 });
        }
        await db.SaveChangesAsync();

        await service.RunAsync();

        var revenueCount = await db.StoreRevenues.CountAsync(r => r.StoreId == store.Id);
        Assert.True(revenueCount <= 12);
    }

    [Fact]
    public async Task StoreRemovedFromBatch_IsNotDeactivated()
    {
        await using var db = await CreateContextAsync();
        var service = new StoreSyncService(db, new FakeStoreSyncSource(storeCount: 5));
        await service.RunAsync();

        var beforeShrink = await db.Stores.FirstAsync(s => s.EvoStoreId == "EVO-00005");
        Assert.True(beforeShrink.Active);

        // Second source only returns 3 stores — EVO-00004/00005 are "removed from the feed".
        var shrunkService = new StoreSyncService(db, new FakeStoreSyncSource(storeCount: 3));
        await shrunkService.RunAsync();

        var afterShrink = await db.Stores.FirstAsync(s => s.EvoStoreId == "EVO-00005");
        Assert.True(afterShrink.Active);
    }
}
