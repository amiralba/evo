namespace Evo.Infrastructure.Stores.Sync;

public record StoreSyncRunSummary(
    DateTimeOffset StartedAt,
    long DurationMs,
    int ChainsCreated,
    int StoresCreated,
    int StoresUpdated,
    int RevenueRowsUpserted,
    int FlagsUpserted);
