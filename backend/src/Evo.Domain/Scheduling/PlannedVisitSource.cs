namespace Evo.Domain.Scheduling;

/// <summary>Design §2.6 — consumed by the pure PatchResolver.</summary>
public enum PlannedVisitSource : byte
{
    Baseline = 1,
    Patch = 2,
}
