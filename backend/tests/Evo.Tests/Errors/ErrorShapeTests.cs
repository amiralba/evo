using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Evo.Domain.Errors;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.ApplicationParts;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests.Errors;

public class ErrorShapeTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public ErrorShapeTests(WebApplicationFactory<Program> factory)
    {
        // Registers TestThrowController (lives in this test assembly) as an MVC application part —
        // it isn't discovered automatically since the "entry point" for controller scanning is
        // Evo.Api's assembly.
        _factory = factory.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
                services.AddControllers().PartManager.ApplicationParts.Add(
                    new AssemblyPart(typeof(TestThrowController).Assembly))));
    }

    private static async Task<JsonDocument> ReadProblemAsync(HttpResponseMessage response)
    {
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var body = await response.Content.ReadAsStringAsync();
        return JsonDocument.Parse(body);
    }

    [Fact]
    public async Task NotFoundException_Returns404WithCode()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/test-throw/not-found");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = await ReadProblemAsync(response);
        Assert.Equal("not_found", doc.RootElement.GetProperty("code").GetString());
        Assert.False(doc.RootElement.TryGetProperty("instance", out _));
        Assert.True(doc.RootElement.TryGetProperty("traceId", out var traceId));
        Assert.False(string.IsNullOrEmpty(traceId.GetString()));
        Assert.False(string.IsNullOrEmpty(doc.RootElement.GetProperty("userTitle").GetString()));
        Assert.False(string.IsNullOrEmpty(doc.RootElement.GetProperty("userMessage").GetString()));
    }

    [Fact]
    public async Task ConflictException_Returns409WithCode()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/test-throw/conflict");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        using var doc = await ReadProblemAsync(response);
        Assert.Equal("conflict", doc.RootElement.GetProperty("code").GetString());
    }

    [Fact]
    public async Task EvoValidationException_Returns422WithErrors()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/test-throw/validation");

        Assert.Equal((HttpStatusCode)422, response.StatusCode);
        using var doc = await ReadProblemAsync(response);
        Assert.Equal("validation_error", doc.RootElement.GetProperty("code").GetString());
        Assert.True(doc.RootElement.TryGetProperty("errors", out var errors));
        Assert.True(errors.TryGetProperty("field", out _));
    }

    [Fact]
    public async Task ModelBindingFailure_Returns400WithSameCodeAsValidation_ButDifferentStatus()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/test-throw/model-state", new { });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = await ReadProblemAsync(response);
        Assert.Equal("validation_error", doc.RootElement.GetProperty("code").GetString());
        Assert.True(doc.RootElement.TryGetProperty("errors", out _));
    }

    [Fact]
    public async Task UnhandledException_UnderNonDevelopment_Returns500WithNoExceptionDetails()
    {
        var prodConfig = new Dictionary<string, string?>
        {
            ["Jwt:Issuer"] = "test-issuer",
            ["Jwt:Audience"] = "test-audience",
            ["Jwt:SigningKey"] = "test-signing-key-at-least-32-bytes-long!!",
            ["ConnectionStrings:EvoDb"] = "Server=localhost,1433;Database=EvoDb;User Id=sa;Password=Local_dev_only!1;TrustServerCertificate=True;",
        };

        var prodFactory = _factory.WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Staging"); // non-Development, and not the well-known-dev-key guard's "Production" special case either — just "not Development"
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(prodConfig));
        });

        var client = prodFactory.CreateClient();
        var response = await client.GetAsync("/test-throw/unhandled");

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        using var doc = await ReadProblemAsync(response);
        Assert.Equal("internal_error", doc.RootElement.GetProperty("code").GetString());
        var detail = doc.RootElement.GetProperty("detail").GetString() ?? string.Empty;
        Assert.DoesNotContain("boom", detail);
        Assert.DoesNotContain("InvalidOperationException", detail);
        Assert.True(doc.RootElement.TryGetProperty("traceId", out var traceId));
        Assert.False(string.IsNullOrEmpty(traceId.GetString()));
        Assert.False(string.IsNullOrEmpty(doc.RootElement.GetProperty("userMessage").GetString()));
    }

    [Fact]
    public void UserErrorMessages_UnmappedCode_ReturnsGenericFallback()
    {
        var entry = UserErrorMessages.For("some.code.nobody.registered");

        Assert.False(string.IsNullOrEmpty(entry.Title));
        Assert.False(string.IsNullOrEmpty(entry.Message));
    }
}
