using Evo.Infrastructure.Audit;
using Evo.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Evo.Infrastructure;

public class EvoDbContext : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>
{
    public EvoDbContext(DbContextOptions<EvoDbContext> options) : base(options)
    {
    }

    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<AuditLogEntry> AuditLog => Set<AuditLogEntry>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<RefreshToken>(entity =>
        {
            entity.HasIndex(t => t.TokenHash).IsUnique();
            entity.HasIndex(t => t.UserId);
            entity.Property(t => t.RowVersion).IsRowVersion();
        });

        builder.Entity<AuditLogEntry>(entity =>
        {
            entity.Property(e => e.EntityType).HasMaxLength(100);
            entity.Property(e => e.Event).HasMaxLength(100);
            entity.Property(e => e.EntityKey).HasMaxLength(200);
            entity.Property(e => e.BeforeJson).HasColumnType("nvarchar(max)");
            entity.Property(e => e.AfterJson).HasColumnType("nvarchar(max)");
            entity.HasIndex(e => e.EntityType);
            entity.HasIndex(e => new { e.EntityType, e.EntityKey });
            entity.HasIndex(e => e.OccurredAt);
        });
    }
}
