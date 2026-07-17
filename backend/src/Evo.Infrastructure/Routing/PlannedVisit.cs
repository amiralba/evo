using Evo.Domain.Scheduling;

namespace Evo.Infrastructure.Routing;

/// <summary>Materialized calendar projection; future rows regenerated, past frozen (design §2.6).</summary>
public class PlannedVisit
{
    public Guid Id { get; set; }
    public Guid RouteId { get; set; }
    public Guid RouteStopId { get; set; }
    public Guid StoreId { get; set; }
    public Guid? MerchandiserId { get; set; }
    public DateOnly VisitDate { get; set; }
    public DateTimeOffset? PlannedStart { get; set; }
    public DateTimeOffset? PlannedEnd { get; set; }
    public PlannedVisitSource Source { get; set; } = PlannedVisitSource.Baseline;
    public Guid? PatchId { get; set; }
    public PlannedVisitStatus Status { get; set; } = PlannedVisitStatus.Planned;
}
