using Evo.Domain.Scheduling;

namespace Evo.Infrastructure.Routing;

/// <summary>Never mutates baseline; applied at generation time; auto-reverts past <see cref="EndsOn"/> (design §2.5).</summary>
public class Patch
{
    public Guid Id { get; set; }
    public Guid RouteId { get; set; }
    public PatchType Type { get; set; }
    public Guid? StoreId { get; set; }
    public Guid? CoverMerchandiserId { get; set; }
    public DateOnly StartsOn { get; set; }
    public DateOnly EndsOn { get; set; }
    public string? ParamsJson { get; set; }
    public PatchStatus Status { get; set; } = PatchStatus.Pending;
    public string? Reason { get; set; }
    public Guid? CreatedBy { get; set; }
}
