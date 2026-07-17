using Evo.Api.Routing.Dtos;
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
    private readonly EvoDbContext _db;

    public MerchandisersController(EvoDbContext db)
    {
        _db = db;
    }

    [HttpGet("{id:guid}/day")]
    public async Task<ActionResult<IReadOnlyList<PlannedVisitDto>>> GetDay(Guid id, [FromQuery] DateOnly date)
    {
        var merchandiser = await _db.Merchandisers.FirstOrDefaultAsync(m => m.Id == id) ?? throw new NotFoundException("Merchandiser");

        var visits = await _db.PlannedVisits
            .Where(v => v.MerchandiserId == id && v.VisitDate == date)
            .ToListAsync();
        var storeNames = await _db.Stores.Where(s => visits.Select(v => v.StoreId).Contains(s.Id))
            .ToDictionaryAsync(s => s.Id, s => s.Name);

        return visits
            .OrderBy(v => v.PlannedStart)
            .Select(v => new PlannedVisitDto(v.StoreId, storeNames.GetValueOrDefault(v.StoreId, "?"), v.PlannedStart, v.PlannedEnd, v.Source))
            .ToList();
    }
}
