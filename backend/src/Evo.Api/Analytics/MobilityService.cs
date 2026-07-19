using Evo.Api.Analytics.Dtos;
using Evo.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Evo.Infrastructure.Time;

namespace Evo.Api.Analytics;

public interface IMobilityService
{
    Task<IReadOnlyList<MerchandiserMobilityDto>> GetReportAsync(string? region, int months, CancellationToken ct = default);
}

/// <summary>Design §8 "Mobility per person" — distinct routes + intra-route reshuffles per
/// merchandiser vs the regional median; outlier → possible mobbing (design's framing). EVO has no
/// senior-management role to gate this behind, so it is Supervisor-scoped like every other
/// analytics endpoint here (spec 010 Q8 — a flagged divergence from the design's role-gating
/// intent, not a silent drop; see docs/DECISIONS.md).</summary>
public class MobilityService : IMobilityService
{
    private static readonly string[] ReshuffleEvents = { "StopMoved", "StopsReordered" };

    private readonly EvoDbContext _db;

    private readonly PlanningClock _clock;

    public MobilityService(EvoDbContext db, PlanningClock clock)
    {
        _clock = clock;
        _db = db;
    }

    public async Task<IReadOnlyList<MerchandiserMobilityDto>> GetReportAsync(string? region, int months, CancellationToken ct = default)
    {
        var since = _clock.Today.AddMonths(-months);

        var routesQuery = _db.Routes.AsQueryable();
        if (!string.IsNullOrEmpty(region))
        {
            routesQuery = routesQuery.Where(r => r.Province == region);
        }
        var routeIds = await routesQuery.Select(r => r.Id).ToListAsync(ct);

        var assignments = await _db.Assignments
            .Where(a => routeIds.Contains(a.RouteId) && (a.EndDate == null || a.EndDate >= since))
            .ToListAsync(ct);

        var merchandiserIds = assignments.Select(a => a.MerchandiserId).Distinct().ToList();
        var merchandisers = await _db.Merchandisers.Where(m => merchandiserIds.Contains(m.Id)).ToListAsync(ct);
        var userIds = merchandisers.Select(m => m.UserId).ToList();
        var names = await _db.Users.Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.DisplayName, ct);

        var sinceOffset = new DateTimeOffset(since.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var reshuffleEvents = await _db.AuditLog
            .Where(e => e.EntityType == "Route" && routeIds.Select(id => id.ToString()).Contains(e.EntityKey) && e.OccurredAt >= sinceOffset && ReshuffleEvents.Contains(e.Event))
            .Select(e => e.EntityKey)
            .ToListAsync(ct);
        var reshuffleCountByRouteId = reshuffleEvents
            .GroupBy(k => k)
            .ToDictionary(g => g.Key, g => g.Count());

        var routesHeldByMerchandiser = merchandiserIds.ToDictionary(
            id => id,
            id => assignments.Where(a => a.MerchandiserId == id).Select(a => a.RouteId).Distinct().ToList());

        var distinctCounts = routesHeldByMerchandiser.Values.Select(routes => routes.Count).OrderBy(c => c).ToList();
        var regionalMedian = Median(distinctCounts);

        var result = new List<MerchandiserMobilityDto>();
        foreach (var merchandiserId in merchandiserIds)
        {
            var merchandiser = merchandisers.First(m => m.Id == merchandiserId);
            var heldRoutes = routesHeldByMerchandiser[merchandiserId];
            var reshuffles = heldRoutes.Sum(routeId => reshuffleCountByRouteId.GetValueOrDefault(routeId.ToString(), 0));
            var outlier = regionalMedian > 0 && (heldRoutes.Count + reshuffles) > regionalMedian * 1.5;

            result.Add(new MerchandiserMobilityDto(
                merchandiserId, names.GetValueOrDefault(merchandiser.UserId, "?"),
                heldRoutes.Count, reshuffles, regionalMedian, outlier));
        }
        return result;
    }

    private static double Median(IReadOnlyList<int> sorted)
    {
        if (sorted.Count == 0) return 0;
        var mid = sorted.Count / 2;
        return sorted.Count % 2 == 0 ? (sorted[mid - 1] + sorted[mid]) / 2.0 : sorted[mid];
    }
}
