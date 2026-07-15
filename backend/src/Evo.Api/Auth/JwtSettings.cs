namespace Evo.Api.Auth;

public class JwtSettings
{
    public const string SectionName = "Jwt";

    /// <summary>
    /// The Development-only key committed in appsettings.Development.json. Fine to keep in
    /// source — it protects nothing outside a throwaway local dev DB — but Program.cs refuses
    /// to start with this exact value outside the Development environment, so it can never
    /// accidentally become the production signing key.
    /// </summary>
    public const string WellKnownDevSigningKey = "LeYwrsCto9RvagXz2XKf0TWIhbp4iudrHrhuoKv3PsMgHROICxyCW4X+PfVjAqzA";

    public string Issuer { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public string SigningKey { get; set; } = string.Empty;
    public int AccessTokenMinutes { get; set; } = 60;
    public int RefreshTokenDays { get; set; } = 14;
}
