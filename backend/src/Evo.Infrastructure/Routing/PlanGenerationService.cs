using Evo.Domain.Scheduling;
using Evo.Infrastructure.Stores;
using Microsoft.EntityFrameworkCore;

namespace Evo.Infrastructure.Routing;

/// <summary>Loads a route's active stops/assignment/patches, projects the baseline calendar via
/// FrequencyExpander, applies PatchResolver, schedules each day via DayScheduler, and upserts
/// planned_visit rows for dates >= from. Past visits (VisitDate &lt; today) are never touched —
/// the horizon is materialized, history is frozen (design §2.6).</summary>
public class PlanGenerationService : IPlanGenerationService
{
    private readonly EvoDbContext _db;
    private readonly ISettingsProvider _settingsProvider;

    public PlanGenerationService(EvoDbContext db, ISettingsProvider settingsProvider)
    {
        _db = db;
        _settingsProvider = settingsProvider;
    }

    public async Task<int> RegenerateFutureAsync(Guid routeId, DateOnly from, DateOnly to, CancellationToken ct = default)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        if (from < today)
        {
            from = today;
        }

        var route = await _db.Routes.FirstOrDefaultAsync(r => r.Id == routeId, ct)
            ?? throw new InvalidOperationException($"Route {routeId} not found.");

        var stops = await _db.RouteStops
            .Where(rs => rs.RouteId == routeId && rs.EffectiveTo == null)
            .ToListAsync(ct);

        var storeIds = stops.Select(s => s.StoreId).ToHashSet();
        var stores = await _db.Stores.Where(s => storeIds.Contains(s.Id)).ToDictionaryAsync(s => s.Id, ct);

        var currentAssignment = await _db.Assignments
            .Where(a => a.RouteId == routeId && a.EndDate == null)
            .FirstOrDefaultAsync(ct);
        var defaultMerchandiserId = currentAssignment?.MerchandiserId;

        var activePatches = await _db.Patches
            .Where(p => p.RouteId == routeId && p.Status != PatchStatus.Cancelled)
            .ToListAsync(ct);
        var patchInputs = activePatches
            .Select(p => new PatchInput(p.Id, p.Type, p.StoreId, p.CoverMerchandiserId, p.StartsOn, p.EndsOn, p.ParamsJson))
            .ToList();

        var settings = await _settingsProvider.GetAsync(route.Province, ct);

        var newVisits = new Dictionary<(Guid RouteStopId, DateOnly Date), PlannedVisit>();

        for (var date = from; date <= to; date = date.AddDays(1))
        {
            var baselineForDate = new List<ProjectedVisit>();
            foreach (var stop in stops)
            {
                var withinMembership = date >= stop.EffectiveFrom && (stop.EffectiveTo is null || date <= stop.EffectiveTo);
                if (!withinMembership)
                {
                    continue;
                }

                var occursOnDate = FrequencyExpander
                    .ExpandVisitDates(stop.Frequency, stop.WeekdayMask, stop.BiweeklyAnchor, date, date)
                    .Any();
                if (!occursOnDate)
                {
                    continue;
                }

                var minutes = stop.ServiceMinutes
                    ?? stores.GetValueOrDefault(stop.StoreId)?.DefaultServiceMinutes
                    ?? settings.DefaultServiceMinutes;

                baselineForDate.Add(new ProjectedVisit(
                    stop.Id, stop.StoreId, date, minutes, defaultMerchandiserId, PlannedVisitSource.Baseline, null));
            }

            var resolved = PatchResolver.Apply(baselineForDate, patchInputs, date);
            if (resolved.Count == 0)
            {
                continue;
            }

            var sequenceByStop = stops.ToDictionary(s => s.Id, s => s.Sequence);
            var ordered = resolved
                .OrderBy(v => sequenceByStop.GetValueOrDefault(v.RouteStopId, int.MaxValue))
                .ToList();

            var dayPlan = DayScheduler.ScheduleDay(
                date,
                ordered.Select(v => (v.RouteStopId, v.StoreId, v.Minutes)).ToList(),
                settings);

            for (var i = 0; i < ordered.Count; i++)
            {
                var projected = ordered[i];
                var scheduled = dayPlan.Visits[i];
                var key = (projected.RouteStopId, date);

                newVisits[key] = new PlannedVisit
                {
                    Id = Guid.NewGuid(),
                    RouteId = routeId,
                    RouteStopId = projected.RouteStopId,
                    StoreId = projected.StoreId,
                    MerchandiserId = projected.MerchandiserId,
                    VisitDate = date,
                    PlannedStart = new DateTimeOffset(date.ToDateTime(scheduled.Start), TimeSpan.Zero),
                    PlannedEnd = new DateTimeOffset(date.ToDateTime(scheduled.End), TimeSpan.Zero),
                    Source = projected.Source,
                    PatchId = projected.PatchId,
                    Status = PlannedVisitStatus.Planned,
                };
            }
        }

        var existing = await _db.PlannedVisits
            .Where(v => v.RouteId == routeId && v.VisitDate >= from && v.VisitDate <= to)
            .ToListAsync(ct);
        var existingByKey = existing.ToDictionary(v => (v.RouteStopId, v.VisitDate));

        var upsertCount = 0;
        foreach (var (key, computed) in newVisits)
        {
            if (existingByKey.TryGetValue(key, out var existingRow))
            {
                existingRow.MerchandiserId = computed.MerchandiserId;
                existingRow.PlannedStart = computed.PlannedStart;
                existingRow.PlannedEnd = computed.PlannedEnd;
                existingRow.Source = computed.Source;
                existingRow.PatchId = computed.PatchId;
            }
            else
            {
                _db.PlannedVisits.Add(computed);
            }
            upsertCount++;
        }

        var toDelete = existing.Where(v => !newVisits.ContainsKey((v.RouteStopId, v.VisitDate))).ToList();
        _db.PlannedVisits.RemoveRange(toDelete);

        await _db.SaveChangesAsync(ct);
        return upsertCount;
    }
}
