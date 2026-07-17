namespace Evo.Infrastructure.Routing;

/// <summary>Replaces the seat; <c>EndDate IS NULL</c> = current; closed on reassignment (design §2.4).</summary>
public class Assignment
{
    public Guid Id { get; set; }
    public Guid RouteId { get; set; }
    public Guid MerchandiserId { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public AssignmentReason Reason { get; set; }
    public Guid? CreatedBy { get; set; }
}
