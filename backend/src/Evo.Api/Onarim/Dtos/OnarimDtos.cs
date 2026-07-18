namespace Evo.Api.Onarim.Dtos;

public record DisruptionDto(Guid Id, string Kind, string Label, DateOnly Start, DateOnly End, int AffectedVisitCount);

public record CandidateDto(
    Guid MerchandiserId,
    string Name,
    Guid? RouteId,
    bool Available,
    int CapacityMinutesAfterMove,
    bool WithinCapacity,
    string RegionProximity,
    string Reasoning,
    int Rank);

public record AffectedVisitDto(
    Guid PlannedVisitId,
    Guid RouteId,
    string RouteCode,
    Guid StoreId,
    string StoreName,
    DateOnly Date,
    int StartMinutes,
    int PlannedMinutes,
    IReadOnlyList<CandidateDto> Candidates);

public enum OnarimAction : byte
{
    Skip = 1,
    MoveDay = 2,
    ReassignRoute = 3,
    ReassignPerson = 4,
}

public record OnarimDecisionDto(Guid PlannedVisitId, OnarimAction Action, DateOnly? TargetDate, Guid? TargetMerchandiserId, Guid? TargetRouteId);

public record ApplyOnarimRequest(string Reason, string Objective, IReadOnlyList<OnarimDecisionDto> Decisions);
