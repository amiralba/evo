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
public class PlanGenerationServiceTests
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
        await db.Users.Where(u => u.UserName!.StartsWith("plangen-test-")).ExecuteDeleteAsync();

        return db;
    }

    private static async Task<(Route Route, RouteStop Stop, Store Store, Merchandiser Merchandiser)> SeedRouteAsync(EvoDbContext db, DateOnly stopEffectiveFrom)
    {
        var store = new Store
        {
            Id = Guid.NewGuid(),
            EvoStoreId = "EVO-PG-" + Guid.NewGuid().ToString("N")[..8],
            Name = "Test Store",
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
            RouteCode = "PG-" + Guid.NewGuid().ToString("N")[..8],
            Name = "PlanGen Test Route",
            Province = "Ankara",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
        };
        var stop = new RouteStop
        {
            Id = Guid.NewGuid(),
            RouteId = route.Id,
            StoreId = store.Id,
            Frequency = Frequency.Daily,
            WeekdayMask = 0,
            Sequence = 1,
            EffectiveFrom = stopEffectiveFrom,
            EffectiveTo = null,
        };

        var userId = Guid.NewGuid();
        db.Users.Add(new ApplicationUser
        {
            Id = userId,
            UserName = $"plangen-test-{userId}",
            NormalizedUserName = $"PLANGEN-TEST-{userId}".ToUpperInvariant(),
            Email = $"plangen-test-{userId}@evo.local",
            NormalizedEmail = $"PLANGEN-TEST-{userId}@EVO.LOCAL".ToUpperInvariant(),
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

        return (route, stop, store, merchandiser);
    }

    [Fact]
    public async Task RegenerateFutureAsync_MaterializesExpectedVisits_WithStartSetAndBreaksRespected()
    {
        await using var db = await CreateContextAsync();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var (route, _, _, _) = await SeedRouteAsync(db, today);

        var settingsProvider = new SettingsProvider(db);
        var service = new PlanGenerationService(db, settingsProvider, new TaskPlanProvider(db));

        var to = today.AddDays(13); // 2-week range
        var count = await service.RegenerateFutureAsync(route.Id, today, to);

        Assert.True(count > 0);
        var visits = await db.PlannedVisits.Where(v => v.RouteId == route.Id).ToListAsync();
        Assert.Equal(count, visits.Count);
        Assert.All(visits, v => Assert.NotNull(v.PlannedStart));

        var expectedWeekdays = Enumerable.Range(0, 14)
            .Select(today.AddDays)
            .Count(d => d.DayOfWeek != DayOfWeek.Saturday && d.DayOfWeek != DayOfWeek.Sunday);
        Assert.Equal(expectedWeekdays, visits.Count);
    }

    [Fact]
    public async Task SecondRun_IsIdempotent_CountStable()
    {
        await using var db = await CreateContextAsync();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var (route, _, _, _) = await SeedRouteAsync(db, today);

        var settingsProvider = new SettingsProvider(db);
        var service = new PlanGenerationService(db, settingsProvider, new TaskPlanProvider(db));
        var to = today.AddDays(6);

        var firstCount = await service.RegenerateFutureAsync(route.Id, today, to);
        var secondCount = await service.RegenerateFutureAsync(route.Id, today, to);

        Assert.Equal(firstCount, secondCount);
        var totalRows = await db.PlannedVisits.CountAsync(v => v.RouteId == route.Id);
        Assert.Equal(firstCount, totalRows);
    }

    [Fact]
    public async Task PastDatedVisit_IsNotModified_WhenRegenerateFromIsToday()
    {
        await using var db = await CreateContextAsync();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var (route, stop, store, merchandiser) = await SeedRouteAsync(db, today.AddDays(-10));

        var pastDate = today.AddDays(-3);
        var pastVisit = new PlannedVisit
        {
            Id = Guid.NewGuid(),
            RouteId = route.Id,
            RouteStopId = stop.Id,
            StoreId = store.Id,
            MerchandiserId = merchandiser.Id,
            VisitDate = pastDate,
            PlannedStart = new DateTimeOffset(pastDate.ToDateTime(new TimeOnly(9, 0)), TimeSpan.Zero),
            PlannedEnd = new DateTimeOffset(pastDate.ToDateTime(new TimeOnly(9, 30)), TimeSpan.Zero),
            Status = PlannedVisitStatus.Done,
        };
        db.PlannedVisits.Add(pastVisit);
        await db.SaveChangesAsync();

        var settingsProvider = new SettingsProvider(db);
        var service = new PlanGenerationService(db, settingsProvider, new TaskPlanProvider(db));
        await service.RegenerateFutureAsync(route.Id, pastDate, today.AddDays(3));

        var refreshed = await db.PlannedVisits.FirstAsync(v => v.Id == pastVisit.Id);
        Assert.Equal(PlannedVisitStatus.Done, refreshed.Status);
        Assert.Equal(pastDate, refreshed.VisitDate);
    }

    [Fact]
    public async Task ActiveSkipStorePatch_RemovesVisitsInWindow_RestoresPastEndsOn()
    {
        await using var db = await CreateContextAsync();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var (route, _, store, _) = await SeedRouteAsync(db, today);

        var windowEnd = today.AddDays(2);
        db.Patches.Add(new Patch
        {
            Id = Guid.NewGuid(),
            RouteId = route.Id,
            Type = PatchType.SkipStore,
            StoreId = store.Id,
            StartsOn = today,
            EndsOn = windowEnd,
            Status = PatchStatus.Active,
            Reason = "test skip",
        });
        await db.SaveChangesAsync();

        var settingsProvider = new SettingsProvider(db);
        var service = new PlanGenerationService(db, settingsProvider, new TaskPlanProvider(db));
        var to = today.AddDays(6);
        await service.RegenerateFutureAsync(route.Id, today, to);

        var visits = await db.PlannedVisits.Where(v => v.RouteId == route.Id).ToListAsync();
        Assert.DoesNotContain(visits, v => v.VisitDate <= windowEnd && v.VisitDate.DayOfWeek != DayOfWeek.Saturday && v.VisitDate.DayOfWeek != DayOfWeek.Sunday);
        Assert.Contains(visits, v => v.VisitDate > windowEnd);
    }
}
