using Evo.Domain.Scheduling;
using Evo.Infrastructure.Routing;

namespace Evo.Api.Routing.Dtos;

public record PlanDayDto(DateOnly Date, IReadOnlyList<PlannedVisitDto> Visits, int PlannedMinutes, IReadOnlyList<FindingDto> Findings);

public record PlannedVisitDto(Guid StoreId, string StoreName, DateTimeOffset? Start, DateTimeOffset? End, PlannedVisitSource Source);

public record FindingDto(string Code, FindingSeverity Severity, string Message, string? Scope);

public record HealthDto(decimal SixMonthRevenue, decimal RevenueTarget, bool RevenueMet, IReadOnlyDictionary<string, int> MinutesByWeekday, IReadOnlyDictionary<string, int> CategoryMix, int ErrorCount, int WarningCount);
