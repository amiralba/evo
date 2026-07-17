using System.Net;
using System.Net.Http.Json;
using Evo.Api.Audit.Dtos;
using Evo.Api.Controllers;
using Evo.Domain.Auth;
using Evo.Infrastructure;
using Evo.Infrastructure.People;
using Evo.Tests.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests.People;

[Collection("TasksDb")]
public class LocationHistoryEndpointTests : IClassFixture<EvoApiTestFactory>
{
    private readonly EvoApiTestFactory _factory;

    public LocationHistoryEndpointTests(EvoApiTestFactory factory)
    {
        _factory = factory;
    }

    private async Task<(Guid MerchandiserId, string Email)> SeedMerchandiserWithPingsAsync(string suffix)
    {
        var email = $"loc-hist-agent-{suffix}@evo.local";
        var user = await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.FieldAgent);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();

        var merchandiser = new Merchandiser { Id = Guid.NewGuid(), UserId = user.Id, Active = true };
        db.Merchandisers.Add(merchandiser);

        var now = DateTimeOffset.UtcNow;
        db.LocationPings.Add(new MerchandiserLocationPing { Id = Guid.NewGuid(), MerchandiserId = merchandiser.Id, Lat = 39.9, Lng = 32.8, RecordedAt = now.AddMinutes(-30) });
        db.LocationPings.Add(new MerchandiserLocationPing { Id = Guid.NewGuid(), MerchandiserId = merchandiser.Id, Lat = 39.91, Lng = 32.81, RecordedAt = now.AddMinutes(-10) });
        await db.SaveChangesAsync();

        return (merchandiser.Id, email);
    }

    [Fact]
    public async Task Supervisor_CanReadAnyMerchandisersHistory()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var (merchandiserId, _) = await SeedMerchandiserWithPingsAsync(suffix);

        var supervisorEmail = $"loc-hist-supervisor-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, supervisorEmail, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, supervisorEmail, "Passw0rd!");

        var from = DateTimeOffset.UtcNow.AddHours(-1);
        var to = DateTimeOffset.UtcNow;
        var response = await client.GetAsync($"/api/v1/merchandisers/{merchandiserId}/location-history?from={Uri.EscapeDataString(from.ToString("o"))}&to={Uri.EscapeDataString(to.ToString("o"))}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var page = await response.Content.ReadFromJsonAsync<PagedResult<LocationPingDto>>();
        Assert.Equal(2, page!.Items.Count);
        Assert.True(page.Items[0].RecordedAt > page.Items[1].RecordedAt);
    }

    [Fact]
    public async Task FieldAgent_CanReadOwnHistory_But403OnAnotherAgent()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var (merchandiserId, email) = await SeedMerchandiserWithPingsAsync(suffix);
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.FieldAgent);
        var ownClient = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        var from = DateTimeOffset.UtcNow.AddHours(-1);
        var to = DateTimeOffset.UtcNow;
        var ownResponse = await ownClient.GetAsync($"/api/v1/merchandisers/{merchandiserId}/location-history?from={Uri.EscapeDataString(from.ToString("o"))}&to={Uri.EscapeDataString(to.ToString("o"))}");
        Assert.Equal(HttpStatusCode.OK, ownResponse.StatusCode);

        var (otherMerchandiserId, _) = await SeedMerchandiserWithPingsAsync(Guid.NewGuid().ToString("N")[..8]);
        var otherResponse = await ownClient.GetAsync($"/api/v1/merchandisers/{otherMerchandiserId}/location-history?from={Uri.EscapeDataString(from.ToString("o"))}&to={Uri.EscapeDataString(to.ToString("o"))}");
        Assert.Equal(HttpStatusCode.Forbidden, otherResponse.StatusCode);
    }
}
