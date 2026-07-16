using Evo.Infrastructure;
using Evo.Infrastructure.Audit;
using Microsoft.EntityFrameworkCore;

namespace Evo.Seeder.Modules;

/// <summary>
/// Demo-profile-only illustrative audit_log rows (system actor — ActorId null). Idempotent:
/// skips entirely if any row already exists. The scale profile inserts none (spec 003).
/// </summary>
public class AuditLogSeederModule : ISeederModule
{
    public string Name => "AuditLog";

    public async Task SeedAsync(EvoDbContext db, SeedProfile profile, Bogus.Faker faker, IServiceProvider services, CancellationToken ct)
    {
        if (profile != SeedProfile.Demo)
        {
            return;
        }

        if (await db.AuditLog.AnyAsync(ct))
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;
        db.AuditLog.AddRange(
            new AuditLogEntry
            {
                Id = Guid.NewGuid(),
                ActorId = null,
                OccurredAt = now.AddMinutes(-30),
                EntityType = "User",
                EntityKey = "demo-seed",
                Event = "created",
                AfterJson = """{"email":"admin@evo.local","displayName":"EVO Admin"}""",
            },
            new AuditLogEntry
            {
                Id = Guid.NewGuid(),
                ActorId = null,
                OccurredAt = now.AddMinutes(-15),
                EntityType = "User",
                EntityKey = "demo-seed",
                Event = "activated",
                BeforeJson = """{"isActive":false}""",
                AfterJson = """{"isActive":true}""",
            });

        await db.SaveChangesAsync(ct);
    }
}
