using Evo.Infrastructure.Notes;

namespace Evo.Api.Notes;

public record NoteDto(
    Guid Id, Guid? AuthorId, string? AuthorName, NoteAnchorType AnchorType, Guid? AnchorId, string? AnchorLabel,
    NoteKind Kind, string Body, NoteStatus Status, DateTimeOffset CreatedAt);

public record UpdateNoteStatusRequest(NoteStatus Status);
