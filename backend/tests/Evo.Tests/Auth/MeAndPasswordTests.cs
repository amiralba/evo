using System.Net;
using System.Net.Http.Json;
using Evo.Domain.Auth;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Evo.Tests.Auth;

public class MeAndPasswordTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public MeAndPasswordTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Me_ReturnsCorrectRoles()
    {
        const string email = "me-test@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        var response = await client.GetAsync("/api/v1/auth/me");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<TestAuthHelper.MeResponseDto>();
        Assert.NotNull(body);
        Assert.Equal(email, body!.Email);
        Assert.Contains(Roles.Supervisor, body.Roles);
    }

    [Fact]
    public async Task Me_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/v1/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ChangePassword_WithCorrectCurrentPassword_Succeeds()
    {
        const string email = "changepw-success@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        var response = await client.PostAsJsonAsync("/api/v1/auth/change-password", new
        {
            CurrentPassword = "Passw0rd!",
            NewPassword = "NewPassw0rd!",
        });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        // Change back so the fixture-shared user is stable for any test re-run.
        var freshClient = await TestAuthHelper.LoginAsync(_factory, email, "NewPassw0rd!");
        await freshClient.PostAsJsonAsync("/api/v1/auth/change-password", new
        {
            CurrentPassword = "NewPassw0rd!",
            NewPassword = "Passw0rd!",
        });
    }

    [Fact]
    public async Task ChangePassword_WithWrongCurrentPassword_Returns422ProblemDetails()
    {
        // 422, not 400: a wrong current password is a domain-rule violation (EvoValidationException,
        // spec 003), not a malformed request. See docs/DECISIONS.md / specs/003-error-audit.
        const string email = "changepw-fail@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        var response = await client.PostAsJsonAsync("/api/v1/auth/change-password", new
        {
            CurrentPassword = "WrongCurrent!",
            NewPassword = "NewPassw0rd!",
        });

        Assert.Equal((HttpStatusCode)422, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }
}
