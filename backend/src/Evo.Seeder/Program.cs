using Bogus;
using Evo.Infrastructure;
using Evo.Infrastructure.Identity;
using Evo.Infrastructure.Routing;
using Evo.Infrastructure.Stores.Sync;
using Evo.Infrastructure.Tasks;
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

// --wipe was removed (audit C3, decision D3b): it was always a no-op, and a real wipe would
// delete the stores/merchandisers that panel-built routes reference. Reset by dropping the DB.
if (args.Contains("--wipe"))
{
    Console.Error.WriteLine("--wipe has been removed. To reset, drop the database and re-run (migrations + seed recreate everything).");
    return 1;
}

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
services.AddSingleton<IStoreSyncSource>(new FakeStoreSyncSource(storeCount: profile == SeedProfile.Demo ? null : 400));
services.AddScoped<ISettingsProvider, SettingsProvider>();
services.AddScoped<ITaskPlanProvider, TaskPlanProvider>();
services.AddScoped<IPlanGenerationService, PlanGenerationService>();

await using var provider = services.BuildServiceProvider();
await using var scope = provider.CreateAsyncScope();

var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
await db.Database.MigrateAsync();

// SeederModule plug-in interface (see ISeederModule.cs): future specs register their module
// here as they add tables. CLAUDE.md rule: every spec that adds tables extends this list.
// Routes (and their materialized plan / field-execution / absences) are the planner's work product,
// built in the panel — the seeder only supplies stores, people (merchandisers) and task templates
// (decision D3b, 2026-07-19: the never-registered Route/FieldExecution/Absence modules were deleted).
var modules = new List<ISeederModule>
{
    new IdentitySeederModule(),
    new AuditLogSeederModule(),
    new StoreSyncSeederModule(),
    new MerchandiserSeederModule(),
    new TaskRuleSeederModule(),
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
