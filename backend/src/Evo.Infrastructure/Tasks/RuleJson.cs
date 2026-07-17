using Evo.Domain.Tasks;

namespace Evo.Infrastructure.Tasks;

/// <summary>Wire shape for <see cref="Rule.ConditionJson"/> — all fields optional (null = wildcard).</summary>
public record RuleConditionJson(
    Guid? ChainId,
    byte? Format,
    string? Category,
    string? Channel,
    string? Province,
    Guid? RouteId,
    Guid? StoreId);

/// <summary>Wire shape for <see cref="Rule.EffectJson"/>.</summary>
public record RuleEffectJson(TaskEffectOp Op, int? SetValue, decimal? ScaleValue);
