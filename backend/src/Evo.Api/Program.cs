using Evo.Api.Audit;
using Evo.Api.Auth;
using Evo.Api.Errors;
using Evo.Api.Notifications;
using Evo.Api.Routing;
using Evo.Infrastructure;
using Evo.Infrastructure.Identity;
using Evo.Infrastructure.Routing;
using Evo.Infrastructure.Tasks;
using Evo.Api.Stores;
using Evo.Infrastructure.Stores.Sync;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IAuditWriter, AuditWriter>();
builder.Services.AddScoped<IRouteChangeLog, RouteChangeLog>();

builder.Services.AddProblemDetails(options => options.CustomizeProblemDetails = EvoProblemDetails.Customize);
builder.Services.AddExceptionHandler<EvoExceptionHandler>();
builder.Services.Configure<Microsoft.AspNetCore.Mvc.ApiBehaviorOptions>(options =>
    options.InvalidModelStateResponseFactory = ValidationProblem.Factory);

// Per-IP limiter on the anonymous auth endpoints (audit §C M2): Identity's lockout is
// per-account, so spraying many known accounts a few tries each never trips it. Dev/test
// environments raise the permit via config (the suite logs in once per test class).
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    var permitPerMinute = builder.Configuration.GetValue("RateLimiting:AuthPermitPerMinute", 10);
    options.AddPolicy("auth", context =>
        System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
            {
                PermitLimit = permitPerMinute,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));
});

// Analytics responses are identical for every Supervisor (2-role model, all-regions) and
// aggregate large scans on read (audit DB §3.1) — cache them briefly, varied by query string.
// excludeDefaultPolicy: the default policy refuses to cache authorized requests; these GET-only,
// cookie-free, role-uniform reports are safe to share. Dev/tests set the duration to 0 (NoCache)
// so assertions never see stale aggregates.
builder.Services.AddOutputCache(options =>
{
    var seconds = builder.Configuration.GetValue("OutputCache:AnalyticsSeconds", 60);
    options.AddPolicy("analytics", b =>
    {
        if (seconds <= 0)
        {
            b.NoCache();
            return;
        }
        b.Expire(TimeSpan.FromSeconds(seconds)).SetVaryByQuery("*");
    }, excludeDefaultPolicy: true);
});

builder.Services.Configure<JwtSettings>(builder.Configuration.GetSection(JwtSettings.SectionName));
builder.Services.AddSingleton<IJwtTokenService, JwtTokenService>();
builder.Services.AddScoped<IRefreshTokenService, RefreshTokenService>();

// Pooled + bounded command timeout (audit DB §3.10). Retry-on-failure is deliberately NOT
// enabled: mutation endpoints use explicit BeginTransaction (§3.6), which EF forbids
// combining with the retrying execution strategy without wrapping every transaction.
builder.Services.AddDbContextPool<EvoDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("EvoDb"),
        x => x.UseNetTopologySuite().CommandTimeout(30)));

builder.Services.AddDataProtection();

builder.Services.AddScoped<IStoreSyncService, StoreSyncService>();
// EXTENSION SEAM: swap FakeStoreSyncSource for the real IStoreSyncSource here once customer-IT
// answers land (see IStoreSyncSource.cs).
builder.Services.AddSingleton<IStoreSyncSource>(new FakeStoreSyncSource());
builder.Services.AddHostedService<StoreSyncBackgroundService>();

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<Evo.Infrastructure.Time.PlanningClock>();
builder.Services.AddScoped<ISettingsProvider, SettingsProvider>();
builder.Services.AddScoped<ITaskPlanProvider, TaskPlanProvider>();
builder.Services.AddScoped<IPlanGenerationService, PlanGenerationService>();
builder.Services.AddScoped<INotificationDispatcher, MockNotificationDispatcher>();
builder.Services.AddScoped<Evo.Api.Analytics.IStabilityService, Evo.Api.Analytics.StabilityService>();
builder.Services.AddScoped<Evo.Api.Analytics.IPlanHealthService, Evo.Api.Analytics.PlanHealthService>();
builder.Services.AddScoped<Evo.Api.Analytics.IMobilityService, Evo.Api.Analytics.MobilityService>();
builder.Services.AddScoped<Evo.Api.Onarim.DisruptionSource>();
builder.Services.AddScoped<Evo.Api.Onarim.IOnarimService, Evo.Api.Onarim.OnarimService>();
builder.Services.AddHostedService<PlanHorizonBackgroundService>();

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

app.UseExceptionHandler();

if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

// Security headers (audit §C H2). The API serves JSON only — a deny-all CSP here is pure
// defense-in-depth (the panel ships its own CSP via index.html); the rest stop MIME sniffing,
// framing and referrer leakage.
app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers["X-Content-Type-Options"] = "nosniff";
    headers["X-Frame-Options"] = "DENY";
    headers["Referrer-Policy"] = "no-referrer";
    headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'";
    await next();
});

app.UseHttpsRedirection();

app.UseRateLimiter();
app.UseOutputCache();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();

public partial class Program { }
