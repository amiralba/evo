using System.Net;
using System.Net.Http.Json;
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
public class RuleImpactTests : IClassFixture<EvoApiTestFactory>, IAsyncLifetime
{
    private readonly EvoApiTestFactory _factory;

    public RuleImpactTests(EvoApiTestFactory factory)
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

    [Fact]
    public async Task Impact_ReturnsNonTrivialCounts_AndPersistsNothing()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var email = $"rule-impact-test-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        Guid storeId, templateId;
        int rulesCountBefore, taskInstancesCountBefore;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();

            var store = new Store
            {
                Id = Guid.NewGuid(), EvoStoreId = "EVO-IMP-" + suffix, Name = "Impact Test Store " + suffix,
                Province = "Ankara", District = "Cankaya", Category = StoreCategory.HighValue, Format = 2,
                SyncedAt = DateTimeOffset.UtcNow,
            };
            var route = new Route
            {
                Id = Guid.NewGuid(), RouteCode = "IMP-" + suffix, Name = "Impact Test Route " + suffix,
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

            storeId = store.Id;
            templateId = template.Id;

            rulesCountBefore = await db.Rules.CountAsync();
            taskInstancesCountBefore = await db.TaskInstances.CountAsync();
        }

        var url = $"/api/v1/rules/impact?scope={RuleScopeLevel.Store}&taskTemplateId={templateId}&storeId={storeId}&op={TaskEffectOp.SetMinutes}&setValue=999";
        var response = await client.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var impact = await response.Content.ReadFromJsonAsync<RuleImpactDto>();
        Assert.NotNull(impact);
        Assert.True(impact!.Stores >= 1);
        Assert.True(impact.VisitsPerWeek >= 1);
        Assert.True(impact.DeltaMinutesPerWeek > 0);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            Assert.Equal(rulesCountBefore, await db.Rules.CountAsync());
            Assert.Equal(taskInstancesCountBefore, await db.TaskInstances.CountAsync());
        }
    }
}
