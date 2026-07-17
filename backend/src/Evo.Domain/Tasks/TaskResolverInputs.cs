namespace Evo.Domain.Tasks;

public record TaskTemplateInput(
    Guid Id,
    string Code,
    int DefaultMinutes,
    string? TargetChain,
    byte? TargetFormat,
    DateOnly? ValidUntil,
    bool Active);

public record StoreConditionMatch(
    Guid? ChainId,
    byte? Format,
    string? Category,
    string? Channel,
    string? Province,
    Guid? RouteId,
    Guid? StoreId);

public record TaskRuleInput(
    Guid Id,
    Guid? TaskTemplateId,
    RuleScopeLevel Scope,
    StoreConditionMatch Condition,
    TaskEffectOp Op,
    int? SetValue,
    decimal? ScaleValue,
    int Priority,
    DateOnly EffectiveFrom,
    DateOnly? EffectiveTo);

public record InstanceOverrideInput(Guid TaskTemplateId, int Minutes);
