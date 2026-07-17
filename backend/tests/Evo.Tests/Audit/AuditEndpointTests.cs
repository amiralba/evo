using System.Net;
using System.Net.Http.Json;
using Evo.Api.Audit.Dtos;
using Evo.Domain.Auth;
using Evo.Tests.Auth;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Evo.Tests.Audit;

public class AuditEndpointTests : IClassFixture<EvoApiTestFactory>
{
    private readonly EvoApiTestFactory _factory;

    public AuditEndpointTests(EvoApiTestFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task CreatingAndDeactivatingAUser_WritesAuditRows_VisibleViaAuditLogEndpoint()
    {
        const string supervisorEmail = "audit-test-supervisor@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, supervisorEmail, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, supervisorEmail, "Passw0rd!");

        var newEmail = $"audit-test-created-{Guid.NewGuid():N}@evo.local";
        var createResponse = await client.PostAsJsonAsync("/api/v1/users", new
        {
            Email = newEmail,
            DisplayName = "Audit Target",
            Role = Roles.Supervisor,
            TemporaryPassword = "Passw0rd!",
        });
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        var created = await createResponse.Content.ReadFromJsonAsync<UserSummaryDto>();

        var deactivateResponse = await client.PostAsync($"/api/v1/users/{created!.Id}/deactivate", content: null);
        Assert.Equal(HttpStatusCode.NoContent, deactivateResponse.StatusCode);

        var auditResponse = await client.GetAsync("/api/v1/audit-log?entityType=User&pageSize=200");
        Assert.Equal(HttpStatusCode.OK, auditResponse.StatusCode);
        var page = await auditResponse.Content.ReadFromJsonAsync<PagedResult<AuditLogEntryDto>>();

        Assert.Contains(page!.Items, e => e.EntityKey == created.Id.ToString() && e.Event == "created");
        Assert.Contains(page.Items, e => e.EntityKey == created.Id.ToString() && e.Event == "deactivated");
    }

    [Fact]
    public async Task FieldAgent_CallingAuditLog_Returns403()
    {
        const string email = "audit-test-fieldagent@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.FieldAgent);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        var response = await client.GetAsync("/api/v1/audit-log");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Unauthenticated_CallingAuditLog_Returns401()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/v1/audit-log");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Paging_ReturnsCorrectSliceAndTotal()
    {
        const string supervisorEmail = "audit-test-paging@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, supervisorEmail, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, supervisorEmail, "Passw0rd!");

        // Create 3 users to guarantee at least 3 "created" audit rows exist.
        for (var i = 0; i < 3; i++)
        {
            await client.PostAsJsonAsync("/api/v1/users", new
            {
                Email = $"audit-test-paging-{Guid.NewGuid():N}@evo.local",
                DisplayName = "Paging Target",
                Role = Roles.Supervisor,
                TemporaryPassword = "Passw0rd!",
            });
        }

        var page1Response = await client.GetAsync("/api/v1/audit-log?entityType=User&page=1&pageSize=2");
        var page1 = await page1Response.Content.ReadFromJsonAsync<PagedResult<AuditLogEntryDto>>();

        Assert.Equal(2, page1!.Items.Count);
        Assert.True(page1.Total >= 3);
        Assert.Equal(1, page1.Page);
        Assert.Equal(2, page1.PageSize);
    }

    private sealed record UserSummaryDto(Guid Id, string Email, string DisplayName, string[] Roles, bool IsActive);
}
