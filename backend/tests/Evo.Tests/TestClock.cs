using Evo.Infrastructure.Time;
using Microsoft.Extensions.Time.Testing;

namespace Evo.Tests;

/// <summary>
/// The suite's pinned planning clock: Wednesday 2026-07-15 09:00 UTC (12:00 Istanbul). Every
/// today-derivation in the API goes through <see cref="PlanningClock"/> (audit §B.3), so pinning
/// the provider midweek makes the whole suite deterministic — the old "11 weekend flakes" were
/// tests deriving "today" from the real clock and generating zero visits on Sat/Sun (§E.1).
/// EvoApiTestFactory injects <see cref="Provider"/>; tests that construct services directly pass
/// <see cref="Clock"/>; date expectations use <see cref="Today"/>.
/// </summary>
public static class TestClock
{
    public static readonly DateTimeOffset Instant = new(2026, 7, 15, 9, 0, 0, TimeSpan.Zero);

    public static readonly FakeTimeProvider Provider = new(Instant);

    public static readonly PlanningClock Clock = new(Provider);

    /// <summary>2026-07-15, a Wednesday (Istanbul calendar date of the pinned instant).</summary>
    public static DateOnly Today => Clock.Today;
}
