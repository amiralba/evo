using Evo.Infrastructure.Audit;
using Evo.Infrastructure.Identity;
using Evo.Infrastructure.Stores;
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
    public DbSet<Store> Stores => Set<Store>();
    public DbSet<Chain> Chains => Set<Chain>();
    public DbSet<StoreType> StoreTypes => Set<StoreType>();
    public DbSet<StoreRevenue> StoreRevenues => Set<StoreRevenue>();
    public DbSet<StoreFlag> StoreFlags => Set<StoreFlag>();

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

        builder.Entity<StoreType>(entity =>
        {
            entity.HasKey(e => e.Code);
            entity.Property(e => e.Label).HasMaxLength(20);
            entity.HasData(
                new StoreType { Code = 1, Label = "Jet" },
                new StoreType { Code = 2, Label = "M" },
                new StoreType { Code = 3, Label = "MM" },
                new StoreType { Code = 4, Label = "3M" },
                new StoreType { Code = 5, Label = "4M" },
                new StoreType { Code = 6, Label = "5M" });
        });

        builder.Entity<Chain>(entity =>
        {
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.HasIndex(e => e.Name).IsUnique();
        });

        builder.Entity<Store>(entity =>
        {
            entity.Property(e => e.EvoStoreId).HasMaxLength(50);
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Channel).HasMaxLength(100);
            entity.Property(e => e.Province).HasMaxLength(100);
            entity.Property(e => e.District).HasMaxLength(100);
            entity.Property(e => e.Neighborhood).HasMaxLength(150);
            entity.Property(e => e.AttributesJson).HasColumnType("nvarchar(max)");
            entity.Property(e => e.Location).HasColumnType("geography");
            entity.HasIndex(e => e.EvoStoreId).IsUnique();
            entity.HasIndex(e => new { e.Province, e.District });
            entity.HasOne<Chain>().WithMany().HasForeignKey(e => e.ChainId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne<StoreType>().WithMany().HasForeignKey(e => e.Format).OnDelete(DeleteBehavior.NoAction);
        });

        builder.Entity<StoreRevenue>(entity =>
        {
            entity.HasKey(e => new { e.StoreId, e.Month });
            entity.Property(e => e.Revenue).HasColumnType("decimal(18,2)");
        });

        builder.Entity<StoreFlag>(entity =>
        {
            entity.HasIndex(e => e.StoreId);
        });
    }
}
