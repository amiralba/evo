namespace Evo.Domain.Scheduling;

public record VisitAbsenceEval(Guid VisitId, Guid MerchandiserId, Guid StoreId, DateOnly Date);

/// <summary>V14 — visit planned while the assignee is on leave or the store is temporarily closed
/// (design §3.2). Pure, no DB — the caller (PlanGenerationService/RoutesController) maps
/// Absence/StoreFlag rows down to plain date-window tuples.</summary>
public static class AbsenceValidator
{
    public static IReadOnlyList<ValidationFinding> Evaluate(
        IReadOnlyList<VisitAbsenceEval> visits,
        IReadOnlyList<(Guid MerchandiserId, DateOnly Start, DateOnly End)> absences,
        IReadOnlyList<(Guid StoreId, DateOnly Start, DateOnly End)> closedStores)
    {
        var findings = new List<ValidationFinding>();
        foreach (var visit in visits)
        {
            var onLeave = absences.Any(a => a.MerchandiserId == visit.MerchandiserId && visit.Date >= a.Start && visit.Date <= a.End);
            var storeClosed = closedStores.Any(c => c.StoreId == visit.StoreId && visit.Date >= c.Start && visit.Date <= c.End);

            if (onLeave)
            {
                findings.Add(new ValidationFinding("V14", FindingSeverity.Error,
                    $"Visit {visit.VisitId} is planned while the assignee is on leave.", visit.VisitId.ToString()));
            }
            else if (storeClosed)
            {
                findings.Add(new ValidationFinding("V14", FindingSeverity.Error,
                    $"Visit {visit.VisitId} is planned while the store is temporarily closed.", visit.VisitId.ToString()));
            }
        }
        return findings;
    }
}
