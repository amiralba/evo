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
public class PlanGenFormatChangeReresolvesTests
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
        await db.Users.Where(u => u.UserName!.StartsWith("plangen-fc-test-")).ExecuteDeleteAsync();

        return db;
    }

    private static async Task<(Route Route, RouteStop Stop, Store Store)> SeedRouteAsync(EvoDbContext db, DateOnly stopEffectiveFrom)
    {
        var store = new Store
        {
            Id = Guid.NewGuid(),
            EvoStoreId = "EVO-PGFC-" + Guid.NewGuid().ToString("N")[..8],
            Name = "Test Store",
            Province = "Ankara",
            District = "Cankaya",
            Category = StoreCategory.HighValue,
            Format = 2, // M
            SyncedAt = DateTimeOffset.UtcNow,
        };
        var route = new Route
        {
            Id = Guid.NewGuid(),
            RouteCode = "PGFC-" + Guid.NewGuid().ToString("N")[..8],
            Name = "PlanGen FormatChange Test Route",
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
            UserName = $"plangen-fc-test-{userId}",
            NormalizedUserName = $"PLANGEN-FC-TEST-{userId}".ToUpperInvariant(),
            Email = $"plangen-fc-test-{userId}@evo.local",
            NormalizedEmail = $"PLANGEN-FC-TEST-{userId}@EVO.LOCAL".ToUpperInvariant(),
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
    public async Task PlanGenFormatChangeReresolvesTests_FormatChange_ReresolvesFutureDurationsAndInstances()
    {
        await using var db = await CreateContextAsync();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var (route, _, store) = await SeedRouteAsync(db, today);

        // 15 min for format M(2), 40 min for format MM(3) — via TargetFormat-scoped templates.
        var mTemplate = new TaskTemplate { Id = Guid.NewGuid(), Code = "SHELF", Name = "Raf (M)", DefaultMinutes = 15, TargetFormat = 2, Active = true };
        var mmTemplate = new TaskTemplate { Id = Guid.NewGuid(), Code = "SHELF_MM", Name = "Raf (MM)", DefaultMinutes = 40, TargetFormat = 3, Active = true };
        db.TaskTemplates.AddRange(mTemplate, mmTemplate);
        await db.SaveChangesAsync();

        var settingsProvider = new SettingsProvider(db);
        var service = new PlanGenerationService(db, settingsProvider, new TaskPlanProvider(db));

        await service.RegenerateFutureAsync(route.Id, today, today);

        var visitBefore = await db.PlannedVisits.SingleAsync(v => v.RouteId == route.Id && v.VisitDate == today);
        var minutesBefore = (int)(visitBefore.PlannedEnd!.Value - visitBefore.PlannedStart!.Value).TotalMinutes;
        Assert.Equal(15, minutesBefore);
        var instancesBefore = await db.TaskInstances.Where(ti => ti.PlannedVisitId == visitBefore.Id).ToListAsync();
        Assert.Single(instancesBefore);
        Assert.Equal(mTemplate.Id, instancesBefore[0].TaskTemplateId);

        // Freeze a past-dated instance to prove regeneration never touches history.
        var pastVisit = new PlannedVisit
        {
            Id = Guid.NewGuid(),
            RouteId = route.Id,
            RouteStopId = visitBefore.RouteStopId,
            StoreId = store.Id,
            VisitDate = today.AddDays(-1),
            PlannedStart = new DateTimeOffset(today.AddDays(-1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero),
            PlannedEnd = new DateTimeOffset(today.AddDays(-1).ToDateTime(TimeOnly.MinValue).AddMinutes(15), TimeSpan.Zero),
            Source = PlannedVisitSource.Baseline,
            Status = PlannedVisitStatus.Done,
        };
        db.PlannedVisits.Add(pastVisit);
        var pastInstance = new TaskInstance
        {
            Id = Guid.NewGuid(),
            PlannedVisitId = pastVisit.Id,
            StoreId = store.Id,
            TaskTemplateId = mTemplate.Id,
            ResolvedMinutes = 15,
            Status = TaskInstanceStatus.Done,
        };
        db.TaskInstances.Add(pastInstance);
        await db.SaveChangesAsync();

        // Format change: M -> MM.
        store.Format = 3;
        await db.SaveChangesAsync();

        await service.RegenerateFutureAsync(route.Id, today, today);

        var visitAfter = await db.PlannedVisits.SingleAsync(v => v.RouteId == route.Id && v.VisitDate == today);
        var minutesAfter = (int)(visitAfter.PlannedEnd!.Value - visitAfter.PlannedStart!.Value).TotalMinutes;
        Assert.Equal(40, minutesAfter);
        var instancesAfter = await db.TaskInstances.Where(ti => ti.PlannedVisitId == visitAfter.Id).ToListAsync();
        Assert.Single(instancesAfter);
        Assert.Equal(mmTemplate.Id, instancesAfter[0].TaskTemplateId);

        var untouchedPastInstance = await db.TaskInstances.SingleAsync(ti => ti.Id == pastInstance.Id);
        Assert.Equal(TaskInstanceStatus.Done, untouchedPastInstance.Status);
        Assert.Equal(15, untouchedPastInstance.ResolvedMinutes);
    }
}
