using Evo.Domain.Scheduling;

namespace Evo.Tests.Scheduling;

public class DaySchedulerTests
{
    private static readonly IReadOnlyList<BreakBlock> Breaks =
    [
        new BreakBlock("Kahvalti", new TimeOnly(10, 30), new TimeOnly(10, 45)),
        new BreakBlock("Ogle Yemegi", new TimeOnly(12, 30), new TimeOnly(13, 15)),
        new BreakBlock("Ikindi Cayi", new TimeOnly(15, 30), new TimeOnly(15, 45)),
    ];

    private static SchedulingSettings Settings(int over450Tolerance = 0) => new(
        DailyWorkMinutes: 450,
        DefaultServiceMinutes: 30,
        DayStart: new TimeOnly(9, 0),
        Over450ToleranceMinutes: over450Tolerance,
        ServiceMixCapPct: 20,
        PlanHorizonWeeks: 6,
        SnapMinutes: 5,
        Breaks: Breaks);

    private static List<(Guid, Guid, int)> VisitsOfMinutes(params int[] minutes) =>
        minutes.Select(m => (Guid.NewGuid(), Guid.NewGuid(), m)).ToList();

    [Fact]
    public void SixSixtyMinuteVisits_PushAroundBreaks_NoOverlap()
    {
        var visits = VisitsOfMinutes(60, 60, 60, 60, 60, 60);

        var plan = DayScheduler.ScheduleDay(new DateOnly(2026, 7, 20), visits, Settings());

        Assert.Equal(360, plan.PlannedMinutes); // breaks excluded from planned minutes
        foreach (var visit in plan.Visits)
        {
            foreach (var brk in Breaks)
            {
                var overlaps = visit.Start < brk.End && visit.End > brk.Start;
                Assert.False(overlaps, $"Visit {visit.Start}-{visit.End} overlaps break {brk.Label}");
            }
        }
    }

    [Fact]
    public void FourHundredMinuteDay_EmitsV1Warning()
    {
        var visits = VisitsOfMinutes(Enumerable.Repeat(50, 8).ToArray()); // 400 minutes

        var plan = DayScheduler.ScheduleDay(new DateOnly(2026, 7, 20), visits, Settings());

        Assert.Equal(400, plan.PlannedMinutes);
        Assert.Contains(plan.Findings, f => f.Code == "V1");
        Assert.DoesNotContain(plan.Findings, f => f.Code == "V2");
    }

    [Fact]
    public void FourHundredSeventyMinuteDay_ZeroTolerance_EmitsV2Warning()
    {
        var visits = VisitsOfMinutes(Enumerable.Repeat(47, 10).ToArray()); // 470 minutes

        var plan = DayScheduler.ScheduleDay(new DateOnly(2026, 7, 20), visits, Settings(over450Tolerance: 0));

        Assert.Equal(470, plan.PlannedMinutes);
        Assert.Contains(plan.Findings, f => f.Code == "V2");
        Assert.DoesNotContain(plan.Findings, f => f.Code == "V1");
    }

    [Fact]
    public void FourHundredFiftyMinuteDay_EmitsNeitherFinding()
    {
        var visits = VisitsOfMinutes(Enumerable.Repeat(45, 10).ToArray()); // 450 minutes

        var plan = DayScheduler.ScheduleDay(new DateOnly(2026, 7, 20), visits, Settings());

        Assert.Equal(450, plan.PlannedMinutes);
        Assert.Empty(plan.Findings);
    }
}
