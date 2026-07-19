using Evo.Domain.Scheduling;
using Evo.Infrastructure;
using Evo.Infrastructure.Identity;
using Evo.Infrastructure.People;
using Evo.Infrastructure.Routing;
using Evo.Infrastructure.Stores;
using Evo.Infrastructure.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests.Routing;

[Collection("RoutingDb")]
public class PlanGenTimeShiftTests
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
        await db.Users.Where(u => u.UserName!.StartsWith("plangen-ts-test-")).ExecuteDeleteAsync();

        return db;
    }

    private static async Task<(Route Route, RouteStop StopA, Store StoreA, RouteStop StopB, Store StoreB)> SeedTwoStopRouteAsync(EvoDbContext db, DateOnly stopEffectiveFrom)
    {
        var storeA = new Store
        {
            Id = Guid.NewGuid(),
            EvoStoreId = "EVO-TS-A-" + Guid.NewGuid().ToString("N")[..8],
            Name = "Test Store A",
            Province = "Ankara",
            District = "Cankaya",
            Category = StoreCategory.HighValue,
            Format = 2,
            DefaultServiceMinutes = 30,
            SyncedAt = DateTimeOffset.UtcNow,
        };
        var storeB = new Store
        {
            Id = Guid.NewGuid(),
            EvoStoreId = "EVO-TS-B-" + Guid.NewGuid().ToString("N")[..8],
            Name = "Test Store B",
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
            RouteCode = "PGTS-" + Guid.NewGuid().ToString("N")[..8],
            Name = "PlanGen TimeShift Test Route",
            Province = "Ankara",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
        };
        var stopA = new RouteStop
        {
            Id = Guid.NewGuid(),
            RouteId = route.Id,
            StoreId = storeA.Id,
            Frequency = Frequency.Daily,
            WeekdayMask = 0,
            Sequence = 1,
            EffectiveFrom = stopEffectiveFrom,
            EffectiveTo = null,
        };
        var stopB = new RouteStop
        {
            Id = Guid.NewGuid(),
            RouteId = route.Id,
            StoreId = storeB.Id,
            Frequency = Frequency.Daily,
            WeekdayMask = 0,
            Sequence = 2,
            EffectiveFrom = stopEffectiveFrom,
            EffectiveTo = null,
        };

        var userId = Guid.NewGuid();
        db.Users.Add(new ApplicationUser
        {
            Id = userId,
            UserName = $"plangen-ts-test-{userId}",
            NormalizedUserName = $"PLANGEN-TS-TEST-{userId}".ToUpperInvariant(),
            Email = $"plangen-ts-test-{userId}@evo.local",
            NormalizedEmail = $"PLANGEN-TS-TEST-{userId}@EVO.LOCAL".ToUpperInvariant(),
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

        db.Stores.AddRange(storeA, storeB);
        db.Routes.Add(route);
        db.RouteStops.AddRange(stopA, stopB);
        db.Merchandisers.Add(merchandiser);
        db.Assignments.Add(assignment);
        await db.SaveChangesAsync();

        return (route, stopA, storeA, stopB, storeB);
    }

    [Fact]
    public async Task ActiveTimeShiftPatch_PinsFirstStoresStart_AndPushesSecondVisitLater()
    {
        await using var db = await CreateContextAsync();
        var today = TestClock.Today;
        // Ensure `today` occurs on a weekday so the assertion date has visits.
        while (today.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday)
        {
            today = today.AddDays(1);
        }
        var (route, stopA, storeA, stopB, _) = await SeedTwoStopRouteAsync(db, today.AddDays(-1));

        db.Patches.Add(new Patch
        {
            Id = Guid.NewGuid(),
            RouteId = route.Id,
            Type = PatchType.TimeShift,
            StoreId = storeA.Id,
            StartsOn = today,
            EndsOn = today,
            Status = PatchStatus.Active,
            ParamsJson = """{"startMinutes":600}""", // 10:00
            Reason = "test time shift",
        });
        await db.SaveChangesAsync();

        var settingsProvider = new SettingsProvider(db);
        var service = new PlanGenerationService(db, settingsProvider, new TaskPlanProvider(db), TestClock.Clock);
        await service.RegenerateFutureAsync(route.Id, today, today);

        var visitA = await db.PlannedVisits.FirstAsync(v => v.RouteStopId == stopA.Id && v.VisitDate == today);
        var visitB = await db.PlannedVisits.FirstAsync(v => v.RouteStopId == stopB.Id && v.VisitDate == today);

        Assert.Equal(new TimeOnly(10, 0), TimeOnly.FromDateTime(visitA.PlannedStart!.Value.DateTime));
        Assert.True(visitB.PlannedStart!.Value >= visitA.PlannedEnd!.Value, "second visit should start no earlier than the pinned visit ends");
    }
}
