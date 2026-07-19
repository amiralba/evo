using System.Security.Claims;
using System.Text.Json;
using Evo.Api.Audit;
using Evo.Api.Notifications;
using Evo.Api.Routing.Dtos;
using Evo.Domain.Auth;
using Evo.Domain.Exceptions;
using Evo.Domain.Scheduling;
using Evo.Infrastructure;
using Evo.Infrastructure.Identity;
using Evo.Infrastructure.People;
using Evo.Infrastructure.Routing;
using Evo.Infrastructure.Stores;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Route = Evo.Infrastructure.Routing.Route;

namespace Evo.Api.Controllers;

[ApiController]
[Route("api/v1/routes")]
[Authorize(Roles = Roles.Supervisor)]
public class RoutesController : ControllerBase
{
    private const int MaxPageSize = 200;

    private readonly EvoDbContext _db;
    private readonly IRouteChangeLog _changeLog;
    private readonly IPlanGenerationService _planGenerationService;
    private readonly ISettingsProvider _settingsProvider;
    private readonly INotificationDispatcher _notificationDispatcher;
    private readonly ILogger<RoutesController> _logger;

    public RoutesController(
        EvoDbContext db, IRouteChangeLog changeLog, IPlanGenerationService planGenerationService,
        ISettingsProvider settingsProvider, INotificationDispatcher notificationDispatcher, ILogger<RoutesController> logger)
    {
        _db = db;
        _changeLog = changeLog;
        _planGenerationService = planGenerationService;
        _settingsProvider = settingsProvider;
        _notificationDispatcher = notificationDispatcher;
        _logger = logger;
    }

    private Guid? CurrentUserId
    {
        get
        {
            var idClaim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
            return Guid.TryParse(idClaim, out var id) ? id : null;
        }
    }

    [HttpPost]
    public async Task<ActionResult<RouteSummaryDto>> Create([FromBody] CreateRouteRequest request)
    {
        var routeCode = request.RouteCode;
        if (string.IsNullOrWhiteSpace(routeCode))
        {
            var prefix = request.Province.Length >= 3 ? request.Province[..3].ToUpperInvariant() : request.Province.ToUpperInvariant();
            var sequence = await _db.Routes.CountAsync(r => r.RouteCode.StartsWith(prefix + "-")) + 1;
            routeCode = $"{prefix}-{sequence:D2}";
        }

        var route = new Route
        {
            Id = Guid.NewGuid(),
            RouteCode = routeCode,
            Name = request.Name,
            Province = request.Province,
            DistrictsJson = request.Districts is { Count: > 0 } ? JsonSerializer.Serialize(request.Districts) : null,
            Status = RouteStatus.Draft,
            Version = 1,
            RevenueTarget = request.RevenueTarget ?? 1_250_000m,
            DailyWorkMinutes = 450,
            CreatedBy = CurrentUserId,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
        };
        _db.Routes.Add(route);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(Get), new { id = route.Id }, ToSummaryDto(route, stopCount: 0));
    }

    [HttpGet]
    public async Task<ActionResult<Audit.Dtos.PagedResult<RouteSummaryDto>>> List(
        [FromQuery] string? province,
        [FromQuery] RouteStatus? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var query = _db.Routes.AsQueryable();
        if (!string.IsNullOrEmpty(province))
        {
            query = query.Where(r => r.Province == province);
        }
        if (status.HasValue)
        {
            query = query.Where(r => r.Status == status.Value);
        }

        var total = await query.CountAsync();
        var routeIds = await query
            .OrderBy(r => r.RouteCode)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var ids = routeIds.Select(r => r.Id).ToList();

        var stopCounts = await _db.RouteStops
            .Where(rs => rs.EffectiveTo == null && ids.Contains(rs.RouteId))
            .GroupBy(rs => rs.RouteId)
            .Select(g => new { RouteId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.RouteId, g => g.Count);

        // Rail parity (evo-planner-prototype-v0.5.html:1101-1112) shows the assignee + accrued
        // 6-month revenue on each rail card, not just the stop count — batch both across the page
        // rather than N+1-ing per route.
        var merchandiserNames = await _db.Assignments
            .Where(a => a.EndDate == null && ids.Contains(a.RouteId))
            .Join(_db.Merchandisers, a => a.MerchandiserId, m => m.Id, (a, m) => new { a.RouteId, m.UserId })
            .Join(_db.Users, x => x.UserId, u => u.Id, (x, u) => new { x.RouteId, u.DisplayName })
            .ToDictionaryAsync(x => x.RouteId, x => x.DisplayName);

        var sixMonthsAgo = new DateOnly(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1).AddMonths(-5);
        var revenueByRoute = await _db.RouteStops
            .Where(rs => rs.EffectiveTo == null && ids.Contains(rs.RouteId))
            .Join(_db.StoreRevenues.Where(r => r.Month >= sixMonthsAgo), rs => rs.StoreId, r => r.StoreId, (rs, r) => new { rs.RouteId, r.Revenue })
            .GroupBy(x => x.RouteId)
            .Select(g => new { RouteId = g.Key, Total = g.Sum(x => x.Revenue) })
            .ToDictionaryAsync(g => g.RouteId, g => g.Total);

        var items = routeIds
            .Select(r => ToSummaryDto(r, stopCounts.GetValueOrDefault(r.Id, 0), merchandiserNames.GetValueOrDefault(r.Id), revenueByRoute.GetValueOrDefault(r.Id, 0)))
            .ToList();
        return new Audit.Dtos.PagedResult<RouteSummaryDto>(items, page, pageSize, total);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<RouteDetailDto>> Get(Guid id)
    {
        var route = await _db.Routes.FirstOrDefaultAsync(r => r.Id == id) ?? throw new NotFoundException("Route");

        var stops = await _db.RouteStops
            .Where(rs => rs.RouteId == id && rs.EffectiveTo == null)
            .OrderBy(rs => rs.Sequence)
            .ToListAsync();
        var storeNames = await _db.Stores.Where(s => stops.Select(rs => rs.StoreId).Contains(s.Id))
            .ToDictionaryAsync(s => s.Id, s => s.Name);
        var stopDtos = stops.Select(rs => new RouteStopDto(
            rs.Id, rs.StoreId, storeNames.GetValueOrDefault(rs.StoreId, "?"), rs.Frequency, rs.WeekdayMask,
            rs.ServiceMinutes, rs.Sequence, rs.EffectiveFrom, rs.EffectiveTo)).ToList();

        var currentAssignment = await _db.Assignments.Where(a => a.RouteId == id && a.EndDate == null).FirstOrDefaultAsync();
        AssignmentDto? assignmentDto = null;
        if (currentAssignment is not null)
        {
            var merchandiser = await _db.Merchandisers.FirstOrDefaultAsync(m => m.Id == currentAssignment.MerchandiserId);
            var user = merchandiser is null ? null : await _db.Users.FirstOrDefaultAsync(u => u.Id == merchandiser.UserId);
            assignmentDto = new AssignmentDto(currentAssignment.MerchandiserId, user?.DisplayName ?? "?", currentAssignment.StartDate, currentAssignment.Reason);
        }

        var activePatches = await _db.Patches
            .Where(p => p.RouteId == id && (p.Status == PatchStatus.Pending || p.Status == PatchStatus.Active))
            .Select(p => new PatchDto(p.Id, p.Type, p.StoreId, p.StartsOn, p.EndsOn, p.Status))
            .ToListAsync();

        var districts = route.DistrictsJson is null
            ? []
            : JsonSerializer.Deserialize<List<string>>(route.DistrictsJson) ?? [];

        return new RouteDetailDto(
            route.Id, route.RouteCode, route.Name, route.Province, districts, route.Status, route.Version,
            route.RevenueTarget, route.DailyWorkMinutes, stopDtos, assignmentDto, activePatches);
    }

    [HttpPatch("{id:guid}")]
    public async Task<ActionResult<RouteSummaryDto>> Update(Guid id, [FromBody] UpdateRouteRequest request)
    {
        var route = await _db.Routes.FirstOrDefaultAsync(r => r.Id == id) ?? throw new NotFoundException("Route");

        if (request.Name is not null)
        {
            route.Name = request.Name;
        }
        if (request.RevenueTarget is not null)
        {
            route.RevenueTarget = request.RevenueTarget.Value;
        }

        if (request.Status is { } newStatus && newStatus != route.Status)
        {
            await ApplyStatusTransitionAsync(route, newStatus);
        }

        route.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        var stopCount = await _db.RouteStops.CountAsync(rs => rs.RouteId == id && rs.EffectiveTo == null);
        return ToSummaryDto(route, stopCount);
    }

    private async Task ApplyStatusTransitionAsync(Route route, RouteStatus newStatus)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        if (route.Status == RouteStatus.Draft && newStatus == RouteStatus.Active)
        {
            var hasActiveAssignment = await _db.Assignments.AnyAsync(a => a.RouteId == route.Id && a.EndDate == null);
            if (!hasActiveAssignment)
            {
                throw new ConflictException("Route cannot activate without an active assignment.");
            }
            route.Status = RouteStatus.Active;
            route.Version++;
            await _changeLog.WriteAsync(route.Id, RouteChangeEvent.Published, null, new { route.Status });
            await _db.SaveChangesAsync();
            await _planGenerationService.RegenerateFutureAsync(route.Id, today, today.AddDays(42));
        }
        else if (route.Status == RouteStatus.Active && newStatus == RouteStatus.Inactive)
        {
            var stops = await _db.RouteStops.Where(rs => rs.RouteId == route.Id && rs.EffectiveTo == null).ToListAsync();
            foreach (var stop in stops)
            {
                stop.EffectiveTo = today;
            }
            var futureVisits = await _db.PlannedVisits.Where(v => v.RouteId == route.Id && v.VisitDate >= today).ToListAsync();
            _db.PlannedVisits.RemoveRange(futureVisits);

            route.Status = RouteStatus.Inactive;
            route.Version++;
            await _changeLog.WriteAsync(route.Id, RouteChangeEvent.StopRemoved, null, new { Reason = "route_deactivated", StopCount = stops.Count });
        }
        else if (route.Status == RouteStatus.Inactive && newStatus == RouteStatus.Active)
        {
            route.Status = RouteStatus.Active;
            route.Version++;
        }
        else
        {
            throw new ConflictException($"Cannot transition route from {route.Status} to {newStatus}.");
        }
    }

    [HttpPost("{id:guid}/stops:bulk")]
    public async Task<ActionResult<BulkAddResultDto>> BulkAddStops(Guid id, [FromBody] BulkAddStopsRequest request)
    {
        var route = await _db.Routes.FirstOrDefaultAsync(r => r.Id == id) ?? throw new NotFoundException("Route");
        var routeDistricts = route.DistrictsJson is null ? [] : JsonSerializer.Deserialize<List<string>>(route.DistrictsJson) ?? [];

        var stores = await _db.Stores.Where(s => request.StoreIds.Contains(s.Id)).ToDictionaryAsync(s => s.Id);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var nextSequence = (await _db.RouteStops.Where(rs => rs.RouteId == id && rs.EffectiveTo == null)
            .Select(rs => (int?)rs.Sequence).MaxAsync() ?? 0) + 1;

        var added = new List<Guid>();
        var rejected = new List<RejectedStoreDto>();

        foreach (var storeId in request.StoreIds)
        {
            if (!stores.TryGetValue(storeId, out var store))
            {
                rejected.Add(new RejectedStoreDto(storeId, "store_not_found"));
                continue;
            }

            var inProvince = store.Province == route.Province;
            var inDistrict = routeDistricts.Count == 0 || routeDistricts.Contains(store.District);
            if (!inProvince || !inDistrict)
            {
                rejected.Add(new RejectedStoreDto(storeId, "out_of_geo_scope"));
                continue;
            }

            var onAnotherRoute = await _db.RouteStops.AnyAsync(rs => rs.StoreId == storeId && rs.EffectiveTo == null);
            if (onAnotherRoute)
            {
                rejected.Add(new RejectedStoreDto(storeId, "on_another_route"));
                continue;
            }

            _db.RouteStops.Add(new RouteStop
            {
                Id = Guid.NewGuid(),
                RouteId = id,
                StoreId = storeId,
                Frequency = request.Frequency,
                WeekdayMask = request.WeekdayMask,
                ServiceMinutes = request.ServiceMinutes,
                Sequence = nextSequence++,
                EffectiveFrom = today,
                EffectiveTo = null,
            });
            added.Add(storeId);
        }

        if (added.Count > 0)
        {
            await _changeLog.WriteAsync(id, RouteChangeEvent.StopAdded, null, new { StoreIds = added });
            await _db.SaveChangesAsync();
            await _planGenerationService.RegenerateFutureAsync(id, today, today.AddDays(42));
        }

        return new BulkAddResultDto(added, rejected);
    }

    [HttpPatch("{id:guid}/stops/{stopId:guid}")]
    public async Task<ActionResult<RouteStopDto>> UpdateStop(Guid id, Guid stopId, [FromBody] UpdateStopRequest request)
    {
        var stop = await _db.RouteStops.FirstOrDefaultAsync(rs => rs.Id == stopId && rs.RouteId == id && rs.EffectiveTo == null)
            ?? throw new NotFoundException("RouteStop");

        var freqChanged = (request.Frequency is { } freq && freq != stop.Frequency)
            || (request.WeekdayMask is { } wm && wm != stop.WeekdayMask);
        if (request.Frequency is { } newFreq)
        {
            stop.Frequency = newFreq;
        }
        if (request.WeekdayMask is { } newMask)
        {
            stop.WeekdayMask = newMask;
        }
        if (request.ServiceMinutes is { } minutes)
        {
            stop.ServiceMinutes = Math.Clamp((int)(Math.Round(minutes / 5.0) * 5), 10, 240);
        }
        if (request.Sequence is { } sequence)
        {
            stop.Sequence = sequence;
        }

        if (freqChanged)
        {
            await _changeLog.WriteAsync(id, RouteChangeEvent.FreqChanged, null, new { stop.Id, stop.Frequency, stop.WeekdayMask });
        }
        await _db.SaveChangesAsync();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        await _planGenerationService.RegenerateFutureAsync(id, today, today.AddDays(42));

        var storeName = await _db.Stores.Where(s => s.Id == stop.StoreId).Select(s => s.Name).FirstOrDefaultAsync() ?? "?";
        return new RouteStopDto(stop.Id, stop.StoreId, storeName, stop.Frequency, stop.WeekdayMask, stop.ServiceMinutes, stop.Sequence, stop.EffectiveFrom, stop.EffectiveTo);
    }

    [HttpPost("{id:guid}/stops:reorder")]
    public async Task<ActionResult<RouteDetailDto>> ReorderStops(Guid id, [FromBody] ReorderStopsRequest request)
    {
        var route = await _db.Routes.FirstOrDefaultAsync(r => r.Id == id) ?? throw new NotFoundException("Route");
        var stops = await _db.RouteStops.Where(rs => rs.RouteId == id && rs.EffectiveTo == null).ToListAsync();

        var stopIdSet = stops.Select(s => s.Id).ToHashSet();
        var requestIdSet = request.StopIds.ToHashSet();
        if (stopIdSet.Count != requestIdSet.Count || !stopIdSet.SetEquals(requestIdSet))
        {
            throw new EvoValidationException(new Dictionary<string, string[]>
            {
                ["stopIds"] = ["stopIds must exactly match the route's active stops."],
            });
        }

        var before = stops.OrderBy(s => s.Sequence).Select(s => new { s.Id, s.Sequence }).ToList();
        var stopsById = stops.ToDictionary(s => s.Id);
        for (var i = 0; i < request.StopIds.Count; i++)
        {
            stopsById[request.StopIds[i]].Sequence = i + 1;
        }

        await _changeLog.WriteAsync(id, RouteChangeEvent.StopsReordered, before, new { Order = request.StopIds });
        await _db.SaveChangesAsync();

        return await Get(id);
    }

    [HttpPost("{id:guid}/stops/{stopId:guid}:move")]
    public async Task<ActionResult<RouteStopDto>> MoveStop(Guid id, Guid stopId, [FromBody] MoveStopRequest request)
    {
        var sourceStop = await _db.RouteStops.FirstOrDefaultAsync(rs => rs.Id == stopId && rs.RouteId == id && rs.EffectiveTo == null)
            ?? throw new NotFoundException("RouteStop");
        var targetRoute = await _db.Routes.FirstOrDefaultAsync(r => r.Id == request.TargetRouteId)
            ?? throw new NotFoundException("Route");
        var store = await _db.Stores.FirstOrDefaultAsync(s => s.Id == sourceStop.StoreId)
            ?? throw new NotFoundException("Store");

        var targetDistricts = targetRoute.DistrictsJson is null ? [] : JsonSerializer.Deserialize<List<string>>(targetRoute.DistrictsJson) ?? [];
        var inProvince = store.Province == targetRoute.Province;
        var inDistrict = targetDistricts.Count == 0 || targetDistricts.Contains(store.District);
        if (!inProvince || !inDistrict)
        {
            throw new ConflictException("Store is outside the target route's geo-scope.");
        }

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var nextSequence = (await _db.RouteStops.Where(rs => rs.RouteId == request.TargetRouteId && rs.EffectiveTo == null)
            .Select(rs => (int?)rs.Sequence).MaxAsync() ?? 0) + 1;

        sourceStop.EffectiveTo = today;

        var newStop = new RouteStop
        {
            Id = Guid.NewGuid(),
            RouteId = request.TargetRouteId,
            StoreId = sourceStop.StoreId,
            Frequency = sourceStop.Frequency,
            WeekdayMask = sourceStop.WeekdayMask,
            BiweeklyAnchor = sourceStop.BiweeklyAnchor,
            ServiceMinutes = sourceStop.ServiceMinutes,
            Sequence = nextSequence,
            TimeWindowStart = sourceStop.TimeWindowStart,
            TimeWindowEnd = sourceStop.TimeWindowEnd,
            EffectiveFrom = today,
            EffectiveTo = null,
        };
        _db.RouteStops.Add(newStop);

        await _changeLog.WriteAsync(id, RouteChangeEvent.StopMoved, new { From = id }, new { To = request.TargetRouteId });
        await _db.SaveChangesAsync();

        await _planGenerationService.RegenerateFutureAsync(id, today, today.AddDays(42));
        await _planGenerationService.RegenerateFutureAsync(request.TargetRouteId, today, today.AddDays(42));

        return new RouteStopDto(newStop.Id, newStop.StoreId, store.Name, newStop.Frequency, newStop.WeekdayMask, newStop.ServiceMinutes, newStop.Sequence, newStop.EffectiveFrom, newStop.EffectiveTo);
    }

    // L3: remove a stop from the route → its store returns to the pool. Per the "no delete" rule the
    // RouteStop row is soft-closed (EffectiveTo = today), keeping history attached; future visits are
    // regenerated so the store drops off the schedule from today onward.
    [HttpDelete("{id:guid}/stops/{stopId:guid}")]
    public async Task<IActionResult> RemoveStop(Guid id, Guid stopId)
    {
        var stop = await _db.RouteStops.FirstOrDefaultAsync(rs => rs.Id == stopId && rs.RouteId == id && rs.EffectiveTo == null)
            ?? throw new NotFoundException("RouteStop");

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        stop.EffectiveTo = today;

        await _changeLog.WriteAsync(id, RouteChangeEvent.StopRemoved, new { stop.Id, stop.StoreId }, null);
        await _db.SaveChangesAsync();

        await _planGenerationService.RegenerateFutureAsync(id, today, today.AddDays(42));

        return NoContent();
    }

    [HttpPost("{id:guid}/assignment")]
    public async Task<ActionResult<AssignmentDto>> Reassign(Guid id, [FromBody] ReassignRequest request)
    {
        if (!Enum.IsDefined(request.Reason))
        {
            throw new EvoValidationException(new Dictionary<string, string[]> { ["reason"] = ["Reason is required."] });
        }

        var route = await _db.Routes.FirstOrDefaultAsync(r => r.Id == id) ?? throw new NotFoundException("Route");
        var merchandiser = await _db.Merchandisers.FirstOrDefaultAsync(m => m.Id == request.MerchandiserId)
            ?? throw new NotFoundException("Merchandiser");

        var currentAssignment = await _db.Assignments.FirstOrDefaultAsync(a => a.RouteId == id && a.EndDate == null);
        if (currentAssignment is not null)
        {
            currentAssignment.EndDate = request.StartDate;
            await _changeLog.WriteAsync(id, RouteChangeEvent.Unassigned, new { currentAssignment.MerchandiserId }, null);
        }

        var newAssignment = new Assignment
        {
            Id = Guid.NewGuid(),
            RouteId = id,
            MerchandiserId = request.MerchandiserId,
            StartDate = request.StartDate,
            EndDate = null,
            Reason = request.Reason,
            CreatedBy = CurrentUserId,
        };
        _db.Assignments.Add(newAssignment);

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            throw new ConflictException("Merchandiser already holds an active assignment on another route.");
        }

        await _changeLog.WriteAsync(id, RouteChangeEvent.Assigned, null, new { request.MerchandiserId });

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var futureVisits = await _db.PlannedVisits.Where(v => v.RouteId == id && v.VisitDate >= today).ToListAsync();
        foreach (var visit in futureVisits)
        {
            visit.MerchandiserId = request.MerchandiserId;
        }
        await _db.SaveChangesAsync();

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == merchandiser.UserId);
        return new AssignmentDto(newAssignment.MerchandiserId, user?.DisplayName ?? "?", newAssignment.StartDate, newAssignment.Reason);
    }

    [HttpPost("{id:guid}/patches")]
    public async Task<ActionResult<PatchDto>> CreatePatch(Guid id, [FromBody] CreatePatchRequest request)
    {
        if (request.EndsOn is null)
        {
            throw new EvoValidationException(new Dictionary<string, string[]> { ["endsOn"] = ["A patch must have a mandatory expiry date (V9)."] });
        }

        if (request.Type == PatchType.TimeShift)
        {
            if (request.StoreId is null || !PatchParams.TryParse<PatchParams.TimeShiftParams>(request.ParamsJson, out _))
            {
                throw new EvoValidationException(new Dictionary<string, string[]>
                {
                    ["paramsJson"] = ["TimeShift requires storeId and a paramsJson of the shape { startMinutes }."],
                });
            }
        }
        else if (request.Type == PatchType.MoveVisit)
        {
            if (request.StoreId is null || !PatchParams.TryParse<PatchParams.MoveVisitParams>(request.ParamsJson, out var mp) || mp is null)
            {
                throw new EvoValidationException(new Dictionary<string, string[]>
                {
                    ["paramsJson"] = ["MoveVisit requires storeId and a paramsJson of the shape { fromDate, toDate, startMinutes? }."],
                });
            }
            if (mp.FromDate == mp.ToDate)
            {
                throw new EvoValidationException(new Dictionary<string, string[]>
                {
                    ["paramsJson"] = ["MoveVisit's fromDate and toDate must differ."],
                });
            }
        }

        var route = await _db.Routes.FirstOrDefaultAsync(r => r.Id == id) ?? throw new NotFoundException("Route");
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var patch = new Patch
        {
            Id = Guid.NewGuid(),
            RouteId = id,
            Type = request.Type,
            StoreId = request.StoreId,
            CoverMerchandiserId = request.CoverMerchandiserId,
            StartsOn = request.StartsOn,
            EndsOn = request.EndsOn.Value,
            ParamsJson = request.ParamsJson,
            Status = request.StartsOn <= today ? PatchStatus.Active : PatchStatus.Pending,
            Reason = request.Reason,
            CreatedBy = CurrentUserId,
        };
        _db.Patches.Add(patch);
        await _changeLog.WriteAsync(id, RouteChangeEvent.Patched, null, new { patch.Id, patch.Type });
        await _db.SaveChangesAsync();

        await _planGenerationService.RegenerateFutureAsync(id, today, today.AddDays(42));

        return new PatchDto(patch.Id, patch.Type, patch.StoreId, patch.StartsOn, patch.EndsOn, patch.Status);
    }

    /// <summary>Cancels a Pending/Active patch early (the drag-and-drop "Geri al" undo — the schedule
    /// pane applies a same-week patch immediately on drop, so undoing it means cancelling that patch
    /// rather than deleting it: patches are never hard-deleted, only expire or get cancelled, same as
    /// the existing PatchStatusAdvancer's Expired transition).</summary>
    [HttpPost("{id:guid}/patches/{patchId:guid}/cancel")]
    public async Task<ActionResult<PatchDto>> CancelPatch(Guid id, Guid patchId)
    {
        var patch = await _db.Patches.FirstOrDefaultAsync(p => p.Id == patchId && p.RouteId == id) ?? throw new NotFoundException("Patch");
        if (patch.Status is not (PatchStatus.Pending or PatchStatus.Active))
        {
            throw new EvoValidationException(new Dictionary<string, string[]> { ["status"] = ["Only a pending or active patch can be cancelled."] });
        }

        patch.Status = PatchStatus.Cancelled;
        await _changeLog.WriteAsync(id, RouteChangeEvent.Patched, null, new { patch.Id, patch.Type, Cancelled = true });
        await _db.SaveChangesAsync();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        await _planGenerationService.RegenerateFutureAsync(id, today, today.AddDays(42));

        return new PatchDto(patch.Id, patch.Type, patch.StoreId, patch.StartsOn, patch.EndsOn, patch.Status);
    }

    [HttpGet("{id:guid}/plan")]
    public async Task<ActionResult<IReadOnlyList<PlanDayDto>>> GetPlan(Guid id, [FromQuery] DateOnly from, [FromQuery] DateOnly to)
    {
        var route = await _db.Routes.FirstOrDefaultAsync(r => r.Id == id) ?? throw new NotFoundException("Route");
        var settings = await _settingsProvider.GetAsync(route.Province);

        var visits = await _db.PlannedVisits
            .Where(v => v.RouteId == id && v.VisitDate >= from && v.VisitDate <= to)
            .ToListAsync();
        var storeNames = await _db.Stores.Where(s => visits.Select(v => v.StoreId).Contains(s.Id))
            .ToDictionaryAsync(s => s.Id, s => s.Name);

        var visitIds = visits.Select(v => v.Id).ToList();
        var realizationByVisitId = await _db.VisitRealizations
            .Where(r => visitIds.Contains(r.PlannedVisitId))
            .ToDictionaryAsync(r => r.PlannedVisitId, r => r);

        var merchandiserIds = visits.Where(v => v.MerchandiserId is not null).Select(v => v.MerchandiserId!.Value).Distinct().ToList();
        var checkInTimes = realizationByVisitId.Values.Where(r => r.CheckInAt is not null).Select(r => r.CheckInAt!.Value).ToList();
        var pings = new List<MerchandiserLocationPing>();
        if (checkInTimes.Count > 0 && merchandiserIds.Count > 0)
        {
            var windowStart = checkInTimes.Min().AddMinutes(-30);
            var windowEnd = checkInTimes.Max().AddMinutes(30);
            pings = await _db.LocationPings
                .Where(p => merchandiserIds.Contains(p.MerchandiserId) && p.RecordedAt >= windowStart && p.RecordedAt <= windowEnd)
                .ToListAsync();
        }

        LocationPointDto? NearestPing(Guid? merchandiserId, DateTimeOffset? checkInAt)
        {
            if (merchandiserId is not { } mId || checkInAt is not { } at) return null;
            var nearest = pings.Where(p => p.MerchandiserId == mId)
                .OrderBy(p => Math.Abs((p.RecordedAt - at).Ticks))
                .FirstOrDefault();
            if (nearest is null || Math.Abs((nearest.RecordedAt - at).TotalMinutes) > 30) return null;
            return new LocationPointDto(nearest.Lat, nearest.Lng);
        }

        var days = new List<PlanDayDto>();
        foreach (var group in visits.GroupBy(v => v.VisitDate).OrderBy(g => g.Key))
        {
            var visitDtos = group.Select(v =>
            {
                var realization = realizationByVisitId.GetValueOrDefault(v.Id);
                return new PlannedVisitDto(
                    v.RouteStopId, v.StoreId, storeNames.GetValueOrDefault(v.StoreId, "?"), v.PlannedStart, v.PlannedEnd, v.Source,
                    v.Status, realization?.CheckInAt, realization?.CheckOutAt, realization?.ActualMinutes,
                    realization?.OutcomeReason, NearestPing(v.MerchandiserId, realization?.CheckInAt));
            }).ToList();
            var plannedMinutes = group.Sum(v => v.PlannedStart.HasValue && v.PlannedEnd.HasValue ? (int)(v.PlannedEnd.Value - v.PlannedStart.Value).TotalMinutes : 0);

            var findings = new List<ValidationFinding>();
            if (plannedMinutes < settings.DailyWorkMinutes)
            {
                findings.Add(new ValidationFinding("V1", FindingSeverity.Warning, $"Day is under-loaded: {plannedMinutes} of {settings.DailyWorkMinutes} minutes planned."));
            }
            if (plannedMinutes > settings.DailyWorkMinutes + settings.Over450ToleranceMinutes)
            {
                findings.Add(new ValidationFinding("V2", FindingSeverity.Warning, $"Day exceeds the {settings.DailyWorkMinutes}-minute rule: {plannedMinutes} minutes planned."));
            }

            var overlapInputs = group.Where(v => v.MerchandiserId is not null && v.PlannedStart is not null && v.PlannedEnd is not null)
                .Select(v => (v.MerchandiserId!.Value, v.VisitDate, TimeOnly.FromDateTime(v.PlannedStart!.Value.DateTime), TimeOnly.FromDateTime(v.PlannedEnd!.Value.DateTime)));
            findings.AddRange(OverlapValidator.V12_Overlaps(overlapInputs));

            findings.AddRange(await BuildV14FindingsAsync(group.ToList()));

            days.Add(new PlanDayDto(group.Key, visitDtos, plannedMinutes,
                findings.Select(f => new FindingDto(f.Code, f.Severity, f.Message, f.Scope)).ToList()));
        }

        return days;
    }

    /// <summary>V14 (design §3.2) — visit planned while the assignee is on leave or the store is
    /// temporarily closed. Never hard-blocks; the finding surfaces on plan/validate and links the
    /// Onarım workbench (spec 010).</summary>
    private async Task<IReadOnlyList<ValidationFinding>> BuildV14FindingsAsync(IReadOnlyList<PlannedVisit> visits)
    {
        if (visits.Count == 0) return [];

        var merchandiserIds = visits.Where(v => v.MerchandiserId is not null).Select(v => v.MerchandiserId!.Value).Distinct().ToList();
        var storeIds = visits.Select(v => v.StoreId).Distinct().ToList();
        var dates = visits.Select(v => v.VisitDate).Distinct().ToList();
        var minDate = dates.Min();
        var maxDate = dates.Max();

        var absences = merchandiserIds.Count == 0
            ? []
            : await _db.Absences
                .Where(a => merchandiserIds.Contains(a.MerchandiserId) && a.StartDate <= maxDate && a.EndDate >= minDate)
                .Select(a => new { a.MerchandiserId, a.StartDate, a.EndDate })
                .ToListAsync();

        var closedStores = await _db.StoreFlags
            .Where(f => f.Type == StoreFlagType.ClosedTemp && storeIds.Contains(f.StoreId) && f.StartsOn <= maxDate && (f.EndsOn == null || f.EndsOn >= minDate))
            .Select(f => new { f.StoreId, f.StartsOn, f.EndsOn })
            .ToListAsync();

        var visitEvals = visits.Where(v => v.MerchandiserId is not null)
            .Select(v => new VisitAbsenceEval(v.Id, v.MerchandiserId!.Value, v.StoreId, v.VisitDate))
            .ToList();
        var absenceWindows = absences.Select(a => (a.MerchandiserId, a.StartDate, a.EndDate)).ToList();
        var closedWindows = closedStores.Select(f => (f.StoreId, f.StartsOn, f.EndsOn ?? DateOnly.MaxValue)).ToList();

        return AbsenceValidator.Evaluate(visitEvals, absenceWindows, closedWindows);
    }

    [HttpGet("{id:guid}/health")]
    public async Task<ActionResult<HealthDto>> GetHealth(Guid id)
    {
        var route = await _db.Routes.FirstOrDefaultAsync(r => r.Id == id) ?? throw new NotFoundException("Route");
        var stops = await _db.RouteStops.Where(rs => rs.RouteId == id && rs.EffectiveTo == null).ToListAsync();
        var storeIds = stops.Select(s => s.StoreId).ToList();
        var stores = await _db.Stores.Where(s => storeIds.Contains(s.Id)).ToListAsync();

        var sixMonthsAgo = new DateOnly(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1).AddMonths(-5);
        var sixMonthRevenue = await _db.StoreRevenues
            .Where(r => storeIds.Contains(r.StoreId) && r.Month >= sixMonthsAgo)
            .SumAsync(r => (decimal?)r.Revenue) ?? 0m;

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var horizonEnd = today.AddDays(27);
        var visits = await _db.PlannedVisits.Where(v => v.RouteId == id && v.VisitDate >= today && v.VisitDate <= horizonEnd).ToListAsync();
        var minutesByWeekday = visits
            .Where(v => v.PlannedStart.HasValue && v.PlannedEnd.HasValue)
            .GroupBy(v => v.VisitDate.DayOfWeek.ToString())
            .ToDictionary(g => g.Key, g => g.Sum(v => (int)(v.PlannedEnd!.Value - v.PlannedStart!.Value).TotalMinutes));

        var categoryMix = stores.Count == 0
            ? new Dictionary<string, int>()
            : stores.GroupBy(s => s.Category.ToString())
                .ToDictionary(g => g.Key, g => g.Count() * 100 / stores.Count);

        var settings = await _settingsProvider.GetAsync(route.Province);
        var routeEval = BuildRouteEval(route, stops, stores, sixMonthRevenue, settings.ServiceMixCapPct);
        var findings = RouteValidator.Evaluate(routeEval);

        return new HealthDto(
            sixMonthRevenue, route.RevenueTarget, sixMonthRevenue >= route.RevenueTarget,
            minutesByWeekday, categoryMix,
            findings.Count(f => f.Severity == FindingSeverity.Error),
            findings.Count(f => f.Severity == FindingSeverity.Warning));
    }

    [HttpPost("{id:guid}/validate")]
    public async Task<ActionResult<IReadOnlyList<FindingDto>>> Validate(Guid id)
    {
        var route = await _db.Routes.FirstOrDefaultAsync(r => r.Id == id) ?? throw new NotFoundException("Route");
        var stops = await _db.RouteStops.Where(rs => rs.RouteId == id && rs.EffectiveTo == null).ToListAsync();
        var storeIds = stops.Select(s => s.StoreId).ToList();
        var stores = await _db.Stores.Where(s => storeIds.Contains(s.Id)).ToListAsync();

        var sixMonthsAgo = new DateOnly(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1).AddMonths(-5);
        var sixMonthRevenue = await _db.StoreRevenues
            .Where(r => storeIds.Contains(r.StoreId) && r.Month >= sixMonthsAgo)
            .SumAsync(r => (decimal?)r.Revenue) ?? 0m;

        var settings = await _settingsProvider.GetAsync(route.Province);
        var routeEval = BuildRouteEval(route, stops, stores, sixMonthRevenue, settings.ServiceMixCapPct);
        var findings = new List<ValidationFinding>(RouteValidator.Evaluate(routeEval));

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var futureVisits = await _db.PlannedVisits
            .Where(v => v.RouteId == id && v.VisitDate >= today)
            .ToListAsync();
        findings.AddRange(await BuildV14FindingsAsync(futureVisits));
        findings.AddRange(await BuildV8FindingsAsync(futureVisits, today, settings.DailyWorkMinutes));

        return findings.Select(f => new FindingDto(f.Code, f.Severity, f.Message, f.Scope)).ToList();
    }

    /// <summary>V8 (design §3.2) — weekly minutes utilization outside the configurable band, per
    /// assigned merchandiser on this route, over the coming 7 days. Warning severity, never blocks.</summary>
    private async Task<IReadOnlyList<ValidationFinding>> BuildV8FindingsAsync(IReadOnlyList<PlannedVisit> futureVisits, DateOnly today, int dailyWorkMinutes)
    {
        var weekEnd = today.AddDays(6);
        var weekVisits = futureVisits.Where(v => v.VisitDate <= weekEnd && v.MerchandiserId is not null && v.PlannedStart is not null && v.PlannedEnd is not null).ToList();
        if (weekVisits.Count == 0) return [];

        var lowerBand = await ReadSettingDoubleAsync("utilization_band_lower", 0.90);
        var upperBand = await ReadSettingDoubleAsync("utilization_band_upper", 1.05);
        var workingDays = weekVisits.Select(v => v.VisitDate).Distinct().Count();
        var weeklyCapacity = dailyWorkMinutes * Math.Max(workingDays, 1);

        var findings = new List<ValidationFinding>();
        foreach (var group in weekVisits.GroupBy(v => v.MerchandiserId!.Value))
        {
            var plannedMinutes = group.Sum(v => (int)(v.PlannedEnd!.Value - v.PlannedStart!.Value).TotalMinutes);
            var finding = UtilizationValidator.Evaluate(plannedMinutes, weeklyCapacity, lowerBand, upperBand);
            if (finding is not null)
            {
                findings.Add(finding with { Scope = group.Key.ToString() });
            }
        }
        return findings;
    }

    private async Task<double> ReadSettingDoubleAsync(string key, double fallback)
    {
        var raw = await _db.Settings.Where(s => s.Key == key && s.RegionId == "").Select(s => s.ValueJson).FirstOrDefaultAsync();
        return raw is null ? fallback : JsonSerializer.Deserialize<double>(raw);
    }

    private static RouteEval BuildRouteEval(Route route, IReadOnlyList<RouteStop> stops, IReadOnlyList<Store> stores, decimal sixMonthRevenue, int serviceMixCapPct)
    {
        var districts = route.DistrictsJson is null ? [] : JsonSerializer.Deserialize<List<string>>(route.DistrictsJson) ?? [];
        var storeById = stores.ToDictionary(s => s.Id);

        var stopEvals = stops
            .Where(stop => storeById.ContainsKey(stop.StoreId))
            .Select(stop =>
            {
                var store = storeById[stop.StoreId];
                return new StopEval(store.Id, store.Province, store.District, store.Category == StoreCategory.Service, stop.ServiceMinutes ?? store.DefaultServiceMinutes ?? 30, stop.TimeWindowStart, stop.TimeWindowEnd, BannedOnDate: false);
            })
            .ToList();

        return new RouteEval(route.Province, districts, route.RevenueTarget, sixMonthRevenue, serviceMixCapPct, stopEvals);
    }

    [HttpPost("{id:guid}/publish")]
    public async Task<ActionResult<PublishResultDto>> Publish(Guid id, [FromBody] PublishRequest request)
    {
        var route = await _db.Routes.FirstOrDefaultAsync(r => r.Id == id) ?? throw new NotFoundException("Route");
        var stops = await _db.RouteStops.Where(rs => rs.RouteId == id && rs.EffectiveTo == null).ToListAsync();
        var storeIds = stops.Select(s => s.StoreId).ToList();
        var stores = await _db.Stores.Where(s => storeIds.Contains(s.Id)).ToListAsync();

        var sixMonthsAgo = new DateOnly(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1).AddMonths(-5);
        var sixMonthRevenue = await _db.StoreRevenues
            .Where(r => storeIds.Contains(r.StoreId) && r.Month >= sixMonthsAgo)
            .SumAsync(r => (decimal?)r.Revenue) ?? 0m;

        var settings = await _settingsProvider.GetAsync(route.Province);
        var routeEval = BuildRouteEval(route, stops, stores, sixMonthRevenue, settings.ServiceMixCapPct);
        var findings = RouteValidator.Evaluate(routeEval);
        var errors = findings.Where(f => f.Severity == FindingSeverity.Error).ToList();

        Guid? decisionJournalId = null;
        if (errors.Count > 0)
        {
            if (string.IsNullOrWhiteSpace(request.Reason) || string.IsNullOrWhiteSpace(request.Objective))
            {
                throw new EvoValidationException(new Dictionary<string, string[]>
                {
                    ["reason"] = ["A reason and objective are required to publish with unresolved validation errors."],
                });
            }

            var entry = new DecisionJournalEntry
            {
                Id = Guid.NewGuid(),
                Kind = DecisionKind.PublishOverride,
                Description = $"Published route {route.RouteCode} with {errors.Count} unresolved error(s).",
                Reason = request.Reason,
                Objective = request.Objective,
                ErrorsJson = JsonSerializer.Serialize(errors.Select(e => e.Code)),
                AuthorId = CurrentUserId,
                CreatedAt = DateTimeOffset.UtcNow,
            };
            _db.DecisionJournal.Add(entry);
            decisionJournalId = entry.Id;
        }

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var horizonEnd = today.AddDays(settings.PlanHorizonWeeks * 7);
        var visitsMaterialized = await _planGenerationService.RegenerateFutureAsync(id, today, horizonEnd);

        await _changeLog.WriteAsync(id, RouteChangeEvent.Published, null, new { VisitsMaterialized = visitsMaterialized, OverrodeErrors = errors.Count > 0 });
        await _db.SaveChangesAsync();

        try
        {
            await _notificationDispatcher.DispatchPublishAsync(id, $"{route.RouteCode} yayınlandı — {visitsMaterialized} ziyaret güncellendi.");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Notification dispatch failed for route {RouteId} publish — publish result is unaffected.", id);
        }

        return new PublishResultDto(visitsMaterialized, errors.Count > 0, decisionJournalId);
    }

    /// <summary>Design §11.2 "Planlama Kanıtı" — plan → execution only, no shelf/sales causality
    /// claim (spec 010). CausalityDisclaimer is always true so the panel renders the disclaimer.</summary>
    [HttpGet("{id:guid}/evidence")]
    public async Task<ActionResult<Evo.Api.Analytics.Dtos.RouteEvidenceDto>> GetEvidence(Guid id, [FromQuery] int weeks = 4)
    {
        var route = await _db.Routes.FirstOrDefaultAsync(r => r.Id == id) ?? throw new NotFoundException("Route");
        var since = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-weeks * 7);

        var visits = await _db.PlannedVisits
            .Where(v => v.RouteId == id && v.VisitDate >= since)
            .ToListAsync();
        var storeIds = visits.Select(v => v.StoreId).Distinct().ToList();
        var storeNames = await _db.Stores.Where(s => storeIds.Contains(s.Id)).ToDictionaryAsync(s => s.Id, s => s.Name);

        var visitIds = visits.Select(v => v.Id).ToList();
        var realizationByVisitId = (await _db.VisitRealizations.Where(r => visitIds.Contains(r.PlannedVisitId)).ToListAsync())
            .ToDictionary(r => r.PlannedVisitId, r => r);

        var storeEvidence = visits.GroupBy(v => v.StoreId).Select(group =>
        {
            var planned = group.Count();
            var done = group.Count(v => v.Status == PlannedVisitStatus.Done);
            var missed = group.Count(v => v.Status == PlannedVisitStatus.Missed);
            var skipped = group.Count(v => v.Status == PlannedVisitStatus.Skipped);

            var plannedMinutes = group.Where(v => v.PlannedStart.HasValue && v.PlannedEnd.HasValue)
                .Sum(v => (int)(v.PlannedEnd!.Value - v.PlannedStart!.Value).TotalMinutes);
            var realizedMinutes = group.Select(v => realizationByVisitId.GetValueOrDefault(v.Id))
                .Where(r => r?.ActualMinutes is not null).Sum(r => r!.ActualMinutes!.Value);
            var variancePct = plannedMinutes == 0 ? 0.0 : (double)(realizedMinutes - plannedMinutes) / plannedMinutes;

            return new Evo.Api.Analytics.Dtos.StoreEvidenceDto(
                group.Key, storeNames.GetValueOrDefault(group.Key, "?"), planned, done, missed, skipped, variancePct);
        }).ToList();

        return new Evo.Api.Analytics.Dtos.RouteEvidenceDto(id, weeks, storeEvidence, CausalityDisclaimer: true);
    }

    private static RouteSummaryDto ToSummaryDto(Route route, int stopCount, string? merchandiserName = null, decimal sixMonthRevenue = 0) =>
        new(route.Id, route.RouteCode, route.Name, route.Province, route.Status, route.Version, stopCount, route.RevenueTarget, merchandiserName, sixMonthRevenue);
}
