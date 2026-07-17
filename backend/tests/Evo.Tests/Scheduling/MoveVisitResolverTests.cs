namespace Evo.Tests.Scheduling;

using Evo.Domain.Scheduling;

public class MoveVisitResolverTests
{
    private static IReadOnlyDictionary<Guid, StopMeta> MetaFor(Guid storeId, Guid routeStopId, int minutes = 30, int sequence = 1) =>
        new Dictionary<Guid, StopMeta> { [storeId] = new StopMeta(routeStopId, minutes, sequence) };

    [Fact]
    public void OnFromDate_TheStoresVisit_IsRemoved()
    {
        var routeStopId = Guid.NewGuid();
        var storeId = Guid.NewGuid();
        var fromDate = new DateOnly(2026, 7, 20);
        var toDate = new DateOnly(2026, 7, 21);

        var baseline = new List<ProjectedVisit>
        {
            new(routeStopId, storeId, fromDate, 30, null, PlannedVisitSource.Baseline, null),
        };
        var patch = new PatchInput(Guid.NewGuid(), PatchType.MoveVisit, storeId, null,
            StartsOn: fromDate, EndsOn: toDate,
            ParamsJson: $$"""{"fromDate":"{{fromDate:O}}","toDate":"{{toDate:O}}"}""");

        var result = PatchResolver.Apply(baseline, [patch], fromDate, MetaFor(storeId, routeStopId));

        Assert.Empty(result);
    }

    [Fact]
    public void OnToDate_TheVisitIsInjected_WithStopMetaMinutesAndRouteStopId()
    {
        var routeStopId = Guid.NewGuid();
        var storeId = Guid.NewGuid();
        var fromDate = new DateOnly(2026, 7, 20);
        var toDate = new DateOnly(2026, 7, 21);

        var baseline = new List<ProjectedVisit>(); // toDate has no baseline visit for this store
        var patch = new PatchInput(Guid.NewGuid(), PatchType.MoveVisit, storeId, null,
            StartsOn: fromDate, EndsOn: toDate,
            ParamsJson: $$"""{"fromDate":"{{fromDate:O}}","toDate":"{{toDate:O}}","startMinutes":600}""");

        var result = PatchResolver.Apply(baseline, [patch], toDate, MetaFor(storeId, routeStopId, minutes: 45));

        Assert.Single(result);
        Assert.Equal(routeStopId, result[0].RouteStopId);
        Assert.Equal(45, result[0].Minutes);
        Assert.Equal(new TimeOnly(10, 0), result[0].PinnedStart);
        Assert.Equal(PlannedVisitSource.Patch, result[0].Source);
    }

    [Fact]
    public void OnUnrelatedDate_NothingChanges()
    {
        var routeStopId = Guid.NewGuid();
        var storeId = Guid.NewGuid();
        var otherStoreId = Guid.NewGuid();
        var fromDate = new DateOnly(2026, 7, 20);
        var toDate = new DateOnly(2026, 7, 21);
        var unrelatedDate = new DateOnly(2026, 7, 22);

        var baseline = new List<ProjectedVisit>
        {
            new(Guid.NewGuid(), otherStoreId, unrelatedDate, 30, null, PlannedVisitSource.Baseline, null),
        };
        var patch = new PatchInput(Guid.NewGuid(), PatchType.MoveVisit, storeId, null,
            StartsOn: fromDate, EndsOn: unrelatedDate,
            ParamsJson: $$"""{"fromDate":"{{fromDate:O}}","toDate":"{{toDate:O}}"}""");

        var result = PatchResolver.Apply(baseline, [patch], unrelatedDate, MetaFor(storeId, routeStopId));

        Assert.Single(result);
        Assert.Equal(otherStoreId, result[0].StoreId);
    }

    [Fact]
    public void PastEndsOn_BothHalvesGone_BaselineStands()
    {
        var routeStopId = Guid.NewGuid();
        var storeId = Guid.NewGuid();
        var fromDate = new DateOnly(2026, 7, 20);
        var toDate = new DateOnly(2026, 7, 21);
        var afterExpiry = toDate.AddDays(1);

        var baseline = new List<ProjectedVisit>
        {
            new(routeStopId, storeId, afterExpiry, 30, null, PlannedVisitSource.Baseline, null),
        };
        var patch = new PatchInput(Guid.NewGuid(), PatchType.MoveVisit, storeId, null,
            StartsOn: fromDate, EndsOn: toDate, // expires before afterExpiry
            ParamsJson: $$"""{"fromDate":"{{fromDate:O}}","toDate":"{{afterExpiry:O}}"}""");

        var result = PatchResolver.Apply(baseline, [patch], afterExpiry, MetaFor(storeId, routeStopId));

        Assert.Single(result);
        Assert.Equal(PlannedVisitSource.Baseline, result[0].Source);
    }

    [Fact]
    public void SkipStore_OnToDate_StillRemovesTheInjectedVisit()
    {
        // Documented order: SKIP phase (incl. MoveVisit-from) runs before the ADD phase (incl.
        // MoveVisit-to). A plain SkipStore is also in the SKIP phase, so it runs before the
        // MoveVisit injection and therefore has nothing to remove yet -- the injected visit
        // survives a same-day SkipStore. This test locks in that resolved order.
        var routeStopId = Guid.NewGuid();
        var storeId = Guid.NewGuid();
        var fromDate = new DateOnly(2026, 7, 20);
        var toDate = new DateOnly(2026, 7, 21);

        var baseline = new List<ProjectedVisit>();
        var movePatch = new PatchInput(Guid.NewGuid(), PatchType.MoveVisit, storeId, null,
            StartsOn: fromDate, EndsOn: toDate,
            ParamsJson: $$"""{"fromDate":"{{fromDate:O}}","toDate":"{{toDate:O}}"}""");
        var skipPatch = new PatchInput(Guid.NewGuid(), PatchType.SkipStore, storeId, null,
            StartsOn: toDate, EndsOn: toDate, ParamsJson: null);

        var result = PatchResolver.Apply(baseline, [movePatch, skipPatch], toDate, MetaFor(storeId, routeStopId));

        Assert.Single(result);
        Assert.Equal(routeStopId, result[0].RouteStopId);
    }

    [Fact]
    public void ToDateAlreadyHasBaselineVisit_BothEntriesPresent_KeyedCoalesceHappensUpstream()
    {
        // The resolver itself does not dedupe by RouteStopId -- if the target date already has a
        // baseline visit for the same stop, both entries are returned here. PlanGenerationService
        // coalesces them later (dictionary keyed by (RouteStopId, Date), last write wins), which is
        // exercised by the end-to-end MoveVisit test, not this pure resolver test.
        var routeStopId = Guid.NewGuid();
        var storeId = Guid.NewGuid();
        var fromDate = new DateOnly(2026, 7, 20);
        var toDate = new DateOnly(2026, 7, 21);

        var baseline = new List<ProjectedVisit>
        {
            new(routeStopId, storeId, toDate, 30, null, PlannedVisitSource.Baseline, null),
        };
        var patch = new PatchInput(Guid.NewGuid(), PatchType.MoveVisit, storeId, null,
            StartsOn: fromDate, EndsOn: toDate,
            ParamsJson: $$"""{"fromDate":"{{fromDate:O}}","toDate":"{{toDate:O}}"}""");

        var result = PatchResolver.Apply(baseline, [patch], toDate, MetaFor(storeId, routeStopId));

        Assert.Equal(2, result.Count);
        Assert.Contains(result, v => v.Source == PlannedVisitSource.Patch);
    }
}
