using System.Security.Claims;
using Evo.Api.Audit;
using Evo.Api.Audit.Dtos;
using Evo.Api.People.Dtos;
using Evo.Api.Routing.Dtos;
using Evo.Domain.Auth;
using Evo.Domain.Exceptions;
using Evo.Infrastructure;
using Evo.Infrastructure.People;
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
    private readonly IAuditWriter _auditWriter;

    public MerchandisersController(EvoDbContext db, IAuditWriter auditWriter)
    {
        _db = db;
        _auditWriter = auditWriter;
    }

    private bool CanAccessMerchandiser(Guid merchandiserUserId)
    {
        if (User.IsInRole(Roles.Supervisor)) return true;
        var idClaim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return Guid.TryParse(idClaim, out var currentUserId) && merchandiserUserId == currentUserId;
    }

    /// <summary>List merchandisers for the "Kişi değiştir" reassign picker (gap-matrix §3 — backend
    /// assignment API already existed, spec 005, there was simply no listing to pick FROM). Supervisor
    /// only; additive/read-only, no schema change.</summary>
    [HttpGet]
    [Authorize(Roles = Roles.Supervisor)]
    public async Task<ActionResult<IReadOnlyList<MerchandiserSummaryDto>>> List([FromQuery] bool activeOnly = true)
    {
        var query = _db.Merchandisers.AsQueryable();
        if (activeOnly)
        {
            query = query.Where(m => m.Active);
        }

        var merchandisers = await query.AsNoTracking().ToListAsync();
        var userIds = merchandisers.Select(m => m.UserId).ToList();
        var names = await _db.Users.Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.DisplayName);

        var merchandiserIds = merchandisers.Select(m => m.Id).ToList();
        var activeRoutes = await _db.Assignments
            .Where(a => a.EndDate == null && merchandiserIds.Contains(a.MerchandiserId))
            .Join(_db.Routes, a => a.RouteId, r => r.Id, (a, r) => new { a.MerchandiserId, r.RouteCode })
            .ToDictionaryAsync(x => x.MerchandiserId, x => x.RouteCode);

        return merchandisers
            .Select(m => new MerchandiserSummaryDto(m.Id, names.GetValueOrDefault(m.UserId, "?"), m.Active, activeRoutes.GetValueOrDefault(m.Id)))
            .OrderBy(m => m.Name)
            .ToList();
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

    [Authorize(Roles = Roles.Supervisor)]
    [HttpPost("{id:guid}/absences")]
    public async Task<ActionResult<AbsenceDto>> CreateAbsence(Guid id, [FromBody] CreateAbsenceRequest request)
    {
        var merchandiser = await _db.Merchandisers.FirstOrDefaultAsync(m => m.Id == id) ?? throw new NotFoundException("Merchandiser");
        if (request.EndDate < request.StartDate)
        {
            throw new EvoValidationException(new Dictionary<string, string[]>
            {
                ["endDate"] = ["endDate must not be before startDate."],
            });
        }

        var idClaim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        Guid? actorId = Guid.TryParse(idClaim, out var currentUserId) ? currentUserId : null;

        var absence = new Absence
        {
            Id = Guid.NewGuid(),
            MerchandiserId = merchandiser.Id,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            Reason = request.Reason,
            Note = request.Note,
            CreatedBy = actorId,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        _db.Absences.Add(absence);
        await _db.SaveChangesAsync();

        var dto = new AbsenceDto(absence.Id, absence.MerchandiserId, absence.StartDate, absence.EndDate, absence.Reason, absence.Note, absence.CreatedAt);
        await _auditWriter.WriteAsync("Absence", absence.Id.ToString(), "create", after: dto, actorId: actorId);

        return dto;
    }

    [HttpGet("{id:guid}/absences")]
    public async Task<ActionResult<IReadOnlyList<AbsenceDto>>> GetAbsences(Guid id)
    {
        var merchandiser = await _db.Merchandisers.FirstOrDefaultAsync(m => m.Id == id) ?? throw new NotFoundException("Merchandiser");
        if (!CanAccessMerchandiser(merchandiser.UserId))
        {
            return Forbid();
        }

        return await _db.Absences
            .Where(a => a.MerchandiserId == id)
            .OrderByDescending(a => a.StartDate)
            .Select(a => new AbsenceDto(a.Id, a.MerchandiserId, a.StartDate, a.EndDate, a.Reason, a.Note, a.CreatedAt))
            .ToListAsync();
    }
}

public record LocationPingDto(DateTimeOffset RecordedAt, double Lat, double Lng);

public record NotificationDto(Guid Id, string PayloadJson, DateTimeOffset CreatedAt, DateTimeOffset? ReadAt);
