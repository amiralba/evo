using NetTopologySuite.Geometries;

namespace Evo.Infrastructure.Stores;

public class Store
{
    public Guid Id { get; set; }
    public string EvoStoreId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public Guid? ChainId { get; set; }
    public string? Channel { get; set; }
    public string Province { get; set; } = string.Empty;
    public string District { get; set; } = string.Empty;
    public string? Neighborhood { get; set; }
    public Point? Location { get; set; }
    public StoreCategory Category { get; set; }
    public byte Format { get; set; }

    /// <summary>Planner-owned — never overwritten by sync (spec 004 Clarification #8).</summary>
    public int? DefaultServiceMinutes { get; set; }

    /// <summary>Operational toggle, planner-owned — never overwritten by sync (spec 004 Clarification #8).</summary>
    public bool Active { get; set; } = true;

    public string? AttributesJson { get; set; }
    public DateTimeOffset SyncedAt { get; set; }
}
