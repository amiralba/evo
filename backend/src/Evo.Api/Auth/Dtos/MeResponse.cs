namespace Evo.Api.Auth.Dtos;

public record MeResponse(Guid Id, string Email, string DisplayName, string[] Roles);
