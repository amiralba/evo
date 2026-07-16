namespace Evo.Infrastructure.Stores.Sync;

/// <summary>
/// EXTENSION SEAM: the real EVO sales system implements this interface (registered in place of
/// FakeStoreSyncSource in Program.cs) once customer IT confirms how it's reached — a live SQL
/// connection/view, a nightly file drop, or an API. Field→column mapping, source auth, and
/// full-refresh-vs-incremental are all blocked on the same open customer-IT questions that block
/// AD/Entra (spec 002's AddEvoAuthentication seam). No real implementation exists yet.
/// </summary>
public interface IStoreSyncSource
{
    Task<IReadOnlyList<StoreSyncRecord>> FetchAsync(CancellationToken ct = default);
}
