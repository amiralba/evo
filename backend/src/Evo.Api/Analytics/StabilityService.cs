using Evo.Api.Analytics.Dtos;
using Evo.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Evo.Api.Analytics;

public interface IStabilityService
{
    Task<double> GetStabilityScoreAsync(Guid routeId, CancellationToken ct = default);
    Task<IReadOnlyList<RouteStabilityDto>> GetRegionStabilityAsync(string? region, CancellationToken ct = default);
}

/// <summary>Design §8: "100 − weighted structural changes in trailing 12 months (stop add/remove/move;
/// frequency change; excludes patches — patches are healthy flexibility)". Reads the route_change_log
/// facade (audit_log where EntityType="Route") — no new table, on-read aggregation (spec 010 Q9).</summary>
public class StabilityService : IStabilityService
{
    // Named weights per structural event type (design §8) — not magic literals.
    private const int StopAddedWeight = 3;
    private const int StopRemovedWeight = 3;
    private const int StopMovedWeight = 2;
    private const int FreqChangedWeight = 2;
    private const int StopsReorderedWeight = 1;

    private static readonly Dictionary<string, int> EventWeights = new()
    {
        ["StopAdded"] = StopAddedWeight,
        ["StopRemoved"] = StopRemovedWeight,
        ["StopMoved"] = StopMovedWeight,
        ["FreqChanged"] = FreqChangedWeight,
        ["StopsReordered"] = StopsReorderedWeight,
    };

    private readonly EvoDbContext _db;

    public StabilityService(EvoDbContext db)
    {
        _db = db;
    }

    public async Task<double> GetStabilityScoreAsync(Guid routeId, CancellationToken ct = default)
    {
        var since = DateTimeOffset.UtcNow.AddMonths(-12);
        var events = await _db.AuditLog
            .Where(e => e.EntityType == "Route" && e.EntityKey == routeId.ToString() && e.OccurredAt >= since)
            .Select(e => e.Event)
            .ToListAsync(ct);

        var penalty = events.Sum(e => EventWeights.GetValueOrDefault(e, 0));
        return Math.Max(0, 100 - penalty);
    }

    public async Task<IReadOnlyList<RouteStabilityDto>> GetRegionStabilityAsync(string? region, CancellationToken ct = default)
    {
        var routesQuery = _db.Routes.AsQueryable();
        if (!string.IsNullOrEmpty(region))
        {
            routesQuery = routesQuery.Where(r => r.Province == region);
        }
        var routes = await routesQuery.Select(r => new { r.Id, r.RouteCode }).ToListAsync(ct);

        var result = new List<RouteStabilityDto>();
        foreach (var route in routes)
        {
            var score = await GetStabilityScoreAsync(route.Id, ct);
            result.Add(new RouteStabilityDto(route.Id, route.RouteCode, score));
        }
        return result;
    }
}
