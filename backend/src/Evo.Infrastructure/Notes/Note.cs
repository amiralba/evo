namespace Evo.Infrastructure.Notes;

/// <summary>The field agent's only write channel in M3 — seeder-produced only (design §2.11),
/// no live field-agent create-note API (mobile deferred).</summary>
public class Note
{
    public Guid Id { get; set; }
    public Guid? AuthorId { get; set; }
    public NoteAnchorType AnchorType { get; set; }
    public Guid? AnchorId { get; set; }
    public DateOnly? AnchorDay { get; set; }
    public NoteKind Kind { get; set; }
    public string Body { get; set; } = string.Empty;
    public NoteStatus Status { get; set; } = NoteStatus.Open;
    public DateTimeOffset CreatedAt { get; set; }
}
