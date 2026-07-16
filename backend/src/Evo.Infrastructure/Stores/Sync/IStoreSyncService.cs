namespace Evo.Infrastructure.Stores.Sync;

public interface IStoreSyncService
{
    Task<StoreSyncRunSummary> RunAsync(CancellationToken ct = default);
}
