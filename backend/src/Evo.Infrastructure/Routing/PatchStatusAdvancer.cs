namespace Evo.Infrastructure.Routing;

/// <summary>Pure status-advance logic used by PlanHorizonBackgroundService — extracted so it's
/// unit-testable without a DB.</summary>
public static class PatchStatusAdvancer
{
    public static PatchStatus NextStatus(PatchStatus current, DateOnly startsOn, DateOnly endsOn, DateOnly today)
    {
        if (current == PatchStatus.Cancelled)
        {
            return current;
        }
        if (current == PatchStatus.Pending && startsOn <= today)
        {
            return PatchStatus.Active;
        }
        if (current == PatchStatus.Active && endsOn < today)
        {
            return PatchStatus.Expired;
        }
        return current;
    }
}
