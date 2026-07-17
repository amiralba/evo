using Evo.Infrastructure;
using Evo.Infrastructure.Identity;
using Evo.Infrastructure.People;
using Evo.Infrastructure.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests.Routing;

/// <summary>
/// Proves the two DB-enforced single-active-assignment rules (spec 005 Task 13's filtered
/// unique indexes): a route can't hold two active assignments, and a merchandiser can't hold
/// two active assignments, at the same time.
/// </summary>
public class AssignmentConstraintTests
{
    private const string ConnectionString =
        "Server=localhost,1433;Database=EvoDb_RoutingTests;User Id=sa;Password=Local_dev_only!1;TrustServerCertificate=True;";

    private static async Task<EvoDbContext> CreateContextAsync()
    {
        var services = new ServiceCollection();
        services.AddDbContext<EvoDbContext>(options => options.UseSqlServer(ConnectionString, x => x.UseNetTopologySuite()));
        var provider = services.BuildServiceProvider();
        var db = provider.GetRequiredService<EvoDbContext>();
        await db.Database.MigrateAsync();

        await db.Assignments.ExecuteDeleteAsync();
        await db.RouteStops.ExecuteDeleteAsync();
        await db.Routes.ExecuteDeleteAsync();
        await db.Merchandisers.ExecuteDeleteAsync();
        await db.Users.Where(u => u.UserName!.StartsWith("assignment-test-")).ExecuteDeleteAsync();

        return db;
    }

    private static async Task<Merchandiser> NewMerchandiserAsync(EvoDbContext db)
    {
        var userId = Guid.NewGuid();
        db.Users.Add(new ApplicationUser
        {
            Id = userId,
            UserName = $"assignment-test-{userId}",
            NormalizedUserName = $"ASSIGNMENT-TEST-{userId}".ToUpperInvariant(),
            Email = $"assignment-test-{userId}@evo.local",
            NormalizedEmail = $"ASSIGNMENT-TEST-{userId}@EVO.LOCAL".ToUpperInvariant(),
            DisplayName = "Test Merchandiser",
        });
        var merchandiser = new Merchandiser { Id = Guid.NewGuid(), UserId = userId, Active = true };
        db.Merchandisers.Add(merchandiser);
        await db.SaveChangesAsync();
        return merchandiser;
    }

    private static Route NewRoute(string code) => new()
    {
        Id = Guid.NewGuid(),
        RouteCode = code,
        Name = "Route " + code,
        Province = "Ankara",
        CreatedAt = DateTimeOffset.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow,
    };

    [Fact]
    public async Task SecondActiveAssignment_ForSameRoute_ThrowsOnSave()
    {
        await using var db = await CreateContextAsync();

        var route = NewRoute("AS-A");
        db.Routes.Add(route);
        await db.SaveChangesAsync();
        var m1 = await NewMerchandiserAsync(db);
        var m2 = await NewMerchandiserAsync(db);

        db.Assignments.Add(new Assignment
        {
            Id = Guid.NewGuid(),
            RouteId = route.Id,
            MerchandiserId = m1.Id,
            StartDate = DateOnly.FromDateTime(DateTime.UtcNow),
            EndDate = null,
            Reason = AssignmentReason.NewHire,
        });
        await db.SaveChangesAsync();

        db.Assignments.Add(new Assignment
        {
            Id = Guid.NewGuid(),
            RouteId = route.Id,
            MerchandiserId = m2.Id,
            StartDate = DateOnly.FromDateTime(DateTime.UtcNow),
            EndDate = null,
            Reason = AssignmentReason.Swap,
        });

        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task ClosingFirstAssignment_AllowsReassignToNewRoute()
    {
        await using var db = await CreateContextAsync();

        var routeA = NewRoute("AS-B");
        var routeB = NewRoute("AS-C");
        db.Routes.AddRange(routeA, routeB);
        await db.SaveChangesAsync();
        var m1 = await NewMerchandiserAsync(db);

        var firstAssignment = new Assignment
        {
            Id = Guid.NewGuid(),
            RouteId = routeA.Id,
            MerchandiserId = m1.Id,
            StartDate = DateOnly.FromDateTime(DateTime.UtcNow),
            EndDate = null,
            Reason = AssignmentReason.NewHire,
        };
        db.Assignments.Add(firstAssignment);
        await db.SaveChangesAsync();

        firstAssignment.EndDate = DateOnly.FromDateTime(DateTime.UtcNow);
        await db.SaveChangesAsync();

        db.Assignments.Add(new Assignment
        {
            Id = Guid.NewGuid(),
            RouteId = routeB.Id,
            MerchandiserId = m1.Id,
            StartDate = DateOnly.FromDateTime(DateTime.UtcNow),
            EndDate = null,
            Reason = AssignmentReason.Swap,
        });
        await db.SaveChangesAsync();

        var openCount = await db.Assignments.CountAsync(a => a.MerchandiserId == m1.Id && a.EndDate == null);
        Assert.Equal(1, openCount);
    }

    [Fact]
    public async Task SecondActiveAssignment_ForSameMerchandiser_OnDifferentRoute_ThrowsOnSave()
    {
        await using var db = await CreateContextAsync();

        var routeA = NewRoute("AS-D");
        var routeB = NewRoute("AS-E");
        db.Routes.AddRange(routeA, routeB);
        await db.SaveChangesAsync();
        var m1 = await NewMerchandiserAsync(db);

        db.Assignments.Add(new Assignment
        {
            Id = Guid.NewGuid(),
            RouteId = routeA.Id,
            MerchandiserId = m1.Id,
            StartDate = DateOnly.FromDateTime(DateTime.UtcNow),
            EndDate = null,
            Reason = AssignmentReason.NewHire,
        });
        await db.SaveChangesAsync();

        db.Assignments.Add(new Assignment
        {
            Id = Guid.NewGuid(),
            RouteId = routeB.Id,
            MerchandiserId = m1.Id,
            StartDate = DateOnly.FromDateTime(DateTime.UtcNow),
            EndDate = null,
            Reason = AssignmentReason.Coverage,
        });

        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }
}
