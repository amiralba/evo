namespace Evo.Domain.Errors;

/// <summary>
/// Stable, English, machine-readable error codes — the panel maps these to Turkish text
/// (spec 003 Phase 4). Never change an existing value; add new ones as needed.
/// </summary>
public static class ErrorCodes
{
    public const string ValidationError = "validation_error";
    public const string NotFound = "not_found";
    public const string Conflict = "conflict";
    public const string Unauthorized = "unauthorized";
    public const string Forbidden = "forbidden";
    public const string InternalError = "internal_error";

    public const string AuthInvalidCredentials = "auth.invalid_credentials";
    public const string AuthAccountInactive = "auth.account_inactive";
    public const string AuthLockedOut = "auth.locked_out";
}
