using Evo.Domain.Tasks;

namespace Evo.Infrastructure.Tasks;

public interface ITaskPlanProvider
{
    Task<IReadOnlyList<ResolvedTask>> ResolveAsync(StoreAttributes store, DateOnly date, CancellationToken ct = default);

    /// <summary>Batch resolve for many stores on one date — avoids re-querying templates/rules per store.</summary>
    Task<IReadOnlyDictionary<Guid, IReadOnlyList<ResolvedTask>>> ResolveForStoresAsync(
        IReadOnlyList<StoreAttributes> stores, DateOnly date, CancellationToken ct = default);
}
