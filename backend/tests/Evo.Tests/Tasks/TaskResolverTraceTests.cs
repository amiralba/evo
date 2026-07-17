using Evo.Domain.Tasks;

namespace Evo.Tests.Tasks;

public class TaskResolverTraceTests
{
    [Fact]
    public void DesignSection6_4Example_ProducesThreeTraceSteps()
    {
        var store = new StoreAttributes(
            StoreId: Guid.NewGuid(), ChainId: Guid.NewGuid(), Format: 2, Category: "Market",
            Channel: "Modern", Province: "Istanbul", RouteId: Guid.NewGuid());
        var date = new DateOnly(2026, 7, 17);

        var template = new TaskTemplateInput(Guid.NewGuid(), "SHELF", DefaultMinutes: 20, null, null, null, true);
        var formatRule = new TaskRuleInput(
            Guid.NewGuid(), template.Id, RuleScopeLevel.Format,
            new StoreConditionMatch(null, 2, null, null, null, null, null),
            TaskEffectOp.ScaleMinutes, null, 1.5m, 0, new DateOnly(2026, 1, 1), null);
        var storeRule = new TaskRuleInput(
            Guid.NewGuid(), template.Id, RuleScopeLevel.Store,
            new StoreConditionMatch(null, null, null, null, null, null, store.StoreId),
            TaskEffectOp.SetMinutes, 60, null, 0, new DateOnly(2026, 1, 1), null);

        var result = TaskResolver.Resolve(store, [template], [formatRule, storeRule], date);
        var resolved = result.Single();

        Assert.Equal(60, resolved.Minutes);
        Assert.Equal(3, resolved.Trace.Count);

        Assert.Equal("template default", resolved.Trace[0].Layer);
        Assert.Equal(20, resolved.Trace[0].BeforeMinutes);
        Assert.Equal(20, resolved.Trace[0].AfterMinutes);

        Assert.Equal(RuleScopeLevel.Format.ToString(), resolved.Trace[1].Layer);
        Assert.Equal(20, resolved.Trace[1].BeforeMinutes);
        Assert.Equal(30, resolved.Trace[1].AfterMinutes);
        Assert.Equal(formatRule.Id, resolved.Trace[1].RuleId);

        Assert.Equal(RuleScopeLevel.Store.ToString(), resolved.Trace[2].Layer);
        Assert.Equal(30, resolved.Trace[2].BeforeMinutes);
        Assert.Equal(60, resolved.Trace[2].AfterMinutes);
        Assert.Equal(storeRule.Id, resolved.Trace[2].RuleId);
    }
}
