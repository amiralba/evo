using System.Net;
using System.Net.Http.Json;
using Evo.Domain.Auth;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Evo.Tests.Auth;

public class UsersEndpointTests : IClassFixture<EvoApiTestFactory>
{
    private readonly EvoApiTestFactory _factory;

    public UsersEndpointTests(EvoApiTestFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task FieldAgent_CallingUsersEndpoints_Returns403()
    {
        const string email = "users-test-fieldagent@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.FieldAgent);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        var listResponse = await client.GetAsync("/api/v1/users");
        Assert.Equal(HttpStatusCode.Forbidden, listResponse.StatusCode);

        var createResponse = await client.PostAsJsonAsync("/api/v1/users", new
        {
            Email = "should-not-be-created@evo.local",
            DisplayName = "Nope",
            Role = Roles.Supervisor,
            TemporaryPassword = "Passw0rd!",
        });
        Assert.Equal(HttpStatusCode.Forbidden, createResponse.StatusCode);
    }

    [Fact]
    public async Task Supervisor_CreatesSupervisor_ThenListIncludesIt()
    {
        const string supervisorEmail = "users-test-creator@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, supervisorEmail, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, supervisorEmail, "Passw0rd!");

        var newEmail = $"users-test-created-{Guid.NewGuid():N}@evo.local";
        var createResponse = await client.PostAsJsonAsync("/api/v1/users", new
        {
            Email = newEmail,
            DisplayName = "New Supervisor",
            Role = Roles.Supervisor,
            TemporaryPassword = "Passw0rd!",
        });
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);

        var listResponse = await client.GetAsync("/api/v1/users");
        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        var users = await listResponse.Content.ReadFromJsonAsync<List<UserSummaryDto>>();
        Assert.Contains(users!, u => u.Email == newEmail);
    }

    [Fact]
    public async Task Supervisor_CreatingFieldAgentViaApi_Returns403()
    {
        const string supervisorEmail = "users-test-reject-fieldagent@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, supervisorEmail, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, supervisorEmail, "Passw0rd!");

        var response = await client.PostAsJsonAsync("/api/v1/users", new
        {
            Email = "should-not-be-created-agent@evo.local",
            DisplayName = "Nope",
            Role = Roles.FieldAgent,
            TemporaryPassword = "Passw0rd!",
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Deactivate_ThenUserCannotLogIn()
    {
        const string supervisorEmail = "users-test-deactivator@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, supervisorEmail, "Passw0rd!", Roles.Supervisor);
        var adminClient = await TestAuthHelper.LoginAsync(_factory, supervisorEmail, "Passw0rd!");

        const string targetEmail = "users-test-deactivate-target@evo.local";
        const string targetPassword = "Passw0rd!";
        var target = await TestAuthHelper.EnsureUserAsync(_factory, targetEmail, targetPassword, Roles.Supervisor);

        var deactivateResponse = await adminClient.PostAsync($"/api/v1/users/{target.Id}/deactivate", content: null);
        Assert.Equal(HttpStatusCode.NoContent, deactivateResponse.StatusCode);

        var anonClient = _factory.CreateClient();
        var loginResponse = await anonClient.PostAsJsonAsync("/api/v1/auth/login", new { Email = targetEmail, Password = targetPassword });
        Assert.Equal(HttpStatusCode.Unauthorized, loginResponse.StatusCode);
    }

    private sealed record UserSummaryDto(Guid Id, string Email, string DisplayName, string[] Roles, bool IsActive);
}
