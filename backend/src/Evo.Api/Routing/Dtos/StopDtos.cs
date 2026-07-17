using Evo.Domain.Scheduling;

namespace Evo.Api.Routing.Dtos;

public record BulkAddStopsRequest(IReadOnlyList<Guid> StoreIds, Frequency Frequency, short WeekdayMask, int? ServiceMinutes);

public record BulkAddResultDto(IReadOnlyList<Guid> Added, IReadOnlyList<RejectedStoreDto> Rejected);

public record RejectedStoreDto(Guid StoreId, string Reason);

public record UpdateStopRequest(Frequency? Frequency, int? ServiceMinutes, int? Sequence);

public record MoveStopRequest(Guid TargetRouteId);
