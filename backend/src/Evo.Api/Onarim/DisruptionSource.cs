using Evo.Infrastructure;
using Evo.Infrastructure.People;
using Evo.Infrastructure.Stores;
using Microsoft.EntityFrameworkCore;

namespace Evo.Api.Onarim;

public enum DisruptionKind
{
    Absence,
    StoreClosure,
}

/// <summary>Uniform view over the two disruption sources Onarım repairs (design §7.3b): an Absence
/// row, or a StoreFlag ClosedTemp window. Both endpoints resolve a disruption id through here so
/// there is one place that knows how to turn either row into an affected merchandiser/store + window.</summary>
public record Disruption(Guid Id, DisruptionKind Kind, string Label, DateOnly Start, DateOnly End, Guid? MerchandiserId, Guid? StoreId);

public class DisruptionSource
{
    private readonly EvoDbContext _db;

    public DisruptionSource(EvoDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<Disruption>> GetActiveOrFutureAsync(DateOnly today, CancellationToken ct = default)
    {
        var absences = await _db.Absences
            .Where(a => a.EndDate >= today)
            .ToListAsync(ct);
        var closures = await _db.StoreFlags
            .Where(f => f.Type == StoreFlagType.ClosedTemp && (f.EndsOn == null || f.EndsOn >= today))
            .ToListAsync(ct);

        var merchandiserIds = absences.Select(a => a.MerchandiserId).Distinct().ToList();
        var storeIds = closures.Select(f => f.StoreId).Distinct().ToList();
        var merchandiserNames = await _db.Merchandisers
            .Where(m => merchandiserIds.Contains(m.Id))
            .Join(_db.Users, m => m.UserId, u => u.Id, (m, u) => new { m.Id, u.DisplayName })
            .ToDictionaryAsync(x => x.Id, x => x.DisplayName, ct);
        var storeNames = await _db.Stores.Where(s => storeIds.Contains(s.Id)).ToDictionaryAsync(s => s.Id, s => s.Name, ct);

        var result = new List<Disruption>();
        result.AddRange(absences.Select(a => new Disruption(
            a.Id, DisruptionKind.Absence, merchandiserNames.GetValueOrDefault(a.MerchandiserId, "?"), a.StartDate, a.EndDate, a.MerchandiserId, null)));
        result.AddRange(closures.Select(f => new Disruption(
            f.Id, DisruptionKind.StoreClosure, storeNames.GetValueOrDefault(f.StoreId, "?"), f.StartsOn, f.EndsOn ?? DateOnly.MaxValue, null, f.StoreId)));
        return result;
    }

    public async Task<Disruption?> GetByIdAsync(Guid id, DateOnly today, CancellationToken ct = default) =>
        (await GetActiveOrFutureAsync(today, ct)).FirstOrDefault(d => d.Id == id);
}
