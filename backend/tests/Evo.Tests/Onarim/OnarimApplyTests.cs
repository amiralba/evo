using System.Net;
using System.Net.Http.Json;
using Evo.Api.Onarim.Dtos;
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

namespace Evo.Tests.Onarim;

[Collection("TasksDb")]
public class OnarimApplyTests : IClassFixture<EvoApiTestFactory>
{
    private readonly EvoApiTestFactory _factory;

    public OnarimApplyTests(EvoApiTestFactory factory)
    {
        _factory = factory;
    }

    private static DateOnly NextWeekday(DateOnly from)
    {
        var d = from;
        while (d.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday)
        {
            d = d.AddDays(1);
        }
        return d;
    }

    private static async Task<(Route RouteA, Route RouteB, Guid MerchA, Guid MerchB, Store StoreA, DateOnly VisitDate, Guid VisitId)> SeedTwoRoutesAsync(EvoDbContext db, string suffix)
    {
        var userAId = Guid.NewGuid();
        var userBId = Guid.NewGuid();
        db.Users.Add(new ApplicationUser
        {
            Id = userAId, UserName = $"onarim-a-{suffix}", NormalizedUserName = $"ONARIM-A-{suffix}".ToUpperInvariant(),
            Email = $"onarim-a-{suffix}@evo.local", NormalizedEmail = $"ONARIM-A-{suffix}@EVO.LOCAL".ToUpperInvariant(),
            DisplayName = "Onarim Merch A",
        });
        db.Users.Add(new ApplicationUser
        {
            Id = userBId, UserName = $"onarim-b-{suffix}", NormalizedUserName = $"ONARIM-B-{suffix}".ToUpperInvariant(),
            Email = $"onarim-b-{suffix}@evo.local", NormalizedEmail = $"ONARIM-B-{suffix}@EVO.LOCAL".ToUpperInvariant(),
            DisplayName = "Onarim Merch B",
        });

        var merchA = new Merchandiser { Id = Guid.NewGuid(), UserId = userAId, Active = true };
        var merchB = new Merchandiser { Id = Guid.NewGuid(), UserId = userBId, Active = true };
        db.Merchandisers.AddRange(merchA, merchB);

        var routeA = new Route { Id = Guid.NewGuid(), RouteCode = "OA-" + suffix, Name = "Onarim Route A", Province = "Istanbul", DailyWorkMinutes = 480, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
        var routeB = new Route { Id = Guid.NewGuid(), RouteCode = "OB-" + suffix, Name = "Onarim Route B", Province = "Istanbul", DailyWorkMinutes = 480, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
        db.Routes.AddRange(routeA, routeB);

        var today = TestClock.Today;
        db.Assignments.AddRange(
            new Assignment { Id = Guid.NewGuid(), RouteId = routeA.Id, MerchandiserId = merchA.Id, StartDate = today.AddDays(-30), Reason = AssignmentReason.NewHire },
            new Assignment { Id = Guid.NewGuid(), RouteId = routeB.Id, MerchandiserId = merchB.Id, StartDate = today.AddDays(-30), Reason = AssignmentReason.NewHire });

        var storeA = new Store
        {
            Id = Guid.NewGuid(), EvoStoreId = "EVO-ONA-" + suffix, Name = "Onarim Store A " + suffix,
            Province = "Istanbul", District = "Kadikoy", Category = StoreCategory.HighValue, Format = 2,
            SyncedAt = DateTimeOffset.UtcNow,
        };
        db.Stores.Add(storeA);

        var visitDate = NextWeekday(today.AddDays(3));
        var stopA = new RouteStop { Id = Guid.NewGuid(), RouteId = routeA.Id, StoreId = storeA.Id, Sequence = 1, Frequency = Frequency.Daily, WeekdayMask = 0, EffectiveFrom = visitDate, EffectiveTo = null };
        db.RouteStops.Add(stopA);

        await db.SaveChangesAsync();

        var visit = new PlannedVisit
        {
            Id = Guid.NewGuid(), RouteId = routeA.Id, RouteStopId = stopA.Id, StoreId = storeA.Id,
            MerchandiserId = merchA.Id, VisitDate = visitDate,
            PlannedStart = new DateTimeOffset(visitDate.ToDateTime(new TimeOnly(9, 0)), TimeSpan.Zero),
            PlannedEnd = new DateTimeOffset(visitDate.ToDateTime(new TimeOnly(9, 30)), TimeSpan.Zero),
            Source = PlannedVisitSource.Baseline, Status = PlannedVisitStatus.Planned,
        };
        db.PlannedVisits.Add(visit);

        db.Absences.Add(new Absence { Id = Guid.NewGuid(), MerchandiserId = merchA.Id, StartDate = visitDate, EndDate = visitDate, Reason = AbsenceReason.SickLeave, CreatedAt = DateTimeOffset.UtcNow });

        await db.SaveChangesAsync();
        return (routeA, routeB, merchA.Id, merchB.Id, storeA, visitDate, visit.Id);
    }


    /// <summary>The API-tests DB is shared and the planning clock is pinned (TestClock), so
    /// absence disruptions from earlier runs never age out — picking First(Absence) grabs an
    /// arbitrary stale one. Each test must target the disruption that contains ITS OWN visit.</summary>
    private static async Task<(DisruptionDto Disruption, List<AffectedVisitDto> Affected)> FindDisruptionForVisitAsync(
        HttpClient client, Guid visitId)
    {
        var disruptions = await client.GetFromJsonAsync<List<DisruptionDto>>("/api/v1/onarim/disruptions");
        foreach (var d in disruptions!.Where(d => d.Kind == "Absence" && d.AffectedVisitCount > 0))
        {
            var affected = await client.GetFromJsonAsync<List<AffectedVisitDto>>($"/api/v1/onarim/disruptions/{d.Id}/affected-visits");
            if (affected!.Any(a => a.PlannedVisitId == visitId))
            {
                return (d, affected);
            }
        }
        throw new InvalidOperationException("No absence disruption contains the seeded visit.");
    }

    [Fact]
    public async Task Apply_MoveDay_CreatesPatchRegeneratesPlanAndJournals()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var email = $"onarim-move-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        Route routeA;
        Guid visitId;
        DateOnly visitDate;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            (routeA, _, _, _, _, visitDate, visitId) = await SeedTwoRoutesAsync(db, suffix);
        }

        var (disruption, affected) = await FindDisruptionForVisitAsync(client, visitId);
        var row = Assert.Single(affected!, a => a.PlannedVisitId == visitId);

        var applyReq = new ApplyOnarimRequest("Merchandiser sick", "Keep store coverage", new[]
        {
            new OnarimDecisionDto(row.PlannedVisitId, OnarimAction.MoveDay, visitDate.AddDays(2), null, null),
        });
        var applyResp = await client.PostAsJsonAsync($"/api/v1/onarim/disruptions/{disruption.Id}/apply", applyReq);
        Assert.True(applyResp.IsSuccessStatusCode, await applyResp.Content.ReadAsStringAsync());

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            var patches = await db.Patches.Where(p => p.RouteId == routeA.Id).ToListAsync();
            Assert.Contains(patches, p => p.Type == PatchType.MoveVisit);

            var journal = await db.DecisionJournal.Where(j => j.Kind == DecisionKind.Repair).OrderByDescending(j => j.CreatedAt).FirstOrDefaultAsync();
            Assert.NotNull(journal);
            Assert.Equal("Merchandiser sick", journal!.Reason);
        }
    }

    [Fact]
    public async Task Apply_WithoutReasonOrObjective_Returns422_AndWritesNothing()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var email = $"onarim-noreason-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        Guid visitId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            (_, _, _, _, _, _, visitId) = await SeedTwoRoutesAsync(db, suffix);
        }

        var (disruption, _) = await FindDisruptionForVisitAsync(client, visitId);

        int patchCountBefore, journalCountBefore;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            patchCountBefore = await db.Patches.CountAsync();
            journalCountBefore = await db.DecisionJournal.CountAsync();
        }

        var applyReq = new ApplyOnarimRequest("", "", new[]
        {
            new OnarimDecisionDto(visitId, OnarimAction.Skip, null, null, null),
        });
        var applyResp = await client.PostAsJsonAsync($"/api/v1/onarim/disruptions/{disruption.Id}/apply", applyReq);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, applyResp.StatusCode);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            Assert.Equal(patchCountBefore, await db.Patches.CountAsync());
            Assert.Equal(journalCountBefore, await db.DecisionJournal.CountAsync());
        }
    }

    [Fact]
    public async Task Apply_ReassignPerson_CreatesCrossReassignVisit_AndReflowsBothRoutes()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var email = $"onarim-cross-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        Route routeA, routeB;
        Guid merchB, visitId;
        Store storeA;
        DateOnly visitDate;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            (routeA, routeB, _, merchB, storeA, visitDate, visitId) = await SeedTwoRoutesAsync(db, suffix);
        }

        var (disruption, affected) = await FindDisruptionForVisitAsync(client, visitId);
        var row = affected!.Single(a => a.PlannedVisitId == visitId);
        var candidate = row.Candidates.FirstOrDefault(c => c.RouteId == routeB.Id);
        Assert.NotNull(candidate);

        var applyReq = new ApplyOnarimRequest("Merchandiser sick", "Keep store coverage", new[]
        {
            new OnarimDecisionDto(visitId, OnarimAction.ReassignPerson, null, merchB, routeB.Id),
        });
        var applyResp = await client.PostAsJsonAsync($"/api/v1/onarim/disruptions/{disruption.Id}/apply", applyReq);
        Assert.True(applyResp.IsSuccessStatusCode, await applyResp.Content.ReadAsStringAsync());

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            var crossPatch = await db.Patches.FirstOrDefaultAsync(p => p.Type == PatchType.CrossReassignVisit && p.RouteId == routeA.Id);
            Assert.NotNull(crossPatch);

            var routeAVisits = await db.PlannedVisits.Where(v => v.RouteId == routeA.Id && v.VisitDate == visitDate && v.Status == PlannedVisitStatus.Planned).ToListAsync();
            Assert.DoesNotContain(routeAVisits, v => v.StoreId == storeA.Id);

            var routeBVisits = await db.PlannedVisits.Where(v => v.RouteId == routeB.Id && v.VisitDate == visitDate).ToListAsync();
            Assert.Contains(routeBVisits, v => v.StoreId == storeA.Id && v.MerchandiserId == merchB);
        }
    }
}
