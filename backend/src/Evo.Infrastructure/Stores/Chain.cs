namespace Evo.Infrastructure.Stores;

/// <summary>
/// Real chain lookup entity (spec 004 Clarification #9 — adjusted from the recommended
/// denormalized string column). Chain is foundational for chain-scoped Rules, map color-coding,
/// and chain filters (design §2.9/§6.1), so it's modeled as a real entity from the first store
/// row rather than a later string→FK migration. Upserted by sync (find-or-create by Name); no
/// chain-management feature owns it yet.
/// </summary>
public class Chain
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
}
