using System.Security.Claims;
using System.Text.Json;
using Evo.Api.Audit;
using Evo.Api.Tasks.Dtos;
using Evo.Domain.Auth;
using Evo.Domain.Exceptions;
using Evo.Domain.Tasks;
using Evo.Infrastructure;
using Evo.Infrastructure.Routing;
using Evo.Infrastructure.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Rule = Evo.Infrastructure.Tasks.Rule;
using Evo.Infrastructure.Time;

namespace Evo.Api.Controllers;

[ApiController]
[Authorize(Roles = Roles.Supervisor)]
public class TaskInstancesController : ControllerBase
{
    private readonly EvoDbContext _db;
    private readonly IAuditWriter _auditWriter;
    private readonly IPlanGenerationService _planGenerationService;

    private readonly PlanningClock _clock;

    public TaskInstancesController(EvoDbContext db, IAuditWriter auditWriter, IPlanGenerationService planGenerationService, PlanningClock clock)
    {
        _clock = clock;
        _db = db;
        _auditWriter = auditWriter;
        _planGenerationService = planGenerationService;
    }

    private Guid? CurrentUserId
    {
        get
        {
            var idClaim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
            return Guid.TryParse(idClaim, out var id) ? id : null;
        }
    }

    [HttpPatch("api/v1/task-instances/{id:guid}")]
    public async Task<IActionResult> UpdateScope(Guid id, [FromBody] PatchTaskInstanceRequest request)
    {
        var instance = await _db.TaskInstances.FirstOrDefaultAsync(ti => ti.Id == id) ?? throw new NotFoundException("TaskInstance");
        var store = await _db.Stores.FirstOrDefaultAsync(s => s.Id == instance.StoreId) ?? throw new NotFoundException("Store");

        var today = _clock.Today;

        switch (request.Scope)
        {
            case "INSTANCE":
                instance.OverrideMinutes = request.Minutes;
                instance.OverrideScope = OverrideScope.Instance;
                await _db.SaveChangesAsync();
                await RecomputeVisitDurationAsync(instance.PlannedVisitId);
                break;

            case "STORE_RULE":
                await CreateMinutesRuleAsync(instance.TaskTemplateId, RuleScopeLevel.Store,
                    new StoreConditionMatch(null, null, null, null, null, null, instance.StoreId), request.Minutes);
                foreach (var routeId in await RouteIdsForStoreAsync(instance.StoreId))
                {
                    await _planGenerationService.RegenerateFutureAsync(routeId, today, today.AddDays(42));
                }
                break;

            case "FORMAT_RULE":
                await CreateMinutesRuleAsync(instance.TaskTemplateId, RuleScopeLevel.Format,
                    new StoreConditionMatch(null, store.Format, null, null, null, null, null), request.Minutes);
                foreach (var routeId in await RouteIdsForFormatAsync(store.Format))
                {
                    await _planGenerationService.RegenerateFutureAsync(routeId, today, today.AddDays(42));
                }
                break;

            default:
                throw new EvoValidationException(new Dictionary<string, string[]>
                {
                    ["scope"] = ["scope must be one of INSTANCE, STORE_RULE, FORMAT_RULE."],
                });
        }

        return NoContent();
    }

    [HttpPost("api/v1/tasks/adhoc")]
    public async Task<ActionResult<AdhocTaskResponse>> CreateAdhoc([FromBody] AdhocTaskRequest request)
    {
        var template = new TaskTemplate
        {
            Id = Guid.NewGuid(),
            Code = request.TemplateCode,
            Name = request.Name,
            DefaultMinutes = request.Minutes,
            Recurrence = TaskRecurrence.Once,
            ProofRequired = ProofRequired.None,
            TargetChain = request.TargetChain,
            TargetFormat = request.TargetFormat,
            ValidUntil = request.Deadline,
            Active = true,
        };
        _db.TaskTemplates.Add(template);
        await _db.SaveChangesAsync();

        var query = _db.Stores.AsQueryable();
        if (request.TargetChain is { } chainId) query = query.Where(s => s.ChainId == chainId);
        if (request.TargetFormat is { } format) query = query.Where(s => s.Format == format);
        var matchingStoreCount = await query.CountAsync();

        var today = _clock.Today;
        var storeIds = await query.Select(s => s.Id).ToListAsync();
        var routeIds = await _db.RouteStops
            .Where(rs => rs.EffectiveTo == null && storeIds.Contains(rs.StoreId))
            .Select(rs => rs.RouteId)
            .Distinct()
            .ToListAsync();
        foreach (var routeId in routeIds)
        {
            await _planGenerationService.RegenerateFutureAsync(routeId, today, request.Deadline);
        }

        return new AdhocTaskResponse(template.Id, matchingStoreCount);
    }

    private async Task RecomputeVisitDurationAsync(Guid? plannedVisitId)
    {
        if (plannedVisitId is not { } visitId) return;

        var visit = await _db.PlannedVisits.FirstOrDefaultAsync(v => v.Id == visitId);
        if (visit is null || visit.PlannedStart is null) return;

        var totalMinutes = await _db.TaskInstances
            .Where(ti => ti.PlannedVisitId == visitId)
            .Select(ti => ti.OverrideMinutes ?? ti.ResolvedMinutes)
            .SumAsync();

        visit.PlannedEnd = visit.PlannedStart.Value.AddMinutes(totalMinutes);
        await _db.SaveChangesAsync();
    }

    private async Task CreateMinutesRuleAsync(Guid taskTemplateId, RuleScopeLevel scope, StoreConditionMatch condition, int minutes)
    {
        var rule = new Rule
        {
            Id = Guid.NewGuid(),
            TaskTemplateId = taskTemplateId,
            Scope = scope,
            ConditionJson = JsonSerializer.Serialize(new RuleConditionJson(
                condition.ChainId, condition.Format, condition.Category, condition.Channel, condition.Province, condition.RouteId, condition.StoreId)),
            EffectJson = JsonSerializer.Serialize(new RuleEffectJson(TaskEffectOp.SetMinutes, minutes, null)),
            Priority = 0,
            EffectiveFrom = _clock.Today,
            EffectiveTo = null,
            CreatedBy = CurrentUserId,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        _db.Rules.Add(rule);
        await _db.SaveChangesAsync();
        await _auditWriter.WriteAsync("Rule", rule.Id.ToString(), "create-from-scope-modal", actorId: CurrentUserId);
    }

    private async Task<List<Guid>> RouteIdsForStoreAsync(Guid storeId) =>
        await _db.RouteStops.Where(rs => rs.StoreId == storeId && rs.EffectiveTo == null).Select(rs => rs.RouteId).Distinct().ToListAsync();

    private async Task<List<Guid>> RouteIdsForFormatAsync(byte format)
    {
        var storeIds = await _db.Stores.Where(s => s.Format == format).Select(s => s.Id).ToListAsync();
        return await _db.RouteStops.Where(rs => rs.EffectiveTo == null && storeIds.Contains(rs.StoreId)).Select(rs => rs.RouteId).Distinct().ToListAsync();
    }
}
