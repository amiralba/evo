using Evo.Domain.Tasks;
using Evo.Infrastructure.Tasks;

namespace Evo.Api.Tasks.Dtos;

public record TaskTemplateDto(
    Guid Id, string Code, string Name, int DefaultMinutes, TaskRecurrence Recurrence,
    ProofRequired ProofRequired, Guid? TargetChain, byte? TargetFormat, DateOnly? ValidUntil, bool Active);

public record RuleConditionDto(
    Guid? ChainId, byte? Format, string? Category, string? Channel, string? Province, Guid? RouteId, Guid? StoreId);

public record RuleEffectDto(TaskEffectOp Op, int? SetValue, decimal? ScaleValue);

public record CreateRuleRequest(
    Guid? TaskTemplateId, RuleScopeLevel Scope, RuleConditionDto Condition, RuleEffectDto Effect,
    int Priority, DateOnly EffectiveFrom, DateOnly? EffectiveTo);

public record RuleDto(
    Guid Id, Guid? TaskTemplateId, RuleScopeLevel Scope, RuleConditionDto Condition, RuleEffectDto Effect,
    int Priority, DateOnly EffectiveFrom, DateOnly? EffectiveTo);

public record RuleImpactDto(int Stores, int VisitsPerWeek, int DeltaMinutesPerWeek, int DaysOver450);

/// <summary>scope: INSTANCE | STORE_RULE | FORMAT_RULE (design §6.4 scope picker).</summary>
public record PatchTaskInstanceRequest(int Minutes, string Scope);

public record AdhocTaskRequest(string TemplateCode, string Name, int Minutes, Guid? TargetChain, byte? TargetFormat, DateOnly Deadline);

public record AdhocTaskResponse(Guid TaskTemplateId, int MatchingStoreCount);
