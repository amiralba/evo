namespace Evo.Api.Auth;

public interface IRefreshTokenService
{
    Task<(string RawToken, DateTimeOffset ExpiresAt)> IssueAsync(Guid userId, CancellationToken ct = default);

    /// <returns>The new raw token + user id, or null if the presented token is not active.</returns>
    Task<(string RawToken, DateTimeOffset ExpiresAt, Guid UserId)?> ValidateAndRotateAsync(string rawToken, CancellationToken ct = default);

    Task RevokeAsync(string rawToken, CancellationToken ct = default);

    Task RevokeAllForUserAsync(Guid userId, CancellationToken ct = default);
}
