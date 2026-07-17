namespace Evo.Api.Audit;

public enum RouteChangeEvent
{
    StopAdded,
    StopRemoved,
    StopMoved,
    FreqChanged,
    Assigned,
    Unassigned,
    Patched,
    Published,
}

/// <summary>Typed facade over the generic audit_log (IAuditWriter) — realizes the design's
/// route_change_log table as queries scoped to entityType "Route" (DECISIONS 2026-07-16).
/// No new table.</summary>
public interface IRouteChangeLog
{
    Task WriteAsync(Guid routeId, RouteChangeEvent evt, object? before, object? after, CancellationToken ct = default);
}
