using System.Text.Json;
using Evo.Domain.Tasks;
using Evo.Infrastructure;
using Evo.Infrastructure.Routing;
using Evo.Infrastructure.Stores;
using Evo.Infrastructure.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Rule = Evo.Infrastructure.Tasks.Rule;

namespace Evo.Seeder.Modules;

/// <summary>
/// Seeds a realistic TaskTemplate catalog + Rule ladder (format scale, store/route exceptions,
/// a dated rule, an exclude rule) plus one ONCE adhoc survey — replaces the flat
/// service_minutes fallback with the real Rule-resolution engine (design §2.9/§2.10). Routes
/// are not seeded (they're the planner's work product), so store-scoped rules attach to seeded
/// stores and any route-scoped behavior only appears once the panel creates routes; re-triggers
/// RegenerateFutureAsync so TaskInstance rows materialize immediately (idempotent by
/// TaskTemplate.Code).
/// </summary>
public class TaskRuleSeederModule : ISeederModule
{
    public string Name => "TaskRule";

    private const byte FormatJet = 1;
    private const byte FormatM = 2;
    private const byte FormatMM = 3;
    private const byte Format3M = 4;
    private const byte Format4M = 5;
    private const byte Format5M = 6;

    public async Task SeedAsync(EvoDbContext db, SeedProfile profile, Bogus.Faker faker, IServiceProvider services, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var templates = new (string Code, string Name, int Minutes, TaskRecurrence Recurrence)[]
        {
            ("BEFORE_PHOTO", "Öncesi Fotoğraf", 5, TaskRecurrence.EveryVisit),
            ("SHELF_WORK", "Raf Düzeni", 20, TaskRecurrence.EveryVisit),
            ("SKT_CHECK", "SKT Kontrolü", 10, TaskRecurrence.EveryVisit),
            ("PRICE_COLLECT", "Fiyat Toplama", 15, TaskRecurrence.EveryVisit),
            ("DISPLAY_CHECK", "Teşhir Kontrolü", 8, TaskRecurrence.Weekly),
            ("SURVEY", "Anket", 12, TaskRecurrence.Weekly),
        };

        var templateIdByCode = new Dictionary<string, Guid>();
        var templatesCreated = 0;
        foreach (var (code, name, minutes, recurrence) in templates)
        {
            var existing = await db.TaskTemplates.FirstOrDefaultAsync(t => t.Code == code, ct);
            if (existing is not null)
            {
                templateIdByCode[code] = existing.Id;
                continue;
            }

            var template = new TaskTemplate
            {
                Id = Guid.NewGuid(),
                Code = code,
                Name = name,
                DefaultMinutes = minutes,
                Recurrence = recurrence,
                ProofRequired = code == "BEFORE_PHOTO" ? ProofRequired.Photo : ProofRequired.None,
                Active = true,
            };
            db.TaskTemplates.Add(template);
            templateIdByCode[code] = template.Id;
            templatesCreated++;
        }
        await db.SaveChangesAsync(ct);
        Console.WriteLine($"TaskRule: {templatesCreated} task templates created ({templateIdByCode.Count} total).");

        var rulesCreated = 0;

        rulesCreated += await EnsureRuleAsync(db, templateIdByCode["SHELF_WORK"], RuleScopeLevel.Format,
            new RuleConditionJson(null, FormatMM, null, null, null, null, null),
            new RuleEffectJson(TaskEffectOp.ScaleMinutes, null, 1.3m), priority: 0, effectiveFrom: today, effectiveTo: null, ct);

        rulesCreated += await EnsureRuleAsync(db, templateIdByCode["SHELF_WORK"], RuleScopeLevel.Format,
            new RuleConditionJson(null, Format4M, null, null, null, null, null),
            new RuleEffectJson(TaskEffectOp.ScaleMinutes, null, 1.6m), priority: 0, effectiveFrom: today, effectiveTo: null, ct);

        rulesCreated += await EnsureRuleAsync(db, templateIdByCode["SHELF_WORK"], RuleScopeLevel.Format,
            new RuleConditionJson(null, Format5M, null, null, null, null, null),
            new RuleEffectJson(TaskEffectOp.ScaleMinutes, null, 2.0m), priority: 0, effectiveFrom: today, effectiveTo: null, ct);

        var seededStoreIds = await db.RouteStops.Where(rs => rs.EffectiveTo == null)
            .Select(rs => rs.StoreId).Distinct().Take(2).ToListAsync(ct);
        if (seededStoreIds.Count > 0)
        {
            rulesCreated += await EnsureRuleAsync(db, templateIdByCode["SHELF_WORK"], RuleScopeLevel.Store,
                new RuleConditionJson(null, null, null, null, null, null, seededStoreIds[0]),
                new RuleEffectJson(TaskEffectOp.SetMinutes, 45, null), priority: 0, effectiveFrom: today, effectiveTo: null, ct);
        }
        if (seededStoreIds.Count > 1)
        {
            rulesCreated += await EnsureRuleAsync(db, templateIdByCode["PRICE_COLLECT"], RuleScopeLevel.Store,
                new RuleConditionJson(null, null, null, null, null, null, seededStoreIds[1]),
                new RuleEffectJson(TaskEffectOp.SetMinutes, 25, null), priority: 0, effectiveFrom: today, effectiveTo: null, ct);
        }

        var seededRouteId = await db.RouteStops.Where(rs => rs.EffectiveTo == null).Select(rs => rs.RouteId).Distinct().FirstOrDefaultAsync(ct);
        if (seededRouteId != Guid.Empty)
        {
            rulesCreated += await EnsureRuleAsync(db, templateIdByCode["SKT_CHECK"], RuleScopeLevel.Route,
                new RuleConditionJson(null, null, null, null, null, seededRouteId, null),
                new RuleEffectJson(TaskEffectOp.ScaleMinutes, null, 1.5m), priority: 0, effectiveFrom: today, effectiveTo: null, ct);
        }

        rulesCreated += await EnsureRuleAsync(db, templateIdByCode["SHELF_WORK"], RuleScopeLevel.Format,
            new RuleConditionJson(null, FormatM, null, null, null, null, null),
            new RuleEffectJson(TaskEffectOp.SetMinutes, 60, null),
            priority: 10, effectiveFrom: today, effectiveTo: today.AddDays(7), ct);

        rulesCreated += await EnsureRuleAsync(db, templateIdByCode["DISPLAY_CHECK"], RuleScopeLevel.Format,
            new RuleConditionJson(null, FormatJet, null, null, null, null, null),
            new RuleEffectJson(TaskEffectOp.ExcludeTask, null, null), priority: 0, effectiveFrom: today, effectiveTo: null, ct);

        await db.SaveChangesAsync(ct);
        Console.WriteLine($"TaskRule: {rulesCreated} rules created.");

        var migrosChainId = await db.Chains.Where(c => c.Name == "Migros").Select(c => c.Id).FirstOrDefaultAsync(ct);
        var adhocDeadline = today.AddDays(10);
        var adhocCreated = false;
        var existingAdhoc = await db.TaskTemplates.FirstOrDefaultAsync(t => t.Code == "SEED-ADHOC-SALCA-SURVEY", ct);
        if (existingAdhoc is null && migrosChainId != Guid.Empty)
        {
            db.TaskTemplates.Add(new TaskTemplate
            {
                Id = Guid.NewGuid(),
                Code = "SEED-ADHOC-SALCA-SURVEY",
                Name = "Salça Anketi",
                DefaultMinutes = 10,
                Recurrence = TaskRecurrence.Once,
                ProofRequired = ProofRequired.Form,
                TargetChain = migrosChainId,
                TargetFormat = FormatMM,
                ValidUntil = adhocDeadline,
                Active = true,
            });
            adhocCreated = true;
            await db.SaveChangesAsync(ct);
        }
        Console.WriteLine(adhocCreated
            ? $"TaskRule: adhoc survey seeded (Migros MM, deadline {adhocDeadline:yyyy-MM-dd})."
            : "TaskRule: adhoc survey already present or no Migros chain synced — skipped.");

        var planGenerationService = services.GetRequiredService<IPlanGenerationService>();
        var settingsProvider = services.GetRequiredService<ISettingsProvider>();
        var routeIds = await db.RouteStops.Where(rs => rs.EffectiveTo == null).Select(rs => rs.RouteId).Distinct().ToListAsync(ct);
        var totalVisits = 0;
        foreach (var routeId in routeIds)
        {
            var route = await db.Routes.FirstAsync(r => r.Id == routeId, ct);
            var settings = await settingsProvider.GetAsync(route.Province, ct);
            totalVisits += await planGenerationService.RegenerateFutureAsync(routeId, today, today.AddDays(settings.PlanHorizonWeeks * 7), ct);
        }
        Console.WriteLine($"TaskRule: {totalVisits} planned visits re-resolved with task minutes.");
    }

    private static async Task<int> EnsureRuleAsync(
        EvoDbContext db, Guid taskTemplateId, RuleScopeLevel scope,
        RuleConditionJson condition, RuleEffectJson effect, int priority, DateOnly effectiveFrom, DateOnly? effectiveTo, CancellationToken ct)
    {
        var conditionJson = JsonSerializer.Serialize(condition);
        var effectJson = JsonSerializer.Serialize(effect);
        var exists = await db.Rules.AnyAsync(r =>
            r.TaskTemplateId == taskTemplateId && r.Scope == scope && r.ConditionJson == conditionJson && r.EffectJson == effectJson, ct);
        if (exists)
        {
            return 0;
        }

        db.Rules.Add(new Rule
        {
            Id = Guid.NewGuid(),
            TaskTemplateId = taskTemplateId,
            Scope = scope,
            ConditionJson = conditionJson,
            EffectJson = effectJson,
            Priority = priority,
            EffectiveFrom = effectiveFrom,
            EffectiveTo = effectiveTo,
            CreatedAt = DateTimeOffset.UtcNow,
        });
        return 1;
    }
}
