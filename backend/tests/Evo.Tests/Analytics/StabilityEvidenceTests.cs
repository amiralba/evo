using System.Net;
using System.Net.Http.Json;
using Evo.Api.Analytics.Dtos;
using Evo.Api.Audit;
using Evo.Domain.Auth;
using Evo.Domain.Scheduling;
using Evo.Infrastructure;
using Evo.Infrastructure.Routing;
using Evo.Infrastructure.Stores;
using Evo.Tests.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests.Analytics;

[Collection("TasksDb")]
public class StabilityEvidenceTests : IClassFixture<EvoApiTestFactory>
{
    private readonly EvoApiTestFactory _factory;

    public StabilityEvidenceTests(EvoApiTestFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GetStability_StructuralEvents_ReduceScoreFrom100()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var province = "StabilityTest-" + suffix;
        var email = $"stability-test-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        Guid routeId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            var route = new Route
            {
                Id = Guid.NewGuid(), RouteCode = "STAB-" + suffix, Name = "Stability Test Route " + suffix,
                Province = province, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
            };
            db.Routes.Add(route);
            await db.SaveChangesAsync();
            routeId = route.Id;

            var changeLog = scope.ServiceProvider.GetRequiredService<IRouteChangeLog>();
            await changeLog.WriteAsync(routeId, RouteChangeEvent.StopAdded, null, new { });
            await changeLog.WriteAsync(routeId, RouteChangeEvent.StopMoved, null, new { });
        }

        var response = await client.GetAsync($"/api/v1/analytics/stability?region={Uri.EscapeDataString(province)}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var stability = await response.Content.ReadFromJsonAsync<List<RouteStabilityDto>>();

        var routeStability = stability!.Single(r => r.RouteId == routeId);
        Assert.True(routeStability.StabilityScore < 100);
    }

    [Fact]
    public async Task GetEvidence_ReturnsPerStoreCountsAndCausalityDisclaimer()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var email = $"evidence-test-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        Guid routeId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            var store = new Store
            {
                Id = Guid.NewGuid(), EvoStoreId = "EVO-EV-" + suffix, Name = "Evidence Store " + suffix,
                Province = "Ankara", District = "Test", Category = StoreCategory.HighValue, Format = 2,
                SyncedAt = DateTimeOffset.UtcNow,
            };
            var route = new Route
            {
                Id = Guid.NewGuid(), RouteCode = "EV-" + suffix, Name = "Evidence Test Route " + suffix,
                Province = "Ankara", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
            };
            var stop = new RouteStop
            {
                Id = Guid.NewGuid(), RouteId = route.Id, StoreId = store.Id, Frequency = Frequency.Daily,
                WeekdayMask = 0, Sequence = 1, EffectiveFrom = today.AddDays(-5), EffectiveTo = null,
            };
            db.Stores.Add(store);
            db.Routes.Add(route);
            db.RouteStops.Add(stop);

            var visit = new PlannedVisit
            {
                Id = Guid.NewGuid(), RouteId = route.Id, RouteStopId = stop.Id, StoreId = store.Id,
                VisitDate = today.AddDays(-1),
                PlannedStart = new DateTimeOffset(today.AddDays(-1).ToDateTime(new TimeOnly(9, 0)), TimeSpan.Zero),
                PlannedEnd = new DateTimeOffset(today.AddDays(-1).ToDateTime(new TimeOnly(9, 20)), TimeSpan.Zero),
                Source = PlannedVisitSource.Baseline, Status = PlannedVisitStatus.Done,
            };
            db.PlannedVisits.Add(visit);
            await db.SaveChangesAsync();

            routeId = route.Id;
        }

        var response = await client.GetAsync($"/api/v1/routes/{routeId}/evidence?weeks=4");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var evidence = await response.Content.ReadFromJsonAsync<RouteEvidenceDto>();

        Assert.True(evidence!.CausalityDisclaimer);
        Assert.Single(evidence.Stores);
        Assert.Equal(1, evidence.Stores[0].Planned);
        Assert.Equal(1, evidence.Stores[0].Done);
    }
}
