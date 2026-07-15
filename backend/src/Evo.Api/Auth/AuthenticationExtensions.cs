using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

namespace Evo.Api.Auth;

public static class AuthenticationExtensions
{
    /// <summary>
    /// Registers local JWT bearer auth (see docs/AUTH.md for the token model). This is the seam
    /// where AD/Entra SSO plugs in later — see the EXTENSION SEAM comment below. No real
    /// Entra/OIDC code exists yet; it is blocked on the 9 open customer-IT questions (see
    /// docs/DECISIONS.md).
    /// </summary>
    public static IServiceCollection AddEvoAuthentication(this IServiceCollection services, IConfiguration configuration)
    {
        var jwtSection = configuration.GetSection(JwtSettings.SectionName);
        var settings = jwtSection.Get<JwtSettings>() ?? new JwtSettings();

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = settings.Issuer,
                    ValidateAudience = true,
                    ValidAudience = settings.Audience,
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(settings.SigningKey)),
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromSeconds(30),
                };
                // Default behavior already reads the token from the `Authorization: Bearer` header.
            });

        // EXTENSION SEAM: register additional authentication schemes here (e.g. Entra/OIDC via
        // .AddMicrosoftIdentityWebApi(configuration.GetSection("Entra"))) once the customer
        // confirms they want AD/Entra SSO. See docs/AUTH.md "How to add AD/Entra later" for the
        // full plug-in steps (package, config section, Entra-group→EVO-role claim mapping).

        services.AddAuthorization();

        return services;
    }
}
