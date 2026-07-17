using Evo.Domain.Tasks;

namespace Evo.Tests.Tasks;

public class TaskResolverTests
{
    private static readonly DateOnly Date = new(2026, 7, 17);

    private static readonly StoreAttributes Store = new(
        StoreId: Guid.NewGuid(), ChainId: Guid.NewGuid(), Format: 2, Category: "Market",
        Channel: "Modern", Province: "Istanbul", RouteId: Guid.NewGuid());

    private static TaskTemplateInput Template(int minutes = 20, byte? targetFormat = null, DateOnly? validUntil = null, bool active = true) =>
        new(Guid.NewGuid(), "SHELF", minutes, null, targetFormat, validUntil, active);

    private static TaskRuleInput Rule(
        RuleScopeLevel scope, Guid templateId, TaskEffectOp op,
        int? setValue = null, decimal? scaleValue = null, int priority = 0,
        StoreConditionMatch? condition = null, DateOnly? from = null, DateOnly? to = null) =>
        new(Guid.NewGuid(), templateId, scope, condition ?? new StoreConditionMatch(null, null, null, null, null, null, null),
            op, setValue, scaleValue, priority, from ?? new DateOnly(2026, 1, 1), to);

    [Fact]
    public void MoreSpecificScopeWins()
    {
        var template = Template(minutes: 20);
        var rules = new List<TaskRuleInput>
        {
            Rule(RuleScopeLevel.Format, template.Id, TaskEffectOp.SetMinutes, setValue: 30),
            Rule(RuleScopeLevel.Store, template.Id, TaskEffectOp.SetMinutes, setValue: 45,
                condition: new StoreConditionMatch(null, null, null, null, null, null, Store.StoreId)),
        };

        var result = TaskResolver.Resolve(Store, [template], rules, Date);

        Assert.Equal(45, result.Single().Minutes);
    }

    [Fact]
    public void ScaleThenSetArithmetic()
    {
        var template = Template(minutes: 20);
        var rules = new List<TaskRuleInput>
        {
            Rule(RuleScopeLevel.Format, template.Id, TaskEffectOp.ScaleMinutes, scaleValue: 1.5m),
            Rule(RuleScopeLevel.Store, template.Id, TaskEffectOp.SetMinutes, setValue: 60,
                condition: new StoreConditionMatch(null, null, null, null, null, null, Store.StoreId)),
        };

        var result = TaskResolver.Resolve(Store, [template], rules, Date);

        Assert.Equal(60, result.Single().Minutes);
    }

    [Fact]
    public void DatedRuleOverridesPermanentWhileActive()
    {
        var template = Template(minutes: 20);
        var permanent = Rule(RuleScopeLevel.Store, template.Id, TaskEffectOp.SetMinutes, setValue: 30, priority: 0);
        var dated = Rule(RuleScopeLevel.Store, template.Id, TaskEffectOp.SetMinutes, setValue: 60, priority: 1,
            from: new DateOnly(2026, 7, 17), to: new DateOnly(2026, 7, 17));

        var duringResult = TaskResolver.Resolve(Store, [template], [permanent, dated], new DateOnly(2026, 7, 17));
        Assert.Equal(60, duringResult.Single().Minutes);

        var afterResult = TaskResolver.Resolve(Store, [template], [permanent, dated], new DateOnly(2026, 7, 18));
        Assert.Equal(30, afterResult.Single().Minutes);
    }

    [Fact]
    public void ExcludeWinsOverInclude()
    {
        var template = Template(minutes: 20, targetFormat: 9);
        var include = Rule(RuleScopeLevel.Format, template.Id, TaskEffectOp.IncludeTask);
        var exclude = Rule(RuleScopeLevel.Store, template.Id, TaskEffectOp.ExcludeTask);

        var result = TaskResolver.Resolve(Store, [template], [include, exclude], Date);

        Assert.Empty(result);
    }

    [Fact]
    public void TargetFilterLimitsTemplate()
    {
        var mmOnly = Template(minutes: 20, targetFormat: 2);
        var otherFormatOnly = Template(minutes: 20, targetFormat: 9);

        var result = TaskResolver.Resolve(Store, [mmOnly, otherFormatOnly], [], Date);

        Assert.Single(result);
        Assert.Equal(mmOnly.Id, result[0].TaskTemplateId);
    }

    [Fact]
    public void ValidUntilExpiredTemplateDropped()
    {
        var expired = Template(minutes: 20, validUntil: new DateOnly(2026, 7, 1));

        var result = TaskResolver.Resolve(Store, [expired], [], Date);

        Assert.Empty(result);
    }

    [Fact]
    public void InstanceOverrideReplacesOneTaskOnly()
    {
        var t1 = Template(minutes: 20);
        var t2 = Template(minutes: 30);
        var overrides = new List<InstanceOverrideInput> { new(t1.Id, 99) };

        var result = TaskResolver.Resolve(Store, [t1, t2], [], Date, overrides);

        Assert.Equal(99, result.Single(r => r.TaskTemplateId == t1.Id).Minutes);
        Assert.Equal(30, result.Single(r => r.TaskTemplateId == t2.Id).Minutes);
    }

    [Fact]
    public void VisitTotalIsSumOfTasks()
    {
        var t1 = Template(minutes: 20);
        var t2 = Template(minutes: 30);

        var result = TaskResolver.Resolve(Store, [t1, t2], [], Date);

        Assert.Equal(50, result.Sum(r => r.Minutes));
    }
}
