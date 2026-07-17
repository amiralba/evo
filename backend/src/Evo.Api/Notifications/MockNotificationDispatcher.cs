using System.Text.Json;
using Evo.Infrastructure;
using Evo.Infrastructure.Notifications;
using Microsoft.EntityFrameworkCore;

namespace Evo.Api.Notifications;

public class MockNotificationDispatcher : INotificationDispatcher
{
    private readonly EvoDbContext _db;

    public MockNotificationDispatcher(EvoDbContext db)
    {
        _db = db;
    }

    public async Task DispatchPublishAsync(Guid routeId, string diffSummary, CancellationToken ct = default)
    {
        var merchandiserId = await _db.Assignments
            .Where(a => a.RouteId == routeId && a.EndDate == null)
            .Select(a => (Guid?)a.MerchandiserId)
            .FirstOrDefaultAsync(ct);
        if (merchandiserId is null) return;

        _db.Notifications.Add(new Notification
        {
            Id = Guid.NewGuid(),
            MerchandiserId = merchandiserId.Value,
            PayloadJson = JsonSerializer.Serialize(new { summary = diffSummary }),
            CreatedAt = DateTimeOffset.UtcNow,
            ReadAt = null,
        });
        await _db.SaveChangesAsync(ct);
    }
}
