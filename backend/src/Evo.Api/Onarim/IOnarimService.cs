using Evo.Api.Onarim.Dtos;

namespace Evo.Api.Onarim;

public interface IOnarimService
{
    Task<IReadOnlyList<DisruptionDto>> GetDisruptionsAsync(string? region, CancellationToken ct = default);

    Task<IReadOnlyList<AffectedVisitDto>> GetAffectedWithCandidatesAsync(Guid disruptionId, CancellationToken ct = default);

    Task<Guid> ApplyAsync(Guid disruptionId, ApplyOnarimRequest request, Guid? actorId, CancellationToken ct = default);
}
