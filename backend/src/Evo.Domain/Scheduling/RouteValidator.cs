namespace Evo.Domain.Scheduling;

/// <summary>IsServiceCategory rather than the full Evo.Infrastructure.Stores.StoreCategory enum —
/// Evo.Domain must not reference Evo.Infrastructure (Infrastructure depends on Domain, not
/// the reverse); the caller (PlanGenerationService) maps StoreCategory.Service to this bool.</summary>
public record StopEval(
    Guid StoreId,
    string Province,
    string District,
    bool IsServiceCategory,
    int Minutes,
    TimeOnly? WindowStart,
    TimeOnly? WindowEnd,
    bool BannedOnDate,
    TimeOnly? ScheduledStart = null,
    TimeOnly? ScheduledEnd = null);

public record RouteEval(
    string Province,
    IReadOnlyList<string> Districts,
    decimal RevenueTarget,
    decimal SixMonthRevenue,
    int ServiceMixCapPct,
    IReadOnlyList<StopEval> Stops);

/// <summary>M1-core validation rule evaluators (design's V1-V16 set, this file covers
/// V3/V5/V6/V7 — V1/V2 come from DayScheduler, V12 from OverlapValidator).
/// Pure, no DB — "never block, always justify": findings surface, the caller decides.</summary>
public static class RouteValidator
{
    public static IReadOnlyList<ValidationFinding> Evaluate(RouteEval route)
    {
        var findings = new List<ValidationFinding>();
        findings.AddRange(V3_GeoScope(route));
        findings.AddRange(V5_Revenue(route));
        findings.AddRange(V6_ServiceMix(route));
        findings.AddRange(V7_TimeWindowBan(route));
        return findings;
    }

    public static IReadOnlyList<ValidationFinding> V3_GeoScope(RouteEval route)
    {
        var findings = new List<ValidationFinding>();
        foreach (var stop in route.Stops)
        {
            var inProvince = stop.Province == route.Province;
            var inDistrict = route.Districts.Count == 0 || route.Districts.Contains(stop.District);
            if (!inProvince || !inDistrict)
            {
                findings.Add(new ValidationFinding("V3", FindingSeverity.Error,
                    $"Store {stop.StoreId} is outside the route's geo-scope.", stop.StoreId.ToString()));
            }
        }
        return findings;
    }

    public static IReadOnlyList<ValidationFinding> V5_Revenue(RouteEval route)
    {
        if (route.SixMonthRevenue < route.RevenueTarget)
        {
            return [new ValidationFinding("V5", FindingSeverity.Warning,
                $"Six-month revenue {route.SixMonthRevenue} is below the target {route.RevenueTarget}.")];
        }
        return [];
    }

    public static IReadOnlyList<ValidationFinding> V6_ServiceMix(RouteEval route)
    {
        if (route.Stops.Count == 0)
        {
            return [];
        }

        var serviceCount = route.Stops.Count(s => s.IsServiceCategory);
        var sharePct = serviceCount * 100 / route.Stops.Count;
        if (sharePct > route.ServiceMixCapPct)
        {
            return [new ValidationFinding("V6", FindingSeverity.Warning,
                $"SERVICE-category share {sharePct}% exceeds the {route.ServiceMixCapPct}% cap.")];
        }
        return [];
    }

    public static IReadOnlyList<ValidationFinding> V7_TimeWindowBan(RouteEval route)
    {
        var findings = new List<ValidationFinding>();
        foreach (var stop in route.Stops)
        {
            if (stop.BannedOnDate)
            {
                findings.Add(new ValidationFinding("V7", FindingSeverity.Error,
                    $"Store {stop.StoreId} is banned on this date.", stop.StoreId.ToString()));
                continue;
            }

            if (stop.WindowStart is { } windowStart && stop.WindowEnd is { } windowEnd
                && stop.ScheduledStart is { } scheduledStart && stop.ScheduledEnd is { } scheduledEnd
                && (scheduledStart < windowStart || scheduledEnd > windowEnd))
            {
                findings.Add(new ValidationFinding("V7", FindingSeverity.Error,
                    $"Store {stop.StoreId}'s visit falls outside its time window.", stop.StoreId.ToString()));
            }
        }
        return findings;
    }
}
