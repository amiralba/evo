namespace Evo.Infrastructure.People;

/// <summary>A merchandiser's leave window (spec 010) — feeds V14 and the Onarım workbench. No delete —
/// absences are historical facts (project no-delete rule), EndDate inclusive.</summary>
public class Absence
{
    public Guid Id { get; set; }
    public Guid MerchandiserId { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public AbsenceReason Reason { get; set; }
    public string? Note { get; set; }
    public Guid? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
