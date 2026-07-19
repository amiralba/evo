using System.Net;
using System.Net.Http.Json;
using Evo.Api.Routing.Dtos;
using Evo.Domain.Auth;
using Evo.Domain.Scheduling;
using Evo.Infrastructure;
using Evo.Infrastructure.Identity;
using Evo.Infrastructure.People;
using Evo.Infrastructure.Routing;
using Evo.Infrastructure.Stores;
using Evo.Tests.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests.Routing;

[Collection("TasksDb")]
public class AbsenceV14EndpointTests : IClassFixture<EvoApiTestFactory>
{
    private readonly EvoApiTestFactory _factory;

    public AbsenceV14EndpointTests(EvoApiTestFactory factory)
    {
        _factory = factory;
    }

    private static async Task<(Route Route, Guid MerchandiserId)> SeedRouteWithFutureVisitAsync(EvoDbContext db, string suffix, DateOnly visitDate, bool withAbsence)
    {
        var store = new Store
        {
            Id = Guid.NewGuid(), EvoStoreId = "EVO-V14-" + suffix, Name = "V14 Test Store " + suffix,
            Province = "Ankara", District = "Cankaya", Category = StoreCategory.HighValue, Format = 2,
            SyncedAt = DateTimeOffset.UtcNow,
        };
        var route = new Route
        {
            Id = Guid.NewGuid(), RouteCode = "V14-" + suffix, Name = "V14 Test Route " + suffix,
            Province = "Ankara", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
        };
        var stop = new RouteStop
        {
            Id = Guid.NewGuid(), RouteId = route.Id, StoreId = store.Id, Frequency = Frequency.Daily,
            WeekdayMask = 0, Sequence = 1, EffectiveFrom = visitDate, EffectiveTo = null,
        };

        var userId = Guid.NewGuid();
        db.Users.Add(new ApplicationUser
        {
            Id = userId, UserName = $"v14-merch-{suffix}", NormalizedUserName = $"V14-MERCH-{suffix}".ToUpperInvariant(),
            Email = $"v14-merch-{suffix}@evo.local", NormalizedEmail = $"V14-MERCH-{suffix}@EVO.LOCAL".ToUpperInvariant(),
            DisplayName = "V14 Test Merchandiser",
        });
        var merchandiser = new Merchandiser { Id = Guid.NewGuid(), UserId = userId, Active = true };

        db.Stores.Add(store);
        db.Routes.Add(route);
        db.RouteStops.Add(stop);
        db.Merchandisers.Add(merchandiser);
        await db.SaveChangesAsync();

        var visit = new PlannedVisit
        {
            Id = Guid.NewGuid(), RouteId = route.Id, RouteStopId = stop.Id, StoreId = store.Id,
            MerchandiserId = merchandiser.Id, VisitDate = visitDate,
            PlannedStart = new DateTimeOffset(visitDate.ToDateTime(new TimeOnly(9, 0)), TimeSpan.Zero),
            PlannedEnd = new DateTimeOffset(visitDate.ToDateTime(new TimeOnly(9, 30)), TimeSpan.Zero),
            Source = PlannedVisitSource.Baseline, Status = PlannedVisitStatus.Planned,
        };
        db.PlannedVisits.Add(visit);

        if (withAbsence)
        {
            db.Absences.Add(new Absence
            {
                Id = Guid.NewGuid(), MerchandiserId = merchandiser.Id,
                StartDate = visitDate.AddDays(-1), EndDate = visitDate.AddDays(1),
                Reason = AbsenceReason.SickLeave, CreatedAt = DateTimeOffset.UtcNow,
            });
        }
        await db.SaveChangesAsync();

        return (route, merchandiser.Id);
    }

    [Fact]
    public async Task Validate_VisitCollidingWithAbsence_ReturnsV14Error()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var email = $"v14-test-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        var futureDate = TestClock.Today.AddDays(5);
        Route route;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            (route, _) = await SeedRouteWithFutureVisitAsync(db, suffix, futureDate, withAbsence: true);
        }

        var response = await client.PostAsync($"/api/v1/routes/{route.Id}/validate", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var findings = await response.Content.ReadFromJsonAsync<List<FindingDto>>();

        Assert.Contains(findings!, f => f.Code == "V14" && f.Severity == FindingSeverity.Error);
    }

    [Fact]
    public async Task Validate_CleanRoute_ReturnsNoV14()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var email = $"v14-clean-test-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        var futureDate = TestClock.Today.AddDays(5);
        Route route;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            (route, _) = await SeedRouteWithFutureVisitAsync(db, suffix, futureDate, withAbsence: false);
        }

        var response = await client.PostAsync($"/api/v1/routes/{route.Id}/validate", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var findings = await response.Content.ReadFromJsonAsync<List<FindingDto>>();

        Assert.DoesNotContain(findings!, f => f.Code == "V14");
    }
}
