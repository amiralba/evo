using System.Text.Json;

namespace Evo.Domain.Scheduling;

/// <summary>Typed shapes for Patch.ParamsJson, keyed by PatchType. Parsing never throws — a
/// malformed/missing value is treated as "no params" so a bad row degrades to a no-op rather
/// than breaking plan generation.</summary>
public static class PatchParams
{
    private static readonly JsonSerializerOptions Options = new() { PropertyNameCaseInsensitive = true };

    public record TimeShiftParams(int StartMinutes);

    public record MoveVisitParams(DateOnly FromDate, DateOnly ToDate, int? StartMinutes);

    /// <summary>Spec 010 — StoreId/Minutes are frozen at Onarım-apply time (the visit's resolved
    /// minutes then) rather than re-resolved from the target route's stops, since the source store
    /// is not necessarily a stop on the target route.</summary>
    public record CrossReassignVisitParams(Guid SourceRouteId, Guid TargetRouteId, Guid PlannedVisitId, Guid TargetMerchandiserId, Guid StoreId, int Minutes);

    public static bool TryParse<T>(string? json, out T? value)
    {
        value = default;
        if (string.IsNullOrWhiteSpace(json))
        {
            return false;
        }

        try
        {
            value = JsonSerializer.Deserialize<T>(json, Options);
            return value is not null;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
