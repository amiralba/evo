namespace Evo.Domain.Tasks;

public record StoreAttributes(
    Guid StoreId,
    Guid? ChainId,
    byte Format,
    string Category,
    string? Channel,
    string Province,
    Guid? RouteId);
