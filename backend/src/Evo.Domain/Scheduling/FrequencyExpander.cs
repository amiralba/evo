namespace Evo.Domain.Scheduling;

/// <summary>Expands a RouteStop's frequency rule into concrete visit dates within a range.
/// Weekend policy (Saturday) is a deferred panel concern — see spec 005 Open questions.</summary>
public static class FrequencyExpander
{
    public static IEnumerable<DateOnly> ExpandVisitDates(
        Frequency freq,
        short weekdayMask,
        DateOnly? biweeklyAnchor,
        DateOnly from,
        DateOnly to)
    {
        for (var date = from; date <= to; date = date.AddDays(1))
        {
            if (date.DayOfWeek == DayOfWeek.Saturday || date.DayOfWeek == DayOfWeek.Sunday)
            {
                continue;
            }

            switch (freq)
            {
                case Frequency.Daily:
                    yield return date;
                    break;

                case Frequency.Weekly:
                    if (IsMaskedWeekday(weekdayMask, date))
                    {
                        yield return date;
                    }
                    break;

                case Frequency.Biweekly:
                    if (IsMaskedWeekday(weekdayMask, date) && IsMatchingBiweeklyWeek(biweeklyAnchor, date))
                    {
                        yield return date;
                    }
                    break;
            }
        }
    }

    private static bool IsMaskedWeekday(short weekdayMask, DateOnly date)
    {
        var bit = ((int)date.DayOfWeek + 6) % 7; // Mon=0 ... Sun=6
        return (weekdayMask & (1 << bit)) != 0;
    }

    private static bool IsMatchingBiweeklyWeek(DateOnly? anchor, DateOnly date)
    {
        if (anchor is not { } a)
        {
            return false;
        }

        var wholeWeeksBetween = (date.DayNumber - a.DayNumber) / 7;
        return wholeWeeksBetween % 2 == 0;
    }
}
