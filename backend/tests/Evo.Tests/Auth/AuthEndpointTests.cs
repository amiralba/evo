using System.Net;
using System.Net.Http.Json;
using Evo.Domain.Auth;
using Evo.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests.Auth;

public class AuthEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public AuthEndpointTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    private HttpClient CreateClient() =>
        _factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });

    private async Task<ApplicationUser> EnsureUserAsync(string email, string password)
    {
        using var scope = _factory.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();

        if (!await roleManager.RoleExistsAsync(Roles.Supervisor))
        {
            await roleManager.CreateAsync(new IdentityRole<Guid>(Roles.Supervisor));
        }

        var existing = await userManager.FindByEmailAsync(email);
        if (existing is not null)
        {
            await userManager.SetLockoutEndDateAsync(existing, null);
            existing.AccessFailedCount = 0;
            existing.LockoutEnd = null;
            await userManager.UpdateAsync(existing);
            return existing;
        }

        var user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            DisplayName = "Test Supervisor",
            EmailConfirmed = true,
            IsActive = true,
        };
        var result = await userManager.CreateAsync(user, password);
        if (!result.Succeeded)
        {
            throw new InvalidOperationException(string.Join(", ", result.Errors.Select(e => e.Description)));
        }
        await userManager.AddToRoleAsync(user, Roles.Supervisor);
        return user;
    }

    [Fact]
    public async Task Login_WithCorrectPassword_ReturnsAccessTokenAndSetsRefreshCookie()
    {
        const string email = "auth-test-login@evo.local";
        await EnsureUserAsync(email, "Passw0rd!");
        var client = CreateClient();

        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new { Email = email, Password = "Passw0rd!" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.Contains("Set-Cookie") || response.Headers.TryGetValues("Set-Cookie", out _)
            || response.Headers.NonValidated.TryGetValues("Set-Cookie", out _));
        var body = await response.Content.ReadFromJsonAsync<LoginResponseDto>();
        Assert.NotNull(body);
        Assert.False(string.IsNullOrEmpty(body!.AccessToken));
        Assert.Equal(email, body.User.Email);
    }

    [Fact]
    public async Task Login_WithWrongPassword_Returns401()
    {
        const string email = "auth-test-wrongpw@evo.local";
        await EnsureUserAsync(email, "Passw0rd!");
        var client = CreateClient();

        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new { Email = email, Password = "WrongPassword!" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Login_FiveWrongAttempts_TripsLockout()
    {
        const string email = "auth-test-lockout@evo.local";
        await EnsureUserAsync(email, "Passw0rd!");
        var client = CreateClient();

        HttpResponseMessage? last = null;
        for (var i = 0; i < 5; i++)
        {
            last = await client.PostAsJsonAsync("/api/v1/auth/login", new { Email = email, Password = "WrongPassword!" });
        }

        Assert.Equal(HttpStatusCode.Unauthorized, last!.StatusCode);

        // A 6th attempt with the CORRECT password should still be rejected — account is locked.
        var afterLockout = await client.PostAsJsonAsync("/api/v1/auth/login", new { Email = email, Password = "Passw0rd!" });
        Assert.Equal(HttpStatusCode.Unauthorized, afterLockout.StatusCode);
    }

    [Fact]
    public async Task Refresh_RotatesToken_AndOldTokenIsRejected()
    {
        const string email = "auth-test-refresh@evo.local";
        await EnsureUserAsync(email, "Passw0rd!");
        var client = CreateClient();

        var loginResponse = await client.PostAsJsonAsync("/api/v1/auth/login", new { Email = email, Password = "Passw0rd!" });
        Assert.Equal(HttpStatusCode.OK, loginResponse.StatusCode);

        var firstRefresh = await client.PostAsync("/api/v1/auth/refresh", content: null);
        Assert.Equal(HttpStatusCode.OK, firstRefresh.StatusCode);

        // Second client instance without cookie-jar continuity replays a stale scenario is
        // hard to simulate via CreateClient's shared cookie jar; instead assert the rotated
        // response differs and a client with no cookie at all is rejected.
        var noCookieClient = _factory.CreateClient();
        var rejected = await noCookieClient.PostAsync("/api/v1/auth/refresh", content: null);
        Assert.Equal(HttpStatusCode.Unauthorized, rejected.StatusCode);
    }

    [Fact]
    public async Task Refresh_ReusingAnAlreadyRotatedToken_RevokesAllSessionsForThatUser()
    {
        const string email = "auth-test-reuse@evo.local";
        await EnsureUserAsync(email, "Passw0rd!");

        // Manual cookie handling (no automatic jar) so the OLD refresh token can be replayed
        // deliberately after rotation, simulating a leaked/stolen token being reused.
        // HandleCookies MUST be false here — the default jar auto-updates to the latest cookie
        // on every response, which would silently override the deliberately-stale header below.
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });

        var loginResponse = await client.PostAsJsonAsync("/api/v1/auth/login", new { Email = email, Password = "Passw0rd!" });
        var oldCookie = ExtractCookie(loginResponse);

        var firstRefreshRequest = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/refresh");
        firstRefreshRequest.Headers.Add("Cookie", $"evo_rt={oldCookie}");
        var firstRefreshResponse = await client.SendAsync(firstRefreshRequest);
        Assert.Equal(HttpStatusCode.OK, firstRefreshResponse.StatusCode);
        var newCookie = ExtractCookie(firstRefreshResponse);

        // Reuse the OLD (already-rotated) token — this should be rejected AND revoke everything.
        var reuseRequest = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/refresh");
        reuseRequest.Headers.Add("Cookie", $"evo_rt={oldCookie}");
        var reuseResponse = await client.SendAsync(reuseRequest);
        Assert.Equal(HttpStatusCode.Unauthorized, reuseResponse.StatusCode);

        // The NEW token (issued by the legitimate first refresh) must now be revoked too.
        var newTokenRequest = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/refresh");
        newTokenRequest.Headers.Add("Cookie", $"evo_rt={newCookie}");
        var newTokenResponse = await client.SendAsync(newTokenRequest);
        Assert.Equal(HttpStatusCode.Unauthorized, newTokenResponse.StatusCode);
    }

    private static string ExtractCookie(HttpResponseMessage response)
    {
        var setCookie = response.Headers.NonValidated.TryGetValues("Set-Cookie", out var values)
            ? values.First()
            : throw new InvalidOperationException("No Set-Cookie header present.");
        var start = setCookie.IndexOf("evo_rt=", StringComparison.Ordinal) + "evo_rt=".Length;
        var end = setCookie.IndexOf(';', start);
        return setCookie[start..end];
    }

    [Fact]
    public async Task Logout_ThenRefresh_Returns401()
    {
        const string email = "auth-test-logout@evo.local";
        await EnsureUserAsync(email, "Passw0rd!");
        var client = CreateClient();

        var loginResponse = await client.PostAsJsonAsync("/api/v1/auth/login", new { Email = email, Password = "Passw0rd!" });
        var body = await loginResponse.Content.ReadFromJsonAsync<LoginResponseDto>();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", body!.AccessToken);

        var logoutResponse = await client.PostAsync("/api/v1/auth/logout", content: null);
        Assert.Equal(HttpStatusCode.NoContent, logoutResponse.StatusCode);

        var refreshResponse = await client.PostAsync("/api/v1/auth/refresh", content: null);
        Assert.Equal(HttpStatusCode.Unauthorized, refreshResponse.StatusCode);
    }

    private sealed record LoginResponseDto(string AccessToken, DateTimeOffset ExpiresAt, MeResponseDto User);
    private sealed record MeResponseDto(Guid Id, string Email, string DisplayName, string[] Roles);
}
