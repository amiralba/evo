namespace Evo.Api.Notifications;

/// <summary>Mocked "would-have-sent" push notification (spec 009) — no real FCM delivery.</summary>
public interface INotificationDispatcher
{
    Task DispatchPublishAsync(Guid routeId, string diffSummary, CancellationToken ct = default);
}
