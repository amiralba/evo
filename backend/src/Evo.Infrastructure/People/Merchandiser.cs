using NetTopologySuite.Geometries;

namespace Evo.Infrastructure.People;

/// <summary>Wraps an Identity FieldAgent user; no delete — active toggle only;
/// deactivation blocked while holding an active assignment (spec 005 Clarification #2).</summary>
public class Merchandiser
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Point? HomeLocation { get; set; }
    public DateOnly? HiredOn { get; set; }
    public bool Active { get; set; } = true;
}
