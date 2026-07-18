namespace Evo.Api.Routing.Dtos;

public record DecisionJournalEntryDto(
    Guid Id,
    string Kind,
    string Description,
    string Reason,
    string Objective,
    string? ErrorsJson,
    Guid? AuthorId,
    DateTimeOffset CreatedAt);
