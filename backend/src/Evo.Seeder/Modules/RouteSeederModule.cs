using Evo.Domain.Auth;
using Evo.Infrastructure;
using Evo.Infrastructure.Identity;
using Evo.Infrastructure.People;
using Evo.Infrastructure.Routing;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Route = Evo.Infrastructure.Routing.Route;

namespace Evo.Seeder.Modules;

/// <summary>
/// Creates routes scoped to a province drawn from synced stores, adds a handful of in-scope
/// unassigned stores as route_stops (skipping already-routed stores), assigns each route to a
/// distinct merchandiser, then materializes planned_visit rows through the REAL scheduling
/// engine (IPlanGenerationService) — never inserts visit rows directly (spec 005 Clarification
/// #14, mirrors 004's real-sync seeder pattern). Idempotent by RouteCode; runs after
/// StoreSync and Merchandiser.
/// </summary>
public class RouteSeederModule : ISeederModule
{
    public string Name => "Route";

    public async Task SeedAsync(EvoDbContext db, SeedProfile profile, Bogus.Faker faker, IServiceProvider services, CancellationToken ct)
    {
        var routeCount = profile == SeedProfile.Demo ? 5 : 50;
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();
        var fieldAgentUsers = await userManager.GetUsersInRoleAsync(Roles.FieldAgent);
        var merchandisers = await db.Merchandisers
            .Where(m => fieldAgentUsers.Select(u => u.Id).Contains(m.UserId))
            .ToListAsync(ct);

        var provinces = await db.Stores.Select(s => s.Province).Distinct().ToListAsync(ct);
        if (provinces.Count == 0 || merchandisers.Count == 0)
        {
            Console.WriteLine("Route: no synced stores or merchandisers available yet — skipping.");
            return;
        }

        var routesCreated = 0;
        var routeIdsToMaterialize = new List<Guid>();
        var usedStoreIdsThisRun = new HashSet<Guid>();

        for (var i = 1; i <= routeCount; i++)
        {
            var routeCode = $"SEED-{i:D3}";
            var existingRoute = await db.Routes.FirstOrDefaultAsync(r => r.RouteCode == routeCode, ct);
            if (existingRoute is not null)
            {
                routeIdsToMaterialize.Add(existingRoute.Id);
                continue;
            }

            var province = provinces[(i - 1) % provinces.Count];
            var route = new Route
            {
                Id = Guid.NewGuid(),
                RouteCode = routeCode,
                Name = $"{province} Route {i}",
                Province = province,
                Status = RouteStatus.Active,
                Version = 1,
                RevenueTarget = 1_000_000m,
                DailyWorkMinutes = 450,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow,
            };
            db.Routes.Add(route);

            // Neighborhood-scale routes (user decision 2026-07-18): a merchandiser's day covers a
            // handful of nearby stores, not the whole province — prefer the single District with the
            // most still-unrouted stores, so a route's stops actually cluster on the map instead of
            // being picked arbitrarily across the whole (large) province.
            var candidateStores = await db.Stores
                .Where(s => s.Province == province)
                .Select(s => new { s.Id, s.District })
                .ToListAsync(ct);
            var alreadyRouted = await db.RouteStops.Where(rs => rs.EffectiveTo == null).Select(rs => rs.StoreId).ToListAsync(ct);
            var availableByDistrict = candidateStores
                .Where(s => !alreadyRouted.Contains(s.Id) && !usedStoreIdsThisRun.Contains(s.Id))
                .GroupBy(s => s.District)
                .OrderByDescending(g => g.Count())
                .FirstOrDefault();
            var availableStores = (availableByDistrict?.Select(s => s.Id) ?? Enumerable.Empty<Guid>()).Take(4).ToList();
            availableStores.ForEach(id => usedStoreIdsThisRun.Add(id));

            var sequence = 1;
            foreach (var storeId in availableStores)
            {
                db.RouteStops.Add(new RouteStop
                {
                    Id = Guid.NewGuid(),
                    RouteId = route.Id,
                    StoreId = storeId,
                    Frequency = Domain.Scheduling.Frequency.Daily,
                    WeekdayMask = 0,
                    Sequence = sequence++,
                    EffectiveFrom = today,
                    EffectiveTo = null,
                });
            }

            var merchandiser = merchandisers[(i - 1) % merchandisers.Count];
            var alreadyAssigned = await db.Assignments.AnyAsync(a => a.MerchandiserId == merchandiser.Id && a.EndDate == null, ct);
            if (!alreadyAssigned)
            {
                db.Assignments.Add(new Assignment
                {
                    Id = Guid.NewGuid(),
                    RouteId = route.Id,
                    MerchandiserId = merchandiser.Id,
                    StartDate = today,
                    EndDate = null,
                    Reason = AssignmentReason.NewHire,
                });
            }

            routeIdsToMaterialize.Add(route.Id);
            routesCreated++;
        }

        await db.SaveChangesAsync(ct);
        Console.WriteLine($"Route: {routesCreated} routes created ({routeIdsToMaterialize.Count} total active for this profile).");

        var planGenerationService = services.GetRequiredService<IPlanGenerationService>();
        var settingsProvider = services.GetRequiredService<ISettingsProvider>();
        var totalVisits = 0;
        foreach (var routeId in routeIdsToMaterialize)
        {
            var route = await db.Routes.FirstAsync(r => r.Id == routeId, ct);
            var settings = await settingsProvider.GetAsync(route.Province, ct);
            totalVisits += await planGenerationService.RegenerateFutureAsync(routeId, today, today.AddDays(settings.PlanHorizonWeeks * 7), ct);
        }
        Console.WriteLine($"Route: {totalVisits} planned visits materialized via the real scheduling engine.");
    }
}
