using Evo.Api.Audit;
using Evo.Api.Audit.Dtos;
using Evo.Api.Stores.Dtos;
using Evo.Api.Tasks.Dtos;
using Evo.Domain.Auth;
using Evo.Domain.Exceptions;
using Evo.Domain.Tasks;
using Evo.Infrastructure;
using Evo.Infrastructure.Stores.Sync;
using Evo.Infrastructure.Routing;
using Evo.Infrastructure.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Evo.Infrastructure.Time;

namespace Evo.Api.Controllers;

[ApiController]
[Route("api/v1/stores")]
public class StoresController : ControllerBase
{
    private const int MaxPageSize = 200;

    private readonly IStoreSyncService _syncService;
    private readonly IAuditWriter _auditWriter;
    private readonly EvoDbContext _db;
    private readonly ITaskPlanProvider _taskPlanProvider;
    private readonly IPlanGenerationService _planGenerationService;

    private readonly PlanningClock _clock;

    public StoresController(IStoreSyncService syncService, IAuditWriter auditWriter, EvoDbContext db, ITaskPlanProvider taskPlanProvider, IPlanGenerationService planGenerationService, PlanningClock clock)
    {
        _clock = clock;
        _syncService = syncService;
        _auditWriter = auditWriter;
        _db = db;
        _taskPlanProvider = taskPlanProvider;
        _planGenerationService = planGenerationService;
    }

    [Authorize(Roles = Roles.Supervisor)]
    [HttpPost("sync")]
    public async Task<ActionResult<StoreSyncRunSummary>> Sync()
    {
        var summary = await _syncService.RunAsync();
        await _auditWriter.WriteAsync("StoreSync", "sync", "run", after: summary);
        return Ok(summary);
    }

    [Authorize]
    [HttpGet]
    public async Task<ActionResult<PagedResult<StoreSummaryDto>>> List(
        [FromQuery] string? province,
        [FromQuery] string? district,
        [FromQuery] bool? active,
        [FromQuery] byte? format,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var query = _db.Stores.AsQueryable();
        if (!string.IsNullOrEmpty(province))
        {
            query = query.Where(s => s.Province == province);
        }
        if (!string.IsNullOrEmpty(district))
        {
            query = query.Where(s => s.District == district);
        }
        if (active.HasValue)
        {
            query = query.Where(s => s.Active == active.Value);
        }
        if (format.HasValue)
        {
            query = query.Where(s => s.Format == format.Value);
        }

        var total = await query.CountAsync();
        var items = await query
            .OrderByDescending(s => s.SyncedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(s => new StoreSummaryDto(
                s.Id,
                s.EvoStoreId,
                s.Name,
                _db.Chains.Where(c => c.Id == s.ChainId).Select(c => c.Name).FirstOrDefault(),
                s.Province,
                s.District,
                s.Format,
                s.Category,
                s.Active,
                s.SyncedAt))
            .ToListAsync();

        return new PagedResult<StoreSummaryDto>(items, page, pageSize, total);
    }

    [Authorize]
    [HttpGet("geo")]
    public async Task<ActionResult<IReadOnlyList<StoreGeoDto>>> Geo(
        [FromQuery] string? province,
        [FromQuery] string? district,
        [FromQuery] bool? onRoute)
    {
        if (string.IsNullOrWhiteSpace(province))
        {
            throw new EvoValidationException(new Dictionary<string, string[]> { ["province"] = ["province is required."] });
        }

        var sixMonthsAgo = new DateOnly(_clock.Today.Year, _clock.Today.Month, 1).AddMonths(-5);

        var query = _db.Stores.Where(s => s.Province == province && s.Location != null);
        if (!string.IsNullOrEmpty(district))
        {
            query = query.Where(s => s.District == district);
        }

        var stores = await query.Take(5000).ToListAsync();
        var storeIds = stores.Select(s => s.Id).ToList();

        var activeStops = await _db.RouteStops
            .Where(rs => rs.EffectiveTo == null && storeIds.Contains(rs.StoreId))
            .ToListAsync();
        var routeIds = activeStops.Select(rs => rs.RouteId).Distinct().ToList();
        var routeCodes = await _db.Routes.Where(r => routeIds.Contains(r.Id))
            .ToDictionaryAsync(r => r.Id, r => r.RouteCode);
        var activeRouteByStore = activeStops.ToDictionary(rs => rs.StoreId, rs => rs.RouteId);

        if (onRoute.HasValue)
        {
            stores = onRoute.Value
                ? stores.Where(s => activeRouteByStore.ContainsKey(s.Id)).ToList()
                : stores.Where(s => !activeRouteByStore.ContainsKey(s.Id)).ToList();
            storeIds = stores.Select(s => s.Id).ToList();
        }

        var revenueByStore = await _db.StoreRevenues
            .Where(r => storeIds.Contains(r.StoreId) && r.Month >= sixMonthsAgo)
            .GroupBy(r => r.StoreId)
            .Select(g => new { StoreId = g.Key, Revenue = g.Sum(r => r.Revenue) })
            .ToDictionaryAsync(g => g.StoreId, g => g.Revenue);

        var chainNames = await _db.Chains.ToDictionaryAsync(c => c.Id, c => c.Name);

        var result = stores.Select(s =>
        {
            Guid? activeRouteId = activeRouteByStore.TryGetValue(s.Id, out var routeId) ? routeId : null;
            return new StoreGeoDto(
                s.Id,
                s.Name,
                s.ChainId is { } chainId ? chainNames.GetValueOrDefault(chainId) : null,
                s.Format,
                s.Category,
                s.Location!.Y,
                s.Location!.X,
                activeRouteId,
                activeRouteId is { } id ? routeCodes.GetValueOrDefault(id) : null,
                revenueByStore.GetValueOrDefault(s.Id, 0m),
                s.Active);
        }).ToList();

        return result;
    }

    [Authorize]
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<StoreDetailDto>> Get(Guid id)
    {
        var store = await _db.Stores.FirstOrDefaultAsync(s => s.Id == id) ?? throw new NotFoundException("Store");

        var chainName = store.ChainId is null
            ? null
            : await _db.Chains.Where(c => c.Id == store.ChainId).Select(c => c.Name).FirstOrDefaultAsync();

        var revenue = await _db.StoreRevenues
            .Where(r => r.StoreId == id)
            .OrderByDescending(r => r.Month)
            .Select(r => new StoreRevenueDto(r.Month, r.Revenue))
            .ToListAsync();

        var flags = await _db.StoreFlags
            .Where(f => f.StoreId == id)
            .Select(f => new StoreFlagDto(f.Type, f.Reason, f.StartsOn, f.EndsOn))
            .ToListAsync();

        return new StoreDetailDto(
            store.Id,
            store.EvoStoreId,
            store.Name,
            chainName,
            store.Channel,
            store.Province,
            store.District,
            store.Neighborhood,
            store.Location?.Y,
            store.Location?.X,
            store.Format,
            store.Category,
            store.DefaultServiceMinutes,
            store.Active,
            store.SyncedAt,
            revenue,
            flags);
    }

    // L1: activate / deactivate a store. Per the design, a deactivated store keeps its route
    // membership (its RouteStops stay open) but drops out of the plan/schedule — no visits are
    // generated for it until it is reactivated. So we flip Store.Active and regenerate the plan for
    // every route that currently holds it, letting PlanGenerationService add/remove its visits.
    [Authorize(Roles = Roles.Supervisor)]
    [HttpPatch("{id:guid}/status")]
    public async Task<ActionResult<StoreDetailDto>> UpdateStatus(Guid id, [FromBody] UpdateStoreStatusRequest request)
    {
        var store = await _db.Stores.FirstOrDefaultAsync(s => s.Id == id) ?? throw new NotFoundException("Store");

        if (store.Active != request.Active)
        {
            var before = new { store.Active };
            store.Active = request.Active;
            await _auditWriter.WriteAsync("Store", store.Id.ToString(), request.Active ? "Activated" : "Deactivated", before, new { store.Active });
            await _db.SaveChangesAsync();

            var today = _clock.Today;
            var routeIds = await _db.RouteStops
                .Where(rs => rs.StoreId == id && rs.EffectiveTo == null)
                .Select(rs => rs.RouteId)
                .Distinct()
                .ToListAsync();
            foreach (var routeId in routeIds)
            {
                await _planGenerationService.RegenerateFutureAsync(routeId, today, today.AddDays(42));
            }
        }

        return await Get(id);
    }

    [Authorize]
    [HttpGet("{id:guid}/task-plan")]
    public async Task<ActionResult<TaskPlanDto>> GetTaskPlan(Guid id, [FromQuery] DateOnly date)
    {
        var store = await _db.Stores.FirstOrDefaultAsync(s => s.Id == id) ?? throw new NotFoundException("Store");

        var activeRouteId = await _db.RouteStops
            .Where(rs => rs.StoreId == id && rs.EffectiveTo == null)
            .Select(rs => (Guid?)rs.RouteId)
            .FirstOrDefaultAsync();

        var attributes = new StoreAttributes(
            store.Id, store.ChainId, store.Format, store.Category.ToString(), store.Channel, store.Province, activeRouteId);

        var resolved = await _taskPlanProvider.ResolveAsync(attributes, date);
        var templateIds = resolved.Select(r => r.TaskTemplateId).ToList();
        var namesByTemplateId = await _db.TaskTemplates
            .Where(t => templateIds.Contains(t.Id))
            .ToDictionaryAsync(t => t.Id, t => t.Name);

        var plannedVisitId = await _db.PlannedVisits
            .Where(v => v.StoreId == id && v.VisitDate == date)
            .Select(v => (Guid?)v.Id)
            .FirstOrDefaultAsync();
        var instanceByTemplateId = plannedVisitId is null
            ? new Dictionary<Guid, TaskInstance>()
            : await _db.TaskInstances
                .Where(ti => ti.PlannedVisitId == plannedVisitId)
                .ToDictionaryAsync(ti => ti.TaskTemplateId, ti => ti);

        var taskDtos = resolved
            .Select(r =>
            {
                var instance = instanceByTemplateId.GetValueOrDefault(r.TaskTemplateId);
                return new ResolvedTaskDto(
                    r.TaskTemplateId,
                    r.Code,
                    namesByTemplateId.GetValueOrDefault(r.TaskTemplateId, r.Code),
                    r.Minutes,
                    r.Trace.Select(t => new SourceTraceStepDto(t.Layer, t.Op.ToString(), t.BeforeMinutes, t.AfterMinutes)).ToList(),
                    instance?.Id,
                    instance?.Status,
                    instance?.ResultJson);
            })
            .ToList();

        return new TaskPlanDto(id, date, taskDtos.Sum(t => t.Minutes), taskDtos);
    }
}
