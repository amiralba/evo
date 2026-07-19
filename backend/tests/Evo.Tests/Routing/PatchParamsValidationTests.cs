using System.Net;
using System.Net.Http.Json;
using Evo.Api.Audit.Dtos;
using Evo.Api.Routing.Dtos;
using Evo.Api.Stores.Dtos;
using Evo.Domain.Auth;
using Evo.Domain.Scheduling;
using Evo.Infrastructure;
using Evo.Infrastructure.Routing;
using Evo.Tests.Auth;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests.Routing;

[Collection("SharedEvoDb")]
public class PatchParamsValidationTests : IClassFixture<EvoApiTestFactory>, IAsyncLifetime
{
    private readonly EvoApiTestFactory _factory;

    public PatchParamsValidationTests(EvoApiTestFactory factory)
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
        var email = $"patchparams-test-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        return await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");
    }

    private async Task<(RouteSummaryDto Route, Guid StoreId)> CreateRouteWithOneStopAsync(HttpClient client, string suffix)
    {
        await client.PostAsync("/api/v1/stores/sync", content: null);
        var listResponse = await client.GetAsync("/api/v1/stores?pageSize=1");
        var listPage = await listResponse.Content.ReadFromJsonAsync<PagedResult<StoreSummaryDto>>();
        var store = listPage!.Items[0];

        var createResponse = await client.PostAsJsonAsync("/api/v1/routes", new CreateRouteRequest(
            Name: "PatchParams Route " + suffix, Province: store.Province, Districts: null, RouteCode: "PP-" + suffix, RevenueTarget: 1000));
        var route = await createResponse.Content.ReadFromJsonAsync<RouteSummaryDto>();

        await client.PostAsJsonAsync($"/api/v1/routes/{route!.Id}/stops:bulk",
            new BulkAddStopsRequest([store.Id], Frequency: Frequency.Daily, WeekdayMask: 0, ServiceMinutes: 30));

        return (route, store.Id);
    }

    [Fact]
    public async Task CreatePatch_TimeShift_NullParamsJson_Returns422()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = await SupervisorClientAsync(suffix);
        var (route, storeId) = await CreateRouteWithOneStopAsync(client, suffix);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var response = await client.PostAsJsonAsync($"/api/v1/routes/{route.Id}/patches",
            new CreatePatchRequest(PatchType.TimeShift, storeId, null, today, today, null, "test"));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task CreatePatch_TimeShift_GarbageParamsJson_Returns422()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = await SupervisorClientAsync(suffix);
        var (route, storeId) = await CreateRouteWithOneStopAsync(client, suffix);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var response = await client.PostAsJsonAsync($"/api/v1/routes/{route.Id}/patches",
            new CreatePatchRequest(PatchType.TimeShift, storeId, null, today, today, "not json", "test"));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task CreatePatch_TimeShift_ValidParams_Returns200()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = await SupervisorClientAsync(suffix);
        var (route, storeId) = await CreateRouteWithOneStopAsync(client, suffix);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var response = await client.PostAsJsonAsync($"/api/v1/routes/{route.Id}/patches",
            new CreatePatchRequest(PatchType.TimeShift, storeId, null, today, today, """{"startMinutes":600}""", "test"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task CreatePatch_MoveVisit_GarbageParamsJson_Returns422()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = await SupervisorClientAsync(suffix);
        var (route, storeId) = await CreateRouteWithOneStopAsync(client, suffix);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var response = await client.PostAsJsonAsync($"/api/v1/routes/{route.Id}/patches",
            new CreatePatchRequest(PatchType.MoveVisit, storeId, null, today, today.AddDays(1), "not json", "test"));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task CreatePatch_MoveVisit_FromDateEqualsToDate_Returns422()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = await SupervisorClientAsync(suffix);
        var (route, storeId) = await CreateRouteWithOneStopAsync(client, suffix);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var paramsJson = $$"""{"fromDate":"{{today:O}}","toDate":"{{today:O}}"}""";

        var response = await client.PostAsJsonAsync($"/api/v1/routes/{route.Id}/patches",
            new CreatePatchRequest(PatchType.MoveVisit, storeId, null, today, today.AddDays(1), paramsJson, "test"));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task CreatePatch_MoveVisit_ValidParams_Returns200()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = await SupervisorClientAsync(suffix);
        var (route, storeId) = await CreateRouteWithOneStopAsync(client, suffix);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var tomorrow = today.AddDays(1);
        var paramsJson = $$"""{"fromDate":"{{today:O}}","toDate":"{{tomorrow:O}}"}""";

        var response = await client.PostAsJsonAsync($"/api/v1/routes/{route.Id}/patches",
            new CreatePatchRequest(PatchType.MoveVisit, storeId, null, today, tomorrow, paramsJson, "test"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task CancelPatch_PendingPatch_SetsStatusCancelled()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = await SupervisorClientAsync(suffix);
        var (route, storeId) = await CreateRouteWithOneStopAsync(client, suffix);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var createResponse = await client.PostAsJsonAsync($"/api/v1/routes/{route.Id}/patches",
            new CreatePatchRequest(PatchType.TimeShift, storeId, null, today, today, """{"startMinutes":600}""", "test"));
        var created = await createResponse.Content.ReadFromJsonAsync<PatchDto>();

        var cancelResponse = await client.PostAsync($"/api/v1/routes/{route.Id}/patches/{created!.Id}/cancel", content: null);
        var cancelled = await cancelResponse.Content.ReadFromJsonAsync<PatchDto>();

        Assert.Equal(HttpStatusCode.OK, cancelResponse.StatusCode);
        Assert.Equal(PatchStatus.Cancelled, cancelled!.Status);
    }

    [Fact]
    public async Task CancelPatch_AlreadyCancelled_Returns422()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = await SupervisorClientAsync(suffix);
        var (route, storeId) = await CreateRouteWithOneStopAsync(client, suffix);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var createResponse = await client.PostAsJsonAsync($"/api/v1/routes/{route.Id}/patches",
            new CreatePatchRequest(PatchType.TimeShift, storeId, null, today, today, """{"startMinutes":600}""", "test"));
        var created = await createResponse.Content.ReadFromJsonAsync<PatchDto>();
        await client.PostAsync($"/api/v1/routes/{route.Id}/patches/{created!.Id}/cancel", content: null);

        var secondCancel = await client.PostAsync($"/api/v1/routes/{route.Id}/patches/{created.Id}/cancel", content: null);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, secondCancel.StatusCode);
    }

    [Fact]
    public async Task UpdateStop_ServiceMinutes_SnapsTo5_AndClamps()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = await SupervisorClientAsync(suffix);
        var (route, _) = await CreateRouteWithOneStopAsync(client, suffix);

        var detailResponse = await client.GetAsync($"/api/v1/routes/{route.Id}");
        var detail = await detailResponse.Content.ReadFromJsonAsync<RouteDetailDto>();
        var stopId = detail!.Stops[0].Id;

        async Task<int?> UpdateAndGetMinutes(int minutes)
        {
            var response = await client.PatchAsJsonAsync($"/api/v1/routes/{route.Id}/stops/{stopId}",
                new UpdateStopRequest(null, minutes, null, null));
            var dto = await response.Content.ReadFromJsonAsync<RouteStopDto>();
            return dto!.ServiceMinutes;
        }

        Assert.Equal(235, await UpdateAndGetMinutes(237));
        Assert.Equal(240, await UpdateAndGetMinutes(500));
        Assert.Equal(10, await UpdateAndGetMinutes(3));
    }
}
