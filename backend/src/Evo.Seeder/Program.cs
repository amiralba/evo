using Bogus;
using Evo.Infrastructure;
using Evo.Seeder;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

var config = new ConfigurationBuilder()
    .SetBasePath(AppContext.BaseDirectory)
    .AddJsonFile("appsettings.json", optional: true)
    .AddEnvironmentVariables()
    .Build();

var profileArg = GetArgValue(args, "--profile") ?? "demo";
var wipe = args.Contains("--wipe");

if (!Enum.TryParse<SeedProfile>(profileArg, ignoreCase: true, out var profile))
{
    Console.Error.WriteLine($"Unknown --profile '{profileArg}'. Expected 'demo' or 'scale'.");
    return 1;
}

var connectionString = config.GetConnectionString("EvoDb")
    ?? "Server=localhost,1433;Database=EvoDb;User Id=sa;Password=Local_dev_only!1;TrustServerCertificate=True;";

var options = new DbContextOptionsBuilder<EvoDbContext>()
    .UseSqlServer(connectionString)
    .Options;

using var db = new EvoDbContext(options);
await db.Database.EnsureCreatedAsync();

if (wipe)
{
    Console.WriteLine("--wipe requested (no entities registered yet — nothing to wipe).");
}

// SeederModule plug-in interface (see ISeederModule.cs): future specs register their module
// here as they add tables. CLAUDE.md rule: every spec that adds tables extends this list.
var modules = new List<ISeederModule>();

var faker = new Faker("tr");

foreach (var module in modules)
{
    Console.WriteLine($"Seeding module: {module.Name} (profile={profile})");
    await module.SeedAsync(db, profile, faker, CancellationToken.None);
}

Console.WriteLine($"{modules.Count} entities registered.");
return 0;

static string? GetArgValue(string[] args, string name)
{
    var index = Array.IndexOf(args, name);
    return index >= 0 && index + 1 < args.Length ? args[index + 1] : null;
}
