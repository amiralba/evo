using Evo.Domain.Scheduling;

namespace Evo.Tests.Scheduling;

public class AbsenceValidatorTests
{
    [Fact]
    public void VisitInsideAbsenceWindow_ReturnsV14Error()
    {
        var merchandiserId = Guid.NewGuid();
        var visit = new VisitAbsenceEval(Guid.NewGuid(), merchandiserId, Guid.NewGuid(), new DateOnly(2026, 7, 20));
        var absences = new List<(Guid, DateOnly, DateOnly)> { (merchandiserId, new DateOnly(2026, 7, 18), new DateOnly(2026, 7, 22)) };

        var findings = AbsenceValidator.Evaluate([visit], absences, []);

        var finding = Assert.Single(findings);
        Assert.Equal("V14", finding.Code);
        Assert.Equal(FindingSeverity.Error, finding.Severity);
        Assert.Equal(visit.VisitId.ToString(), finding.Scope);
    }

    [Fact]
    public void VisitAtClosedStore_ReturnsV14Error()
    {
        var storeId = Guid.NewGuid();
        var visit = new VisitAbsenceEval(Guid.NewGuid(), Guid.NewGuid(), storeId, new DateOnly(2026, 7, 20));
        var closedStores = new List<(Guid, DateOnly, DateOnly)> { (storeId, new DateOnly(2026, 7, 19), new DateOnly(2026, 7, 21)) };

        var findings = AbsenceValidator.Evaluate([visit], [], closedStores);

        var finding = Assert.Single(findings);
        Assert.Equal("V14", finding.Code);
    }

    [Fact]
    public void CleanVisit_ReturnsNoFinding()
    {
        var visit = new VisitAbsenceEval(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), new DateOnly(2026, 7, 20));

        var findings = AbsenceValidator.Evaluate([visit], [], []);

        Assert.Empty(findings);
    }
}
