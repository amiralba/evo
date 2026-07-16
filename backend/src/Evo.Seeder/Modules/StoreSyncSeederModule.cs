using Evo.Infrastructure;
using Evo.Infrastructure.Stores.Sync;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Seeder.Modules;

/// <summary>
/// Seeds stores by triggering a REAL sync run through IStoreSyncService against
/// FakeStoreSyncSource (spec 004 Clarification #2) — never inserts store rows directly. Store
/// count comes from whichever FakeStoreSyncSource is registered for the current profile
/// (see Program.cs). Idempotent by construction: the service upserts against a deterministic
/// fake, so re-running updates the same rows.
/// </summary>
public class StoreSyncSeederModule : ISeederModule
{
    public string Name => "StoreSync";

    public async Task SeedAsync(EvoDbContext db, SeedProfile profile, Bogus.Faker faker, IServiceProvider services, CancellationToken ct)
    {
        var syncService = services.GetRequiredService<IStoreSyncService>();
        var summary = await syncService.RunAsync(ct);
        Console.WriteLine(
            $"Store sync: {summary.StoresCreated} created, {summary.StoresUpdated} updated, "
            + $"{summary.ChainsCreated} chains created, {summary.RevenueRowsUpserted} revenue rows, {summary.FlagsUpserted} flags.");
    }
}
