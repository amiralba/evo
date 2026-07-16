using System.Security.Claims;
using System.Text.Json;
using Evo.Infrastructure;
using Evo.Infrastructure.Audit;

namespace Evo.Api.Audit;

public class AuditWriter : IAuditWriter
{
    private readonly EvoDbContext _db;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public AuditWriter(EvoDbContext db, IHttpContextAccessor httpContextAccessor)
    {
        _db = db;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task WriteAsync(
        string entityType,
        string entityKey,
        string @event,
        object? before = null,
        object? after = null,
        Guid? actorId = null,
        CancellationToken ct = default)
    {
        var entry = new AuditLogEntry
        {
            Id = Guid.NewGuid(),
            ActorId = actorId ?? ResolveCurrentUserId(),
            OccurredAt = DateTimeOffset.UtcNow,
            EntityType = entityType,
            EntityKey = entityKey,
            Event = @event,
            BeforeJson = before is null ? null : JsonSerializer.Serialize(before),
            AfterJson = after is null ? null : JsonSerializer.Serialize(after),
        };

        _db.AuditLog.Add(entry);
        await _db.SaveChangesAsync(ct);
    }

    private Guid? ResolveCurrentUserId()
    {
        var idClaim = _httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? _httpContextAccessor.HttpContext?.User.FindFirstValue("sub");
        return Guid.TryParse(idClaim, out var id) ? id : null;
    }
}
