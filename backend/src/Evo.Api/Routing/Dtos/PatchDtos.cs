using Evo.Domain.Scheduling;

namespace Evo.Api.Routing.Dtos;

public record CreatePatchRequest(PatchType Type, Guid? StoreId, Guid? CoverMerchandiserId, DateOnly StartsOn, DateOnly? EndsOn, string? ParamsJson, string? Reason);
