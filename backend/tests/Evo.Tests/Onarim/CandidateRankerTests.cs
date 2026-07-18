namespace Evo.Tests.Onarim;

using Evo.Domain.Onarim;

public class CandidateRankerTests
{
    [Fact]
    public void OnLeaveCandidate_RanksLast_AndIsUnavailable()
    {
        var candidates = new[]
        {
            new CandidateInput(Guid.NewGuid(), "Ayşe", OnLeaveThatDay: true, CurrentDayMinutes: 0, DailyCapacity: 480, SameProvince: true, HomeDistanceBucket: 0),
            new CandidateInput(Guid.NewGuid(), "Mehmet", OnLeaveThatDay: false, CurrentDayMinutes: 100, DailyCapacity: 480, SameProvince: true, HomeDistanceBucket: 0),
        };

        var ranked = CandidateRanker.Rank(candidates, plannedMinutes: 30);

        Assert.Equal("Mehmet", ranked[0].Name);
        Assert.Equal("Ayşe", ranked[1].Name);
        Assert.False(ranked[1].Available);
    }

    [Fact]
    public void SameProvinceWithCapacity_OutranksOutOfProvince()
    {
        var candidates = new[]
        {
            new CandidateInput(Guid.NewGuid(), "OutOfProvince", OnLeaveThatDay: false, CurrentDayMinutes: 0, DailyCapacity: 480, SameProvince: false, HomeDistanceBucket: 5),
            new CandidateInput(Guid.NewGuid(), "SameProvince", OnLeaveThatDay: false, CurrentDayMinutes: 0, DailyCapacity: 480, SameProvince: true, HomeDistanceBucket: 1),
        };

        var ranked = CandidateRanker.Rank(candidates, plannedMinutes: 30);

        Assert.Equal("SameProvince", ranked[0].Name);
    }

    [Fact]
    public void OverCapacityCandidate_IsNotWithinCapacity()
    {
        var candidates = new[]
        {
            new CandidateInput(Guid.NewGuid(), "Full", OnLeaveThatDay: false, CurrentDayMinutes: 470, DailyCapacity: 480, SameProvince: true, HomeDistanceBucket: 0),
        };

        var ranked = CandidateRanker.Rank(candidates, plannedMinutes: 30);

        Assert.False(ranked[0].WithinCapacity);
        Assert.False(ranked[0].Available);
    }

    [Fact]
    public void TieBreak_IsDeterministic_ByGuid()
    {
        var a = new CandidateInput(Guid.Parse("00000000-0000-0000-0000-000000000001"), "A", false, 0, 480, true, 0);
        var b = new CandidateInput(Guid.Parse("00000000-0000-0000-0000-000000000002"), "B", false, 0, 480, true, 0);

        var ranked1 = CandidateRanker.Rank([b, a], 30);
        var ranked2 = CandidateRanker.Rank([a, b], 30);

        Assert.Equal(ranked1.Select(r => r.Id), ranked2.Select(r => r.Id));
        Assert.Equal(a.Id, ranked1[0].Id);
    }

    [Fact]
    public void Reasoning_IsNeverEmpty()
    {
        var candidates = new[]
        {
            new CandidateInput(Guid.NewGuid(), "X", true, 0, 480, true, 0),
            new CandidateInput(Guid.NewGuid(), "Y", false, 470, 480, true, 0),
            new CandidateInput(Guid.NewGuid(), "Z", false, 0, 480, false, 3),
        };

        var ranked = CandidateRanker.Rank(candidates, 30);

        Assert.All(ranked, r => Assert.False(string.IsNullOrWhiteSpace(r.Reasoning)));
    }
}
