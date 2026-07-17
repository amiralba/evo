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

namespace Evo.Tests.Stores;

[Collection("SharedEvoDb")]
public class StoresGeoEndpointTests : IClassFixture<WebApplicationFactory<Program>>, IAsyncLifetime
{
    private readonly WebApplicationFactory<Program> _factory;

    public StoresGeoEndpointTests(WebApplicationFactory<Program> factory)
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
        var email = $"stores-geo-test-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        return await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");
    }

    [Fact]
    public async Task Geo_ReturnsLocatedStores_WithLatLng_ForRequestedProvince()
    {
        var client = await SupervisorClientAsync("located");
        await client.PostAsync("/api/v1/stores/sync", content: null);

        var listResponse = await client.GetAsync("/api/v1/stores?pageSize=1");
        var listPage = await listResponse.Content.ReadFromJsonAsync<PagedResult<StoreSummaryDto>>();
        var province = listPage!.Items[0].Province;

        var geoResponse = await client.GetAsync($"/api/v1/stores/geo?province={Uri.EscapeDataString(province)}");
        Assert.Equal(HttpStatusCode.OK, geoResponse.StatusCode);
        var geoStores = await geoResponse.Content.ReadFromJsonAsync<List<StoreGeoDto>>();
        Assert.NotNull(geoStores);
        Assert.NotEmpty(geoStores!);
        Assert.All(geoStores!, s => Assert.True(s.Latitude != 0 && s.Longitude != 0));
    }

    [Fact]
    public async Task Geo_MissingProvince_Returns422()
    {
        var client = await SupervisorClientAsync("missing-province");

        var response = await client.GetAsync("/api/v1/stores/geo");

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task Geo_OnRouteFilter_SplitsPoolFromRouted()
    {
        var suffix = "on-route-filter";
        var client = await SupervisorClientAsync(suffix);
        await client.PostAsync("/api/v1/stores/sync", content: null);

        var listResponse = await client.GetAsync("/api/v1/stores?pageSize=200");
        var listPage = await listResponse.Content.ReadFromJsonAsync<PagedResult<StoreSummaryDto>>();
        var byProvince = listPage!.Items.GroupBy(s => s.Province).OrderByDescending(g => g.Count()).First();
        var province = byProvince.Key;
        var store = byProvince.First();

        var createResponse = await client.PostAsJsonAsync("/api/v1/routes", new CreateRouteRequest(
            Name: "Geo Test Route " + suffix, Province: province, Districts: null, RouteCode: "GEO-" + suffix, RevenueTarget: 1000));
        var route = await createResponse.Content.ReadFromJsonAsync<RouteSummaryDto>();

        await client.PostAsJsonAsync($"/api/v1/routes/{route!.Id}/stops:bulk",
            new BulkAddStopsRequest([store.Id], Frequency: Frequency.Daily, WeekdayMask: 0, ServiceMinutes: 30));

        var onRouteResponse = await client.GetAsync($"/api/v1/stores/geo?province={Uri.EscapeDataString(province)}&onRoute=true");
        var onRouteStores = await onRouteResponse.Content.ReadFromJsonAsync<List<StoreGeoDto>>();
        Assert.Contains(onRouteStores!, s => s.Id == store.Id && s.ActiveRouteId == route.Id);

        var poolResponse = await client.GetAsync($"/api/v1/stores/geo?province={Uri.EscapeDataString(province)}&onRoute=false");
        var poolStores = await poolResponse.Content.ReadFromJsonAsync<List<StoreGeoDto>>();
        Assert.DoesNotContain(poolStores!, s => s.Id == store.Id);
    }

    [Fact]
    public async Task Unauthenticated_Geo_Returns401()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/v1/stores/geo?province=Ankara");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
