using System.Net;
using System.Net.Http.Json;
using Evo.Api.Routing.Dtos;
using Evo.Api.Tasks.Dtos;
using Evo.Domain.Auth;
using Evo.Domain.Scheduling;
using Evo.Domain.Tasks;
using Evo.Infrastructure;
using Evo.Infrastructure.Routing;
using Evo.Infrastructure.Stores;
using Evo.Infrastructure.Tasks;
using Evo.Tests.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests.Tasks;

[Collection("TasksDb")]
public class AdhocTaskTests : IClassFixture<EvoApiTestFactory>, IAsyncLifetime
{
    private readonly EvoApiTestFactory _factory;

    public AdhocTaskTests(EvoApiTestFactory factory)
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
        var email = $"adhoc-test-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        return await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");
    }

    private async Task<(Store Store, RouteStop Stop, Route Route)> SeedStoreOnRouteAsync(string suffix, byte format)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();

        var store = new Store
        {
            Id = Guid.NewGuid(), EvoStoreId = "EVO-ADH-" + suffix, Name = "Adhoc Test Store " + suffix,
            Province = "Ankara", District = "Cankaya", Category = StoreCategory.HighValue, Format = format,
            SyncedAt = DateTimeOffset.UtcNow,
        };
        var route = new Route
        {
            Id = Guid.NewGuid(), RouteCode = "ADH-" + suffix, Name = "Adhoc Test Route " + suffix,
            Province = "Ankara", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
        };
        var today = TestClock.Today;
        var stop = new RouteStop
        {
            Id = Guid.NewGuid(), RouteId = route.Id, StoreId = store.Id, Frequency = Frequency.Daily,
            WeekdayMask = 0, Sequence = 1, EffectiveFrom = today, EffectiveTo = null,
        };

        db.Stores.Add(store);
        db.Routes.Add(route);
        db.RouteStops.Add(stop);
        await db.SaveChangesAsync();

        return (store, stop, route);
    }

    [Fact]
    public async Task PostAdhoc_AttachesInstanceToNextVisitBeforeDeadline()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = await SupervisorClientAsync(suffix);
        var (store, stop, route) = await SeedStoreOnRouteAsync(suffix, format: 3);
        var today = TestClock.Today;
        var deadline = today.AddDays(5);

        var request = new AdhocTaskRequest("SURVEY-" + suffix, "Fiyat Anketi " + suffix, 15, null, TargetFormat: 3, deadline);
        var response = await client.PostAsJsonAsync("/api/v1/tasks/adhoc", request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = await response.Content.ReadFromJsonAsync<AdhocTaskResponse>();
        Assert.NotNull(result);
        Assert.True(result!.MatchingStoreCount >= 1);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
        var visit = await db.PlannedVisits.FirstOrDefaultAsync(v => v.RouteStopId == stop.Id && v.VisitDate == today);
        Assert.NotNull(visit);
        var instance = await db.TaskInstances.SingleOrDefaultAsync(ti => ti.PlannedVisitId == visit!.Id && ti.TaskTemplateId == result.TaskTemplateId);
        Assert.NotNull(instance);
    }

    [Fact]
    public async Task RuleThatPushesDayOver450_ReturnsWarning_NotBlocked()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = await SupervisorClientAsync(suffix);
        var (store, stop, route) = await SeedStoreOnRouteAsync(suffix, format: 3);
        var today = TestClock.Today;

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            db.TaskTemplates.Add(new TaskTemplate { Id = Guid.NewGuid(), Code = "HUGE-" + suffix, Name = "Uzun Gorev", DefaultMinutes = 500, TargetFormat = 3, Active = true });
            await db.SaveChangesAsync();
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var planGen = scope.ServiceProvider.GetRequiredService<IPlanGenerationService>();
            await planGen.RegenerateFutureAsync(route.Id, today, today);
        }

        var planResponse = await client.GetAsync($"/api/v1/routes/{route.Id}/plan?from={today:yyyy-MM-dd}&to={today:yyyy-MM-dd}");
        Assert.Equal(HttpStatusCode.OK, planResponse.StatusCode);
        var days = await planResponse.Content.ReadFromJsonAsync<List<PlanDayDto>>();
        var todayPlan = days!.Single(d => d.Date == today);

        Assert.Contains(todayPlan.Findings, f => f.Code == "V2");
        Assert.All(todayPlan.Findings.Where(f => f.Code == "V2"), f => Assert.Equal(FindingSeverity.Warning, f.Severity));
    }
}
