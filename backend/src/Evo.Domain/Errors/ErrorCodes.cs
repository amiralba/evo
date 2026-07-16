namespace Evo.Domain.Errors;

/// <summary>
/// Stable, English, machine-readable error codes. Each one should have a matching entry in
/// UserErrorMessages (falls back to a generic Turkish message otherwise). Never change an
/// existing value; add new ones as needed.
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

    public const string UserOnlySupervisorCreatable = "user.only_supervisor_creatable";
}
