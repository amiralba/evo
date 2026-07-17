namespace Evo.Infrastructure.Notes;

public enum NoteAnchorType : byte
{
    Store = 1,
    Visit = 2,
    Day = 3,
    General = 4,
}

public enum NoteKind : byte
{
    Note = 1,
    ChangeRequest = 2,
}

public enum NoteStatus : byte
{
    Open = 1,
    Acknowledged = 2,
    Resolved = 3,
}
