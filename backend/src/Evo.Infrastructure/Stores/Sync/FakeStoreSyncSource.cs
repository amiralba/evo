using Bogus;

namespace Evo.Infrastructure.Stores.Sync;

/// <summary>
/// Deterministic Turkish fake source for dev/seed/test — fixed seed means EvoStoreIds and their
/// generated data are stable across runs, so re-syncing updates the same rows (never duplicates).
/// </summary>
public class FakeStoreSyncSource : IStoreSyncSource
{
    private static readonly string[] Chains = { "Migros", "A101", "BİM", "ŞOK", "CarrefourSA" };
    private static readonly string[] Provinces = { "İstanbul", "Ankara", "İzmir", "Bursa", "Antalya" };

    private readonly int _storeCount;

    public FakeStoreSyncSource(int storeCount)
    {
        _storeCount = storeCount;
    }

    public Task<IReadOnlyList<StoreSyncRecord>> FetchAsync(CancellationToken ct = default)
    {
        var faker = new Faker("tr") { Random = new Randomizer(12345) };
        var records = new List<StoreSyncRecord>(_storeCount);

        for (var i = 1; i <= _storeCount; i++)
        {
            var evoStoreId = $"EVO-{i:D5}";
            var province = faker.PickRandom(Provinces);

            var revenue = new List<StoreSyncRevenueRecord>();
            var monthsBack = faker.Random.Int(6, 12);
            var firstOfThisMonth = new DateOnly(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1);
            for (var m = 0; m < monthsBack; m++)
            {
                revenue.Add(new StoreSyncRevenueRecord(firstOfThisMonth.AddMonths(-m), faker.Random.Decimal(50_000, 500_000)));
            }

            var flags = new List<StoreSyncFlagRecord>();
            if (i % 17 == 0)
            {
                flags.Add(new StoreSyncFlagRecord(StoreFlagType.Banned, "Kapsam dışı bölge", DateOnly.FromDateTime(DateTime.UtcNow), null));
            }

            records.Add(new StoreSyncRecord(
                EvoStoreId: evoStoreId,
                Name: $"{faker.Company.CompanyName()} {province}",
                ChainName: faker.PickRandom(Chains),
                Channel: faker.PickRandom("Perakende", "Bakkal", "Market"),
                Province: province,
                District: faker.Address.County(),
                Neighborhood: faker.Address.StreetName(),
                Latitude: faker.Address.Latitude(36.0, 42.0),
                Longitude: faker.Address.Longitude(26.0, 44.0),
                Category: (StoreCategory)faker.Random.Int(1, 3),
                Format: (byte)faker.Random.Int(1, 6),
                Revenue: revenue,
                Flags: flags));
        }

        return Task.FromResult<IReadOnlyList<StoreSyncRecord>>(records);
    }
}
