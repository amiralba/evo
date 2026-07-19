using System.Text.Json;
using Evo.Domain.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Evo.Infrastructure.Tasks;

public class TaskPlanProvider : ITaskPlanProvider
{
    private readonly EvoDbContext _db;

    // Scoped-lifetime memo (one HTTP request / one generation run): PlanGenerationService calls
    // ResolveForStoresAsync once per DAY in its date loop, which re-fetched ALL templates + ALL
    // rules each time — 84 queries per route regeneration (audit DB §3.3). The catalog cannot
    // change mid-request, so load it once per provider instance.
    private (IReadOnlyList<TaskTemplateInput> Templates, IReadOnlyList<TaskRuleInput> Rules)? _catalog;

    public TaskPlanProvider(EvoDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<ResolvedTask>> ResolveAsync(StoreAttributes store, DateOnly date, CancellationToken ct = default)
    {
        var (templates, rules) = await LoadAsync(ct);
        return TaskResolver.Resolve(store, templates, rules, date);
    }

    public async Task<IReadOnlyDictionary<Guid, IReadOnlyList<ResolvedTask>>> ResolveForStoresAsync(
        IReadOnlyList<StoreAttributes> stores, DateOnly date, CancellationToken ct = default)
    {
        var (templates, rules) = await LoadAsync(ct);
        var result = new Dictionary<Guid, IReadOnlyList<ResolvedTask>>();
        foreach (var store in stores)
        {
            result[store.StoreId] = TaskResolver.Resolve(store, templates, rules, date);
        }
        return result;
    }

    private async Task<(IReadOnlyList<TaskTemplateInput> Templates, IReadOnlyList<TaskRuleInput> Rules)> LoadAsync(CancellationToken ct)
    {
        if (_catalog is { } cached)
        {
            return cached;
        }

        var templates = await _db.TaskTemplates
            .Where(t => t.Active)
            .Select(t => new TaskTemplateInput(t.Id, t.Code, t.DefaultMinutes, t.TargetChain, t.TargetFormat, t.ValidUntil, t.Active))
            .ToListAsync(ct);

        var ruleRows = await _db.Rules.AsNoTracking().ToListAsync(ct);
        var rules = ruleRows.Select(MapRule).ToList();

        _catalog = (templates, rules);
        return _catalog.Value;
    }

    private static TaskRuleInput MapRule(Rule rule)
    {
        var condition = JsonSerializer.Deserialize<RuleConditionJson>(rule.ConditionJson)
            ?? new RuleConditionJson(null, null, null, null, null, null, null);
        var effect = JsonSerializer.Deserialize<RuleEffectJson>(rule.EffectJson)
            ?? throw new InvalidOperationException($"Rule {rule.Id} has invalid EffectJson.");

        var match = new StoreConditionMatch(
            condition.ChainId, condition.Format, condition.Category, condition.Channel,
            condition.Province, condition.RouteId, condition.StoreId);

        return new TaskRuleInput(
            rule.Id, rule.TaskTemplateId, rule.Scope, match,
            effect.Op, effect.SetValue, effect.ScaleValue,
            rule.Priority, rule.EffectiveFrom, rule.EffectiveTo);
    }
}
