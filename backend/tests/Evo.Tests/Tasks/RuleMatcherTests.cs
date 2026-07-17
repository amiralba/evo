using Evo.Domain.Tasks;

namespace Evo.Tests.Tasks;

public class RuleMatcherTests
{
    private static readonly StoreAttributes MmStore = new(
        StoreId: Guid.NewGuid(), ChainId: Guid.NewGuid(), Format: 2, Category: "Market",
        Channel: "Modern", Province: "Istanbul", RouteId: Guid.NewGuid());

    private static TaskRuleInput Rule(StoreConditionMatch condition, DateOnly? from = null, DateOnly? to = null) =>
        new(Guid.NewGuid(), Guid.NewGuid(), RuleScopeLevel.Format, condition, TaskEffectOp.ScaleMinutes,
            null, 1.5m, 0, from ?? new DateOnly(2026, 1, 1), to);

    [Fact]
    public void FormatOnlyCondition_MatchesMmStore()
    {
        var rule = Rule(new StoreConditionMatch(null, 2, null, null, null, null, null));
        Assert.True(RuleMatcher.Matches(rule, MmStore, new DateOnly(2026, 7, 17)));
    }

    [Fact]
    public void FormatOnlyCondition_Rejects5MStore()
    {
        var rule = Rule(new StoreConditionMatch(null, 5, null, null, null, null, null));
        Assert.False(RuleMatcher.Matches(rule, MmStore, new DateOnly(2026, 7, 17)));
    }

    [Fact]
    public void StoreIdCondition_OnlyMatchesThatStore()
    {
        var rule = Rule(new StoreConditionMatch(null, null, null, null, null, null, MmStore.StoreId));
        Assert.True(RuleMatcher.Matches(rule, MmStore, new DateOnly(2026, 7, 17)));

        var otherRule = Rule(new StoreConditionMatch(null, null, null, null, null, null, Guid.NewGuid()));
        Assert.False(RuleMatcher.Matches(otherRule, MmStore, new DateOnly(2026, 7, 17)));
    }

    [Fact]
    public void DateWindow_InsideMatches_OutsideRejects()
    {
        var rule = Rule(new StoreConditionMatch(null, 2, null, null, null, null, null),
            from: new DateOnly(2026, 7, 1), to: new DateOnly(2026, 7, 31));

        Assert.True(RuleMatcher.Matches(rule, MmStore, new DateOnly(2026, 7, 15)));
        Assert.False(RuleMatcher.Matches(rule, MmStore, new DateOnly(2026, 8, 1)));
    }

    [Fact]
    public void MultiFieldCondition_RequiresAllToMatch()
    {
        var rule = Rule(new StoreConditionMatch(MmStore.ChainId, 2, null, null, "Istanbul", null, null));
        Assert.True(RuleMatcher.Matches(rule, MmStore, new DateOnly(2026, 7, 17)));

        var mismatched = Rule(new StoreConditionMatch(MmStore.ChainId, 2, null, null, "Ankara", null, null));
        Assert.False(RuleMatcher.Matches(mismatched, MmStore, new DateOnly(2026, 7, 17)));
    }
}
