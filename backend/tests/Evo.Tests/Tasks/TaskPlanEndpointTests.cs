using System.Net;
using System.Net.Http.Json;
using Evo.Api.Tasks.Dtos;
using Evo.Domain.Auth;
using Evo.Infrastructure;
using Evo.Infrastructure.Stores;
using Evo.Infrastructure.Tasks;
using Evo.Tests.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests.Tasks;

[Collection("TasksDb")]
public class TaskPlanEndpointTests : IClassFixture<EvoApiTestFactory>, IAsyncLifetime
{
    private readonly EvoApiTestFactory _factory;

    public TaskPlanEndpointTests(EvoApiTestFactory factory)
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
        var email = $"task-plan-test-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        return await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");
    }

    private async Task<Store> SeedStoreAsync(string suffix)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
        var store = new Store
        {
            Id = Guid.NewGuid(),
            EvoStoreId = "EVO-TPE-" + suffix,
            Name = "TaskPlan Test Store " + suffix,
            Province = "Ankara",
            District = "Cankaya",
            Category = StoreCategory.HighValue,
            Format = 2,
            SyncedAt = DateTimeOffset.UtcNow,
        };
        db.Stores.Add(store);
        await db.SaveChangesAsync();
        return store;
    }

    [Fact]
    public async Task GetTaskTemplates_ReturnsSeededTemplates()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = await SupervisorClientAsync(suffix);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            db.TaskTemplates.Add(new TaskTemplate { Id = Guid.NewGuid(), Code = "TPL-" + suffix, Name = "Test Template", DefaultMinutes = 15, TargetFormat = 1, Active = true });
            await db.SaveChangesAsync();
        }

        var response = await client.GetAsync("/api/v1/task-templates");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var templates = await response.Content.ReadFromJsonAsync<List<TaskTemplateDto>>();
        Assert.Contains(templates!, t => t.Code == "TPL-" + suffix);
    }

    [Fact]
    public async Task GetTaskPlan_ReturnsResolvedTasksWithTraceAndCorrectTotal()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = await SupervisorClientAsync(suffix);
        var store = await SeedStoreAsync(suffix);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            db.TaskTemplates.Add(new TaskTemplate { Id = Guid.NewGuid(), Code = "SHELF-" + suffix, Name = "Raf", DefaultMinutes = 20, TargetFormat = 2, Active = true });
            db.TaskTemplates.Add(new TaskTemplate { Id = Guid.NewGuid(), Code = "SURVEY-" + suffix, Name = "Anket", DefaultMinutes = 10, TargetFormat = 2, Active = true });
            await db.SaveChangesAsync();
        }

        var date = DateOnly.FromDateTime(DateTime.UtcNow);
        var response = await client.GetAsync($"/api/v1/stores/{store.Id}/task-plan?date={date:yyyy-MM-dd}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var plan = await response.Content.ReadFromJsonAsync<TaskPlanDto>();
        Assert.NotNull(plan);
        Assert.Contains(plan!.Tasks, t => t.Code == "SHELF-" + suffix && t.Minutes == 20);
        Assert.Contains(plan.Tasks, t => t.Code == "SURVEY-" + suffix && t.Minutes == 10);
        Assert.Equal(plan.Tasks.Sum(t => t.Minutes), plan.VisitTotalMinutes);
        Assert.All(plan.Tasks, t => Assert.NotEmpty(t.Trace));
    }

    [Fact]
    public async Task GetTaskPlan_UnknownStore_Returns404()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = await SupervisorClientAsync(suffix);

        var response = await client.GetAsync($"/api/v1/stores/{Guid.NewGuid()}/task-plan?date={DateOnly.FromDateTime(DateTime.UtcNow):yyyy-MM-dd}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
