using Evo.Domain.Auth;
using Evo.Infrastructure;
using Evo.Infrastructure.Identity;
using Evo.Infrastructure.People;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using NetTopologySuite.Geometries;

namespace Evo.Seeder.Modules;

/// <summary>
/// Creates a Merchandiser row for every seeded FieldAgent ApplicationUser that doesn't already
/// have one. Runs after IdentitySeederModule. Idempotent: skips users that already have a
/// merchandiser (spec 005 Clarification #2 — merchandiser did not ship in 002, it ships here).
/// </summary>
public class MerchandiserSeederModule : ISeederModule
{
    private static readonly GeometryFactory GeometryFactory = new(new PrecisionModel(), 4326);

    public string Name => "Merchandiser";

    public async Task SeedAsync(EvoDbContext db, SeedProfile profile, Bogus.Faker faker, IServiceProvider services, CancellationToken ct)
    {
        var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();
        var fieldAgents = await userManager.GetUsersInRoleAsync(Roles.FieldAgent);

        var existingUserIds = await db.Merchandisers.Select(m => m.UserId).ToListAsync(ct);
        var existingSet = existingUserIds.ToHashSet();

        var created = 0;
        foreach (var agent in fieldAgents)
        {
            if (existingSet.Contains(agent.Id))
            {
                continue;
            }

            var lat = 36.0 + faker.Random.Double() * 6.0; // rough Turkey latitude band
            var lon = 26.0 + faker.Random.Double() * 18.0; // rough Turkey longitude band

            db.Merchandisers.Add(new Merchandiser
            {
                Id = Guid.NewGuid(),
                UserId = agent.Id,
                HomeLocation = GeometryFactory.CreatePoint(new Coordinate(lon, lat)),
                HiredOn = DateOnly.FromDateTime(faker.Date.Past(3)),
                Active = true,
            });
            created++;
        }

        if (created > 0)
        {
            await db.SaveChangesAsync(ct);
        }

        Console.WriteLine($"Merchandiser: {created} created ({fieldAgents.Count} field agents total).");
    }
}
