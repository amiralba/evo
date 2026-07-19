using Evo.Infrastructure;
using Evo.Infrastructure.Routing;
using Microsoft.EntityFrameworkCore;

namespace Evo.Api.Routing;

/// <summary>Nightly cycle (Routing:HorizonIntervalHours, default 24): advances patch statuses
/// (Pending→Active, Active→Expired), then regenerates the planned-visit horizon for every
/// ACTIVE route. A failed cycle is logged, never crashes the host.</summary>
public class PlanHorizonBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PlanHorizonBackgroundService> _logger;
    private readonly IConfiguration _configuration;

    public PlanHorizonBackgroundService(IServiceScopeFactory scopeFactory, ILogger<PlanHorizonBackgroundService> logger, IConfiguration configuration)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _configuration = configuration;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var intervalHours = _configuration.GetValue("Routing:HorizonIntervalHours", 24);
        var interval = TimeSpan.FromHours(intervalHours);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
                var settingsProvider = scope.ServiceProvider.GetRequiredService<ISettingsProvider>();
                var planGenerationService = scope.ServiceProvider.GetRequiredService<IPlanGenerationService>();
                var clock = scope.ServiceProvider.GetRequiredService<Evo.Infrastructure.Time.PlanningClock>();

                var today = clock.Today;

                var patches = await db.Patches.Where(p => p.Status == PatchStatus.Pending || p.Status == PatchStatus.Active).ToListAsync(stoppingToken);
                var advancedCount = 0;
                foreach (var patch in patches)
                {
                    var next = PatchStatusAdvancer.NextStatus(patch.Status, patch.StartsOn, patch.EndsOn, today);
                    if (next != patch.Status)
                    {
                        patch.Status = next;
                        advancedCount++;
                    }
                }
                if (advancedCount > 0)
                {
                    await db.SaveChangesAsync(stoppingToken);
                }

                var activeRoutes = await db.Routes.Where(r => r.Status == RouteStatus.Active).ToListAsync(stoppingToken);
                var totalVisits = 0;
                foreach (var route in activeRoutes)
                {
                    var settings = await settingsProvider.GetAsync(route.Province, stoppingToken);
                    var horizonEnd = today.AddDays(settings.PlanHorizonWeeks * 7);
                    totalVisits += await planGenerationService.RegenerateFutureAsync(route.Id, today, horizonEnd, stoppingToken);
                }

                _logger.LogInformation(
                    "Plan horizon cycle completed: {AdvancedPatches} patches advanced, {RouteCount} active routes regenerated, {VisitCount} visits materialized.",
                    advancedCount, activeRoutes.Count, totalVisits);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Plan horizon cycle failed.");
            }

            await Task.Delay(interval, stoppingToken);
        }
    }
}
