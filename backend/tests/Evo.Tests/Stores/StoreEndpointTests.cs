using System.Net;
using System.Net.Http.Json;
using Evo.Api.Audit.Dtos;
using Evo.Api.Stores.Dtos;
using Evo.Domain.Auth;
using Evo.Tests.Auth;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Evo.Tests.Stores;

public class StoreEndpointTests : IClassFixture<EvoApiTestFactory>
{
    private readonly EvoApiTestFactory _factory;

    public StoreEndpointTests(EvoApiTestFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Supervisor_Sync_ReturnsSummary_AndWritesAuditRow()
    {
        const string email = "store-test-supervisor-sync@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        var syncResponse = await client.PostAsync("/api/v1/stores/sync", content: null);
        Assert.Equal(HttpStatusCode.OK, syncResponse.StatusCode);
        var summary = await syncResponse.Content.ReadFromJsonAsync<StoreSyncRunSummaryDto>();
        Assert.NotNull(summary);
        Assert.True(summary!.StoresCreated + summary.StoresUpdated > 0);

        var auditResponse = await client.GetAsync("/api/v1/audit-log?entityType=StoreSync&pageSize=10");
        Assert.Equal(HttpStatusCode.OK, auditResponse.StatusCode);
        var auditPage = await auditResponse.Content.ReadFromJsonAsync<PagedResult<AuditLogEntryDto>>();
        Assert.Contains(auditPage!.Items, e => e.Event == "run");
    }

    [Fact]
    public async Task FieldAgent_Sync_Returns403()
    {
        const string email = "store-test-fieldagent-sync@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.FieldAgent);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        var response = await client.PostAsync("/api/v1/stores/sync", content: null);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Unauthenticated_Sync_Returns401()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsync("/api/v1/stores/sync", content: null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task List_FiltersByProvince_AndPagesCorrectly()
    {
        const string email = "store-test-list@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        await client.PostAsync("/api/v1/stores/sync", content: null);

        var allResponse = await client.GetAsync("/api/v1/stores?pageSize=1");
        var allPage = await allResponse.Content.ReadFromJsonAsync<PagedResult<StoreSummaryDto>>();
        Assert.Equal(HttpStatusCode.OK, allResponse.StatusCode);
        Assert.Single(allPage!.Items);
        Assert.True(allPage.Total > 0);

        var knownProvince = allPage.Items[0].Province;
        var filteredResponse = await client.GetAsync($"/api/v1/stores?province={Uri.EscapeDataString(knownProvince)}&pageSize=200");
        var filteredPage = await filteredResponse.Content.ReadFromJsonAsync<PagedResult<StoreSummaryDto>>();
        Assert.All(filteredPage!.Items, s => Assert.Equal(knownProvince, s.Province));
    }

    [Fact]
    public async Task GetById_ReturnsRevenueAndFlags_AndUnknownId_Returns404()
    {
        const string email = "store-test-detail@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        await client.PostAsync("/api/v1/stores/sync", content: null);
        var listResponse = await client.GetAsync("/api/v1/stores?pageSize=1");
        var listPage = await listResponse.Content.ReadFromJsonAsync<PagedResult<StoreSummaryDto>>();
        var storeId = listPage!.Items[0].Id;

        var detailResponse = await client.GetAsync($"/api/v1/stores/{storeId}");
        Assert.Equal(HttpStatusCode.OK, detailResponse.StatusCode);
        var detail = await detailResponse.Content.ReadFromJsonAsync<StoreDetailDto>();
        Assert.NotNull(detail);
        Assert.NotNull(detail!.Revenue);

        var notFoundResponse = await client.GetAsync($"/api/v1/stores/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, notFoundResponse.StatusCode);
    }

    private sealed record StoreSyncRunSummaryDto(
        DateTimeOffset StartedAt, long DurationMs, int ChainsCreated, int StoresCreated,
        int StoresUpdated, int RevenueRowsUpserted, int FlagsUpserted);
}
