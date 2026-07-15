namespace Evo.Api.Auth;

public static class RefreshCookie
{
    public const string Name = "evo_rt";

    /// <param name="isDevelopment">
    /// Dev-only relaxation: the panel dev server talks to the API over plain http://localhost,
    /// where a Secure cookie would never be sent back by the browser. Production always sets
    /// Secure=true (real deployments are HTTPS-only).
    /// </param>
    public static void Set(HttpResponse response, string rawToken, DateTimeOffset expiresAt, bool isDevelopment = false)
    {
        response.Cookies.Append(Name, rawToken, new CookieOptions
        {
            HttpOnly = true,
            Secure = !isDevelopment,
            SameSite = SameSiteMode.Strict,
            Path = "/api/v1/auth",
            Expires = expiresAt,
        });
    }

    public static void Clear(HttpResponse response)
    {
        response.Cookies.Delete(Name, new CookieOptions { Path = "/api/v1/auth" });
    }

    public static bool TryRead(HttpRequest request, out string rawToken)
    {
        var value = request.Cookies[Name];
        rawToken = value ?? string.Empty;
        return !string.IsNullOrEmpty(value);
    }
}
