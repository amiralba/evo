namespace Evo.Domain.Scheduling;

/// <summary>V8 — weekly minutes utilization outside the configurable band (design §3.2), Warning
/// severity. Pure, no DB.</summary>
public static class UtilizationValidator
{
    public static ValidationFinding? Evaluate(int weeklyPlannedMinutes, int weeklyCapacityMinutes, double lowerBandPct, double upperBandPct)
    {
        if (weeklyCapacityMinutes <= 0) return null;

        var utilization = (double)weeklyPlannedMinutes / weeklyCapacityMinutes;
        if (utilization < lowerBandPct)
        {
            return new ValidationFinding("V8", FindingSeverity.Warning,
                $"Weekly utilization {utilization:P0} is below the {lowerBandPct:P0} band — under-allocated.");
        }
        if (utilization > upperBandPct)
        {
            return new ValidationFinding("V8", FindingSeverity.Warning,
                $"Weekly utilization {utilization:P0} exceeds the {upperBandPct:P0} band — over-allocated.");
        }
        return null;
    }
}
