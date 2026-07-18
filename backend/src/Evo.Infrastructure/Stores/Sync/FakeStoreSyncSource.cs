using Bogus;

namespace Evo.Infrastructure.Stores.Sync;

/// <summary>
/// Deterministic Turkish fake source for dev/seed/test — fixed seed means EvoStoreIds and their
/// generated data are stable across runs, so re-syncing updates the same rows (never duplicates).
/// </summary>
public class FakeStoreSyncSource : IStoreSyncSource
{
    private static readonly string[] Chains = { "Migros", "A101", "BİM", "ŞOK", "CarrefourSA" };

    /// <summary>Real district centers per province (approximate). Routes are neighborhood-scale in
    /// practice (a merchandiser's day covers a handful of nearby stores, not the whole city) — stores
    /// need to actually cluster by district for that to render sensibly on a real basemap. Previously
    /// every store got an independent uniform-random lat/lng across a bounding box spanning nearly
    /// all of Turkey (36–42°N, 26–44°E), decoupled from its Province/District text entirely.</summary>
    private static readonly (string Province, string District, double Lat, double Lng)[] Districts =
    {
        ("İstanbul", "Kadıköy", 40.9900, 29.0300),
        ("İstanbul", "Beşiktaş", 41.0430, 29.0090),
        ("İstanbul", "Şişli", 41.0600, 28.9870),
        ("İstanbul", "Üsküdar", 41.0230, 29.0150),
        ("İstanbul", "Bakırköy", 40.9800, 28.8720),
        ("Ankara", "Çankaya", 39.9180, 32.8540),
        ("Ankara", "Keçiören", 39.9900, 32.8620),
        ("Ankara", "Yenimahalle", 39.9700, 32.8000),
        ("Ankara", "Mamak", 39.9300, 32.9000),
        ("Ankara", "Etimesgut", 39.9500, 32.6800),
        ("İzmir", "Konak", 38.4200, 27.1300),
        ("İzmir", "Bornova", 38.4600, 27.2200),
        ("İzmir", "Karşıyaka", 38.4600, 27.1000),
        ("İzmir", "Buca", 38.3800, 27.1700),
        ("Bursa", "Osmangazi", 40.1800, 29.0600),
        ("Bursa", "Nilüfer", 40.2100, 29.0000),
        ("Bursa", "Yıldırım", 40.1900, 29.1000),
        ("Antalya", "Muratpaşa", 36.8850, 30.7050),
        ("Antalya", "Konyaaltı", 36.8700, 30.6300),
        ("Antalya", "Kepez", 36.9200, 30.7300),
    };

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
            var district = faker.PickRandom(Districts);

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

            // Jitter ~0.008° (~800m at these latitudes) around the district center — a route's stores
            // land walkable/short-drive distances apart, matching "1 to 3-4 stores, same neighborhood".
            var lat = district.Lat + faker.Random.Double(-0.008, 0.008);
            var lng = district.Lng + faker.Random.Double(-0.008, 0.008);

            records.Add(new StoreSyncRecord(
                EvoStoreId: evoStoreId,
                Name: $"{faker.Company.CompanyName()} {district.District}",
                ChainName: faker.PickRandom(Chains),
                Channel: faker.PickRandom("Perakende", "Bakkal", "Market"),
                Province: district.Province,
                District: district.District,
                Neighborhood: faker.Address.StreetName(),
                Latitude: lat,
                Longitude: lng,
                Category: (StoreCategory)faker.Random.Int(1, 3),
                Format: (byte)faker.Random.Int(1, 6),
                Revenue: revenue,
                Flags: flags));
        }

        return Task.FromResult<IReadOnlyList<StoreSyncRecord>>(records);
    }
}
