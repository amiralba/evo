namespace Evo.Domain.Scheduling;

/// <summary>A statutory or planned break the day scheduler must route visits around.</summary>
public record BreakBlock(string Label, TimeOnly Start, TimeOnly End);

/// <summary>EF-free settings the scheduling engine consumes; mapped from the <c>setting</c> table
/// by <c>SettingsProvider</c> (Task 28) so the engine never touches EF.</summary>
public record SchedulingSettings(
    int DailyWorkMinutes,
    int DefaultServiceMinutes,
    TimeOnly DayStart,
    int Over450ToleranceMinutes,
    int ServiceMixCapPct,
    int PlanHorizonWeeks,
    int SnapMinutes,
    IReadOnlyList<BreakBlock> Breaks);
