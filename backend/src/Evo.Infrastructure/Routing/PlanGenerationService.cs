using Evo.Domain.Scheduling;
using Evo.Domain.Tasks;
using Evo.Infrastructure.Stores;
using Evo.Infrastructure.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Evo.Infrastructure.Routing;

/// <summary>Loads a route's active stops/assignment/patches, projects the baseline calendar via
/// FrequencyExpander, applies PatchResolver, schedules each day via DayScheduler, and upserts
/// planned_visit rows for dates >= from. Past visits (VisitDate &lt; today) are never touched —
/// the horizon is materialized, history is frozen (design §2.6). Visit duration = Σ resolved task
/// minutes (design §2.9) unless RouteStop.ServiceMinutes is set, which always wins as a manual override.</summary>
public class PlanGenerationService : IPlanGenerationService
{
    private readonly EvoDbContext _db;
    private readonly ISettingsProvider _settingsProvider;
    private readonly ITaskPlanProvider _taskPlanProvider;

    public PlanGenerationService(EvoDbContext db, ISettingsProvider settingsProvider, ITaskPlanProvider taskPlanProvider)
    {
        _db = db;
        _settingsProvider = settingsProvider;
        _taskPlanProvider = taskPlanProvider;
    }

    public Task<int> RegenerateFutureAsync(Guid routeId, DateOnly from, DateOnly to, CancellationToken ct = default)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        if (from < today)
        {
            from = today;
        }

        return GenerateAsync(routeId, from, to, ct);
    }

    /// <summary>Seeder-only (spec 009): materializes past dates through the same real engine, bypassing
    /// RegenerateFutureAsync's today-clamp. Never call this from request/background-service code paths —
    /// regeneration must stay future-only so history stays frozen (design §2.6).</summary>
    public Task<int> MaterializeHistoryAsync(Guid routeId, DateOnly from, DateOnly to, CancellationToken ct = default) =>
        GenerateAsync(routeId, from, to, ct);

    private async Task<int> GenerateAsync(Guid routeId, DateOnly from, DateOnly to, CancellationToken ct)
    {
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

        var stopMetaByStoreId = stops.ToDictionary(
            s => s.StoreId,
            s => new StopMeta(
                s.Id,
                s.ServiceMinutes ?? stores.GetValueOrDefault(s.StoreId)?.DefaultServiceMinutes ?? settings.DefaultServiceMinutes,
                s.Sequence));

        var storeAttributesByStoreId = stores.ToDictionary(
            kv => kv.Key,
            kv => new StoreAttributes(kv.Value.Id, kv.Value.ChainId, kv.Value.Format, kv.Value.Category.ToString(), kv.Value.Channel, kv.Value.Province, routeId));

        var newVisits = new Dictionary<(Guid RouteStopId, DateOnly Date), PlannedVisit>();
        var resolvedTasksByKey = new Dictionary<(Guid RouteStopId, DateOnly Date), IReadOnlyList<ResolvedTask>>();

        for (var date = from; date <= to; date = date.AddDays(1))
        {
            var occurringStops = stops.Where(stop =>
            {
                var withinMembership = date >= stop.EffectiveFrom && (stop.EffectiveTo is null || date <= stop.EffectiveTo);
                if (!withinMembership) return false;
                return FrequencyExpander.ExpandVisitDates(stop.Frequency, stop.WeekdayMask, stop.BiweeklyAnchor, date, date).Any();
            }).ToList();

            var storesForDate = occurringStops
                .Select(s => storeAttributesByStoreId.GetValueOrDefault(s.StoreId))
                .Where(a => a is not null)
                .Select(a => a!)
                .DistinctBy(a => a.StoreId)
                .ToList();
            var resolvedByStore = await _taskPlanProvider.ResolveForStoresAsync(storesForDate, date, ct);

            var baselineForDate = new List<ProjectedVisit>();
            foreach (var stop in occurringStops)
            {
                var resolvedTasks = resolvedByStore.GetValueOrDefault(stop.StoreId) ?? [];
                resolvedTasksByKey[(stop.Id, date)] = resolvedTasks;

                var minutes = stop.ServiceMinutes
                    ?? (resolvedTasks.Count > 0 ? resolvedTasks.Sum(r => r.Minutes) : (int?)null)
                    ?? stores.GetValueOrDefault(stop.StoreId)?.DefaultServiceMinutes
                    ?? settings.DefaultServiceMinutes;

                baselineForDate.Add(new ProjectedVisit(
                    stop.Id, stop.StoreId, date, minutes, defaultMerchandiserId, PlannedVisitSource.Baseline, null));
            }

            var resolved = PatchResolver.Apply(baselineForDate, patchInputs, date, stopMetaByStoreId);
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
                ordered.Select(v => (v.RouteStopId, v.StoreId, v.Minutes, v.PinnedStart)).ToList(),
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
        var plannedVisitIdByKey = new Dictionary<(Guid RouteStopId, DateOnly Date), Guid>();
        foreach (var (key, computed) in newVisits)
        {
            Guid visitId;
            if (existingByKey.TryGetValue(key, out var existingRow))
            {
                existingRow.MerchandiserId = computed.MerchandiserId;
                existingRow.PlannedStart = computed.PlannedStart;
                existingRow.PlannedEnd = computed.PlannedEnd;
                existingRow.Source = computed.Source;
                existingRow.PatchId = computed.PatchId;
                visitId = existingRow.Id;
            }
            else
            {
                _db.PlannedVisits.Add(computed);
                visitId = computed.Id;
            }
            plannedVisitIdByKey[key] = visitId;
            upsertCount++;
        }

        var toDelete = existing.Where(v => !newVisits.ContainsKey((v.RouteStopId, v.VisitDate))).ToList();
        _db.PlannedVisits.RemoveRange(toDelete);

        var toDeleteVisitIds = toDelete.Select(v => v.Id).ToHashSet();
        var relevantVisitIds = plannedVisitIdByKey.Values.Concat(toDeleteVisitIds).ToHashSet();
        var existingTaskInstances = await _db.TaskInstances
            .Where(ti => ti.PlannedVisitId != null && relevantVisitIds.Contains(ti.PlannedVisitId.Value))
            .ToListAsync(ct);
        var existingTaskInstanceByKey = existingTaskInstances.ToDictionary(ti => (ti.PlannedVisitId!.Value, ti.TaskTemplateId));

        foreach (var (key, computed) in newVisits)
        {
            var visitId = plannedVisitIdByKey[key];
            var tasks = resolvedTasksByKey.GetValueOrDefault(key) ?? [];

            foreach (var task in tasks)
            {
                var tiKey = (visitId, task.TaskTemplateId);
                if (existingTaskInstanceByKey.TryGetValue(tiKey, out var existingTi))
                {
                    existingTi.ResolvedMinutes = task.Minutes;
                }
                else
                {
                    _db.TaskInstances.Add(new TaskInstance
                    {
                        Id = Guid.NewGuid(),
                        PlannedVisitId = visitId,
                        StoreId = computed.StoreId,
                        MerchandiserId = computed.MerchandiserId,
                        TaskTemplateId = task.TaskTemplateId,
                        ResolvedMinutes = task.Minutes,
                        Status = TaskInstanceStatus.Pending,
                    });
                }
            }

            var currentTemplateIds = tasks.Select(t => t.TaskTemplateId).ToHashSet();
            var staleTaskInstances = existingTaskInstanceByKey
                .Where(kv => kv.Key.Item1 == visitId && !currentTemplateIds.Contains(kv.Key.Item2))
                .Select(kv => kv.Value);
            _db.TaskInstances.RemoveRange(staleTaskInstances);
        }

        var deletedVisitTaskInstances = existingTaskInstances.Where(ti => toDeleteVisitIds.Contains(ti.PlannedVisitId!.Value));
        _db.TaskInstances.RemoveRange(deletedVisitTaskInstances);

        await _db.SaveChangesAsync(ct);
        return upsertCount;
    }
}
