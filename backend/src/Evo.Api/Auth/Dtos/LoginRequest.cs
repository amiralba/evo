using System.ComponentModel.DataAnnotations;

namespace Evo.Api.Auth.Dtos;

public record LoginRequest(
    [Required, EmailAddress] string Email,
    [Required] string Password);
