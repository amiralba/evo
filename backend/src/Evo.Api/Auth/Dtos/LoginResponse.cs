namespace Evo.Api.Auth.Dtos;

public record LoginResponse(string AccessToken, DateTimeOffset ExpiresAt, MeResponse User);
