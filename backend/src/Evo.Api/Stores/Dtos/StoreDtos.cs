using Evo.Infrastructure.Stores;

namespace Evo.Api.Stores.Dtos;

public record StoreSummaryDto(
    Guid Id,
    string EvoStoreId,
    string Name,
    string? ChainName,
    string Province,
    string District,
    byte Format,
    StoreCategory Category,
    bool Active,
    DateTimeOffset SyncedAt);

public record StoreRevenueDto(DateOnly Month, decimal Revenue);

public record StoreFlagDto(StoreFlagType Type, string? Reason, DateOnly StartsOn, DateOnly? EndsOn);

public record StoreGeoDto(
    Guid Id,
    string Name,
    string? ChainName,
    byte Format,
    StoreCategory Category,
    double Latitude,
    double Longitude,
    Guid? ActiveRouteId,
    string? ActiveRouteCode,
    decimal SixMonthRevenue);

public record StoreDetailDto(
    Guid Id,
    string EvoStoreId,
    string Name,
    string? ChainName,
    string? Channel,
    string Province,
    string District,
    string? Neighborhood,
    double? Latitude,
    double? Longitude,
    byte Format,
    StoreCategory Category,
    int? DefaultServiceMinutes,
    bool Active,
    DateTimeOffset SyncedAt,
    IReadOnlyList<StoreRevenueDto> Revenue,
    IReadOnlyList<StoreFlagDto> Flags);
