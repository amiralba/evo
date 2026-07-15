using Evo.Api.Auth;
using Evo.Infrastructure;
using Evo.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.Configure<JwtSettings>(builder.Configuration.GetSection(JwtSettings.SectionName));
builder.Services.AddSingleton<IJwtTokenService, JwtTokenService>();
builder.Services.AddScoped<IRefreshTokenService, RefreshTokenService>();

builder.Services.AddDbContext<EvoDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("EvoDb")));

builder.Services.AddDataProtection();

// AddIdentityCore (not AddIdentity) — avoids registering the default cookie auth schemes,
// since this API uses JWT bearer auth (see Auth/AuthenticationExtensions.cs).
builder.Services.AddIdentityCore<ApplicationUser>(options =>
    {
        options.Password.RequiredLength = 8;
        options.Password.RequireDigit = true;
        options.Password.RequireUppercase = true;
        options.Password.RequireNonAlphanumeric = false;
        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(5);
        options.Lockout.AllowedForNewUsers = true;
    })
    .AddRoles<IdentityRole<Guid>>()
    .AddEntityFrameworkStores<EvoDbContext>()
    .AddSignInManager()
    .AddDefaultTokenProviders();

builder.Services.AddEvoAuthentication(builder.Configuration);

var app = builder.Build();

var jwtSettings = app.Services.GetRequiredService<Microsoft.Extensions.Options.IOptions<JwtSettings>>().Value;
if (string.IsNullOrEmpty(jwtSettings.Issuer) || string.IsNullOrEmpty(jwtSettings.Audience))
{
    throw new InvalidOperationException("Jwt:Issuer and Jwt:Audience must be configured.");
}
if (string.IsNullOrEmpty(jwtSettings.SigningKey) || System.Text.Encoding.UTF8.GetByteCount(jwtSettings.SigningKey) < 32)
{
    throw new InvalidOperationException("Jwt:SigningKey must be configured and at least 256 bits (32 bytes).");
}
if (!app.Environment.IsDevelopment() && jwtSettings.SigningKey == JwtSettings.WellKnownDevSigningKey)
{
    throw new InvalidOperationException("Jwt:SigningKey is still set to the committed dev placeholder — set a real secret (env var / secret store) outside Development.");
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();

public partial class Program { }
