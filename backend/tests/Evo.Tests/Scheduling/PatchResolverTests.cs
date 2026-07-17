using Evo.Domain.Scheduling;

namespace Evo.Tests.Scheduling;

public class PatchResolverTests
{
    [Fact]
    public void SkipStore_RemovesExactlyThatStoresVisit_InsideWindow()
    {
        var routeStopId = Guid.NewGuid();
        var storeToSkip = Guid.NewGuid();
        var otherStore = Guid.NewGuid();
        var date = new DateOnly(2026, 7, 20);

        var baseline = new List<ProjectedVisit>
        {
            new(routeStopId, storeToSkip, date, 30, null, PlannedVisitSource.Baseline, null),
            new(Guid.NewGuid(), otherStore, date, 30, null, PlannedVisitSource.Baseline, null),
        };

        var patch = new PatchInput(Guid.NewGuid(), PatchType.SkipStore, storeToSkip, null,
            StartsOn: date, EndsOn: date, ParamsJson: null);

        var result = PatchResolver.Apply(baseline, [patch], date);

        Assert.Single(result);
        Assert.Equal(otherStore, result[0].StoreId);
    }

    [Fact]
    public void SkipStore_LeavesVisitPresent_TheDayAfterEndsOn()
    {
        var routeStopId = Guid.NewGuid();
        var storeToSkip = Guid.NewGuid();
        var windowStart = new DateOnly(2026, 7, 20);
        var windowEnd = new DateOnly(2026, 7, 21);
        var dayAfter = windowEnd.AddDays(1);

        var baseline = new List<ProjectedVisit>
        {
            new(routeStopId, storeToSkip, dayAfter, 30, null, PlannedVisitSource.Baseline, null),
        };

        var patch = new PatchInput(Guid.NewGuid(), PatchType.SkipStore, storeToSkip, null,
            StartsOn: windowStart, EndsOn: windowEnd, ParamsJson: null);

        var result = PatchResolver.Apply(baseline, [patch], dayAfter);

        Assert.Single(result);
        Assert.Equal(storeToSkip, result[0].StoreId);
    }

    [Fact]
    public void ReassignTemp_RepointsMerchandiser_WithinWindow()
    {
        var routeStopId = Guid.NewGuid();
        var storeId = Guid.NewGuid();
        var originalMerchandiser = Guid.NewGuid();
        var coverMerchandiser = Guid.NewGuid();
        var date = new DateOnly(2026, 7, 20);

        var baseline = new List<ProjectedVisit>
        {
            new(routeStopId, storeId, date, 30, originalMerchandiser, PlannedVisitSource.Baseline, null),
        };

        var patch = new PatchInput(Guid.NewGuid(), PatchType.ReassignTemp, storeId, coverMerchandiser,
            StartsOn: date, EndsOn: date, ParamsJson: null);

        var result = PatchResolver.Apply(baseline, [patch], date);

        Assert.Single(result);
        Assert.Equal(coverMerchandiser, result[0].MerchandiserId);
        Assert.Equal(PlannedVisitSource.Patch, result[0].Source);
    }

    [Fact]
    public void ConflictingSkipAndAdd_ResolveInSkipOverAddPriority()
    {
        var storeId = Guid.NewGuid();
        var date = new DateOnly(2026, 7, 20);

        var baseline = new List<ProjectedVisit>
        {
            new(Guid.NewGuid(), storeId, date, 30, null, PlannedVisitSource.Baseline, null),
        };

        var skipPatch = new PatchInput(Guid.NewGuid(), PatchType.SkipStore, storeId, null,
            StartsOn: date, EndsOn: date, ParamsJson: null);
        var addPatch = new PatchInput(Guid.NewGuid(), PatchType.AddStore, storeId, null,
            StartsOn: date, EndsOn: date, ParamsJson: null);

        // AddStore always injects (it doesn't know about the removed baseline visit), but the
        // baseline visit removed by SkipStore never re-appears — SKIP still wins over the
        // pre-existing baseline entry, proving SKIP is applied before ADD in priority order.
        var result = PatchResolver.Apply(baseline, [skipPatch, addPatch], date);

        Assert.Single(result);
        Assert.Equal(PlannedVisitSource.Patch, result[0].Source);
    }
}
