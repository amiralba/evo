using Evo.Domain.Scheduling;
using Evo.Domain.Tasks;
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
public class PlanGenTaskMinutesTests
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

        await db.TaskInstances.ExecuteDeleteAsync();
        await db.Rules.ExecuteDeleteAsync();
        await db.TaskTemplates.ExecuteDeleteAsync();
        await db.PlannedVisits.ExecuteDeleteAsync();
        await db.Patches.ExecuteDeleteAsync();
        await db.Assignments.ExecuteDeleteAsync();
        await db.RouteStops.ExecuteDeleteAsync();
        await db.Routes.ExecuteDeleteAsync();
        await db.Merchandisers.ExecuteDeleteAsync();
        await db.Stores.ExecuteDeleteAsync();
        await db.Users.Where(u => u.UserName!.StartsWith("plangen-tm-test-")).ExecuteDeleteAsync();

        return db;
    }

    private static async Task<(Route Route, RouteStop Stop, Store Store)> SeedRouteAsync(EvoDbContext db, DateOnly stopEffectiveFrom, byte format = 2)
    {
        var store = new Store
        {
            Id = Guid.NewGuid(),
            EvoStoreId = "EVO-PGTM-" + Guid.NewGuid().ToString("N")[..8],
            Name = "Test Store",
            Province = "Ankara",
            District = "Cankaya",
            Category = StoreCategory.HighValue,
            Format = format,
            SyncedAt = DateTimeOffset.UtcNow,
        };
        var route = new Route
        {
            Id = Guid.NewGuid(),
            RouteCode = "PGTM-" + Guid.NewGuid().ToString("N")[..8],
            Name = "PlanGen TaskMinutes Test Route",
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
            UserName = $"plangen-tm-test-{userId}",
            NormalizedUserName = $"PLANGEN-TM-TEST-{userId}".ToUpperInvariant(),
            Email = $"plangen-tm-test-{userId}@evo.local",
            NormalizedEmail = $"PLANGEN-TM-TEST-{userId}@EVO.LOCAL".ToUpperInvariant(),
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
    public async Task RegenerateFutureAsync_SetsVisitMinutes_ToSumOfResolvedTasks_AndUpsertsTaskInstances()
    {
        await using var db = await CreateContextAsync();
        var today = TestClock.Today;
        var (route, _, store) = await SeedRouteAsync(db, today);

        var t1 = new TaskTemplate { Id = Guid.NewGuid(), Code = "SHELF", Name = "Raf Duzeni", DefaultMinutes = 20, Active = true };
        var t2 = new TaskTemplate { Id = Guid.NewGuid(), Code = "SURVEY", Name = "Fiyat Anketi", DefaultMinutes = 10, Active = true };
        db.TaskTemplates.AddRange(t1, t2);
        await db.SaveChangesAsync();

        var settingsProvider = new SettingsProvider(db);
        var service = new PlanGenerationService(db, settingsProvider, new TaskPlanProvider(db), TestClock.Clock);

        var to = today; // just today for a focused assertion
        await service.RegenerateFutureAsync(route.Id, today, to);

        var visit = await db.PlannedVisits.SingleAsync(v => v.RouteId == route.Id && v.VisitDate == today);
        var expectedMinutes = 30; // 20 + 10
        var actualMinutes = (int)(visit.PlannedEnd!.Value - visit.PlannedStart!.Value).TotalMinutes;
        Assert.Equal(expectedMinutes, actualMinutes);

        var instances = await db.TaskInstances.Where(ti => ti.PlannedVisitId == visit.Id).ToListAsync();
        Assert.Equal(2, instances.Count);
        Assert.Contains(instances, i => i.TaskTemplateId == t1.Id && i.ResolvedMinutes == 20);
        Assert.Contains(instances, i => i.TaskTemplateId == t2.Id && i.ResolvedMinutes == 10);
        Assert.All(instances, i => Assert.Equal(TaskInstanceStatus.Pending, i.Status));
    }

    [Fact]
    public async Task RegenerateFutureAsync_ExplicitServiceMinutes_StillWinsAsManualOverride()
    {
        await using var db = await CreateContextAsync();
        var today = TestClock.Today;
        var (route, stop, _) = await SeedRouteAsync(db, today);

        stop.ServiceMinutes = 99;
        db.TaskTemplates.Add(new TaskTemplate { Id = Guid.NewGuid(), Code = "SHELF", Name = "Raf Duzeni", DefaultMinutes = 20, Active = true });
        await db.SaveChangesAsync();

        var settingsProvider = new SettingsProvider(db);
        var service = new PlanGenerationService(db, settingsProvider, new TaskPlanProvider(db), TestClock.Clock);

        await service.RegenerateFutureAsync(route.Id, today, today);

        var visit = await db.PlannedVisits.SingleAsync(v => v.RouteId == route.Id && v.VisitDate == today);
        var actualMinutes = (int)(visit.PlannedEnd!.Value - visit.PlannedStart!.Value).TotalMinutes;
        Assert.Equal(99, actualMinutes);
    }
}
