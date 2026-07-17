namespace Evo.Domain.Scheduling;

public record ScheduledVisit(Guid RouteStopId, Guid StoreId, int Minutes, TimeOnly Start, TimeOnly End);

public record DayPlan(DateOnly Date, IReadOnlyList<ScheduledVisit> Visits, int PlannedMinutes, IReadOnlyList<ValidationFinding> Findings);

/// <summary>Places visits sequentially from DayStart, pushing them past any statutory break
/// they would otherwise overlap (breaks are reserved, non-editable — design §3.3), then checks
/// the 450-minute rule (V1/V2).</summary>
public static class DayScheduler
{
    public static DayPlan ScheduleDay(
        DateOnly date,
        IReadOnlyList<(Guid RouteStopId, Guid StoreId, int Minutes, TimeOnly? PinnedStart)> orderedVisits,
        SchedulingSettings settings)
    {
        var cursor = settings.DayStart;
        var visits = new List<ScheduledVisit>();
        var plannedMinutes = 0;

        foreach (var (routeStopId, storeId, minutes, pinnedStart) in orderedVisits)
        {
            var start = pinnedStart is { } pin && pin > cursor ? pin : cursor;
            var end = start.AddMinutes(minutes);

            foreach (var brk in settings.Breaks)
            {
                if (start < brk.End && end > brk.Start)
                {
                    start = brk.End;
                    end = start.AddMinutes(minutes);
                }
            }

            visits.Add(new ScheduledVisit(routeStopId, storeId, minutes, start, end));
            plannedMinutes += minutes;
            cursor = end;
        }

        var findings = new List<ValidationFinding>();
        if (plannedMinutes < settings.DailyWorkMinutes)
        {
            findings.Add(new ValidationFinding("V1", FindingSeverity.Warning,
                $"Day is under-loaded: {plannedMinutes} of {settings.DailyWorkMinutes} minutes planned."));
        }
        if (plannedMinutes > settings.DailyWorkMinutes + settings.Over450ToleranceMinutes)
        {
            findings.Add(new ValidationFinding("V2", FindingSeverity.Warning,
                $"Day exceeds the {settings.DailyWorkMinutes}-minute rule: {plannedMinutes} minutes planned."));
        }

        return new DayPlan(date, visits, plannedMinutes, findings);
    }
}
