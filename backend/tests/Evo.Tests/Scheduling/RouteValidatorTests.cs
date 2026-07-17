using Evo.Domain.Scheduling;

namespace Evo.Tests.Scheduling;

public class RouteValidatorTests
{
    private static StopEval Stop(
        string province = "Ankara",
        string district = "Cankaya",
        bool isService = false,
        bool bannedOnDate = false,
        TimeOnly? windowStart = null,
        TimeOnly? windowEnd = null,
        TimeOnly? scheduledStart = null,
        TimeOnly? scheduledEnd = null) =>
        new(Guid.NewGuid(), province, district, isService, 30, windowStart, windowEnd, bannedOnDate, scheduledStart, scheduledEnd);

    [Fact]
    public void V3_BlocksOutOfProvinceStop_PassesInScopeOne()
    {
        var route = new RouteEval("Ankara", ["Cankaya"], 0, 0, 20,
        [
            Stop(province: "Istanbul"),
            Stop(province: "Ankara", district: "Cankaya"),
        ]);

        var findings = RouteValidator.V3_GeoScope(route);

        Assert.Single(findings);
        Assert.Equal("V3", findings[0].Code);
    }

    [Fact]
    public void V5_WarnsWhenRevenueBelowTarget()
    {
        var underTarget = new RouteEval("Ankara", [], 1000, 500, 20, []);
        var atTarget = new RouteEval("Ankara", [], 1000, 1000, 20, []);

        Assert.Contains(RouteValidator.V5_Revenue(underTarget), f => f.Code == "V5");
        Assert.Empty(RouteValidator.V5_Revenue(atTarget));
    }

    [Fact]
    public void V6_WarnsWhenServiceShareExceedsCap_NotBelow()
    {
        var overCap = new RouteEval("Ankara", [], 0, 0, 20,
        [
            Stop(isService: true), Stop(isService: true), Stop(isService: true), Stop(isService: false),
        ]); // 75% service > 20% cap

        var underCap = new RouteEval("Ankara", [], 0, 0, 20,
        [
            Stop(isService: false), Stop(isService: false), Stop(isService: false), Stop(isService: false),
        ]); // 0% service

        Assert.Contains(RouteValidator.V6_ServiceMix(overCap), f => f.Code == "V6");
        Assert.Empty(RouteValidator.V6_ServiceMix(underCap));
    }

    [Fact]
    public void V7_BlocksVisitOutsideTimeWindow_AndOnBannedDate()
    {
        var outsideWindow = new RouteEval("Ankara", [], 0, 0, 20,
        [
            Stop(windowStart: new TimeOnly(9, 0), windowEnd: new TimeOnly(12, 0),
                 scheduledStart: new TimeOnly(13, 0), scheduledEnd: new TimeOnly(13, 30)),
        ]);
        var banned = new RouteEval("Ankara", [], 0, 0, 20, [Stop(bannedOnDate: true)]);
        var withinWindow = new RouteEval("Ankara", [], 0, 0, 20,
        [
            Stop(windowStart: new TimeOnly(9, 0), windowEnd: new TimeOnly(12, 0),
                 scheduledStart: new TimeOnly(10, 0), scheduledEnd: new TimeOnly(10, 30)),
        ]);

        Assert.Contains(RouteValidator.V7_TimeWindowBan(outsideWindow), f => f.Code == "V7");
        Assert.Contains(RouteValidator.V7_TimeWindowBan(banned), f => f.Code == "V7");
        Assert.Empty(RouteValidator.V7_TimeWindowBan(withinWindow));
    }

    [Fact]
    public void V12_FlagsOverlappingVisits_NotNonOverlapping()
    {
        var merchandiser = Guid.NewGuid();
        var date = new DateOnly(2026, 7, 20);

        var overlapping = new[]
        {
            (merchandiser, date, new TimeOnly(9, 0), new TimeOnly(10, 0)),
            (merchandiser, date, new TimeOnly(9, 30), new TimeOnly(10, 30)),
        };
        var nonOverlapping = new[]
        {
            (merchandiser, date, new TimeOnly(9, 0), new TimeOnly(10, 0)),
            (merchandiser, date, new TimeOnly(10, 0), new TimeOnly(11, 0)),
        };

        Assert.NotEmpty(OverlapValidator.V12_Overlaps(overlapping));
        Assert.Empty(OverlapValidator.V12_Overlaps(nonOverlapping));
    }
}
