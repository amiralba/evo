namespace Evo.Api.Analytics.Dtos;

public record RoutePlanHealthDto(
    Guid RouteId, string RouteCode, string RouteName, string Province,
    double CompletionPct, int PlannedMinutes, int RealizedMinutes, double DurationVariancePct,
    double UtilizationPct, string UtilizationBand, double TaskCompliancePct,
    IReadOnlyDictionary<string, int> PatchLoad, double StabilityScore, int AssignmentTurnover,
    double OverrideRatePct, double PlanHealthScore);

public record PlanHealthReportDto(string? Region, DateOnly From, DateOnly To, IReadOnlyList<RoutePlanHealthDto> Routes);

public record RouteStabilityDto(Guid RouteId, string RouteCode, double StabilityScore);

public record StoreEvidenceDto(Guid StoreId, string StoreName, int Planned, int Done, int Missed, int Skipped, double DurationVariancePct);

public record RouteEvidenceDto(Guid RouteId, int Weeks, IReadOnlyList<StoreEvidenceDto> Stores, bool CausalityDisclaimer);
