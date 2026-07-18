using System.Net.Http.Json;
using Evo.Api.Audit.Dtos;
using Evo.Api.Routing.Dtos;
using Evo.Domain.Auth;
using Evo.Infrastructure;
using Evo.Infrastructure.Routing;
using Evo.Tests.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests.Routing;

[Collection("TasksDb")]
public class DecisionJournalEndpointTests : IClassFixture<EvoApiTestFactory>
{
    private readonly EvoApiTestFactory _factory;

    public DecisionJournalEndpointTests(EvoApiTestFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task List_ReturnsSeededEntries_NewestFirst()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var email = $"decision-journal-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        Guid olderId, newerId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            var older = new DecisionJournalEntry
            {
                Id = Guid.NewGuid(), Kind = DecisionKind.PublishOverride, Description = "older " + suffix,
                Reason = "r1", Objective = "o1", CreatedAt = DateTimeOffset.UtcNow.AddMinutes(-10),
            };
            var newer = new DecisionJournalEntry
            {
                Id = Guid.NewGuid(), Kind = DecisionKind.Repair, Description = "newer " + suffix,
                Reason = "r2", Objective = "o2", CreatedAt = DateTimeOffset.UtcNow,
            };
            db.DecisionJournal.AddRange(older, newer);
            await db.SaveChangesAsync();
            olderId = older.Id;
            newerId = newer.Id;
        }

        var response = await client.GetAsync("/api/v1/decision-journal?pageSize=200");
        response.EnsureSuccessStatusCode();
        var page = await response.Content.ReadFromJsonAsync<PagedResult<DecisionJournalEntryDto>>();

        var ids = page!.Items.Select(e => e.Id).ToList();
        Assert.Contains(newerId, ids);
        Assert.Contains(olderId, ids);
        Assert.True(ids.IndexOf(newerId) < ids.IndexOf(olderId));

        var newerDto = page.Items.First(e => e.Id == newerId);
        Assert.Equal("Repair", newerDto.Kind);
        Assert.Equal("o2", newerDto.Objective);
    }
}
