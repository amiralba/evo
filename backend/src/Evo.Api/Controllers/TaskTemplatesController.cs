using Evo.Api.Tasks.Dtos;
using Evo.Domain.Auth;
using Evo.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Evo.Api.Controllers;

[ApiController]
[Route("api/v1/task-templates")]
[Authorize(Roles = Roles.Supervisor)]
public class TaskTemplatesController : ControllerBase
{
    private readonly EvoDbContext _db;

    public TaskTemplatesController(EvoDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<TaskTemplateDto>>> List()
    {
        var templates = await _db.TaskTemplates
            .Where(t => t.Active)
            .Select(t => new TaskTemplateDto(
                t.Id, t.Code, t.Name, t.DefaultMinutes, t.Recurrence, t.ProofRequired,
                t.TargetChain, t.TargetFormat, t.ValidUntil, t.Active))
            .ToListAsync();

        return templates;
    }
}
