namespace Evo.Infrastructure.Routing;

/// <summary>Reality, 1:1 with PlannedVisit (design §2.6); planned_visit.Status stays the outcome
/// source of truth. Check-in location is derived from MerchandiserLocationPing at read time, not
/// stored here (spec 009 — separate from a single check-in column, per user decision).</summary>
public class VisitRealization
{
    public Guid Id { get; set; }
    public Guid PlannedVisitId { get; set; }
    public DateTimeOffset? CheckInAt { get; set; }
    public DateTimeOffset? CheckOutAt { get; set; }
    public int? ActualMinutes { get; set; }
    public VisitOutcomeReason? OutcomeReason { get; set; }
}
