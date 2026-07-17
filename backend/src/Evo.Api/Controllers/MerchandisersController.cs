using System.Security.Claims;
using Evo.Api.Audit.Dtos;
using Evo.Api.Routing.Dtos;
using Evo.Domain.Auth;
using Evo.Domain.Exceptions;
using Evo.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Evo.Api.Controllers;

[ApiController]
[Route("api/v1/merchandisers")]
[Authorize]
public class MerchandisersController : ControllerBase
{
    private const int MaxPageSize = 500;

    private readonly EvoDbContext _db;

    public MerchandisersController(EvoDbContext db)
    {
        _db = db;
    }

    private bool CanAccessMerchandiser(Guid merchandiserUserId)
    {
        if (User.IsInRole(Roles.Supervisor)) return true;
        var idClaim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return Guid.TryParse(idClaim, out var currentUserId) && merchandiserUserId == currentUserId;
    }

    [HttpGet("{id:guid}/day")]
    public async Task<ActionResult<IReadOnlyList<PlannedVisitDto>>> GetDay(Guid id, [FromQuery] DateOnly date)
    {
        var merchandiser = await _db.Merchandisers.FirstOrDefaultAsync(m => m.Id == id) ?? throw new NotFoundException("Merchandiser");
        if (!CanAccessMerchandiser(merchandiser.UserId))
        {
            return Forbid();
        }

        var visits = await _db.PlannedVisits
            .Where(v => v.MerchandiserId == id && v.VisitDate == date)
            .ToListAsync();
        var storeNames = await _db.Stores.Where(s => visits.Select(v => v.StoreId).Contains(s.Id))
            .ToDictionaryAsync(s => s.Id, s => s.Name);
        var visitIds = visits.Select(v => v.Id).ToList();
        var realizationByVisitId = await _db.VisitRealizations
            .Where(r => visitIds.Contains(r.PlannedVisitId))
            .ToDictionaryAsync(r => r.PlannedVisitId, r => r);

        return visits
            .OrderBy(v => v.PlannedStart)
            .Select(v =>
            {
                var realization = realizationByVisitId.GetValueOrDefault(v.Id);
                return new PlannedVisitDto(
                    v.RouteStopId, v.StoreId, storeNames.GetValueOrDefault(v.StoreId, "?"), v.PlannedStart, v.PlannedEnd, v.Source,
                    v.Status, realization?.CheckInAt, realization?.CheckOutAt, realization?.ActualMinutes, realization?.OutcomeReason, null);
            })
            .ToList();
    }

    [HttpGet("{id:guid}/location-history")]
    public async Task<ActionResult<PagedResult<LocationPingDto>>> GetLocationHistory(
        Guid id, [FromQuery] DateTimeOffset from, [FromQuery] DateTimeOffset to,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 100)
    {
        var merchandiser = await _db.Merchandisers.FirstOrDefaultAsync(m => m.Id == id) ?? throw new NotFoundException("Merchandiser");
        if (!CanAccessMerchandiser(merchandiser.UserId))
        {
            return Forbid();
        }

        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var query = _db.LocationPings.Where(p => p.MerchandiserId == id && p.RecordedAt >= from && p.RecordedAt <= to);
        var total = await query.CountAsync();
        var items = await query
            .OrderByDescending(p => p.RecordedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(p => new LocationPingDto(p.RecordedAt, p.Lat, p.Lng))
            .ToListAsync();

        return new PagedResult<LocationPingDto>(items, page, pageSize, total);
    }

    [HttpGet("{id:guid}/notifications")]
    public async Task<ActionResult<IReadOnlyList<NotificationDto>>> GetNotifications(Guid id)
    {
        var merchandiser = await _db.Merchandisers.FirstOrDefaultAsync(m => m.Id == id) ?? throw new NotFoundException("Merchandiser");
        if (!CanAccessMerchandiser(merchandiser.UserId))
        {
            return Forbid();
        }

        return await _db.Notifications
            .Where(n => n.MerchandiserId == id)
            .OrderByDescending(n => n.CreatedAt)
            .Select(n => new NotificationDto(n.Id, n.PayloadJson, n.CreatedAt, n.ReadAt))
            .ToListAsync();
    }
}

public record LocationPingDto(DateTimeOffset RecordedAt, double Lat, double Lng);

public record NotificationDto(Guid Id, string PayloadJson, DateTimeOffset CreatedAt, DateTimeOffset? ReadAt);
