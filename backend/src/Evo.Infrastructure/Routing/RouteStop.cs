using Evo.Domain.Scheduling;

namespace Evo.Infrastructure.Routing;

/// <summary>The store's dated membership in a route; <c>EffectiveTo IS NULL</c> = active membership (design §2.3).</summary>
public class RouteStop
{
    public Guid Id { get; set; }
    public Guid RouteId { get; set; }
    public Guid StoreId { get; set; }
    public Frequency Frequency { get; set; }
    public short WeekdayMask { get; set; }
    public DateOnly? BiweeklyAnchor { get; set; }
    public int? ServiceMinutes { get; set; }
    public int Sequence { get; set; }
    public TimeOnly? TimeWindowStart { get; set; }
    public TimeOnly? TimeWindowEnd { get; set; }
    public DateOnly EffectiveFrom { get; set; }
    public DateOnly? EffectiveTo { get; set; }
}
