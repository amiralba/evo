namespace Evo.Domain.Scheduling;

public record ProjectedVisit(
    Guid RouteStopId,
    Guid StoreId,
    DateOnly Date,
    int Minutes,
    Guid? MerchandiserId,
    PlannedVisitSource Source,
    Guid? PatchId);

public record PatchInput(
    Guid Id,
    PatchType Type,
    Guid? StoreId,
    Guid? CoverMerchandiserId,
    DateOnly StartsOn,
    DateOnly EndsOn,
    string? ParamsJson);

/// <summary>Baseline ⊕ active patches, applied at generation time — never mutates the baseline
/// (design §2.5). Only patches whose window covers <paramref name="date"/> are considered; past
/// EndsOn a patch is simply not applied, which is the auto-revert.</summary>
public static class PatchResolver
{
    public static IReadOnlyList<ProjectedVisit> Apply(
        IReadOnlyList<ProjectedVisit> baseline,
        IReadOnlyList<PatchInput> patches,
        DateOnly date)
    {
        var applicable = patches.Where(p => p.StartsOn <= date && date <= p.EndsOn).ToList();
        var result = new List<ProjectedVisit>(baseline);

        // SKIP > TIME_SHIFT > ADD > REASSIGN
        foreach (var patch in applicable.Where(p => p.Type == PatchType.SkipStore))
        {
            result.RemoveAll(v => v.StoreId == patch.StoreId);
        }

        foreach (var patch in applicable.Where(p => p.Type == PatchType.SkipRange))
        {
            result.Clear();
        }

        // TimeShift carries as a marker on matching visits; DayScheduler applies the window later.
        // No structural change to the projected list here.

        foreach (var patch in applicable.Where(p => p.Type == PatchType.AddStore))
        {
            if (patch.StoreId is { } storeId)
            {
                result.Add(new ProjectedVisit(
                    RouteStopId: Guid.Empty,
                    StoreId: storeId,
                    Date: date,
                    Minutes: 0,
                    MerchandiserId: patch.CoverMerchandiserId,
                    Source: PlannedVisitSource.Patch,
                    PatchId: patch.Id));
            }
        }

        foreach (var patch in applicable.Where(p => p.Type == PatchType.ReassignTemp))
        {
            for (var i = 0; i < result.Count; i++)
            {
                if (patch.StoreId is null || result[i].StoreId == patch.StoreId)
                {
                    result[i] = result[i] with { MerchandiserId = patch.CoverMerchandiserId, Source = PlannedVisitSource.Patch, PatchId = patch.Id };
                }
            }
        }

        return result;
    }
}
