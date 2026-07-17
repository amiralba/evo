using Evo.Domain.Scheduling;

namespace Evo.Tests.Scheduling;

public class FrequencyExpanderTests
{
    // Mon 2026-07-06 .. Fri 2026-07-17 is a 2-week weekday range (10 weekdays).
    private static readonly DateOnly From = new(2026, 7, 6);
    private static readonly DateOnly To = new(2026, 7, 17);

    [Fact]
    public void Daily_OverTwoWeeks_YieldsTenWeekdayDates()
    {
        var dates = FrequencyExpander.ExpandVisitDates(Frequency.Daily, 0, null, From, To).ToList();

        Assert.Equal(10, dates.Count);
        Assert.All(dates, d => Assert.True(d.DayOfWeek != DayOfWeek.Saturday && d.DayOfWeek != DayOfWeek.Sunday));
    }

    [Fact]
    public void Weekly_MonThuMask_YieldsOnlyMondaysAndThursdays()
    {
        // Mon=bit0, Thu=bit3
        short mask = 0b0001001;

        var dates = FrequencyExpander.ExpandVisitDates(Frequency.Weekly, mask, null, From, To).ToList();

        Assert.Equal(4, dates.Count); // 2 Mondays + 2 Thursdays across the 2-week range
        Assert.All(dates, d => Assert.True(d.DayOfWeek == DayOfWeek.Monday || d.DayOfWeek == DayOfWeek.Thursday));
    }

    [Fact]
    public void Biweekly_WithAnchor_YieldsOnlyAlternatingMatchingWeeks()
    {
        short mask = 0b0000001; // Monday only
        var anchor = new DateOnly(2026, 7, 6); // Monday, week 1 (anchor week included)

        var dates = FrequencyExpander.ExpandVisitDates(Frequency.Biweekly, mask, anchor, From, To).ToList();

        Assert.Single(dates);
        Assert.Equal(anchor, dates[0]); // anchor week's Monday included, the following week's Monday skipped
    }

    [Fact]
    public void EmptyRange_YieldsNone()
    {
        var dates = FrequencyExpander.ExpandVisitDates(Frequency.Daily, 0, null, To, From).ToList();

        Assert.Empty(dates);
    }
}
