namespace Evo.Domain.Scheduling;

public record ProjectedVisit(
    Guid RouteStopId,
    Guid StoreId,
    DateOnly Date,
    int Minutes,
    Guid? MerchandiserId,
    PlannedVisitSource Source,
    Guid? PatchId,
    TimeOnly? PinnedStart = null);

public record PatchInput(
    Guid Id,
    PatchType Type,
    Guid? StoreId,
    Guid? CoverMerchandiserId,
    DateOnly StartsOn,
    DateOnly EndsOn,
    string? ParamsJson);

/// <summary>Minimal facts about a route stop needed to inject a MoveVisit-added visit (its real
/// RouteStopId/Minutes/Sequence) — a store maps to at most one active stop (one-active-route).</summary>
public record StopMeta(Guid RouteStopId, int Minutes, int Sequence);

/// <summary>Baseline ⊕ active patches, applied at generation time — never mutates the baseline
/// (design §2.5). Only patches whose window covers <paramref name="date"/> are considered; past
/// EndsOn a patch is simply not applied, which is the auto-revert.</summary>
public static class PatchResolver
{
    public static IReadOnlyList<ProjectedVisit> Apply(
        IReadOnlyList<ProjectedVisit> baseline,
        IReadOnlyList<PatchInput> patches,
        DateOnly date,
        IReadOnlyDictionary<Guid, StopMeta>? stopMetaByStoreId = null)
    {
        stopMetaByStoreId ??= new Dictionary<Guid, StopMeta>();
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

        foreach (var patch in applicable.Where(p => p.Type == PatchType.MoveVisit))
        {
            if (PatchParams.TryParse<PatchParams.MoveVisitParams>(patch.ParamsJson, out var mp) && mp is not null && mp.FromDate == date)
            {
                result.RemoveAll(v => v.StoreId == patch.StoreId);
            }
        }

        foreach (var patch in applicable.Where(p => p.Type == PatchType.TimeShift))
        {
            if (!PatchParams.TryParse<PatchParams.TimeShiftParams>(patch.ParamsJson, out var p) || p is null)
            {
                continue;
            }

            var pinned = TimeOnly.FromTimeSpan(TimeSpan.FromMinutes(p.StartMinutes));
            for (var i = 0; i < result.Count; i++)
            {
                if (result[i].StoreId == patch.StoreId)
                {
                    result[i] = result[i] with { PinnedStart = pinned };
                }
            }
        }

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

        foreach (var patch in applicable.Where(p => p.Type == PatchType.MoveVisit))
        {
            if (!PatchParams.TryParse<PatchParams.MoveVisitParams>(patch.ParamsJson, out var mp) || mp is null || mp.ToDate != date)
            {
                continue;
            }
            if (patch.StoreId is not { } storeId || !stopMetaByStoreId.TryGetValue(storeId, out var meta))
            {
                continue;
            }

            var pinned = mp.StartMinutes is { } sm ? TimeOnly.FromTimeSpan(TimeSpan.FromMinutes(sm)) : (TimeOnly?)null;
            result.Add(new ProjectedVisit(
                RouteStopId: meta.RouteStopId,
                StoreId: storeId,
                Date: date,
                Minutes: meta.Minutes,
                MerchandiserId: patch.CoverMerchandiserId,
                Source: PlannedVisitSource.Patch,
                PatchId: patch.Id,
                PinnedStart: pinned));
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
