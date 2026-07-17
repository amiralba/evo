using Evo.Domain.Scheduling;
using Evo.Infrastructure.Routing;

namespace Evo.Api.Routing.Dtos;

public record PlanDayDto(DateOnly Date, IReadOnlyList<PlannedVisitDto> Visits, int PlannedMinutes, IReadOnlyList<FindingDto> Findings);

public record LocationPointDto(double Lat, double Lng);

public record PlannedVisitDto(
    Guid RouteStopId, Guid StoreId, string StoreName, DateTimeOffset? Start, DateTimeOffset? End, PlannedVisitSource Source,
    PlannedVisitStatus Status, DateTimeOffset? CheckInAt, DateTimeOffset? CheckOutAt, int? ActualMinutes,
    VisitOutcomeReason? OutcomeReason, LocationPointDto? CheckInLocation);

public record FindingDto(string Code, FindingSeverity Severity, string Message, string? Scope);

public record HealthDto(decimal SixMonthRevenue, decimal RevenueTarget, bool RevenueMet, IReadOnlyDictionary<string, int> MinutesByWeekday, IReadOnlyDictionary<string, int> CategoryMix, int ErrorCount, int WarningCount);
