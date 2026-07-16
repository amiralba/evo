namespace Evo.Api.Audit;

/// <summary>Append-only by design — intentionally no update/delete member on this interface.</summary>
public interface IAuditWriter
{
    Task WriteAsync(
        string entityType,
        string entityKey,
        string @event,
        object? before = null,
        object? after = null,
        Guid? actorId = null,
        CancellationToken ct = default);
}
