using Evo.Infrastructure.Audit;
using Evo.Infrastructure.Identity;
using Evo.Infrastructure.People;
using Evo.Infrastructure.Routing;
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
    public DbSet<Merchandiser> Merchandisers => Set<Merchandiser>();
    public DbSet<Route> Routes => Set<Route>();
    public DbSet<RouteStop> RouteStops => Set<RouteStop>();
    public DbSet<Assignment> Assignments => Set<Assignment>();
    public DbSet<Patch> Patches => Set<Patch>();
    public DbSet<PlannedVisit> PlannedVisits => Set<PlannedVisit>();
    public DbSet<DecisionJournalEntry> DecisionJournal => Set<DecisionJournalEntry>();
    public DbSet<Setting> Settings => Set<Setting>();

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

        builder.Entity<Merchandiser>(entity =>
        {
            entity.ToTable("merchandiser");
            entity.Property(e => e.HomeLocation).HasColumnType("geography");
            entity.HasOne<ApplicationUser>().WithMany().HasForeignKey(e => e.UserId).OnDelete(DeleteBehavior.NoAction);
            entity.HasIndex(e => e.UserId).IsUnique();
        });

        builder.Entity<Route>(entity =>
        {
            entity.ToTable("route");
            entity.Property(e => e.RouteCode).HasMaxLength(30);
            entity.HasIndex(e => e.RouteCode).IsUnique();
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Province).HasMaxLength(100);
            entity.Property(e => e.DistrictsJson).HasColumnType("nvarchar(max)");
            entity.Property(e => e.GeoScope).HasColumnType("geography");
            entity.Property(e => e.RevenueTarget).HasColumnType("decimal(18,2)");
        });

        builder.Entity<RouteStop>(entity =>
        {
            entity.ToTable("route_stop");
            entity.HasOne<Route>().WithMany().HasForeignKey(e => e.RouteId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<Store>().WithMany().HasForeignKey(e => e.StoreId).OnDelete(DeleteBehavior.NoAction);
            entity.HasIndex(e => e.StoreId)
                .HasFilter("[EffectiveTo] IS NULL")
                .IsUnique();
        });

        builder.Entity<Assignment>(entity =>
        {
            entity.ToTable("assignment");
            entity.HasOne<Route>().WithMany().HasForeignKey(e => e.RouteId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne<Merchandiser>().WithMany().HasForeignKey(e => e.MerchandiserId).OnDelete(DeleteBehavior.NoAction);
            entity.HasIndex(e => e.RouteId).HasFilter("[EndDate] IS NULL").IsUnique();
            entity.HasIndex(e => e.MerchandiserId).HasFilter("[EndDate] IS NULL").IsUnique();
        });

        builder.Entity<Patch>(entity =>
        {
            entity.ToTable("patch");
            entity.HasOne<Route>().WithMany().HasForeignKey(e => e.RouteId).OnDelete(DeleteBehavior.Cascade);
            entity.Property(e => e.Reason).HasMaxLength(1000);
            entity.Property(e => e.ParamsJson).HasColumnType("nvarchar(max)");
            entity.HasIndex(e => new { e.RouteId, e.Status, e.EndsOn });
        });

        builder.Entity<PlannedVisit>(entity =>
        {
            entity.ToTable("planned_visit");
            entity.HasOne<Route>().WithMany().HasForeignKey(e => e.RouteId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(e => new { e.RouteStopId, e.VisitDate }).IsUnique();
            entity.HasIndex(e => new { e.MerchandiserId, e.VisitDate });
        });

        builder.Entity<DecisionJournalEntry>(entity =>
        {
            entity.ToTable("decision_journal");
            entity.Property(e => e.Description).HasMaxLength(2000);
            entity.Property(e => e.Reason).HasMaxLength(2000);
            entity.Property(e => e.Objective).HasMaxLength(2000);
            entity.Property(e => e.ErrorsJson).HasColumnType("nvarchar(max)");
        });

        builder.Entity<Setting>(entity =>
        {
            entity.ToTable("setting");
            entity.HasKey(e => new { e.Key, e.RegionId });
            entity.Property(e => e.Key).HasMaxLength(100);
            entity.Property(e => e.RegionId).HasMaxLength(50);
            entity.Property(e => e.ValueJson).HasColumnType("nvarchar(max)");
            entity.HasData(
                new Setting { Key = "daily_work_minutes", RegionId = "", ValueJson = "450" },
                new Setting { Key = "default_service_minutes", RegionId = "", ValueJson = "30" },
                new Setting { Key = "day_start", RegionId = "", ValueJson = "\"09:00\"" },
                new Setting { Key = "over_450_tolerance_minutes", RegionId = "", ValueJson = "0" },
                new Setting { Key = "service_mix_cap_pct", RegionId = "", ValueJson = "20" },
                new Setting { Key = "plan_horizon_weeks", RegionId = "", ValueJson = "6" },
                new Setting { Key = "snap_minutes", RegionId = "", ValueJson = "5" },
                new Setting
                {
                    Key = "break_blocks",
                    RegionId = "",
                    ValueJson = "[{\"label\":\"Kahvalti\",\"start\":\"10:30\",\"end\":\"10:45\"},{\"label\":\"Ogle Yemegi\",\"start\":\"12:30\",\"end\":\"13:15\"},{\"label\":\"Ikindi Cayi\",\"start\":\"15:30\",\"end\":\"15:45\"}]",
                });
        });
    }
}
