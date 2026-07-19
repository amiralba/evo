using System.Net;
using System.Net.Http.Json;
using Evo.Api.Audit.Dtos;
using Evo.Api.Routing.Dtos;
using Evo.Api.Stores.Dtos;
using Evo.Domain.Auth;
using Evo.Infrastructure;
using Evo.Infrastructure.Identity;
using Evo.Infrastructure.People;
using Evo.Infrastructure.Routing;
using Evo.Tests.Auth;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests.Routing;

/// <summary>
/// Uses the shared EvoDb (via WebApplicationFactory, like StoreEndpointTests) rather than the
/// isolated EvoDb_RoutingTests — so unlike the other Routing tests it must clean up its own
/// Route-family rows on start, otherwise a prior run's route_stops on FakeStoreSyncSource's
/// deterministic stores would make every subsequent run see those stores as "already routed".
/// [Collection("SharedEvoDb")] serializes this against the other shared-EvoDb test classes
/// (StoresGeoEndpointTests, RouteStopsReorderTests) that touch the same deterministic store set.
/// </summary>
[Collection("SharedEvoDb")]
public class RouteEndpointTests : IClassFixture<EvoApiTestFactory>, IAsyncLifetime
{
    private readonly EvoApiTestFactory _factory;

    public RouteEndpointTests(EvoApiTestFactory factory)
    {
        _factory = factory;
    }

    public async Task InitializeAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
        await db.VisitRealizations.ExecuteDeleteAsync();
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
        var email = $"route-test-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        return await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");
    }

    private async Task<(StoreSummaryDto InScope, StoreSummaryDto OutOfScope)> SyncAndPickTwoStoresAsync(HttpClient client)
    {
        await client.PostAsync("/api/v1/stores/sync", content: null);
        var listResponse = await client.GetAsync("/api/v1/stores?pageSize=200");
        var page = await listResponse.Content.ReadFromJsonAsync<PagedResult<StoreSummaryDto>>();
        var byProvince = page!.Items.GroupBy(s => s.Province).OrderByDescending(g => g.Count()).First();
        var inScope = byProvince.First();
        var outOfScope = page.Items.First(s => s.Province != inScope.Province);
        return (inScope, outOfScope);
    }

    private async Task<Guid> CreateMerchandiserAsync(string suffix)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Identity.UserManager<ApplicationUser>>();

        var email = $"route-test-merch-{suffix}@evo.local";
        var user = await userManager.FindByEmailAsync(email);
        if (user is null)
        {
            user = new ApplicationUser { UserName = email, Email = email, DisplayName = "Test Merchandiser", EmailConfirmed = true, IsActive = true };
            var result = await userManager.CreateAsync(user, "Passw0rd!");
            if (!result.Succeeded)
            {
                throw new InvalidOperationException(string.Join(", ", result.Errors.Select(e => e.Description)));
            }
        }

        var merchandiser = await db.Merchandisers.FirstOrDefaultAsync(m => m.UserId == user.Id);
        if (merchandiser is null)
        {
            merchandiser = new Merchandiser { Id = Guid.NewGuid(), UserId = user.Id, Active = true };
            db.Merchandisers.Add(merchandiser);
            await db.SaveChangesAsync();
        }
        return merchandiser.Id;
    }

    [Fact]
    public async Task FullRouteLifecycle_CreateStopsAssignActivatePatchPublish()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = await SupervisorClientAsync(suffix);
        var (inScope, outOfScope) = await SyncAndPickTwoStoresAsync(client);

        // 1. Create route
        var createResponse = await client.PostAsJsonAsync("/api/v1/routes", new CreateRouteRequest(
            Name: "Test Route " + suffix, Province: inScope.Province, Districts: [inScope.District], RouteCode: "RT-" + suffix, RevenueTarget: 1000));
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        var route = await createResponse.Content.ReadFromJsonAsync<RouteSummaryDto>();
        Assert.NotNull(route);

        // 2. Bulk-add stops: in-scope accepted, out-of-scope rejected (V3)
        var bulkResponse = await client.PostAsJsonAsync($"/api/v1/routes/{route!.Id}/stops:bulk",
            new BulkAddStopsRequest([inScope.Id, outOfScope.Id], Frequency: Evo.Domain.Scheduling.Frequency.Daily, WeekdayMask: 0, ServiceMinutes: 30));
        Assert.Equal(HttpStatusCode.OK, bulkResponse.StatusCode);
        var bulkResult = await bulkResponse.Content.ReadFromJsonAsync<BulkAddResultDto>();
        Assert.Contains(inScope.Id, bulkResult!.Added);
        Assert.Contains(bulkResult.Rejected, r => r.StoreId == outOfScope.Id && r.Reason == "out_of_geo_scope");

        // 3. V4: adding the same in-scope store to a second route is rejected
        var secondRouteResponse = await client.PostAsJsonAsync("/api/v1/routes", new CreateRouteRequest(
            Name: "Second Route " + suffix, Province: inScope.Province, Districts: [inScope.District], RouteCode: "RT2-" + suffix, RevenueTarget: 1000));
        var secondRoute = await secondRouteResponse.Content.ReadFromJsonAsync<RouteSummaryDto>();
        var secondBulkResponse = await client.PostAsJsonAsync($"/api/v1/routes/{secondRoute!.Id}/stops:bulk",
            new BulkAddStopsRequest([inScope.Id], Frequency: Evo.Domain.Scheduling.Frequency.Daily, WeekdayMask: 0, ServiceMinutes: 30));
        var secondBulkResult = await secondBulkResponse.Content.ReadFromJsonAsync<BulkAddResultDto>();
        Assert.Contains(secondBulkResult!.Rejected, r => r.StoreId == inScope.Id && r.Reason == "on_another_route");

        // 4. Assignment without reason -> 422
        var merchandiserId = await CreateMerchandiserAsync(suffix);
        var noReasonJson = new { MerchandiserId = merchandiserId, StartDate = TestClock.Today };
        var noReasonResponse = await client.PostAsJsonAsync($"/api/v1/routes/{route.Id}/assignment", noReasonJson);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, noReasonResponse.StatusCode);

        // 5. Assignment with reason -> 200
        var assignResponse = await client.PostAsJsonAsync($"/api/v1/routes/{route.Id}/assignment",
            new ReassignRequest(merchandiserId, TestClock.Today, AssignmentReason.NewHire));
        Assert.Equal(HttpStatusCode.OK, assignResponse.StatusCode);

        // 6. Draft->Active on a fresh route with no assignment -> 409
        var freshRouteResponse = await client.PostAsJsonAsync("/api/v1/routes", new CreateRouteRequest(
            Name: "Fresh Route " + suffix, Province: inScope.Province, Districts: null, RouteCode: "RT3-" + suffix, RevenueTarget: 1000));
        var freshRoute = await freshRouteResponse.Content.ReadFromJsonAsync<RouteSummaryDto>();
        var failActivateResponse = await client.PatchAsJsonAsync($"/api/v1/routes/{freshRoute!.Id}", new UpdateRouteRequest(null, null, RouteStatus.Active));
        Assert.Equal(HttpStatusCode.Conflict, failActivateResponse.StatusCode);

        // 7. Draft->Active on the assigned route -> 200
        var activateResponse = await client.PatchAsJsonAsync($"/api/v1/routes/{route.Id}", new UpdateRouteRequest(null, null, RouteStatus.Active));
        Assert.Equal(HttpStatusCode.OK, activateResponse.StatusCode);

        // 8. Patch without EndsOn -> 422 (V9)
        var noExpiryPatchResponse = await client.PostAsJsonAsync($"/api/v1/routes/{route.Id}/patches",
            new CreatePatchRequest(Evo.Domain.Scheduling.PatchType.SkipStore, inScope.Id, null, TestClock.Today, null, null, "test"));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, noExpiryPatchResponse.StatusCode);

        // 9. Patch with EndsOn -> 200
        var patchResponse = await client.PostAsJsonAsync($"/api/v1/routes/{route.Id}/patches",
            new CreatePatchRequest(Evo.Domain.Scheduling.PatchType.SkipStore, inScope.Id, null, TestClock.Today, TestClock.Today.AddDays(2), null, "test"));
        Assert.Equal(HttpStatusCode.OK, patchResponse.StatusCode);

        // 10. Publish with an Error finding and no reason -> 422; force an error by inserting an out-of-scope stop directly
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            db.RouteStops.Add(new RouteStop
            {
                Id = Guid.NewGuid(),
                RouteId = route.Id,
                StoreId = outOfScope.Id,
                Frequency = Evo.Domain.Scheduling.Frequency.Daily,
                WeekdayMask = 0,
                Sequence = 99,
                EffectiveFrom = TestClock.Today,
                EffectiveTo = null,
            });
            await db.SaveChangesAsync();
        }

        var publishNoReasonResponse = await client.PostAsJsonAsync($"/api/v1/routes/{route.Id}/publish", new PublishRequest(null, null));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, publishNoReasonResponse.StatusCode);

        var publishResponse = await client.PostAsJsonAsync($"/api/v1/routes/{route.Id}/publish",
            new PublishRequest("Testing override reason", "Testing override objective"));
        Assert.Equal(HttpStatusCode.OK, publishResponse.StatusCode);
        var publishResult = await publishResponse.Content.ReadFromJsonAsync<PublishResultDto>();
        Assert.True(publishResult!.OverrodeErrors);
        Assert.NotNull(publishResult.DecisionJournalId);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            var journalRow = await db.DecisionJournal.FirstOrDefaultAsync(j => j.Id == publishResult.DecisionJournalId);
            Assert.NotNull(journalRow);
            Assert.Equal(DecisionKind.PublishOverride, journalRow!.Kind);
        }

        // 11. GET plan returns days with findings
        var from = TestClock.Today;
        var to = from.AddDays(6);
        var planResponse = await client.GetAsync($"/api/v1/routes/{route.Id}/plan?from={from:yyyy-MM-dd}&to={to:yyyy-MM-dd}");
        Assert.Equal(HttpStatusCode.OK, planResponse.StatusCode);
        var plan = await planResponse.Content.ReadFromJsonAsync<List<PlanDayDto>>();
        Assert.NotNull(plan);
    }

    [Fact]
    public async Task FieldAgent_CreateRoute_Returns403()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var email = $"route-test-fieldagent-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.FieldAgent);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        var response = await client.PostAsJsonAsync("/api/v1/routes", new CreateRouteRequest("X", "Ankara", null, null, null));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Unauthenticated_CreateRoute_Returns401()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/v1/routes", new CreateRouteRequest("X", "Ankara", null, null, null));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task MerchandiserDay_FieldAgent_CanReadOwnDay_ButNotAnothers()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];

        var (selfMerchandiserId, selfClient) = await CreateFieldAgentWithMerchandiserAsync(suffix + "-self");
        var (otherMerchandiserId, _) = await CreateFieldAgentWithMerchandiserAsync(suffix + "-other");

        var today = TestClock.Today;

        var ownDayResponse = await selfClient.GetAsync($"/api/v1/merchandisers/{selfMerchandiserId}/day?date={today:yyyy-MM-dd}");
        Assert.Equal(HttpStatusCode.OK, ownDayResponse.StatusCode);

        var otherDayResponse = await selfClient.GetAsync($"/api/v1/merchandisers/{otherMerchandiserId}/day?date={today:yyyy-MM-dd}");
        Assert.Equal(HttpStatusCode.Forbidden, otherDayResponse.StatusCode);
    }

    [Fact]
    public async Task MerchandiserDay_Supervisor_CanReadAnyDay()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var (merchandiserId, _) = await CreateFieldAgentWithMerchandiserAsync(suffix);
        var supervisorClient = await SupervisorClientAsync("merch-day-" + suffix);
        var today = TestClock.Today;

        var response = await supervisorClient.GetAsync($"/api/v1/merchandisers/{merchandiserId}/day?date={today:yyyy-MM-dd}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private async Task<(Guid MerchandiserId, HttpClient Client)> CreateFieldAgentWithMerchandiserAsync(string suffix)
    {
        var email = $"route-test-agent-{suffix}@evo.local";
        var user = await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.FieldAgent);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
        var merchandiser = await db.Merchandisers.FirstOrDefaultAsync(m => m.UserId == user.Id);
        if (merchandiser is null)
        {
            merchandiser = new Merchandiser { Id = Guid.NewGuid(), UserId = user.Id, Active = true };
            db.Merchandisers.Add(merchandiser);
            await db.SaveChangesAsync();
        }

        return (merchandiser.Id, client);
    }
}
