using Evo.Infrastructure;

namespace Evo.Seeder;

/// <summary>
/// Plug-in point for module specs. CLAUDE.md rule: "every spec that adds tables must extend
/// the seeder in the same spec" — implement this per module and register it in Program.cs.
/// </summary>
public interface ISeederModule
{
    string Name { get; }

    Task SeedAsync(EvoDbContext db, SeedProfile profile, Bogus.Faker faker, CancellationToken ct);
}

public enum SeedProfile
{
    Demo,
    Scale,
}
