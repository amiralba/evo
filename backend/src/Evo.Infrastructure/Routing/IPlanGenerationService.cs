namespace Evo.Infrastructure.Routing;

public interface IPlanGenerationService
{
    Task<int> RegenerateFutureAsync(Guid routeId, DateOnly from, DateOnly to, CancellationToken ct = default);

    /// <summary>Seeder-only (spec 009) — materializes past dates, bypassing the today-clamp.</summary>
    Task<int> MaterializeHistoryAsync(Guid routeId, DateOnly from, DateOnly to, CancellationToken ct = default);
}
