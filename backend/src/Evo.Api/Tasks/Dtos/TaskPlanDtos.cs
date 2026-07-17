namespace Evo.Api.Tasks.Dtos;

public record SourceTraceStepDto(string Layer, string Op, int Before, int After);

public record ResolvedTaskDto(Guid TemplateId, string Code, string Name, int Minutes, IReadOnlyList<SourceTraceStepDto> Trace);

public record TaskPlanDto(Guid StoreId, DateOnly Date, int VisitTotalMinutes, IReadOnlyList<ResolvedTaskDto> Tasks);
