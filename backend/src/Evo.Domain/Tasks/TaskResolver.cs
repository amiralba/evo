namespace Evo.Domain.Tasks;

public static class TaskResolver
{
    public static IReadOnlyList<ResolvedTask> Resolve(
        StoreAttributes store,
        IReadOnlyList<TaskTemplateInput> templates,
        IReadOnlyList<TaskRuleInput> rules,
        DateOnly date,
        IReadOnlyList<InstanceOverrideInput>? overrides = null)
    {
        var eligible = templates.ToDictionary(t => t.Id, t => t);
        var included = new HashSet<Guid>(
            templates.Where(t => t.Active && TemplateActiveOn(t, date) && TargetMatches(t, store))
                     .Select(t => t.Id));

        var matchingRules = rules.Where(r => RuleMatcher.Matches(r, store, date)).ToList();

        foreach (var rule in matchingRules.Where(r => r.Op == TaskEffectOp.IncludeTask && r.TaskTemplateId is not null))
        {
            var id = rule.TaskTemplateId!.Value;
            if (eligible.TryGetValue(id, out var template) && template.Active && TemplateActiveOn(template, date))
            {
                included.Add(id);
            }
        }

        foreach (var rule in matchingRules.Where(r => r.Op == TaskEffectOp.ExcludeTask && r.TaskTemplateId is not null))
        {
            included.Remove(rule.TaskTemplateId!.Value);
        }

        var overrideLookup = overrides?.ToDictionary(o => o.TaskTemplateId, o => o.Minutes)
                              ?? new Dictionary<Guid, int>();

        var result = new List<ResolvedTask>();
        foreach (var id in included)
        {
            var template = eligible[id];
            var trace = new List<SourceTraceStep>
            {
                new("template default", TaskEffectOp.SetMinutes, template.DefaultMinutes, template.DefaultMinutes, null),
            };
            var minutes = template.DefaultMinutes;

            var minutesRules = matchingRules
                .Where(r => r.TaskTemplateId == id && r.Op is TaskEffectOp.SetMinutes or TaskEffectOp.ScaleMinutes)
                .OrderBy(r => r.Scope)
                .ThenBy(r => r.Priority)
                .ThenBy(r => r.EffectiveFrom);

            foreach (var rule in minutesRules)
            {
                var before = minutes;
                minutes = rule.Op == TaskEffectOp.SetMinutes
                    ? rule.SetValue!.Value
                    : (int)Math.Round(before * rule.ScaleValue!.Value, MidpointRounding.AwayFromZero);
                trace.Add(new SourceTraceStep(rule.Scope.ToString(), rule.Op, before, minutes, rule.Id));
            }

            if (overrideLookup.TryGetValue(id, out var overrideMinutes))
            {
                trace.Add(new SourceTraceStep("manual (instance)", TaskEffectOp.SetMinutes, minutes, overrideMinutes, null));
                minutes = overrideMinutes;
            }

            result.Add(new ResolvedTask(id, template.Code, minutes, trace));
        }

        return result;
    }

    private static bool TemplateActiveOn(TaskTemplateInput template, DateOnly date) =>
        template.ValidUntil is null || date <= template.ValidUntil;

    private static bool TargetMatches(TaskTemplateInput template, StoreAttributes store) =>
        template.TargetFormat is null || template.TargetFormat == store.Format;
}
