namespace Evo.Infrastructure.Routing;

public interface IPlanGenerationService
{
    Task<int> RegenerateFutureAsync(Guid routeId, DateOnly from, DateOnly to, CancellationToken ct = default);
}
