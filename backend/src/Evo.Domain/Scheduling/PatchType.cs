namespace Evo.Domain.Scheduling;

/// <summary>Design §2.5 — consumed by the pure PatchResolver.</summary>
public enum PatchType : byte
{
    SkipStore = 1,
    SkipRange = 2,
    AddStore = 3,
    ReassignTemp = 4,
    TimeShift = 5,
    MoveVisit = 6,

    /// <summary>Spec 010 (Onarım "reassign this one visit to a different person's route") —
    /// structurally analogous to MoveVisit (paired skip-source/add-target off one patch row) but
    /// crosses ROUTES on the same date instead of crossing DATES on the same route. See
    /// PatchParams.CrossReassignVisitParams and PatchResolver's currentRouteId parameter.</summary>
    CrossReassignVisit = 7,
}
