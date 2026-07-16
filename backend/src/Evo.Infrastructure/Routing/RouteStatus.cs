namespace Evo.Infrastructure.Routing;

/// <summary>Design §4 — no Archived/Deleted status; routes only activate/deactivate.</summary>
public enum RouteStatus : byte
{
    Draft = 1,
    Active = 2,
    Inactive = 3,
}
