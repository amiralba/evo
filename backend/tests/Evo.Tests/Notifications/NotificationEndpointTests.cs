using System.Net;
using System.Net.Http.Json;
using Evo.Api.Controllers;
using Evo.Api.Routing.Dtos;
using Evo.Domain.Auth;
using Evo.Domain.Scheduling;
using Evo.Infrastructure;
using Evo.Infrastructure.People;
using Evo.Infrastructure.Routing;
using Evo.Infrastructure.Stores;
using Evo.Tests.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests.Notifications;

[Collection("TasksDb")]
public class NotificationEndpointTests : IClassFixture<EvoApiTestFactory>
{
    private readonly EvoApiTestFactory _factory;

    public NotificationEndpointTests(EvoApiTestFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task PublishRoute_WritesOneNotification_ForAssignedMerchandiser_AndAgentCanReadIt()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var supervisorEmail = $"notif-test-supervisor-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, supervisorEmail, "Passw0rd!", Roles.Supervisor);
        var supervisorClient = await TestAuthHelper.LoginAsync(_factory, supervisorEmail, "Passw0rd!");

        var agentEmail = $"notif-test-agent-{suffix}@evo.local";
        var agentUser = await TestAuthHelper.EnsureUserAsync(_factory, agentEmail, "Passw0rd!", Roles.FieldAgent);

        Guid routeId, merchandiserId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            var store = new Store
            {
                Id = Guid.NewGuid(), EvoStoreId = "EVO-NOTIF-" + suffix, Name = "Notif Test Store " + suffix,
                Province = "Ankara", District = "Cankaya", Category = StoreCategory.HighValue, Format = 2,
                SyncedAt = DateTimeOffset.UtcNow,
            };
            var route = new Route
            {
                Id = Guid.NewGuid(), RouteCode = "NOTIF-" + suffix, Name = "Notif Test Route " + suffix,
                Province = "Ankara", Status = RouteStatus.Draft, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
            };
            var today = TestClock.Today;
            var stop = new RouteStop
            {
                Id = Guid.NewGuid(), RouteId = route.Id, StoreId = store.Id, Frequency = Frequency.Daily,
                WeekdayMask = 0, Sequence = 1, EffectiveFrom = today, EffectiveTo = null,
            };
            var merchandiser = new Merchandiser { Id = Guid.NewGuid(), UserId = agentUser.Id, Active = true };
            var assignment = new Assignment
            {
                Id = Guid.NewGuid(), RouteId = route.Id, MerchandiserId = merchandiser.Id,
                StartDate = today, EndDate = null, Reason = AssignmentReason.NewHire,
            };

            db.Stores.Add(store);
            db.Routes.Add(route);
            db.RouteStops.Add(stop);
            db.Merchandisers.Add(merchandiser);
            db.Assignments.Add(assignment);
            await db.SaveChangesAsync();

            routeId = route.Id;
            merchandiserId = merchandiser.Id;
        }

        var publishResponse = await supervisorClient.PostAsJsonAsync($"/api/v1/routes/{routeId}/publish", new PublishRequest(null, null));
        Assert.Equal(HttpStatusCode.OK, publishResponse.StatusCode);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            var notifications = await db.Notifications.Where(n => n.MerchandiserId == merchandiserId).ToListAsync();
            Assert.Single(notifications);
        }

        var agentClient = await TestAuthHelper.LoginAsync(_factory, agentEmail, "Passw0rd!");
        var getResponse = await agentClient.GetAsync($"/api/v1/merchandisers/{merchandiserId}/notifications");
        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
        var notificationDtos = await getResponse.Content.ReadFromJsonAsync<List<NotificationDto>>();
        Assert.Single(notificationDtos!);
    }

    [Fact]
    public async Task FieldAgent_GetAnotherAgentsNotifications_Returns403()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var ownerEmail = $"notif-test-owner-{suffix}@evo.local";
        var ownerUser = await TestAuthHelper.EnsureUserAsync(_factory, ownerEmail, "Passw0rd!", Roles.FieldAgent);

        Guid merchandiserId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            var merchandiser = new Merchandiser { Id = Guid.NewGuid(), UserId = ownerUser.Id, Active = true };
            db.Merchandisers.Add(merchandiser);
            await db.SaveChangesAsync();
            merchandiserId = merchandiser.Id;
        }

        var otherEmail = $"notif-test-other-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, otherEmail, "Passw0rd!", Roles.FieldAgent);
        var otherClient = await TestAuthHelper.LoginAsync(_factory, otherEmail, "Passw0rd!");

        var response = await otherClient.GetAsync($"/api/v1/merchandisers/{merchandiserId}/notifications");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
