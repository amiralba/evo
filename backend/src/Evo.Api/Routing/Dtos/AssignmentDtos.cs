using Evo.Infrastructure.Routing;

namespace Evo.Api.Routing.Dtos;

public record ReassignRequest(Guid MerchandiserId, DateOnly StartDate, AssignmentReason Reason);
