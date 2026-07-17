namespace Evo.Api.Routing.Dtos;

public record PublishRequest(string? Reason, string? Objective);

public record PublishResultDto(int VisitsMaterialized, bool OverrodeErrors, Guid? DecisionJournalId);
