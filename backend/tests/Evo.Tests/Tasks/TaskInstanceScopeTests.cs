using System.Net;
using System.Net.Http.Json;
using Evo.Api.Tasks.Dtos;
using Evo.Domain.Auth;
using Evo.Domain.Scheduling;
using Evo.Infrastructure;
using Evo.Infrastructure.Routing;
using Evo.Infrastructure.Stores;
using Evo.Infrastructure.Tasks;
using Evo.Tests.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests.Tasks;

[Collection("TasksDb")]
public class TaskInstanceScopeTests : IClassFixture<EvoApiTestFactory>, IAsyncLifetime
{
    private readonly EvoApiTestFactory _factory;

    public TaskInstanceScopeTests(EvoApiTestFactory factory)
    {
        _factory = factory;
    }

    public async Task InitializeAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
        await db.TaskInstances.ExecuteDeleteAsync();
        await db.Rules.ExecuteDeleteAsync();
        await db.TaskTemplates.ExecuteDeleteAsync();
    }

    public Task DisposeAsync() => Task.CompletedTask;

    private async Task<HttpClient> SupervisorClientAsync(string suffix)
    {
        var email = $"ti-scope-test-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        return await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");
    }

    private record Seeded(Store StoreA, Store StoreB, RouteStop StopA, RouteStop StopB, TaskTemplate Template);

    private async Task<Seeded> SeedTwoStoresSameFormatAsync(string suffix, byte format)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();

        var storeA = new Store { Id = Guid.NewGuid(), EvoStoreId = "EVO-TIS-A-" + suffix, Name = "TIS A " + suffix, Province = "Ankara", District = "Cankaya", Category = StoreCategory.HighValue, Format = format, SyncedAt = DateTimeOffset.UtcNow };
        var storeB = new Store { Id = Guid.NewGuid(), EvoStoreId = "EVO-TIS-B-" + suffix, Name = "TIS B " + suffix, Province = "Ankara", District = "Cankaya", Category = StoreCategory.HighValue, Format = format, SyncedAt = DateTimeOffset.UtcNow };
        var routeA = new Route { Id = Guid.NewGuid(), RouteCode = "TISA-" + suffix, Name = "TIS Route A " + suffix, Province = "Ankara", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
        var routeB = new Route { Id = Guid.NewGuid(), RouteCode = "TISB-" + suffix, Name = "TIS Route B " + suffix, Province = "Ankara", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
        var today = TestClock.Today;
        var stopA = new RouteStop { Id = Guid.NewGuid(), RouteId = routeA.Id, StoreId = storeA.Id, Frequency = Frequency.Daily, WeekdayMask = 0, Sequence = 1, EffectiveFrom = today, EffectiveTo = null };
        var stopB = new RouteStop { Id = Guid.NewGuid(), RouteId = routeB.Id, StoreId = storeB.Id, Frequency = Frequency.Daily, WeekdayMask = 0, Sequence = 1, EffectiveFrom = today, EffectiveTo = null };
        var template = new TaskTemplate { Id = Guid.NewGuid(), Code = "SHELF-" + suffix, Name = "Raf", DefaultMinutes = 20, TargetFormat = format, Active = true };

        db.Stores.AddRange(storeA, storeB);
        db.Routes.AddRange(routeA, routeB);
        db.RouteStops.AddRange(stopA, stopB);
        db.TaskTemplates.Add(template);
        await db.SaveChangesAsync();

        return new Seeded(storeA, storeB, stopA, stopB, template);
    }

    private async Task RegenerateAsync(Guid routeId)
    {
        using var scope = _factory.Services.CreateScope();
        var planGen = scope.ServiceProvider.GetRequiredService<IPlanGenerationService>();
        var today = TestClock.Today;
        await planGen.RegenerateFutureAsync(routeId, today, today);
    }

    [Fact]
    public async Task InstanceScope_OnlyChangesThatVisit()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = await SupervisorClientAsync(suffix);
        var seeded = await SeedTwoStoresSameFormatAsync(suffix, format: 4);
        await RegenerateAsync(seeded.StopA.RouteId);
        await RegenerateAsync(seeded.StopB.RouteId);

        var today = TestClock.Today;
        Guid instanceAId, instanceBIdBefore;
        int minutesBBefore;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            var visitA = await db.PlannedVisits.SingleAsync(v => v.RouteStopId == seeded.StopA.Id && v.VisitDate == today);
            var visitB = await db.PlannedVisits.SingleAsync(v => v.RouteStopId == seeded.StopB.Id && v.VisitDate == today);
            var instanceA = await db.TaskInstances.SingleAsync(ti => ti.PlannedVisitId == visitA.Id && ti.TaskTemplateId == seeded.Template.Id);
            var instanceB = await db.TaskInstances.SingleAsync(ti => ti.PlannedVisitId == visitB.Id && ti.TaskTemplateId == seeded.Template.Id);
            instanceAId = instanceA.Id;
            instanceBIdBefore = instanceB.Id;
            minutesBBefore = instanceB.ResolvedMinutes;
        }

        var response = await client.PatchAsJsonAsync($"/api/v1/task-instances/{instanceAId}", new PatchTaskInstanceRequest(77, "INSTANCE"));
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        using var verifyScope = _factory.Services.CreateScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<EvoDbContext>();
        var updatedA = await verifyDb.TaskInstances.SingleAsync(ti => ti.Id == instanceAId);
        Assert.Equal(77, updatedA.OverrideMinutes);

        var untouchedB = await verifyDb.TaskInstances.SingleAsync(ti => ti.Id == instanceBIdBefore);
        Assert.Equal(minutesBBefore, untouchedB.ResolvedMinutes);
        Assert.Null(untouchedB.OverrideMinutes);
    }

    [Fact]
    public async Task StoreRuleScope_CreatesRule_AndOnlyChangesThatStore()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = await SupervisorClientAsync(suffix);
        var seeded = await SeedTwoStoresSameFormatAsync(suffix, format: 5);
        await RegenerateAsync(seeded.StopA.RouteId);
        await RegenerateAsync(seeded.StopB.RouteId);

        var today = TestClock.Today;
        Guid instanceAId;
        int minutesBBefore, rulesBefore;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            var visitA = await db.PlannedVisits.SingleAsync(v => v.RouteStopId == seeded.StopA.Id && v.VisitDate == today);
            var visitB = await db.PlannedVisits.SingleAsync(v => v.RouteStopId == seeded.StopB.Id && v.VisitDate == today);
            var instanceA = await db.TaskInstances.SingleAsync(ti => ti.PlannedVisitId == visitA.Id && ti.TaskTemplateId == seeded.Template.Id);
            var instanceB = await db.TaskInstances.SingleAsync(ti => ti.PlannedVisitId == visitB.Id && ti.TaskTemplateId == seeded.Template.Id);
            instanceAId = instanceA.Id;
            minutesBBefore = instanceB.ResolvedMinutes;
            rulesBefore = await db.Rules.CountAsync();
        }

        var response = await client.PatchAsJsonAsync($"/api/v1/task-instances/{instanceAId}", new PatchTaskInstanceRequest(88, "STORE_RULE"));
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        using var verifyScope = _factory.Services.CreateScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<EvoDbContext>();
        Assert.Equal(rulesBefore + 1, await verifyDb.Rules.CountAsync());

        var visitAAfter = await verifyDb.PlannedVisits.SingleAsync(v => v.RouteStopId == seeded.StopA.Id && v.VisitDate == today);
        var instanceAAfter = await verifyDb.TaskInstances.SingleAsync(ti => ti.PlannedVisitId == visitAAfter.Id && ti.TaskTemplateId == seeded.Template.Id);
        Assert.Equal(88, instanceAAfter.ResolvedMinutes);

        var visitBAfter = await verifyDb.PlannedVisits.SingleAsync(v => v.RouteStopId == seeded.StopB.Id && v.VisitDate == today);
        var instanceBAfter = await verifyDb.TaskInstances.SingleAsync(ti => ti.PlannedVisitId == visitBAfter.Id && ti.TaskTemplateId == seeded.Template.Id);
        Assert.Equal(minutesBBefore, instanceBAfter.ResolvedMinutes);
    }

    [Fact]
    public async Task FormatRuleScope_CreatesRule_AndChangesAllStoresOfThatFormat()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = await SupervisorClientAsync(suffix);
        var seeded = await SeedTwoStoresSameFormatAsync(suffix, format: 6);
        await RegenerateAsync(seeded.StopA.RouteId);
        await RegenerateAsync(seeded.StopB.RouteId);

        var today = TestClock.Today;
        Guid instanceAId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            var visitA = await db.PlannedVisits.SingleAsync(v => v.RouteStopId == seeded.StopA.Id && v.VisitDate == today);
            var instanceA = await db.TaskInstances.SingleAsync(ti => ti.PlannedVisitId == visitA.Id && ti.TaskTemplateId == seeded.Template.Id);
            instanceAId = instanceA.Id;
        }

        var response = await client.PatchAsJsonAsync($"/api/v1/task-instances/{instanceAId}", new PatchTaskInstanceRequest(99, "FORMAT_RULE"));
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        using var verifyScope = _factory.Services.CreateScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<EvoDbContext>();

        var visitAAfter = await verifyDb.PlannedVisits.SingleAsync(v => v.RouteStopId == seeded.StopA.Id && v.VisitDate == today);
        var instanceAAfter = await verifyDb.TaskInstances.SingleAsync(ti => ti.PlannedVisitId == visitAAfter.Id && ti.TaskTemplateId == seeded.Template.Id);
        Assert.Equal(99, instanceAAfter.ResolvedMinutes);

        var visitBAfter = await verifyDb.PlannedVisits.SingleAsync(v => v.RouteStopId == seeded.StopB.Id && v.VisitDate == today);
        var instanceBAfter = await verifyDb.TaskInstances.SingleAsync(ti => ti.PlannedVisitId == visitBAfter.Id && ti.TaskTemplateId == seeded.Template.Id);
        Assert.Equal(99, instanceBAfter.ResolvedMinutes);
    }
}
