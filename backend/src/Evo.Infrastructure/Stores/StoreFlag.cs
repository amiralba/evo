namespace Evo.Infrastructure.Stores;

/// <summary>Replace-managed by sync each run; no consuming logic in 004 (visit-blocking is M1).</summary>
public class StoreFlag
{
    public Guid Id { get; set; }
    public Guid StoreId { get; set; }
    public StoreFlagType Type { get; set; }
    public string? Reason { get; set; }
    public DateOnly StartsOn { get; set; }
    public DateOnly? EndsOn { get; set; }
    public string? CreatedBy { get; set; }
}
