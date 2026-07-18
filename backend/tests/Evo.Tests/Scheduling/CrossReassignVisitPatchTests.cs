namespace Evo.Tests.Scheduling;

using Evo.Domain.Scheduling;

public class CrossReassignVisitPatchTests
{
    private static PatchInput MakePatch(Guid sourceRouteId, Guid targetRouteId, Guid storeId, Guid targetMerchandiserId, DateOnly starts, DateOnly ends, int minutes = 30) =>
        new(Guid.NewGuid(), PatchType.CrossReassignVisit, storeId, null, starts, ends,
            $$"""{"sourceRouteId":"{{sourceRouteId}}","targetRouteId":"{{targetRouteId}}","plannedVisitId":"{{Guid.NewGuid()}}","targetMerchandiserId":"{{targetMerchandiserId}}","storeId":"{{storeId}}","minutes":{{minutes}}}""");

    [Fact]
    public void ResolvingSourceRoute_OmitsTheReassignedVisit()
    {
        var sourceRouteId = Guid.NewGuid();
        var targetRouteId = Guid.NewGuid();
        var storeId = Guid.NewGuid();
        var date = new DateOnly(2026, 7, 20);

        var baseline = new List<ProjectedVisit> { new(Guid.NewGuid(), storeId, date, 30, null, PlannedVisitSource.Baseline, null) };
        var patch = MakePatch(sourceRouteId, targetRouteId, storeId, Guid.NewGuid(), date, date);

        var result = PatchResolver.Apply(baseline, [patch], date, currentRouteId: sourceRouteId);

        Assert.Empty(result);
    }

    [Fact]
    public void ResolvingTargetRoute_IncludesTheVisit_WithCorrectStoreMinutesAndMerchandiser()
    {
        var sourceRouteId = Guid.NewGuid();
        var targetRouteId = Guid.NewGuid();
        var storeId = Guid.NewGuid();
        var targetMerchandiserId = Guid.NewGuid();
        var date = new DateOnly(2026, 7, 20);

        var baseline = new List<ProjectedVisit>();
        var patch = MakePatch(sourceRouteId, targetRouteId, storeId, targetMerchandiserId, date, date, minutes: 45);

        var result = PatchResolver.Apply(baseline, [patch], date, currentRouteId: targetRouteId);

        var visit = Assert.Single(result);
        Assert.Equal(storeId, visit.StoreId);
        Assert.Equal(45, visit.Minutes);
        Assert.Equal(targetMerchandiserId, visit.MerchandiserId);
        Assert.Equal(PlannedVisitSource.Patch, visit.Source);
    }

    [Fact]
    public void OutsidePatchWindow_NeitherRouteShowsAnEffect_AutoReverts()
    {
        var sourceRouteId = Guid.NewGuid();
        var targetRouteId = Guid.NewGuid();
        var storeId = Guid.NewGuid();
        var starts = new DateOnly(2026, 7, 20);
        var ends = new DateOnly(2026, 7, 21);
        var afterExpiry = new DateOnly(2026, 7, 22);

        var baseline = new List<ProjectedVisit> { new(Guid.NewGuid(), storeId, afterExpiry, 30, null, PlannedVisitSource.Baseline, null) };
        var patch = MakePatch(sourceRouteId, targetRouteId, storeId, Guid.NewGuid(), starts, ends);

        var sourceResult = PatchResolver.Apply(baseline, [patch], afterExpiry, currentRouteId: sourceRouteId);
        var targetResult = PatchResolver.Apply([], [patch], afterExpiry, currentRouteId: targetRouteId);

        Assert.Single(sourceResult); // baseline visit untouched — patch no longer applies
        Assert.Empty(targetResult); // no injected visit — patch no longer applies
    }
}
