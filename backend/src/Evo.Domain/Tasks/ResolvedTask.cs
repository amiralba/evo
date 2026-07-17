namespace Evo.Domain.Tasks;

public record SourceTraceStep(string Layer, TaskEffectOp Op, int BeforeMinutes, int AfterMinutes, Guid? RuleId);

public record ResolvedTask(Guid TaskTemplateId, string Code, int Minutes, IReadOnlyList<SourceTraceStep> Trace);
