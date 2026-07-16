using Evo.Infrastructure.Stores.Sync;

namespace Evo.Api.Stores;

/// <summary>
/// Runs IStoreSyncService on a fixed interval (StoreSync:IntervalHours, default 24). Uses an
/// interval timer rather than a wall-clock cron time — see spec 004 Open questions: revisit for
/// a specific window (e.g. 03:00 after the upstream EVO batch) once the real source is wired.
/// </summary>
public class StoreSyncBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<StoreSyncBackgroundService> _logger;
    private readonly IConfiguration _configuration;

    public StoreSyncBackgroundService(IServiceScopeFactory scopeFactory, ILogger<StoreSyncBackgroundService> logger, IConfiguration configuration)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _configuration = configuration;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var intervalHours = _configuration.GetValue("StoreSync:IntervalHours", 24);
        var interval = TimeSpan.FromHours(intervalHours);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var syncService = scope.ServiceProvider.GetRequiredService<IStoreSyncService>();
                var summary = await syncService.RunAsync(stoppingToken);
                _logger.LogInformation(
                    "Nightly store sync completed: {StoresCreated} created, {StoresUpdated} updated, {DurationMs}ms",
                    summary.StoresCreated, summary.StoresUpdated, summary.DurationMs);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Nightly store sync run failed.");
            }

            await Task.Delay(interval, stoppingToken);
        }
    }
}
