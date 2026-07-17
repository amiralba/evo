using Evo.Infrastructure;
using Evo.Infrastructure.Routing;
using Evo.Infrastructure.Stores;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests.Routing;

/// <summary>
/// Proves the DB-enforced one-active-route rule: a store can only carry one open-ended
/// (EffectiveTo IS NULL) route_stop at a time (spec 005 Task 5's filtered unique index).
/// </summary>
[Collection("RoutingDb")]
public class RouteStopConstraintTests
{
    private const string ConnectionString =
        "Server=localhost,1433;Database=EvoDb_RoutingTests;User Id=sa;Password=Local_dev_only!1;TrustServerCertificate=True;";

    private static async Task<EvoDbContext> CreateContextAsync()
    {
        var services = new ServiceCollection();
        services.AddDbContext<EvoDbContext>(options => options.UseSqlServer(ConnectionString, x => x.UseNetTopologySuite()));
        var provider = services.BuildServiceProvider();
        var db = provider.GetRequiredService<EvoDbContext>();
        await db.Database.MigrateAsync();

        await db.PlannedVisits.ExecuteDeleteAsync();
        await db.Patches.ExecuteDeleteAsync();
        await db.Assignments.ExecuteDeleteAsync();
        await db.RouteStops.ExecuteDeleteAsync();
        await db.Routes.ExecuteDeleteAsync();
        await db.Stores.ExecuteDeleteAsync();

        return db;
    }

    private static Store NewStore(string evoStoreId) => new()
    {
        Id = Guid.NewGuid(),
        EvoStoreId = evoStoreId,
        Name = "Test Store " + evoStoreId,
        Province = "Ankara",
        District = "Cankaya",
        Category = StoreCategory.HighValue,
        Format = 2,
        SyncedAt = DateTimeOffset.UtcNow,
    };

    private static Route NewRoute(string code) => new()
    {
        Id = Guid.NewGuid(),
        RouteCode = code,
        Name = "Route " + code,
        Province = "Ankara",
        CreatedAt = DateTimeOffset.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow,
    };

    [Fact]
    public async Task SecondActiveRouteStop_ForSameStore_ThrowsOnSave()
    {
        await using var db = await CreateContextAsync();

        var store = NewStore("EVO-RT-001");
        var routeA = NewRoute("RT-A");
        var routeB = NewRoute("RT-B");
        db.Stores.Add(store);
        db.Routes.AddRange(routeA, routeB);
        await db.SaveChangesAsync();

        db.RouteStops.Add(new RouteStop
        {
            Id = Guid.NewGuid(),
            RouteId = routeA.Id,
            StoreId = store.Id,
            EffectiveFrom = DateOnly.FromDateTime(DateTime.UtcNow),
            EffectiveTo = null,
        });
        await db.SaveChangesAsync();

        db.RouteStops.Add(new RouteStop
        {
            Id = Guid.NewGuid(),
            RouteId = routeB.Id,
            StoreId = store.Id,
            EffectiveFrom = DateOnly.FromDateTime(DateTime.UtcNow),
            EffectiveTo = null,
        });

        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task ClosingFirstStop_FreesStoreForAnotherRoute()
    {
        await using var db = await CreateContextAsync();

        var store = NewStore("EVO-RT-002");
        var routeA = NewRoute("RT-C");
        var routeB = NewRoute("RT-D");
        db.Stores.Add(store);
        db.Routes.AddRange(routeA, routeB);
        await db.SaveChangesAsync();

        var firstStop = new RouteStop
        {
            Id = Guid.NewGuid(),
            RouteId = routeA.Id,
            StoreId = store.Id,
            EffectiveFrom = DateOnly.FromDateTime(DateTime.UtcNow),
            EffectiveTo = null,
        };
        db.RouteStops.Add(firstStop);
        await db.SaveChangesAsync();

        firstStop.EffectiveTo = DateOnly.FromDateTime(DateTime.UtcNow);
        await db.SaveChangesAsync();

        db.RouteStops.Add(new RouteStop
        {
            Id = Guid.NewGuid(),
            RouteId = routeB.Id,
            StoreId = store.Id,
            EffectiveFrom = DateOnly.FromDateTime(DateTime.UtcNow),
            EffectiveTo = null,
        });
        await db.SaveChangesAsync();

        var openCount = await db.RouteStops.CountAsync(s => s.StoreId == store.Id && s.EffectiveTo == null);
        Assert.Equal(1, openCount);
    }
}
