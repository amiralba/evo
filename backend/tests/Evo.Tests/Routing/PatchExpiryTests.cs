using Evo.Infrastructure.Routing;

namespace Evo.Tests.Routing;

public class PatchExpiryTests
{
    [Fact]
    public void Pending_WithStartsOnTodayOrEarlier_BecomesActive()
    {
        var today = new DateOnly(2026, 7, 20);
        var next = PatchStatusAdvancer.NextStatus(PatchStatus.Pending, startsOn: today, endsOn: today.AddDays(5), today: today);

        Assert.Equal(PatchStatus.Active, next);
    }

    [Fact]
    public void Active_WithEndsOnBeforeToday_BecomesExpired()
    {
        var today = new DateOnly(2026, 7, 20);
        var next = PatchStatusAdvancer.NextStatus(PatchStatus.Active, startsOn: today.AddDays(-5), endsOn: today.AddDays(-1), today: today);

        Assert.Equal(PatchStatus.Expired, next);
    }

    [Fact]
    public void Cancelled_IsNeverChanged()
    {
        var today = new DateOnly(2026, 7, 20);
        var next = PatchStatusAdvancer.NextStatus(PatchStatus.Cancelled, startsOn: today.AddDays(-5), endsOn: today.AddDays(-1), today: today);

        Assert.Equal(PatchStatus.Cancelled, next);
    }

    [Fact]
    public void Pending_WithFutureStartsOn_StaysPending()
    {
        var today = new DateOnly(2026, 7, 20);
        var next = PatchStatusAdvancer.NextStatus(PatchStatus.Pending, startsOn: today.AddDays(1), endsOn: today.AddDays(5), today: today);

        Assert.Equal(PatchStatus.Pending, next);
    }

    [Fact]
    public void Active_WithEndsOnStillFuture_StaysActive()
    {
        var today = new DateOnly(2026, 7, 20);
        var next = PatchStatusAdvancer.NextStatus(PatchStatus.Active, startsOn: today.AddDays(-1), endsOn: today.AddDays(5), today: today);

        Assert.Equal(PatchStatus.Active, next);
    }
}
