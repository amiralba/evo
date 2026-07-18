using Evo.Domain.Scheduling;
using Evo.Infrastructure.Routing;

namespace Evo.Api.Routing.Dtos;

public record CreateRouteRequest(string Name, string Province, IReadOnlyList<string>? Districts, string? RouteCode, decimal? RevenueTarget);

public record RouteSummaryDto(
    Guid Id, string RouteCode, string Name, string Province, RouteStatus Status, int Version, int StopCount, decimal RevenueTarget,
    string? MerchandiserName, decimal SixMonthRevenue);

public record RouteStopDto(Guid Id, Guid StoreId, string StoreName, Frequency Frequency, short WeekdayMask, int? ServiceMinutes, int Sequence, DateOnly EffectiveFrom, DateOnly? EffectiveTo);

public record AssignmentDto(Guid MerchandiserId, string MerchandiserName, DateOnly StartDate, AssignmentReason Reason);

public record PatchDto(Guid Id, PatchType Type, Guid? StoreId, DateOnly StartsOn, DateOnly EndsOn, PatchStatus Status);

public record RouteDetailDto(
    Guid Id,
    string RouteCode,
    string Name,
    string Province,
    IReadOnlyList<string> Districts,
    RouteStatus Status,
    int Version,
    decimal RevenueTarget,
    int DailyWorkMinutes,
    IReadOnlyList<RouteStopDto> Stops,
    AssignmentDto? CurrentAssignment,
    IReadOnlyList<PatchDto> ActivePatches);

public record UpdateRouteRequest(string? Name, decimal? RevenueTarget, RouteStatus? Status);
