using System.ComponentModel.DataAnnotations;

namespace Evo.Api.Auth.Dtos;

/// <summary>
/// Field agents have no creation API (seeder-only, per spec 002) — this always creates a
/// Supervisor. The Role field exists so the intent is explicit in the request and rejected
/// clearly (400) if a caller tries anything else, rather than silently ignoring it.
/// </summary>
public record CreateUserRequest(
    [Required, EmailAddress] string Email,
    [Required] string DisplayName,
    [Required] string Role,
    [Required, MinLength(8)] string TemporaryPassword);
