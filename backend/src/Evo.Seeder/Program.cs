using Bogus;
using Evo.Infrastructure;
using Evo.Infrastructure.Identity;
using Evo.Infrastructure.Stores.Sync;
using Evo.Seeder;
using Evo.Seeder.Modules;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

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

var services = new ServiceCollection();
services.AddDbContext<EvoDbContext>(options => options.UseSqlServer(connectionString, x => x.UseNetTopologySuite()));
services.AddDataProtection();
services.AddLogging();
services.AddIdentityCore<ApplicationUser>()
    .AddRoles<IdentityRole<Guid>>()
    .AddEntityFrameworkStores<EvoDbContext>();
services.AddScoped<IStoreSyncService, StoreSyncService>();
services.AddSingleton<IStoreSyncSource>(new FakeStoreSyncSource(storeCount: profile == SeedProfile.Demo ? 15 : 400));

await using var provider = services.BuildServiceProvider();
await using var scope = provider.CreateAsyncScope();

var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
await db.Database.MigrateAsync();

if (wipe)
{
    Console.WriteLine("--wipe requested (no entities registered yet — nothing to wipe).");
}

// SeederModule plug-in interface (see ISeederModule.cs): future specs register their module
// here as they add tables. CLAUDE.md rule: every spec that adds tables extends this list.
var modules = new List<ISeederModule>
{
    new IdentitySeederModule(),
    new AuditLogSeederModule(),
    new StoreSyncSeederModule(),
};

var faker = new Faker("tr");

foreach (var module in modules)
{
    Console.WriteLine($"Seeding module: {module.Name} (profile={profile})");
    await module.SeedAsync(db, profile, faker, scope.ServiceProvider, CancellationToken.None);
}

Console.WriteLine($"{modules.Count} entities registered.");
return 0;

static string? GetArgValue(string[] args, string name)
{
    var index = Array.IndexOf(args, name);
    return index >= 0 && index + 1 < args.Length ? args[index + 1] : null;
}
