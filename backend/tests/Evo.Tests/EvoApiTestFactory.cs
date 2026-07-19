using Evo.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests;

/// <summary>
/// WebApplicationFactory-based API tests (StoreEndpointTests, RouteEndpointTests, AuthEndpointTests,
/// etc.) used to boot Program.cs against appsettings.Development.json's "EvoDb" connection string —
/// the SAME database the local dev backend server points at. Several of those tests wipe
/// Routes/RouteStops/Assignments/etc. for isolation, so running `dotnet test` locally was silently
/// erasing whatever the seeder had built for manual/panel testing (2026-07-17 incident). This factory
/// redirects "EvoDb" to a dedicated EvoDb_ApiTests database and migrates it once per test class,
/// mirroring how the already-isolated Routing tests (EvoDb_RoutingTests) avoid the dev DB.
/// </summary>
public class EvoApiTestFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string ConnectionString =
        "Server=localhost,1433;Database=EvoDb_ApiTests;User Id=sa;Password=Local_dev_only!1;TrustServerCertificate=True;";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:EvoDb"] = ConnectionString,
            });
        });
        // Pin the planning clock midweek (TestClock) so "today" is deterministic — the API's
        // PlanningClock resolves from this TimeProvider (see audit §B.3/§E.1).
        builder.ConfigureServices(services =>
        {
            services.AddSingleton<TimeProvider>(TestClock.Provider);
        });
    }

    // Each test class gets its own factory instance (xUnit IClassFixture is per-class), but they
    // all point at the same EvoDb_ApiTests database — migrating concurrently races CREATE DATABASE.
    private static readonly SemaphoreSlim MigrationLock = new(1, 1);

    public async Task InitializeAsync()
    {
        await MigrationLock.WaitAsync();
        try
        {
            using var scope = Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
            await db.Database.MigrateAsync();
        }
        finally
        {
            MigrationLock.Release();
        }
    }

    public new Task DisposeAsync() => Task.CompletedTask;
}
