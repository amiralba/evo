namespace Evo.Domain.Tasks;

/// <summary>Mirrors Evo.Infrastructure.Tasks.ProofRequired's values without depending on it
/// (Evo.Domain never references Evo.Infrastructure — see docs/ARCHITECTURE.md layering rule).
/// The infrastructure/API caller maps ProofRequired to this before calling TaskResultJson.</summary>
public enum ResultKind
{
    None = 0,
    Photo = 1,
    Form = 2,
}

public record PhotoRef(string ObjectKey, string Url);

public record TaskResultNone(DateTimeOffset CompletedAt, string? Note);

public record TaskResultPhoto(DateTimeOffset CompletedAt, IReadOnlyList<PhotoRef> Photos);

public record TaskResultForm(DateTimeOffset CompletedAt, IReadOnlyDictionary<string, string> Answers);
