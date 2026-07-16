using Evo.Api.Audit.Dtos;
using Evo.Domain.Auth;
using Evo.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Evo.Api.Controllers;

[ApiController]
[Authorize(Roles = Roles.Supervisor)]
[Route("api/v1/audit-log")]
public class AuditLogController : ControllerBase
{
    private const int MaxPageSize = 200;

    private readonly EvoDbContext _db;

    public AuditLogController(EvoDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<AuditLogEntryDto>>> List(
        [FromQuery] string? entityType,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var query = _db.AuditLog.AsQueryable();
        if (!string.IsNullOrEmpty(entityType))
        {
            query = query.Where(e => e.EntityType == entityType);
        }

        var total = await query.CountAsync();
        var items = await query
            .OrderByDescending(e => e.OccurredAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(e => new AuditLogEntryDto(e.Id, e.ActorId, e.OccurredAt, e.EntityType, e.EntityKey, e.Event, e.BeforeJson, e.AfterJson))
            .ToListAsync();

        return new PagedResult<AuditLogEntryDto>(items, page, pageSize, total);
    }
}
