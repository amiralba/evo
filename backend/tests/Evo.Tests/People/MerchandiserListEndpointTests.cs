using System.Net.Http.Json;
using Evo.Api.People.Dtos;
using Evo.Domain.Auth;
using Evo.Infrastructure;
using Evo.Infrastructure.Identity;
using Evo.Infrastructure.People;
using Evo.Tests.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests.People;

[Collection("TasksDb")]
public class MerchandiserListEndpointTests : IClassFixture<EvoApiTestFactory>
{
    private readonly EvoApiTestFactory _factory;

    public MerchandiserListEndpointTests(EvoApiTestFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task List_ReturnsActiveMerchandisersByDefault_ExcludingInactive()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var email = $"merch-list-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        Guid activeId, inactiveId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            var activeUserId = Guid.NewGuid();
            var inactiveUserId = Guid.NewGuid();
            db.Users.AddRange(
                new ApplicationUser { Id = activeUserId, UserName = $"m-active-{suffix}", NormalizedUserName = $"M-ACTIVE-{suffix}".ToUpperInvariant(), Email = $"m-active-{suffix}@evo.local", NormalizedEmail = $"M-ACTIVE-{suffix}@EVO.LOCAL".ToUpperInvariant(), DisplayName = "Active Merch " + suffix },
                new ApplicationUser { Id = inactiveUserId, UserName = $"m-inactive-{suffix}", NormalizedUserName = $"M-INACTIVE-{suffix}".ToUpperInvariant(), Email = $"m-inactive-{suffix}@evo.local", NormalizedEmail = $"M-INACTIVE-{suffix}@EVO.LOCAL".ToUpperInvariant(), DisplayName = "Inactive Merch " + suffix });

            var active = new Merchandiser { Id = Guid.NewGuid(), UserId = activeUserId, Active = true };
            var inactive = new Merchandiser { Id = Guid.NewGuid(), UserId = inactiveUserId, Active = false };
            db.Merchandisers.AddRange(active, inactive);
            await db.SaveChangesAsync();
            activeId = active.Id;
            inactiveId = inactive.Id;
        }

        var response = await client.GetAsync("/api/v1/merchandisers");
        response.EnsureSuccessStatusCode();
        var list = await response.Content.ReadFromJsonAsync<List<MerchandiserSummaryDto>>();

        Assert.Contains(list!, m => m.Id == activeId);
        Assert.DoesNotContain(list!, m => m.Id == inactiveId);
    }
}
