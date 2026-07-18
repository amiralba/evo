using Evo.Api.Audit.Dtos;
using Evo.Api.Routing.Dtos;
using Evo.Domain.Auth;
using Evo.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Evo.Api.Controllers;

/// <summary>Read side of the decision journal (design §11.3) — written on publish-with-errors
/// (RoutesController.Publish), Onarım repairs (OnarimService.ApplyAsync), and future "make
/// permanent" flows. Prototype's 📖 Karar Günlüğü viewer (gap-matrix §3) had no backing read API
/// until now — this is additive/read-only, no new table or schema change.</summary>
[ApiController]
[Authorize(Roles = Roles.Supervisor)]
[Route("api/v1/decision-journal")]
public class DecisionJournalController : ControllerBase
{
    private const int MaxPageSize = 200;

    private readonly EvoDbContext _db;

    public DecisionJournalController(EvoDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<DecisionJournalEntryDto>>> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var query = _db.DecisionJournal.AsQueryable();
        var total = await query.CountAsync();
        var items = await query
            .OrderByDescending(e => e.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(e => new DecisionJournalEntryDto(e.Id, e.Kind.ToString(), e.Description, e.Reason, e.Objective, e.ErrorsJson, e.AuthorId, e.CreatedAt))
            .ToListAsync();

        return new PagedResult<DecisionJournalEntryDto>(items, page, pageSize, total);
    }
}
