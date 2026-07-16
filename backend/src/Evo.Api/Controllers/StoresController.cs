using Evo.Api.Audit;
using Evo.Api.Audit.Dtos;
using Evo.Api.Stores.Dtos;
using Evo.Domain.Auth;
using Evo.Domain.Exceptions;
using Evo.Infrastructure;
using Evo.Infrastructure.Stores.Sync;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Evo.Api.Controllers;

[ApiController]
[Route("api/v1/stores")]
public class StoresController : ControllerBase
{
    private const int MaxPageSize = 200;

    private readonly IStoreSyncService _syncService;
    private readonly IAuditWriter _auditWriter;
    private readonly EvoDbContext _db;

    public StoresController(IStoreSyncService syncService, IAuditWriter auditWriter, EvoDbContext db)
    {
        _syncService = syncService;
        _auditWriter = auditWriter;
        _db = db;
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
}
