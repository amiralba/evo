using Evo.Domain.Scheduling;

namespace Evo.Tests.Scheduling;

public class UtilizationValidatorTests
{
    [Fact]
    public void UnderBand_ReturnsV8Warning()
    {
        var finding = UtilizationValidator.Evaluate(weeklyPlannedMinutes: 1800, weeklyCapacityMinutes: 2250, lowerBandPct: 0.90, upperBandPct: 1.05);

        Assert.NotNull(finding);
        Assert.Equal("V8", finding!.Code);
        Assert.Equal(FindingSeverity.Warning, finding.Severity);
        Assert.Contains("under-allocated", finding.Message);
    }

    [Fact]
    public void InBand_ReturnsNoFinding()
    {
        var finding = UtilizationValidator.Evaluate(weeklyPlannedMinutes: 2137, weeklyCapacityMinutes: 2250, lowerBandPct: 0.90, upperBandPct: 1.05);

        Assert.Null(finding);
    }

    [Fact]
    public void OverBand_ReturnsV8Warning()
    {
        var finding = UtilizationValidator.Evaluate(weeklyPlannedMinutes: 2500, weeklyCapacityMinutes: 2250, lowerBandPct: 0.90, upperBandPct: 1.05);

        Assert.NotNull(finding);
        Assert.Equal("V8", finding!.Code);
        Assert.Contains("over-allocated", finding.Message);
    }

    [Fact]
    public void BandEdges_AreInclusive()
    {
        Assert.Null(UtilizationValidator.Evaluate(2025, 2250, 0.90, 1.05)); // exactly 90%
        Assert.Null(UtilizationValidator.Evaluate(2362, 2250, 0.90, 1.05)); // ~105%, just under
    }
}
