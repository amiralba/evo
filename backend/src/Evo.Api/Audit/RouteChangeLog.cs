namespace Evo.Api.Audit;

public class RouteChangeLog : IRouteChangeLog
{
    private readonly IAuditWriter _auditWriter;

    public RouteChangeLog(IAuditWriter auditWriter)
    {
        _auditWriter = auditWriter;
    }

    public Task WriteAsync(Guid routeId, RouteChangeEvent evt, object? before, object? after, CancellationToken ct = default) =>
        _auditWriter.WriteAsync("Route", routeId.ToString(), evt.ToString(), before, after, ct: ct);
}
