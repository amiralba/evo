using System.Net.Http.Json;
using Evo.Api.Audit.Dtos;
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
using Route = Evo.Infrastructure.Routing.Route;

namespace Evo.Tests.Routing;

[Collection("TasksDb")]
public class RouteListSummaryFieldsTests : IClassFixture<EvoApiTestFactory>
{
    private readonly EvoApiTestFactory _factory;

    public RouteListSummaryFieldsTests(EvoApiTestFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task List_IncludesMerchandiserNameAndSixMonthRevenue_ForTheAssignedRoute()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var email = $"route-summary-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        var province = "SummaryTest-" + suffix;
        Guid routeId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();

            var store = new Store
            {
                Id = Guid.NewGuid(), EvoStoreId = "EVO-SUM-" + suffix, Name = "Summary Store " + suffix,
                Province = province, District = "Test", Category = StoreCategory.HighValue, Format = 2,
                SyncedAt = DateTimeOffset.UtcNow,
            };
            var route = new Route
            {
                Id = Guid.NewGuid(), RouteCode = "SUM-" + suffix, Name = "Summary Route " + suffix,
                Province = province, RevenueTarget = 1000, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
            };
            var stop = new RouteStop
            {
                Id = Guid.NewGuid(), RouteId = route.Id, StoreId = store.Id, Frequency = Frequency.Daily,
                WeekdayMask = 0, Sequence = 1, EffectiveFrom = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-10), EffectiveTo = null,
            };

            var userId = Guid.NewGuid();
            db.Users.Add(new ApplicationUser
            {
                Id = userId, UserName = $"sum-merch-{suffix}", NormalizedUserName = $"SUM-MERCH-{suffix}".ToUpperInvariant(),
                Email = $"sum-merch-{suffix}@evo.local", NormalizedEmail = $"SUM-MERCH-{suffix}@EVO.LOCAL".ToUpperInvariant(),
                DisplayName = "Summary Merch " + suffix,
            });
            var merchandiser = new Merchandiser { Id = Guid.NewGuid(), UserId = userId, Active = true };
            var assignment = new Assignment { Id = Guid.NewGuid(), RouteId = route.Id, MerchandiserId = merchandiser.Id, StartDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-5), Reason = AssignmentReason.NewHire };

            var thisMonth = new DateOnly(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1);
            var revenue = new StoreRevenue { StoreId = store.Id, Month = thisMonth, Revenue = 1500 };

            db.Stores.Add(store);
            db.Routes.Add(route);
            db.RouteStops.Add(stop);
            db.Merchandisers.Add(merchandiser);
            db.Assignments.Add(assignment);
            db.StoreRevenues.Add(revenue);
            await db.SaveChangesAsync();
            routeId = route.Id;
        }

        var response = await client.GetAsync($"/api/v1/routes?province={province}");
        response.EnsureSuccessStatusCode();
        var page = await response.Content.ReadFromJsonAsync<PagedResult<RouteSummaryDto>>();

        var dto = page!.Items.Single(r => r.Id == routeId);
        Assert.Equal("Summary Merch " + suffix, dto.MerchandiserName);
        Assert.Equal(1500m, dto.SixMonthRevenue);
    }
}
