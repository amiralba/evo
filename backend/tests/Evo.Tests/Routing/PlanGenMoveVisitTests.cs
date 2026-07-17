using Evo.Domain.Scheduling;
using Evo.Infrastructure;
using Evo.Infrastructure.Identity;
using Evo.Infrastructure.People;
using Evo.Infrastructure.Routing;
using Evo.Infrastructure.Stores;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests.Routing;

[Collection("RoutingDb")]
public class PlanGenMoveVisitTests
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
        await db.Merchandisers.ExecuteDeleteAsync();
        await db.Stores.ExecuteDeleteAsync();
        await db.Users.Where(u => u.UserName!.StartsWith("plangen-mv-test-")).ExecuteDeleteAsync();

        return db;
    }

    private static async Task<(Route Route, RouteStop Stop, Store Store)> SeedRouteAsync(EvoDbContext db, DateOnly stopEffectiveFrom)
    {
        var store = new Store
        {
            Id = Guid.NewGuid(),
            EvoStoreId = "EVO-MV-" + Guid.NewGuid().ToString("N")[..8],
            Name = "Test Store MV",
            Province = "Ankara",
            District = "Cankaya",
            Category = StoreCategory.HighValue,
            Format = 2,
            DefaultServiceMinutes = 30,
            SyncedAt = DateTimeOffset.UtcNow,
        };
        var route = new Route
        {
            Id = Guid.NewGuid(),
            RouteCode = "PGMV-" + Guid.NewGuid().ToString("N")[..8],
            Name = "PlanGen MoveVisit Test Route",
            Province = "Ankara",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
        };
        // Weekly, anchored so it occurs only on the seed day-of-week -- makes fromDate a real
        // occurrence and toDate (a different weekday) a day with no baseline visit for this store.
        var stop = new RouteStop
        {
            Id = Guid.NewGuid(),
            RouteId = route.Id,
            StoreId = store.Id,
            Frequency = Frequency.Weekly,
            WeekdayMask = (short)(1 << (int)stopEffectiveFrom.DayOfWeek),
            Sequence = 1,
            EffectiveFrom = stopEffectiveFrom,
            EffectiveTo = null,
        };

        var userId = Guid.NewGuid();
        db.Users.Add(new ApplicationUser
        {
            Id = userId,
            UserName = $"plangen-mv-test-{userId}",
            NormalizedUserName = $"PLANGEN-MV-TEST-{userId}".ToUpperInvariant(),
            Email = $"plangen-mv-test-{userId}@evo.local",
            NormalizedEmail = $"PLANGEN-MV-TEST-{userId}@EVO.LOCAL".ToUpperInvariant(),
            DisplayName = "Test Merchandiser",
        });
        var merchandiser = new Merchandiser { Id = Guid.NewGuid(), UserId = userId, Active = true };
        var assignment = new Assignment
        {
            Id = Guid.NewGuid(),
            RouteId = route.Id,
            MerchandiserId = merchandiser.Id,
            StartDate = stopEffectiveFrom,
            EndDate = null,
            Reason = AssignmentReason.NewHire,
        };

        db.Stores.Add(store);
        db.Routes.Add(route);
        db.RouteStops.Add(stop);
        db.Merchandisers.Add(merchandiser);
        db.Assignments.Add(assignment);
        await db.SaveChangesAsync();

        return (route, stop, store);
    }

    [Fact]
    public async Task ActiveMoveVisitPatch_MovesTheVisit_FromSourceDate_ToTargetDate()
    {
        await using var db = await CreateContextAsync();
        var fromDate = DateOnly.FromDateTime(DateTime.UtcNow);
        while (fromDate.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday)
        {
            fromDate = fromDate.AddDays(1);
        }
        var toDate = fromDate.AddDays(1);
        if (toDate.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday)
        {
            toDate = toDate.AddDays(2);
        }

        var (route, stop, store) = await SeedRouteAsync(db, fromDate);

        db.Patches.Add(new Patch
        {
            Id = Guid.NewGuid(),
            RouteId = route.Id,
            Type = PatchType.MoveVisit,
            StoreId = store.Id,
            StartsOn = fromDate,
            EndsOn = toDate,
            Status = PatchStatus.Active,
            ParamsJson = $$"""{"fromDate":"{{fromDate:O}}","toDate":"{{toDate:O}}"}""",
            Reason = "test move visit",
        });
        await db.SaveChangesAsync();

        var settingsProvider = new SettingsProvider(db);
        var service = new PlanGenerationService(db, settingsProvider);
        await service.RegenerateFutureAsync(route.Id, fromDate, toDate);

        var visits = await db.PlannedVisits.Where(v => v.RouteId == route.Id).ToListAsync();

        Assert.DoesNotContain(visits, v => v.VisitDate == fromDate);
        var moved = Assert.Single(visits, v => v.VisitDate == toDate);
        Assert.Equal(stop.Id, moved.RouteStopId);
        Assert.Equal(store.Id, moved.StoreId);
    }
}
