namespace Evo.Infrastructure.Routing;

/// <summary>The "why" behind publish-with-errors/repairs/permanents; append-only; distinct from
/// <c>audit_log</c> (design §11.3, deferred-to-M1 per DECISIONS 2026-07-16).</summary>
public class DecisionJournalEntry
{
    public Guid Id { get; set; }
    public DecisionKind Kind { get; set; }
    public string Description { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public string Objective { get; set; } = string.Empty;
    public string? ErrorsJson { get; set; }
    public Guid? AuthorId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
