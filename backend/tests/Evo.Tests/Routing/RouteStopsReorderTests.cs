using System.Net;
using System.Net.Http.Json;
using Evo.Api.Audit.Dtos;
using Evo.Api.Routing.Dtos;
using Evo.Api.Stores.Dtos;
using Evo.Domain.Auth;
using Evo.Domain.Scheduling;
using Evo.Infrastructure;
using Evo.Tests.Auth;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests.Routing;

[Collection("SharedEvoDb")]
public class RouteStopsReorderTests : IClassFixture<WebApplicationFactory<Program>>, IAsyncLifetime
{
    private readonly WebApplicationFactory<Program> _factory;

    public RouteStopsReorderTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    public async Task InitializeAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
        await db.PlannedVisits.ExecuteDeleteAsync();
        await db.DecisionJournal.ExecuteDeleteAsync();
        await db.Patches.ExecuteDeleteAsync();
        await db.Assignments.ExecuteDeleteAsync();
        await db.RouteStops.ExecuteDeleteAsync();
        await db.Routes.ExecuteDeleteAsync();
    }

    public Task DisposeAsync() => Task.CompletedTask;

    private async Task<HttpClient> SupervisorClientAsync(string suffix)
    {
        var email = $"reorder-test-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        return await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");
    }

    private async Task<(RouteSummaryDto Route, List<RouteStopDto> Stops)> CreateRouteWithThreeStopsAsync(HttpClient client, string suffix)
    {
        await client.PostAsync("/api/v1/stores/sync", content: null);
        var listResponse = await client.GetAsync("/api/v1/stores?pageSize=200");
        var listPage = await listResponse.Content.ReadFromJsonAsync<PagedResult<StoreSummaryDto>>();
        var byProvince = listPage!.Items.GroupBy(s => s.Province).First(g => g.Count() >= 3);
        var province = byProvince.Key;
        var stores = byProvince.Take(3).ToList();

        var createResponse = await client.PostAsJsonAsync("/api/v1/routes", new CreateRouteRequest(
            Name: "Reorder Route " + suffix, Province: province, Districts: null, RouteCode: "REORD-" + suffix, RevenueTarget: 1000));
        var route = await createResponse.Content.ReadFromJsonAsync<RouteSummaryDto>();

        await client.PostAsJsonAsync($"/api/v1/routes/{route!.Id}/stops:bulk",
            new BulkAddStopsRequest(stores.Select(s => s.Id).ToList(), Frequency: Frequency.Daily, WeekdayMask: 0, ServiceMinutes: 30));

        var detailResponse = await client.GetAsync($"/api/v1/routes/{route.Id}");
        var detail = await detailResponse.Content.ReadFromJsonAsync<RouteDetailDto>();

        return (route, detail!.Stops.ToList());
    }

    [Fact]
    public async Task Reorder_ValidFullOrder_PersistsSequence_AndReturnsUpdatedRoute()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = await SupervisorClientAsync(suffix);
        var (route, stops) = await CreateRouteWithThreeStopsAsync(client, suffix);

        var newOrder = stops.Select(s => s.Id).Reverse().ToList();
        var response = await client.PostAsJsonAsync($"/api/v1/routes/{route.Id}/stops:reorder", new ReorderStopsRequest(newOrder));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = await response.Content.ReadFromJsonAsync<RouteDetailDto>();
        var orderedIds = updated!.Stops.OrderBy(s => s.Sequence).Select(s => s.Id).ToList();
        Assert.Equal(newOrder, orderedIds);
    }

    [Fact]
    public async Task Reorder_MissingStopId_Returns422()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = await SupervisorClientAsync(suffix);
        var (route, stops) = await CreateRouteWithThreeStopsAsync(client, suffix);

        var incompleteOrder = stops.Take(2).Select(s => s.Id).ToList();
        var response = await client.PostAsJsonAsync($"/api/v1/routes/{route.Id}/stops:reorder", new ReorderStopsRequest(incompleteOrder));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task Reorder_UnknownStopId_Returns422()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = await SupervisorClientAsync(suffix);
        var (route, stops) = await CreateRouteWithThreeStopsAsync(client, suffix);

        var badOrder = stops.Select(s => s.Id).Skip(1).Append(Guid.NewGuid()).ToList();
        var response = await client.PostAsJsonAsync($"/api/v1/routes/{route.Id}/stops:reorder", new ReorderStopsRequest(badOrder));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task Reorder_WritesExactlyOneAuditLogEntry()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = await SupervisorClientAsync(suffix);
        var (route, stops) = await CreateRouteWithThreeStopsAsync(client, suffix);
        var newOrder = stops.Select(s => s.Id).Reverse().ToList();

        await client.PostAsJsonAsync($"/api/v1/routes/{route.Id}/stops:reorder", new ReorderStopsRequest(newOrder));

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
        var count = await db.AuditLog.CountAsync(a => a.EntityType == "Route" && a.EntityKey == route.Id.ToString() && a.Event == "StopsReordered");
        Assert.Equal(1, count);
    }
}
