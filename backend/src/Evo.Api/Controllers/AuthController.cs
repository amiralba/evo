using System.Security.Claims;
using Evo.Api.Audit;
using Evo.Api.Auth;
using Evo.Api.Auth.Dtos;
using Evo.Api.Errors;
using Evo.Domain.Errors;
using Evo.Domain.Exceptions;
using Evo.Infrastructure.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace Evo.Api.Controllers;

[ApiController]
[Route("api/v1/auth")]
public class AuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly IJwtTokenService _jwtTokenService;
    private readonly IRefreshTokenService _refreshTokenService;
    private readonly IAuditWriter _auditWriter;
    private readonly IWebHostEnvironment _environment;

    public AuthController(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        IJwtTokenService jwtTokenService,
        IRefreshTokenService refreshTokenService,
        IAuditWriter auditWriter,
        IWebHostEnvironment environment)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _jwtTokenService = jwtTokenService;
        _refreshTokenService = refreshTokenService;
        _auditWriter = auditWriter;
        _environment = environment;
    }

    [AllowAnonymous]
    [Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("auth")]
    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest request)
    {
        var user = await _userManager.FindByEmailAsync(request.Email);
        if (user is null)
        {
            return this.EvoProblem(StatusCodes.Status401Unauthorized, ErrorCodes.AuthInvalidCredentials, "Invalid credentials.");
        }
        if (!user.IsActive)
        {
            return this.EvoProblem(StatusCodes.Status401Unauthorized, ErrorCodes.AuthAccountInactive, "Account is inactive.");
        }

        var result = await _signInManager.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: true);
        if (result.IsLockedOut)
        {
            return this.EvoProblem(StatusCodes.Status401Unauthorized, ErrorCodes.AuthLockedOut, "Account locked. Try again later.");
        }
        if (!result.Succeeded)
        {
            return this.EvoProblem(StatusCodes.Status401Unauthorized, ErrorCodes.AuthInvalidCredentials, "Invalid credentials.");
        }

        return await IssueLoginResponseAsync(user);
    }

    [AllowAnonymous]
    [Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("auth")]
    [HttpPost("refresh")]
    public async Task<ActionResult<LoginResponse>> Refresh()
    {
        if (!RefreshCookie.TryRead(Request, out var rawToken))
        {
            return this.EvoProblem(StatusCodes.Status401Unauthorized, ErrorCodes.Unauthorized, "No refresh token.");
        }

        var rotated = await _refreshTokenService.ValidateAndRotateAsync(rawToken);
        if (rotated is null)
        {
            RefreshCookie.Clear(Response);
            return this.EvoProblem(StatusCodes.Status401Unauthorized, ErrorCodes.Unauthorized, "Refresh token is invalid or expired.");
        }

        var user = await _userManager.FindByIdAsync(rotated.Value.UserId.ToString());
        if (user is null || !user.IsActive)
        {
            RefreshCookie.Clear(Response);
            return this.EvoProblem(StatusCodes.Status401Unauthorized, ErrorCodes.AuthAccountInactive, "Account no longer active.");
        }

        RefreshCookie.Set(Response, rotated.Value.RawToken, rotated.Value.ExpiresAt, _environment.IsDevelopment());

        var roles = await _userManager.GetRolesAsync(user);
        var (accessToken, expiresAt) = _jwtTokenService.GenerateAccessToken(user, roles);
        var me = new MeResponse(user.Id, user.Email ?? string.Empty, user.DisplayName, roles.ToArray());
        return new LoginResponse(accessToken, expiresAt, me);
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        if (RefreshCookie.TryRead(Request, out var rawToken))
        {
            await _refreshTokenService.RevokeAsync(rawToken);
        }
        RefreshCookie.Clear(Response);
        return NoContent();
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<MeResponse>> Me()
    {
        var user = await FindCurrentUserAsync() ?? throw new NotFoundException("User");
        var roles = await _userManager.GetRolesAsync(user);
        return new MeResponse(user.Id, user.Email ?? string.Empty, user.DisplayName, roles.ToArray());
    }

    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request)
    {
        var user = await FindCurrentUserAsync() ?? throw new NotFoundException("User");

        var result = await _userManager.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
        if (!result.Succeeded)
        {
            throw new EvoValidationException(new Dictionary<string, string[]>
            {
                ["currentPassword"] = result.Errors.Select(e => e.Description).ToArray(),
            });
        }

        await _refreshTokenService.RevokeAllForUserAsync(user.Id);
        await _auditWriter.WriteAsync("User", user.Id.ToString(), "password_changed");
        RefreshCookie.Clear(Response);
        return NoContent();
    }

    private Task<ApplicationUser?> FindCurrentUserAsync()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return userId is null ? Task.FromResult<ApplicationUser?>(null) : _userManager.FindByIdAsync(userId);
    }

    private async Task<LoginResponse> IssueLoginResponseAsync(ApplicationUser user)
    {
        var roles = await _userManager.GetRolesAsync(user);
        var (accessToken, expiresAt) = _jwtTokenService.GenerateAccessToken(user, roles);
        var (rawRefreshToken, refreshExpiresAt) = await _refreshTokenService.IssueAsync(user.Id);

        RefreshCookie.Set(Response, rawRefreshToken, refreshExpiresAt, _environment.IsDevelopment());

        var me = new MeResponse(user.Id, user.Email ?? string.Empty, user.DisplayName, roles.ToArray());
        return new LoginResponse(accessToken, expiresAt, me);
    }
}
