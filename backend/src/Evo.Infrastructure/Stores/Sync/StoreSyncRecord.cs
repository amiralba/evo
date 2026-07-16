namespace Evo.Infrastructure.Stores.Sync;

public record StoreSyncRevenueRecord(DateOnly Month, decimal Revenue);

public record StoreSyncFlagRecord(StoreFlagType Type, string? Reason, DateOnly StartsOn, DateOnly? EndsOn);

/// <summary>
/// Source-shaped input from IStoreSyncSource — decoupled from the Store entity. Latitude/Longitude
/// are plain doubles here; StoreSyncService builds the geography Point.
/// </summary>
public record StoreSyncRecord(
    string EvoStoreId,
    string Name,
    string? ChainName,
    string? Channel,
    string Province,
    string District,
    string? Neighborhood,
    double Latitude,
    double Longitude,
    StoreCategory Category,
    byte Format,
    IReadOnlyList<StoreSyncRevenueRecord> Revenue,
    IReadOnlyList<StoreSyncFlagRecord> Flags);
