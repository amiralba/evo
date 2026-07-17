using System.Security.Claims;
using System.Text.Json;
using Evo.Api.Audit;
using Evo.Api.Tasks.Dtos;
using Evo.Domain.Auth;
using Evo.Domain.Scheduling;
using Evo.Domain.Tasks;
using Evo.Infrastructure;
using Evo.Infrastructure.Routing;
using Evo.Infrastructure.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Rule = Evo.Infrastructure.Tasks.Rule;

namespace Evo.Api.Controllers;

[ApiController]
[Route("api/v1/rules")]
[Authorize(Roles = Roles.Supervisor)]
public class RulesController : ControllerBase
{
    private const int DailyWorkMinutes = 450;

    private readonly EvoDbContext _db;
    private readonly IAuditWriter _auditWriter;
    private readonly IPlanGenerationService _planGenerationService;

    public RulesController(EvoDbContext db, IAuditWriter auditWriter, IPlanGenerationService planGenerationService)
    {
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

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<RuleDto>>> List()
    {
        var rules = await _db.Rules.ToListAsync();
        return rules.Select(ToDto).ToList();
    }

    [HttpPost]
    public async Task<ActionResult<RuleDto>> Create([FromBody] CreateRuleRequest request)
    {
        var rule = new Rule
        {
            Id = Guid.NewGuid(),
            TaskTemplateId = request.TaskTemplateId,
            Scope = request.Scope,
            ConditionJson = JsonSerializer.Serialize(new RuleConditionJson(
                request.Condition.ChainId, request.Condition.Format, request.Condition.Category,
                request.Condition.Channel, request.Condition.Province, request.Condition.RouteId, request.Condition.StoreId)),
            EffectJson = JsonSerializer.Serialize(new RuleEffectJson(request.Effect.Op, request.Effect.SetValue, request.Effect.ScaleValue)),
            Priority = request.Priority,
            EffectiveFrom = request.EffectiveFrom,
            EffectiveTo = request.EffectiveTo,
            CreatedBy = CurrentUserId,
            CreatedAt = DateTimeOffset.UtcNow,
        };

        _db.Rules.Add(rule);
        await _db.SaveChangesAsync();

        await _auditWriter.WriteAsync("Rule", rule.Id.ToString(), "create", after: ToDto(rule), actorId: CurrentUserId);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var affectedRouteIds = await FindAffectedRouteIdsAsync(request.Scope, request.Condition);
        foreach (var routeId in affectedRouteIds)
        {
            await _planGenerationService.RegenerateFutureAsync(routeId, today, today.AddDays(42));
        }

        return CreatedAtAction(nameof(List), null, ToDto(rule));
    }

    [HttpGet("impact")]
    public async Task<ActionResult<RuleImpactDto>> Impact(
        [FromQuery] RuleScopeLevel scope, [FromQuery] Guid? taskTemplateId, [FromQuery] Guid? chainId, [FromQuery] byte? format,
        [FromQuery] Guid? routeId, [FromQuery] Guid? storeId, [FromQuery] TaskEffectOp op,
        [FromQuery] int? setValue, [FromQuery] decimal? scaleValue)
    {
        var condition = new RuleConditionDto(chainId, format, null, null, null, routeId, storeId);
        var candidateStores = await FindMatchingStoresAsync(condition);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var weekDates = Enumerable.Range(0, 7).Select(today.AddDays).ToList();

        var storeAttributesById = candidateStores.ToDictionary(
            s => s.Id,
            s => new StoreAttributes(s.Id, s.ChainId, s.Format, s.Category.ToString(), s.Channel, s.Province,
                RouteIdByStore(routeId, s.Id)));

        var storeIds = candidateStores.Select(s => s.Id).ToHashSet();
        var stopsForStores = await _db.RouteStops
            .Where(rs => rs.EffectiveTo == null && storeIds.Contains(rs.StoreId))
            .ToListAsync();

        var visitsPerWeek = 0;
        var deltaMinutesPerWeek = 0;

        var candidateRule = new TaskRuleInput(
            Guid.NewGuid(), taskTemplateId, scope,
            new StoreConditionMatch(chainId, format, null, null, null, routeId, storeId),
            op, setValue, scaleValue, Priority: int.MaxValue, weekDates[0], weekDates[^1]);

        var templates = await _db.TaskTemplates.Where(t => t.Active)
            .Select(t => new TaskTemplateInput(t.Id, t.Code, t.DefaultMinutes, null, t.TargetFormat, t.ValidUntil, t.Active))
            .ToListAsync();
        var existingRules = await _db.Rules.ToListAsync();
        var existingRuleInputs = existingRules.Select(MapRuleRow).ToList();

        foreach (var stop in stopsForStores)
        {
            var store = storeAttributesById.GetValueOrDefault(stop.StoreId);
            if (store is null) continue;

            foreach (var date in weekDates)
            {
                var occursOnDate = FrequencyExpander
                    .ExpandVisitDates(stop.Frequency, stop.WeekdayMask, stop.BiweeklyAnchor, date, date)
                    .Any();
                if (!occursOnDate) continue;

                visitsPerWeek++;

                var before = TaskResolver.Resolve(store, templates, existingRuleInputs, date).Sum(r => r.Minutes);
                var after = TaskResolver.Resolve(store, templates, [.. existingRuleInputs, candidateRule], date).Sum(r => r.Minutes);
                deltaMinutesPerWeek += after - before;
            }
        }

        // Simplified V10 estimate (M2 scope): sums only the matched stores' contribution per
        // route/day (not the full route's other stops) against the 450-min threshold.
        var daysOver450 = 0;
        foreach (var routeGroup in stopsForStores.GroupBy(s => s.RouteId))
        {
            foreach (var date in weekDates)
            {
                var totalBefore = 0;
                var totalAfter = 0;
                foreach (var stop in routeGroup)
                {
                    var occursOnDate = FrequencyExpander
                        .ExpandVisitDates(stop.Frequency, stop.WeekdayMask, stop.BiweeklyAnchor, date, date)
                        .Any();
                    if (!occursOnDate) continue;

                    var store = storeAttributesById.GetValueOrDefault(stop.StoreId);
                    if (store is null) continue;

                    totalBefore += TaskResolver.Resolve(store, templates, existingRuleInputs, date).Sum(r => r.Minutes);
                    totalAfter += TaskResolver.Resolve(store, templates, [.. existingRuleInputs, candidateRule], date).Sum(r => r.Minutes);
                }

                if (totalBefore <= DailyWorkMinutes && totalAfter > DailyWorkMinutes)
                {
                    daysOver450++;
                }
            }
        }

        return new RuleImpactDto(candidateStores.Count, visitsPerWeek, deltaMinutesPerWeek, daysOver450);
    }

    private static Guid? RouteIdByStore(Guid? conditionRouteId, Guid storeId) => conditionRouteId;

    private async Task<List<Evo.Infrastructure.Stores.Store>> FindMatchingStoresAsync(RuleConditionDto condition)
    {
        var query = _db.Stores.AsQueryable();
        if (condition.ChainId is { } chainId) query = query.Where(s => s.ChainId == chainId);
        if (condition.Format is { } format) query = query.Where(s => s.Format == format);
        if (condition.Province is { } province) query = query.Where(s => s.Province == province);
        if (condition.StoreId is { } storeId) query = query.Where(s => s.Id == storeId);
        if (condition.RouteId is { } routeId)
        {
            var storeIdsOnRoute = await _db.RouteStops
                .Where(rs => rs.RouteId == routeId && rs.EffectiveTo == null)
                .Select(rs => rs.StoreId)
                .ToListAsync();
            query = query.Where(s => storeIdsOnRoute.Contains(s.Id));
        }
        return await query.ToListAsync();
    }

    private async Task<IReadOnlyList<Guid>> FindAffectedRouteIdsAsync(RuleScopeLevel scope, RuleConditionDto condition)
    {
        if (scope == RuleScopeLevel.Route && condition.RouteId is { } directRouteId)
        {
            return [directRouteId];
        }

        var matchingStores = await FindMatchingStoresAsync(condition);
        var storeIds = matchingStores.Select(s => s.Id).ToHashSet();
        return await _db.RouteStops
            .Where(rs => rs.EffectiveTo == null && storeIds.Contains(rs.StoreId))
            .Select(rs => rs.RouteId)
            .Distinct()
            .ToListAsync();
    }

    private static TaskRuleInput MapRuleRow(Rule rule)
    {
        var condition = JsonSerializer.Deserialize<RuleConditionJson>(rule.ConditionJson)
            ?? new RuleConditionJson(null, null, null, null, null, null, null);
        var effect = JsonSerializer.Deserialize<RuleEffectJson>(rule.EffectJson)!;
        var match = new StoreConditionMatch(
            condition.ChainId, condition.Format, condition.Category, condition.Channel,
            condition.Province, condition.RouteId, condition.StoreId);
        return new TaskRuleInput(rule.Id, rule.TaskTemplateId, rule.Scope, match, effect.Op, effect.SetValue, effect.ScaleValue, rule.Priority, rule.EffectiveFrom, rule.EffectiveTo);
    }

    private static RuleDto ToDto(Rule rule)
    {
        var condition = JsonSerializer.Deserialize<RuleConditionJson>(rule.ConditionJson)
            ?? new RuleConditionJson(null, null, null, null, null, null, null);
        var effect = JsonSerializer.Deserialize<RuleEffectJson>(rule.EffectJson)!;
        return new RuleDto(
            rule.Id, rule.TaskTemplateId, rule.Scope,
            new RuleConditionDto(condition.ChainId, condition.Format, condition.Category, condition.Channel, condition.Province, condition.RouteId, condition.StoreId),
            new RuleEffectDto(effect.Op, effect.SetValue, effect.ScaleValue),
            rule.Priority, rule.EffectiveFrom, rule.EffectiveTo);
    }
}
