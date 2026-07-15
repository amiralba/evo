using System.Net.Http.Json;
using Evo.Domain.Auth;
using Evo.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests.Auth;

internal static class TestAuthHelper
{
    public static async Task<ApplicationUser> EnsureUserAsync(
        WebApplicationFactory<Program> factory, string email, string password, string role)
    {
        using var scope = factory.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();

        foreach (var roleName in Roles.All)
        {
            if (!await roleManager.RoleExistsAsync(roleName))
            {
                await roleManager.CreateAsync(new IdentityRole<Guid>(roleName));
            }
        }

        var existing = await userManager.FindByEmailAsync(email);
        if (existing is not null)
        {
            existing.IsActive = true;
            await userManager.SetLockoutEndDateAsync(existing, null);
            existing.AccessFailedCount = 0;
            await userManager.UpdateAsync(existing);
            if (!await userManager.IsInRoleAsync(existing, role))
            {
                await userManager.AddToRoleAsync(existing, role);
            }
            return existing;
        }

        var user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            DisplayName = "Test " + role,
            EmailConfirmed = true,
            IsActive = true,
        };
        var result = await userManager.CreateAsync(user, password);
        if (!result.Succeeded)
        {
            throw new InvalidOperationException(string.Join(", ", result.Errors.Select(e => e.Description)));
        }
        await userManager.AddToRoleAsync(user, role);
        return user;
    }

    /// <summary>Logs in via the real endpoint and returns a client with the bearer header set.</summary>
    public static async Task<HttpClient> LoginAsync(WebApplicationFactory<Program> factory, string email, string password)
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new { Email = email, Password = password });
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<LoginResponseDto>();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", body!.AccessToken);
        return client;
    }

    public sealed record LoginResponseDto(string AccessToken, DateTimeOffset ExpiresAt, MeResponseDto User);
    public sealed record MeResponseDto(Guid Id, string Email, string DisplayName, string[] Roles);
}
