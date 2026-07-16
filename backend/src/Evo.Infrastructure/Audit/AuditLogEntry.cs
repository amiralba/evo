namespace Evo.Infrastructure.Audit;

/// <summary>
/// One generic, append-only audit table backing the future RouteChangeLog / admin_audit_log
/// typed facades (spec 003 deviation — see docs/DECISIONS.md) once their owning entities
/// (Route, Setting, etc.) exist. No mutation methods by design — writes only via IAuditWriter.
/// </summary>
public class AuditLogEntry
{
    public Guid Id { get; set; }
    public Guid? ActorId { get; set; }
    public DateTimeOffset OccurredAt { get; set; }
    public string EntityType { get; set; } = string.Empty;
    public string EntityKey { get; set; } = string.Empty;
    public string Event { get; set; } = string.Empty;
    public string? BeforeJson { get; set; }
    public string? AfterJson { get; set; }
}
