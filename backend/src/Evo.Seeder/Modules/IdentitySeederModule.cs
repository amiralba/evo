using Evo.Domain.Auth;
using Evo.Infrastructure;
using Evo.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Seeder.Modules;

/// <summary>
/// Seeds the two Identity roles, one bootstrap Supervisor admin, and (demo profile only) a
/// handful of Field agents — Field agents have no account-creation API (see spec 002), so the
/// seeder is their only account source. Idempotent: safe to re-run.
/// </summary>
public class IdentitySeederModule : ISeederModule
{
    public string Name => "Identity";

    public async Task SeedAsync(EvoDbContext db, SeedProfile profile, Bogus.Faker faker, IServiceProvider services, CancellationToken ct)
    {
        var roleManager = services.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();

        foreach (var roleName in Roles.All)
        {
            if (!await roleManager.RoleExistsAsync(roleName))
            {
                await roleManager.CreateAsync(new IdentityRole<Guid>(roleName));
            }
        }

        var adminEmail = Environment.GetEnvironmentVariable("EVO_SEED_ADMIN_EMAIL")
            ?? "admin@evo.local";
        var adminPassword = Environment.GetEnvironmentVariable("EVO_SEED_ADMIN_PASSWORD")
            ?? (profile == SeedProfile.Demo ? "Demo1234!" : null);

        if (adminPassword is null)
        {
            Console.WriteLine("EVO_SEED_ADMIN_PASSWORD not set — skipping bootstrap admin (required outside demo profile).");
        }
        else if (await userManager.FindByEmailAsync(adminEmail) is null)
        {
            var admin = new ApplicationUser
            {
                UserName = adminEmail,
                Email = adminEmail,
                DisplayName = "EVO Admin",
                EmailConfirmed = true,
            };
            var result = await userManager.CreateAsync(admin, adminPassword);
            if (result.Succeeded)
            {
                await userManager.AddToRoleAsync(admin, Roles.Supervisor);
                Console.WriteLine($"Created bootstrap Supervisor: {adminEmail}");
            }
            else
            {
                Console.Error.WriteLine($"Failed to create bootstrap admin: {string.Join(", ", result.Errors.Select(e => e.Description))}");
            }
        }

        if (profile == SeedProfile.Demo)
        {
            var demoAgents = new[]
            {
                ("ayse.demir@evo.local", "Ayşe Demir"),
                ("mehmet.kaya@evo.local", "Mehmet Kaya"),
                ("fatma.sahin@evo.local", "Fatma Şahin"),
            };

            foreach (var (email, displayName) in demoAgents)
            {
                if (await userManager.FindByEmailAsync(email) is not null)
                {
                    continue;
                }

                var agent = new ApplicationUser
                {
                    UserName = email,
                    Email = email,
                    DisplayName = displayName,
                    EmailConfirmed = true,
                };
                var result = await userManager.CreateAsync(agent, "Demo1234!");
                if (result.Succeeded)
                {
                    await userManager.AddToRoleAsync(agent, Roles.FieldAgent);
                }
            }
        }
    }
}
