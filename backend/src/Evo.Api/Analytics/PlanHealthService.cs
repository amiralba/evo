using Evo.Api.Analytics.Dtos;
using Evo.Domain.Scheduling;
using Evo.Infrastructure;
using Evo.Infrastructure.Routing;
using Evo.Infrastructure.Tasks;
using Microsoft.EntityFrameworkCore;
using Route = Evo.Infrastructure.Routing.Route;

namespace Evo.Api.Analytics;

public interface IPlanHealthService
{
    Task<PlanHealthReportDto> GetReportAsync(string? region, DateOnly from, DateOnly to, CancellationToken ct = default);
}

/// <summary>On-read plan-health aggregation (spec 010 Q9 — no analytics table, no refresh job).
/// Computes design §8's metric set per route from existing tables only.</summary>
public class PlanHealthService : IPlanHealthService
{
    private readonly EvoDbContext _db;
    private readonly IStabilityService _stabilityService;
    private readonly ISettingsProvider _settingsProvider;

    public PlanHealthService(EvoDbContext db, IStabilityService stabilityService, ISettingsProvider settingsProvider)
    {
        _db = db;
        _stabilityService = stabilityService;
        _settingsProvider = settingsProvider;
    }

    public async Task<PlanHealthReportDto> GetReportAsync(string? region, DateOnly from, DateOnly to, CancellationToken ct = default)
    {
        var routesQuery = _db.Routes.AsQueryable();
        if (!string.IsNullOrEmpty(region))
        {
            routesQuery = routesQuery.Where(r => r.Province == region);
        }
        var routes = await routesQuery.ToListAsync(ct);

        var lowerBand = await ReadSettingDoubleAsync("utilization_band_lower", 0.90, ct);
        var upperBand = await ReadSettingDoubleAsync("utilization_band_upper", 1.05, ct);

        var report = new List<RoutePlanHealthDto>();
        foreach (var route in routes)
        {
            var settings = await _settingsProvider.GetAsync(route.Province, ct);
            var health = await ComputeRouteHealthAsync(route, from, to, lowerBand, upperBand, settings.DailyWorkMinutes, ct);
            report.Add(health);
        }

        return new PlanHealthReportDto(region, from, to, report.OrderByDescending(r => r.PlanHealthScore).ToList());
    }

    private async Task<RoutePlanHealthDto> ComputeRouteHealthAsync(
        Route route, DateOnly from, DateOnly to, double lowerBand, double upperBand, int dailyWorkMinutes, CancellationToken ct)
    {
        var visits = await _db.PlannedVisits
            .Where(v => v.RouteId == route.Id && v.VisitDate >= from && v.VisitDate <= to)
            .ToListAsync(ct);

        var visitIds = visits.Select(v => v.Id).ToList();
        var realizations = await _db.VisitRealizations
            .Where(r => visitIds.Contains(r.PlannedVisitId))
            .ToListAsync(ct);
        var realizationByVisitId = realizations.ToDictionary(r => r.PlannedVisitId, r => r);

        // Planned-vs-realized (completion %, duration variance).
        var doneCount = visits.Count(v => v.Status == PlannedVisitStatus.Done);
        var missedCount = visits.Count(v => v.Status == PlannedVisitStatus.Missed);
        var skippedCount = visits.Count(v => v.Status == PlannedVisitStatus.Skipped);
        var resolvedCount = doneCount + missedCount + skippedCount;
        var completionPct = resolvedCount == 0 ? 0.0 : (double)doneCount / resolvedCount;

        var plannedMinutes = visits.Where(v => v.PlannedStart.HasValue && v.PlannedEnd.HasValue)
            .Sum(v => (int)(v.PlannedEnd!.Value - v.PlannedStart!.Value).TotalMinutes);
        var realizedMinutes = realizations.Where(r => r.ActualMinutes.HasValue).Sum(r => r.ActualMinutes!.Value);
        var durationVariancePct = plannedMinutes == 0 ? 0.0 : (double)(realizedMinutes - plannedMinutes) / plannedMinutes;

        // Utilization (V8 band).
        var workingDays = visits.Select(v => v.VisitDate).Distinct().Count();
        var weeklyCapacity = dailyWorkMinutes * Math.Max(workingDays, 1);
        var utilizationPct = weeklyCapacity == 0 ? 0.0 : (double)plannedMinutes / weeklyCapacity;
        var utilizationBand = utilizationPct < lowerBand ? "under" : utilizationPct > upperBand ? "over" : "ok";

        // Task compliance.
        var taskInstances = await _db.TaskInstances
            .Where(ti => ti.PlannedVisitId != null && visitIds.Contains(ti.PlannedVisitId.Value))
            .ToListAsync(ct);
        var taskDone = taskInstances.Count(ti => ti.Status == TaskInstanceStatus.Done);
        var taskConsidered = taskInstances.Count(ti => ti.Status is TaskInstanceStatus.Done or TaskInstanceStatus.Overdue or TaskInstanceStatus.Cancelled);
        var taskCompliancePct = taskConsidered == 0 ? 0.0 : (double)taskDone / taskConsidered;

        // Override rate.
        var overrideCount = taskInstances.Count(ti => ti.OverrideScope == OverrideScope.Instance);
        var overrideRatePct = taskInstances.Count == 0 ? 0.0 : (double)overrideCount / taskInstances.Count;

        // Patch load.
        var patches = await _db.Patches
            .Where(p => p.RouteId == route.Id && p.StartsOn <= to && p.EndsOn >= from)
            .ToListAsync(ct);
        var patchLoad = patches.GroupBy(p => p.Type.ToString()).ToDictionary(g => g.Key, g => g.Count());

        // Assignment turnover (trailing 12 months).
        var since = DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(-12));
        var turnover = await _db.Assignments
            .CountAsync(a => a.RouteId == route.Id && a.EndDate != null && a.EndDate >= since, ct);

        var stabilityScore = await _stabilityService.GetStabilityScoreAsync(route.Id, ct);
        var planHealthScore = ComputePlanHealthScore(stabilityScore, completionPct, utilizationBand);

        return new RoutePlanHealthDto(
            route.Id, route.RouteCode, route.Name, route.Province,
            completionPct, plannedMinutes, realizedMinutes, durationVariancePct,
            utilizationPct, utilizationBand, taskCompliancePct,
            patchLoad, stabilityScore, turnover, overrideRatePct, planHealthScore);
    }

    /// <summary>Equal-weighted normalized product of stability, completion %, and an in-band
    /// utilization factor (design §8 suggests stability × revenue attainment × utilization —
    /// revenue attainment substituted with completion % since revenue-per-route isn't in scope
    /// here; retune here if the weighting needs to change).</summary>
    private static double ComputePlanHealthScore(double stabilityScore, double completionPct, string utilizationBand)
    {
        var utilizationFactor = utilizationBand == "ok" ? 1.0 : 0.75;
        return (stabilityScore / 100.0) * completionPct * utilizationFactor;
    }

    private async Task<double> ReadSettingDoubleAsync(string key, double fallback, CancellationToken ct)
    {
        var raw = await _db.Settings.Where(s => s.Key == key && s.RegionId == "").Select(s => s.ValueJson).FirstOrDefaultAsync(ct);
        return raw is null ? fallback : System.Text.Json.JsonSerializer.Deserialize<double>(raw);
    }
}
