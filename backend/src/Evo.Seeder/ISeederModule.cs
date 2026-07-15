using Evo.Infrastructure;

namespace Evo.Seeder;

/// <summary>
/// Plug-in point for module specs. CLAUDE.md rule: "every spec that adds tables must extend
/// the seeder in the same spec" — implement this per module and register it in Program.cs.
/// </summary>
public interface ISeederModule
{
    string Name { get; }

    /// <param name="services">
    /// Scoped DI container (Identity's UserManager/RoleManager and any future module
    /// dependencies are resolved from here rather than constructed by hand).
    /// </param>
    Task SeedAsync(EvoDbContext db, SeedProfile profile, Bogus.Faker faker, IServiceProvider services, CancellationToken ct);
}

public enum SeedProfile
{
    Demo,
    Scale,
}
