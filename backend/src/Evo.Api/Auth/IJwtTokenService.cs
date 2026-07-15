using Evo.Infrastructure.Identity;

namespace Evo.Api.Auth;

public interface IJwtTokenService
{
    (string AccessToken, DateTimeOffset ExpiresAt) GenerateAccessToken(ApplicationUser user, IEnumerable<string> roles);
}
