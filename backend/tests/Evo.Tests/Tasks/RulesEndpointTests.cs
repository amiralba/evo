using System.Net;
using System.Net.Http.Json;
using Evo.Api.Audit.Dtos;
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
public class RulesEndpointTests : IClassFixture<EvoApiTestFactory>, IAsyncLifetime
{
    private readonly EvoApiTestFactory _factory;

    public RulesEndpointTests(EvoApiTestFactory factory)
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

    private async Task<HttpClient> ClientAsync(string suffix, string role)
    {
        var email = $"rules-test-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", role);
        return await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");
    }

    private async Task<(Store Store, RouteStop Stop, TaskTemplate Template)> SeedStoreOnRouteAsync(string suffix)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();

        var store = new Store
        {
            Id = Guid.NewGuid(), EvoStoreId = "EVO-RUL-" + suffix, Name = "Rules Test Store " + suffix,
            Province = "Ankara", District = "Cankaya", Category = StoreCategory.HighValue, Format = 2,
            SyncedAt = DateTimeOffset.UtcNow,
        };
        var route = new Route
        {
            Id = Guid.NewGuid(), RouteCode = "RUL-" + suffix, Name = "Rules Test Route " + suffix,
            Province = "Ankara", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
        };
        var today = TestClock.Today;
        var stop = new RouteStop
        {
            Id = Guid.NewGuid(), RouteId = route.Id, StoreId = store.Id, Frequency = Frequency.Daily,
            WeekdayMask = 0, Sequence = 1, EffectiveFrom = today, EffectiveTo = null,
        };
        var template = new TaskTemplate { Id = Guid.NewGuid(), Code = "SHELF-" + suffix, Name = "Raf", DefaultMinutes = 20, TargetFormat = 2, Active = true };

        db.Stores.Add(store);
        db.Routes.Add(route);
        db.RouteStops.Add(stop);
        db.TaskTemplates.Add(template);
        await db.SaveChangesAsync();

        return (store, stop, template);
    }

    [Fact]
    public async Task Supervisor_CreatesRule_WritesAuditRow_AndRegeneratesAffectedRoute()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = await ClientAsync(suffix, Roles.Supervisor);
        var (store, stop, template) = await SeedStoreOnRouteAsync(suffix);
        var today = TestClock.Today;

        var request = new CreateRuleRequest(
            template.Id, RuleScopeLevel.Store,
            new RuleConditionDto(null, null, null, null, null, null, store.Id),
            new RuleEffectDto(TaskEffectOp.SetMinutes, 60, null),
            Priority: 0, EffectiveFrom: today, EffectiveTo: null);

        var response = await client.PostAsJsonAsync("/api/v1/rules", request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var rule = await response.Content.ReadFromJsonAsync<RuleDto>();
        Assert.NotNull(rule);
        Assert.Equal(60, rule!.Effect.SetValue);

        var auditResponse = await client.GetAsync($"/api/v1/audit-log?entityType=Rule&pageSize=50");
        Assert.Equal(HttpStatusCode.OK, auditResponse.StatusCode);
        var auditPage = await auditResponse.Content.ReadFromJsonAsync<PagedResult<AuditLogEntryDto>>();
        Assert.Contains(auditPage!.Items, e => e.EntityKey == rule.Id.ToString() && e.Event == "create");

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
        var visit = await db.PlannedVisits.SingleAsync(v => v.RouteStopId == stop.Id && v.VisitDate == today);
        var instance = await db.TaskInstances.SingleAsync(ti => ti.PlannedVisitId == visit.Id && ti.TaskTemplateId == template.Id);
        Assert.Equal(60, instance.ResolvedMinutes);
    }

    [Fact]
    public async Task FieldAgent_CreateRule_Returns403()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = await ClientAsync(suffix, Roles.FieldAgent);

        var request = new CreateRuleRequest(
            null, RuleScopeLevel.Global,
            new RuleConditionDto(null, null, null, null, null, null, null),
            new RuleEffectDto(TaskEffectOp.SetMinutes, 10, null),
            Priority: 0, EffectiveFrom: TestClock.Today, EffectiveTo: null);

        var response = await client.PostAsJsonAsync("/api/v1/rules", request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
