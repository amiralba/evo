namespace Evo.Infrastructure.Routing;

/// <summary>Composite key (Key, RegionId); RegionId is non-nullable with an empty-string ("")
/// sentinel meaning global — a non-empty RegionId is a region override (EF config in Task 13).</summary>
public class Setting
{
    public string Key { get; set; } = string.Empty;
    public string RegionId { get; set; } = string.Empty;
    public string ValueJson { get; set; } = string.Empty;
}
