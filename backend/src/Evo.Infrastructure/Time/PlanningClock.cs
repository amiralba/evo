namespace Evo.Infrastructure.Time;

/// <summary>
/// The planning domain's single source of "now"/"today" (audit §B.3, DB §1.1). EVO is a
/// Turkish-market product: a planning day is a EUROPE/ISTANBUL calendar day, not a UTC one.
/// Deriving "today" from <c>DateTime.UtcNow</c> made every date between 00:00–03:00 Istanbul
/// belong to the previous day — the regeneration clamp could rewrite the already-executed
/// Turkish yesterday and patch expiry advanced late — and made the test suite's "today"
/// weekend-dependent. All planning-date derivations go through <see cref="Today"/>; tests pin
/// a <c>FakeTimeProvider</c> midweek and the whole stack follows.
/// </summary>
public sealed class PlanningClock(TimeProvider provider)
{
    private static readonly TimeZoneInfo Istanbul = ResolveIstanbul();

    /// <summary>Today as a Europe/Istanbul calendar date.</summary>
    public DateOnly Today => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(provider.GetUtcNow(), Istanbul).DateTime);

    public DateTimeOffset UtcNow => provider.GetUtcNow();

    /// <summary>Istanbul's UTC offset on the given date (for labeling wall-clock plan times).</summary>
    public TimeSpan IstanbulOffset(DateOnly date) => Istanbul.GetUtcOffset(date.ToDateTime(TimeOnly.MinValue));

    private static TimeZoneInfo ResolveIstanbul()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Europe/Istanbul");
        }
        catch (TimeZoneNotFoundException)
        {
            // Windows without ICU falls back to the legacy id.
            return TimeZoneInfo.FindSystemTimeZoneById("Turkey Standard Time");
        }
    }
}
