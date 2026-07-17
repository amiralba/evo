namespace Evo.Domain.Scheduling;

public enum FindingSeverity : byte
{
    Error = 1,
    Warning = 2,
    Info = 3,
}

public record ValidationFinding(string Code, FindingSeverity Severity, string Message, string? Scope = null);
