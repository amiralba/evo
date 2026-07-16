namespace Evo.Api.Audit.Dtos;

public record AuditLogEntryDto(
    Guid Id,
    Guid? ActorId,
    DateTimeOffset OccurredAt,
    string EntityType,
    string EntityKey,
    string Event,
    string? BeforeJson,
    string? AfterJson);
