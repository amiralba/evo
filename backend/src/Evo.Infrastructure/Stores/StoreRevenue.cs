namespace Evo.Infrastructure.Stores;

/// <summary>Composite key (StoreId, Month). Only the most recent 12 months are retained (spec 004).</summary>
public class StoreRevenue
{
    public Guid StoreId { get; set; }
    public DateOnly Month { get; set; }
    public decimal Revenue { get; set; }
}
