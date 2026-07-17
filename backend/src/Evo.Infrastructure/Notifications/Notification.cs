namespace Evo.Infrastructure.Notifications;

/// <summary>Mocked "would-have-sent" receipt (spec 009) — no real push/FCM delivery.</summary>
public class Notification
{
    public Guid Id { get; set; }
    public Guid MerchandiserId { get; set; }
    public string PayloadJson { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ReadAt { get; set; }
}
