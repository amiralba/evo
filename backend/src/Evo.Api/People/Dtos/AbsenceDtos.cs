using Evo.Infrastructure.People;

namespace Evo.Api.People.Dtos;

public record AbsenceDto(Guid Id, Guid MerchandiserId, DateOnly StartDate, DateOnly EndDate, AbsenceReason Reason, string? Note, DateTimeOffset CreatedAt);

public record CreateAbsenceRequest(DateOnly StartDate, DateOnly EndDate, AbsenceReason Reason, string? Note);
