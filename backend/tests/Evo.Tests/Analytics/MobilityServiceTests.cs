using Evo.Api.Analytics;
using Evo.Domain.Auth;
using Evo.Domain.Scheduling;
using Evo.Infrastructure;
using Evo.Infrastructure.Identity;
using Evo.Infrastructure.People;
using Evo.Infrastructure.Routing;
using Evo.Tests.Auth;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests.Analytics;

[Collection("TasksDb")]
public class MobilityServiceTests : IClassFixture<EvoApiTestFactory>
{
    private readonly EvoApiTestFactory _factory;

    public MobilityServiceTests(EvoApiTestFactory factory)
    {
        _factory = factory;
    }

    private static async Task<Merchandiser> SeedMerchandiserWithRoutesAsync(EvoDbContext db, string province, string suffix, int routeCount)
    {
        var userId = Guid.NewGuid();
        db.Users.Add(new ApplicationUser
        {
            Id = userId, UserName = $"mobility-{suffix}", NormalizedUserName = $"MOBILITY-{suffix}".ToUpperInvariant(),
            Email = $"mobility-{suffix}@evo.local", NormalizedEmail = $"MOBILITY-{suffix}@EVO.LOCAL".ToUpperInvariant(),
            DisplayName = "Mobility Test " + suffix,
        });
        var merchandiser = new Merchandiser { Id = Guid.NewGuid(), UserId = userId, Active = true };
        db.Merchandisers.Add(merchandiser);
        await db.SaveChangesAsync();

        var today = TestClock.Today;
        for (var i = 0; i < routeCount; i++)
        {
            var route = new Route
            {
                Id = Guid.NewGuid(), RouteCode = $"MOB-{suffix}-{i}", Name = $"Mobility Route {suffix}-{i}",
                Province = province, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
            };
            db.Routes.Add(route);
            db.Assignments.Add(new Assignment
            {
                Id = Guid.NewGuid(), RouteId = route.Id, MerchandiserId = merchandiser.Id,
                StartDate = today.AddDays(-i * 30), EndDate = i == routeCount - 1 ? null : today.AddDays(-i * 30 + 20),
                Reason = AssignmentReason.NewHire,
            });
        }
        await db.SaveChangesAsync();
        return merchandiser;
    }

    [Fact]
    public async Task Report_FlagsHighRouteCountMerchandiser_AsOutlier_AgainstMedian()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var province = "MobilityTest-" + suffix;

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();

        await SeedMerchandiserWithRoutesAsync(db, province, suffix + "-a", routeCount: 1);
        await SeedMerchandiserWithRoutesAsync(db, province, suffix + "-b", routeCount: 1);
        var outlierMerchandiser = await SeedMerchandiserWithRoutesAsync(db, province, suffix + "-c", routeCount: 4);

        var service = scope.ServiceProvider.GetRequiredService<IMobilityService>();
        var report = await service.GetReportAsync(province, months: 12);

        Assert.Equal(1.0, report.First(m => m.MerchandiserId != outlierMerchandiser.Id).RegionalMedianRoutesHeld);
        var outlierDto = report.Single(m => m.MerchandiserId == outlierMerchandiser.Id);
        Assert.Equal(4, outlierDto.DistinctRoutesHeld);
        Assert.True(outlierDto.Outlier);
    }
}
