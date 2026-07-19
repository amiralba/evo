using Bogus;

namespace Evo.Infrastructure.Stores.Sync;

/// <summary>
/// Deterministic Turkish fake source for dev/seed/test — fixed seed means EvoStoreIds and their
/// generated data are stable across runs, so re-syncing updates the same rows (never duplicates).
/// </summary>
public class FakeStoreSyncSource : IStoreSyncSource
{
    private static readonly string[] Chains = { "Migros", "A101", "BİM", "ŞOK", "CarrefourSA" };

    /// <summary>Curated to the three cities we operate in (İstanbul, İzmir, Ankara), each with real
    /// district centers. Routes are built in the panel, not seeded, so the seeder only needs to hand
    /// the planner a small, correctly-located set of stores to pick from. Stores jitter ~800m around a
    /// district center so a route's stops render as nearby pins on the real basemap.</summary>
    private static readonly (string Province, (string District, double Lat, double Lng)[] Districts)[] Cities =
    {
        ("İstanbul", new[]
        {
            ("Kadıköy", 40.9900, 29.0300), ("Beşiktaş", 41.0430, 29.0090), ("Şişli", 41.0600, 28.9870),
            ("Üsküdar", 41.0230, 29.0150), ("Bakırköy", 40.9800, 28.8720),
        }),
        ("Ankara", new[]
        {
            ("Çankaya", 39.9180, 32.8540), ("Keçiören", 39.9900, 32.8620), ("Yenimahalle", 39.9700, 32.8000),
            ("Mamak", 39.9300, 32.9000), ("Etimesgut", 39.9500, 32.6800),
        }),
        ("İzmir", new[]
        {
            ("Konak", 38.4200, 27.1300), ("Bornova", 38.4600, 27.2200), ("Karşıyaka", 38.4600, 27.1000),
            ("Buca", 38.3800, 27.1700),
        }),
    };

    // null = curated demo (4–6 stores per city, round-robining each city's districts);
    // a number = exactly that many stores, round-robining across ALL cities' districts
    // (used by the scale profile and by StoreSyncServiceTests, which need a deterministic count).
    private readonly int? _storeCount;

    public FakeStoreSyncSource(int? storeCount = null)
    {
        _storeCount = storeCount;
    }

    public Task<IReadOnlyList<StoreSyncRecord>> FetchAsync(CancellationToken ct = default)
    {
        var faker = new Faker("tr") { Random = new Randomizer(12345) };
        var records = new List<StoreSyncRecord>();
        var i = 0;

        StoreSyncRecord Build(string province, (string District, double Lat, double Lng) district)
        {
            i++;
            var revenue = new List<StoreSyncRevenueRecord>();
            var monthsBack = faker.Random.Int(6, 12);
            var firstOfThisMonth = new DateOnly(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1);
            for (var m = 0; m < monthsBack; m++)
            {
                revenue.Add(new StoreSyncRevenueRecord(firstOfThisMonth.AddMonths(-m), faker.Random.Decimal(50_000, 500_000)));
            }

            // Jitter ~0.008° (~800m) around the district center.
            var lat = district.Lat + faker.Random.Double(-0.008, 0.008);
            var lng = district.Lng + faker.Random.Double(-0.008, 0.008);

            return new StoreSyncRecord(
                EvoStoreId: $"EVO-{i:D5}",
                Name: $"{faker.Company.CompanyName()} {district.District}",
                ChainName: faker.PickRandom(Chains),
                Channel: faker.PickRandom("Perakende", "Bakkal", "Market"),
                Province: province,
                District: district.District,
                Neighborhood: faker.Address.StreetName(),
                Latitude: lat,
                Longitude: lng,
                Category: (StoreCategory)faker.Random.Int(1, 3),
                Format: (byte)faker.Random.Int(1, 6),
                Revenue: revenue,
                Flags: new List<StoreSyncFlagRecord>());
        }

        if (_storeCount is { } total)
        {
            // Deterministic exact-count mode: round-robin across every city's districts.
            var flat = Cities.SelectMany(c => c.Districts.Select(d => (c.Province, District: d))).ToList();
            for (var n = 0; n < total; n++)
            {
                var (province, district) = flat[n % flat.Count];
                records.Add(Build(province, district));
            }
        }
        else
        {
            // Curated demo: 4–6 stores per city.
            foreach (var (province, districts) in Cities)
            {
                var count = faker.Random.Int(4, 6);
                for (var n = 0; n < count; n++)
                {
                    records.Add(Build(province, districts[n % districts.Length]));
                }
            }
        }

        return Task.FromResult<IReadOnlyList<StoreSyncRecord>>(records);
    }
}
