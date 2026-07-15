using System.Security.Cryptography;
using Evo.Infrastructure;
using Evo.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Evo.Api.Auth;

public class RefreshTokenService : IRefreshTokenService
{
    private readonly EvoDbContext _db;
    private readonly JwtSettings _settings;

    public RefreshTokenService(EvoDbContext db, IOptions<JwtSettings> settings)
    {
        _db = db;
        _settings = settings.Value;
    }

    public async Task<(string RawToken, DateTimeOffset ExpiresAt)> IssueAsync(Guid userId, CancellationToken ct = default)
    {
        var rawToken = GenerateRawToken();
        var expiresAt = DateTimeOffset.UtcNow.AddDays(_settings.RefreshTokenDays);

        _db.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            TokenHash = Hash(rawToken),
            ExpiresAt = expiresAt,
        });
        await _db.SaveChangesAsync(ct);

        return (rawToken, expiresAt);
    }

    /// <summary>
    /// Rotates a refresh token. Two failure modes both return null: an unknown/expired token,
    /// or REUSE — presenting a token that was already rotated (its RevokedAt is set but it
    /// hasn't expired). Reuse means the raw token leaked and someone else already used it, so
    /// every token for that user is revoked as a precaution (forces re-login everywhere).
    /// A concurrent double-use of the SAME still-active token is caught via the RowVersion
    /// optimistic-concurrency token: the loser's SaveChanges throws, and the loser is treated
    /// as reuse too, rather than silently minting a second valid token for one presented value.
    /// </summary>
    public async Task<(string RawToken, DateTimeOffset ExpiresAt, Guid UserId)?> ValidateAndRotateAsync(string rawToken, CancellationToken ct = default)
    {
        var hash = Hash(rawToken);
        var existing = await _db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (existing is null)
        {
            return null;
        }

        if (!existing.IsActive)
        {
            if (existing.RevokedAt is not null && existing.ExpiresAt > DateTimeOffset.UtcNow)
            {
                // Already rotated/revoked, but not yet expired on its own — this is reuse.
                await RevokeAllForUserAsync(existing.UserId, ct);
            }
            return null;
        }

        var newRawToken = GenerateRawToken();
        var newExpiresAt = DateTimeOffset.UtcNow.AddDays(_settings.RefreshTokenDays);

        existing.RevokedAt = DateTimeOffset.UtcNow;
        existing.ReplacedByTokenHash = Hash(newRawToken);

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            // Another request rotated this exact token first — treat this request as reuse.
            await RevokeAllForUserAsync(existing.UserId, ct);
            return null;
        }

        _db.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = existing.UserId,
            TokenHash = Hash(newRawToken),
            ExpiresAt = newExpiresAt,
        });
        await _db.SaveChangesAsync(ct);

        return (newRawToken, newExpiresAt, existing.UserId);
    }

    public async Task RevokeAsync(string rawToken, CancellationToken ct = default)
    {
        var hash = Hash(rawToken);
        var existing = await _db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (existing is not null && existing.RevokedAt is null)
        {
            existing.RevokedAt = DateTimeOffset.UtcNow;
            await _db.SaveChangesAsync(ct);
        }
    }

    public async Task RevokeAllForUserAsync(Guid userId, CancellationToken ct = default)
    {
        var active = await _db.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAt == null)
            .ToListAsync(ct);
        foreach (var token in active)
        {
            token.RevokedAt = DateTimeOffset.UtcNow;
        }
        await _db.SaveChangesAsync(ct);
    }

    private static string GenerateRawToken() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));

    private static string Hash(string rawToken)
    {
        var bytes = SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(rawToken));
        return Convert.ToHexString(bytes);
    }
}
