namespace Evo.Infrastructure.Tasks;

/// <summary>Materialized per-visit task attachment (design §2.10); ResultJson reserved for M3 field execution.</summary>
public class TaskInstance
{
    public Guid Id { get; set; }
    public Guid? PlannedVisitId { get; set; }
    public Guid StoreId { get; set; }
    public Guid? MerchandiserId { get; set; }
    public Guid TaskTemplateId { get; set; }
    public int ResolvedMinutes { get; set; }
    public int? OverrideMinutes { get; set; }
    public OverrideScope? OverrideScope { get; set; }
    public DateOnly? Deadline { get; set; }
    public TaskInstanceStatus Status { get; set; } = TaskInstanceStatus.Pending;
    public string? CancelReason { get; set; }
    public string? ResultJson { get; set; }
}
