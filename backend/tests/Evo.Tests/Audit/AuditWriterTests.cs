using Evo.Api.Audit;
using Evo.Infrastructure;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests.Audit;

public class AuditWriterTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public AuditWriterTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task WriteAsync_InsertsOneRow_WithSerializedAfterAndOccurredAt()
    {
        using var scope = _factory.Services.CreateScope();
        var writer = scope.ServiceProvider.GetRequiredService<IAuditWriter>();
        var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();

        var key = Guid.NewGuid().ToString();
        var before = DateTimeOffset.UtcNow;

        await writer.WriteAsync("User", key, "created", before: null, after: new { Email = "a@evo.local" });

        var entry = await db.AuditLog.FirstOrDefaultAsync(e => e.EntityType == "User" && e.EntityKey == key);
        Assert.NotNull(entry);
        Assert.Equal("created", entry!.Event);
        Assert.Null(entry.BeforeJson);
        Assert.Contains("a@evo.local", entry.AfterJson);
        Assert.True(entry.OccurredAt >= before);
    }

    [Fact]
    public async Task WriteAsync_WithExplicitActorId_StoresThatActor()
    {
        using var scope = _factory.Services.CreateScope();
        var writer = scope.ServiceProvider.GetRequiredService<IAuditWriter>();
        var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();

        var key = Guid.NewGuid().ToString();
        var actorId = Guid.NewGuid();

        await writer.WriteAsync("User", key, "created", actorId: actorId);

        var entry = await db.AuditLog.FirstOrDefaultAsync(e => e.EntityType == "User" && e.EntityKey == key);
        Assert.NotNull(entry);
        Assert.Equal(actorId, entry!.ActorId);
    }

    [Fact]
    public void IAuditWriter_HasNoUpdateOrDeleteMember()
    {
        var methodNames = typeof(IAuditWriter).GetMethods().Select(m => m.Name);

        Assert.DoesNotContain(methodNames, name =>
            name.Contains("Update", StringComparison.OrdinalIgnoreCase) ||
            name.Contains("Delete", StringComparison.OrdinalIgnoreCase) ||
            name.Contains("Remove", StringComparison.OrdinalIgnoreCase));
    }
}
