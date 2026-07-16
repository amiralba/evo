namespace Evo.Api.Audit.Dtos;

public record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int Total);
