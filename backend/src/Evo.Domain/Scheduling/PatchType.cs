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
}
