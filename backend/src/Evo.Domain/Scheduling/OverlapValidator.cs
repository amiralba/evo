namespace Evo.Domain.Scheduling;

/// <summary>V12 — a merchandiser cannot be scheduled at two overlapping visits on the same day.
/// Pure, no DB.</summary>
public static class OverlapValidator
{
    public static IReadOnlyList<ValidationFinding> V12_Overlaps(
        IEnumerable<(Guid MerchandiserId, DateOnly Date, TimeOnly Start, TimeOnly End)> visits)
    {
        var findings = new List<ValidationFinding>();
        var byPerson = visits.GroupBy(v => (v.MerchandiserId, v.Date));

        foreach (var group in byPerson)
        {
            var ordered = group.OrderBy(v => v.Start).ToList();
            for (var i = 0; i < ordered.Count; i++)
            {
                for (var j = i + 1; j < ordered.Count; j++)
                {
                    if (ordered[i].Start < ordered[j].End && ordered[j].Start < ordered[i].End)
                    {
                        findings.Add(new ValidationFinding("V12", FindingSeverity.Error,
                            $"Merchandiser {group.Key.MerchandiserId} has overlapping visits on {group.Key.Date}.",
                            group.Key.MerchandiserId.ToString()));
                    }
                }
            }
        }

        return findings;
    }
}
