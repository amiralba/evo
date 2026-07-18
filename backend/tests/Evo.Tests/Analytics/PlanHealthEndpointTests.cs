using System.Net;
using System.Net.Http.Json;
using Evo.Api.Analytics.Dtos;
using Evo.Domain.Auth;
using Evo.Domain.Scheduling;
using Evo.Infrastructure;
using Evo.Infrastructure.Identity;
using Evo.Infrastructure.People;
using Evo.Infrastructure.Routing;
using Evo.Infrastructure.Stores;
using Evo.Infrastructure.Tasks;
using Evo.Tests.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests.Analytics;

[Collection("TasksDb")]
public class PlanHealthEndpointTests : IClassFixture<EvoApiTestFactory>
{
    private readonly EvoApiTestFactory _factory;

    public PlanHealthEndpointTests(EvoApiTestFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GetPlanHealth_KnownFixture_ReturnsExpectedCompletionAndOverrideRate()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var province = "PlanHealthTest-" + suffix;
        var email = $"planhealth-test-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        Guid routeId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();

            var store = new Store
            {
                Id = Guid.NewGuid(), EvoStoreId = "EVO-PH-" + suffix, Name = "PlanHealth Store " + suffix,
                Province = province, District = "Test", Category = StoreCategory.HighValue, Format = 2,
                SyncedAt = DateTimeOffset.UtcNow,
            };
            var route = new Route
            {
                Id = Guid.NewGuid(), RouteCode = "PH-" + suffix, Name = "PlanHealth Route " + suffix,
                Province = province, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
            };
            var stop = new RouteStop
            {
                Id = Guid.NewGuid(), RouteId = route.Id, StoreId = store.Id, Frequency = Frequency.Daily,
                WeekdayMask = 0, Sequence = 1, EffectiveFrom = today.AddDays(-10), EffectiveTo = null,
            };
            db.Stores.Add(store);
            db.Routes.Add(route);
            db.RouteStops.Add(stop);
            await db.SaveChangesAsync();

            var template = new TaskTemplate { Id = Guid.NewGuid(), Code = "PH-TASK-" + suffix, Name = "Test Task", DefaultMinutes = 20, Active = true };
            db.TaskTemplates.Add(template);
            await db.SaveChangesAsync();

            // 8 Done, 1 Missed, 1 Skipped — completionPct should be 0.8.
            for (var i = 0; i < 10; i++)
            {
                var visitDate = today.AddDays(-i);
                var status = i < 8 ? PlannedVisitStatus.Done : i == 8 ? PlannedVisitStatus.Missed : PlannedVisitStatus.Skipped;
                var start = new DateTimeOffset(visitDate.ToDateTime(new TimeOnly(9, 0)), TimeSpan.Zero);
                var visit = new PlannedVisit
                {
                    Id = Guid.NewGuid(), RouteId = route.Id, RouteStopId = stop.Id, StoreId = store.Id,
                    VisitDate = visitDate, PlannedStart = start, PlannedEnd = start.AddMinutes(20),
                    Source = PlannedVisitSource.Baseline, Status = status,
                };
                db.PlannedVisits.Add(visit);

                if (status == PlannedVisitStatus.Done)
                {
                    db.VisitRealizations.Add(new VisitRealization
                    {
                        Id = Guid.NewGuid(), PlannedVisitId = visit.Id,
                        CheckInAt = start, CheckOutAt = start.AddMinutes(20), ActualMinutes = 20,
                    });
                }

                var taskInstance = new TaskInstance
                {
                    Id = Guid.NewGuid(), PlannedVisitId = visit.Id, StoreId = store.Id,
                    TaskTemplateId = template.Id, ResolvedMinutes = 20,
                    Status = status == PlannedVisitStatus.Done ? TaskInstanceStatus.Done : TaskInstanceStatus.Overdue,
                    OverrideMinutes = i == 0 ? 25 : null,
                    OverrideScope = i == 0 ? OverrideScope.Instance : null,
                };
                db.TaskInstances.Add(taskInstance);
            }
            await db.SaveChangesAsync();

            routeId = route.Id;
        }

        var response = await client.GetAsync($"/api/v1/analytics/plan-health?region={Uri.EscapeDataString(province)}&from={today.AddDays(-9):yyyy-MM-dd}&to={today:yyyy-MM-dd}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var report = await response.Content.ReadFromJsonAsync<PlanHealthReportDto>();

        var routeHealth = report!.Routes.Single(r => r.RouteId == routeId);
        Assert.Equal(0.8, routeHealth.CompletionPct, 2);
        Assert.True(routeHealth.OverrideRatePct > 0);
        Assert.True(routeHealth.StabilityScore >= 0);
        Assert.True(routeHealth.UtilizationPct >= 0);
        Assert.True(routeHealth.TaskCompliancePct > 0);

        // Ranked by planHealthScore descending.
        var scores = report.Routes.Select(r => r.PlanHealthScore).ToList();
        Assert.Equal(scores.OrderByDescending(s => s).ToList(), scores);
    }
}
