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
            // Field agents = the pool of people the planner assigns to routes. Seed a surplus (well
            // more than the 5 seeded routes) so routes can be BUILT in the panel with a free
            // merchandiser to choose from — routes are the planner's work product, not seed data.
            var demoAgents = new List<(string Email, string Name)>
            {
                ("ayse.demir@evo.local", "Ayşe Demir"),
                ("mehmet.kaya@evo.local", "Mehmet Kaya"),
                ("fatma.sahin@evo.local", "Fatma Şahin"),
                ("ali.yildiz@evo.local", "Ali Yıldız"),
                ("zeynep.arslan@evo.local", "Zeynep Arslan"),
            };
            for (var i = 1; i <= 20; i++)
            {
                demoAgents.Add(($"saha-{i:D2}@evo.local", faker.Name.FullName()));
            }

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
        else
        {
            // Scale profile: generate deterministic fake agents for the merchandiser pool
            // (routes are the planner's work product — built in the panel, not seeded).
            for (var i = 1; i <= 50; i++)
            {
                var email = $"scale-agent-{i:D3}@evo.local";
                if (await userManager.FindByEmailAsync(email) is not null)
                {
                    continue;
                }

                var agent = new ApplicationUser
                {
                    UserName = email,
                    Email = email,
                    DisplayName = faker.Name.FullName(),
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
