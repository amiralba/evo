namespace Evo.Infrastructure.People;

/// <summary>Continuous location-history stream (spec 009) — pulls M4's live-location-layer data
/// groundwork into M3 per user decision (2026-07-17). Independent of PlannedVisit/TaskInstance;
/// a visit's check-in location is derived by finding the nearest ping to its check-in time.</summary>
public class MerchandiserLocationPing
{
    public Guid Id { get; set; }
    public Guid MerchandiserId { get; set; }
    public double Lat { get; set; }
    public double Lng { get; set; }
    public DateTimeOffset RecordedAt { get; set; }
}
