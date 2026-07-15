namespace Evo.Infrastructure.Identity;

/// <summary>
/// Only the SHA-256 hash of the raw token is ever stored — the raw value is returned to the
/// caller once (as the httpOnly cookie) and never persisted or logged.
/// </summary>
public class RefreshToken
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string TokenHash { get; set; } = string.Empty;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? RevokedAt { get; set; }
    public string? ReplacedByTokenHash { get; set; }

    /// <summary>
    /// Optimistic-concurrency token. Two concurrent requests presenting the same refresh token
    /// race to revoke it; without this, both can win, doubling the active-token count. EF Core
    /// throws DbUpdateConcurrencyException on the loser's SaveChanges, which is treated as reuse.
    /// </summary>
    public byte[] RowVersion { get; set; } = Array.Empty<byte>();

    public bool IsActive => RevokedAt is null && ExpiresAt > DateTimeOffset.UtcNow;
}
