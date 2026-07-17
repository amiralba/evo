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
public class PlanRealizedFieldsTests : IClassFixture<EvoApiTestFactory>
{
    private readonly EvoApiTestFactory _factory;

    public PlanRealizedFieldsTests(EvoApiTestFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GetPlan_PastVisit_ReturnsRealizedFieldsAndNearestPingLocation()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var email = $"realized-test-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        var pastDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-3);
        var checkInAt = new DateTimeOffset(pastDate.ToDateTime(new TimeOnly(9, 30)), TimeSpan.Zero);
        var checkOutAt = checkInAt.AddMinutes(30);

        Guid routeId, merchandiserId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();

            var store = new Store
            {
                Id = Guid.NewGuid(), EvoStoreId = "EVO-RLZ-" + suffix, Name = "Realized Test Store " + suffix,
                Province = "Ankara", District = "Cankaya", Category = StoreCategory.HighValue, Format = 2,
                SyncedAt = DateTimeOffset.UtcNow,
            };
            var route = new Route
            {
                Id = Guid.NewGuid(), RouteCode = "RLZ-" + suffix, Name = "Realized Test Route " + suffix,
                Province = "Ankara", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
            };
            var stop = new RouteStop
            {
                Id = Guid.NewGuid(), RouteId = route.Id, StoreId = store.Id, Frequency = Frequency.Daily,
                WeekdayMask = 0, Sequence = 1, EffectiveFrom = pastDate, EffectiveTo = null,
            };

            var userId = Guid.NewGuid();
            db.Users.Add(new ApplicationUser
            {
                Id = userId, UserName = $"realized-merch-{suffix}", NormalizedUserName = $"REALIZED-MERCH-{suffix}".ToUpperInvariant(),
                Email = $"realized-merch-{suffix}@evo.local", NormalizedEmail = $"REALIZED-MERCH-{suffix}@EVO.LOCAL".ToUpperInvariant(),
                DisplayName = "Realized Test Merchandiser",
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
                MerchandiserId = merchandiser.Id, VisitDate = pastDate,
                PlannedStart = checkInAt, PlannedEnd = checkInAt.AddMinutes(25),
                Source = PlannedVisitSource.Baseline, Status = PlannedVisitStatus.Done,
            };
            db.PlannedVisits.Add(visit);
            db.VisitRealizations.Add(new VisitRealization
            {
                Id = Guid.NewGuid(), PlannedVisitId = visit.Id,
                CheckInAt = checkInAt, CheckOutAt = checkOutAt, ActualMinutes = 30,
            });

            // Nearest ping (5 min after check-in) should win over a farther one (25 min after).
            db.LocationPings.Add(new MerchandiserLocationPing { Id = Guid.NewGuid(), MerchandiserId = merchandiser.Id, Lat = 39.90, Lng = 32.85, RecordedAt = checkInAt.AddMinutes(5) });
            db.LocationPings.Add(new MerchandiserLocationPing { Id = Guid.NewGuid(), MerchandiserId = merchandiser.Id, Lat = 39.91, Lng = 32.86, RecordedAt = checkInAt.AddMinutes(25) });
            await db.SaveChangesAsync();

            routeId = route.Id;
            merchandiserId = merchandiser.Id;
        }

        var response = await client.GetAsync($"/api/v1/routes/{routeId}/plan?from={pastDate:yyyy-MM-dd}&to={pastDate:yyyy-MM-dd}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var days = await response.Content.ReadFromJsonAsync<List<PlanDayDto>>();
        var visitDto = days!.Single().Visits.Single();

        Assert.Equal(PlannedVisitStatus.Done, visitDto.Status);
        Assert.Equal(checkInAt, visitDto.CheckInAt);
        Assert.Equal(checkOutAt, visitDto.CheckOutAt);
        Assert.Equal(30, visitDto.ActualMinutes);
        Assert.NotNull(visitDto.CheckInLocation);
        Assert.Equal(39.90, visitDto.CheckInLocation!.Lat);
        Assert.Equal(32.85, visitDto.CheckInLocation.Lng);
    }
}
