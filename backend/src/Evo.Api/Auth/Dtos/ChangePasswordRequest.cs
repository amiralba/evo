using System.ComponentModel.DataAnnotations;

namespace Evo.Api.Auth.Dtos;

public record ChangePasswordRequest(
    [Required] string CurrentPassword,
    [Required, MinLength(8)] string NewPassword);
