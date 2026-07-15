namespace Evo.Api.Auth.Dtos;

public record UserSummary(Guid Id, string Email, string DisplayName, string[] Roles, bool IsActive);
