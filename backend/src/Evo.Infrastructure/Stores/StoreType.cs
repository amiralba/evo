namespace Evo.Infrastructure.Stores;

/// <summary>
/// Fixed format taxonomy (Jet/M/MM/3M/4M/5M), migration-seeded — not admin-editable
/// (spec 004 Clarification #4). Drives task-resolution duration rules in M2, not consumed in 004.
/// </summary>
public class StoreType
{
    public byte Code { get; set; }
    public string Label { get; set; } = string.Empty;
}
