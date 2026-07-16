using NetTopologySuite.Geometries;

namespace Evo.Infrastructure.Routing;

/// <summary>Identity = <see cref="RouteCode"/>; composition = <see cref="Version"/>; no delete (design §2.2).</summary>
public class Route
{
    public Guid Id { get; set; }
    public string RouteCode { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Province { get; set; } = string.Empty;
    public string? DistrictsJson { get; set; }
    public MultiPolygon? GeoScope { get; set; }
    public RouteStatus Status { get; set; } = RouteStatus.Draft;
    public int Version { get; set; } = 1;
    public decimal RevenueTarget { get; set; } = 1_250_000m;
    public int DailyWorkMinutes { get; set; } = 450;
    public Guid? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
