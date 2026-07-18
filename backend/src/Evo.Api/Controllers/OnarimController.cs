using System.Security.Claims;
using Evo.Api.Onarim;
using Evo.Api.Onarim.Dtos;
using Evo.Domain.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Evo.Api.Controllers;

[ApiController]
[Route("api/v1/onarim")]
[Authorize(Roles = Roles.Supervisor)]
public class OnarimController : ControllerBase
{
    private readonly IOnarimService _onarim;

    public OnarimController(IOnarimService onarim)
    {
        _onarim = onarim;
    }

    private Guid? CurrentUserId
    {
        get
        {
            var idClaim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
            return Guid.TryParse(idClaim, out var id) ? id : null;
        }
    }

    [HttpGet("disruptions")]
    public async Task<ActionResult<IReadOnlyList<DisruptionDto>>> GetDisruptions([FromQuery] string? region) =>
        Ok(await _onarim.GetDisruptionsAsync(region));

    [HttpGet("disruptions/{id:guid}/affected-visits")]
    public async Task<ActionResult<IReadOnlyList<AffectedVisitDto>>> GetAffectedVisits(Guid id) =>
        Ok(await _onarim.GetAffectedWithCandidatesAsync(id));

    [HttpPost("disruptions/{id:guid}/apply")]
    public async Task<ActionResult<object>> Apply(Guid id, [FromBody] ApplyOnarimRequest request)
    {
        var decisionJournalId = await _onarim.ApplyAsync(id, request, CurrentUserId);
        var updated = await _onarim.GetAffectedWithCandidatesAsync(id);
        return Ok(new { DecisionJournalId = decisionJournalId, AffectedVisits = updated });
    }
}
