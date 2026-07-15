using System.Security.Claims;
using Evo.Api.Auth;
using Evo.Api.Auth.Dtos;
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
    private readonly IWebHostEnvironment _environment;

    public AuthController(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        IJwtTokenService jwtTokenService,
        IRefreshTokenService refreshTokenService,
        IWebHostEnvironment environment)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _jwtTokenService = jwtTokenService;
        _refreshTokenService = refreshTokenService;
        _environment = environment;
    }

    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest request)
    {
        var user = await _userManager.FindByEmailAsync(request.Email);
        if (user is null || !user.IsActive)
        {
            return Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Invalid credentials.");
        }

        var result = await _signInManager.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: true);
        if (result.IsLockedOut)
        {
            return Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Account locked. Try again later.");
        }
        if (!result.Succeeded)
        {
            return Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Invalid credentials.");
        }

        return await IssueLoginResponseAsync(user);
    }

    [AllowAnonymous]
    [HttpPost("refresh")]
    public async Task<ActionResult<LoginResponse>> Refresh()
    {
        if (!RefreshCookie.TryRead(Request, out var rawToken))
        {
            return Problem(statusCode: StatusCodes.Status401Unauthorized, title: "No refresh token.");
        }

        var rotated = await _refreshTokenService.ValidateAndRotateAsync(rawToken);
        if (rotated is null)
        {
            RefreshCookie.Clear(Response);
            return Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Refresh token is invalid or expired.");
        }

        var user = await _userManager.FindByIdAsync(rotated.Value.UserId.ToString());
        if (user is null || !user.IsActive)
        {
            RefreshCookie.Clear(Response);
            return Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Account no longer active.");
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
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        var user = userId is null ? null : await _userManager.FindByIdAsync(userId);
        if (user is null)
        {
            return Problem(statusCode: StatusCodes.Status401Unauthorized, title: "User not found.");
        }

        var roles = await _userManager.GetRolesAsync(user);
        return new MeResponse(user.Id, user.Email ?? string.Empty, user.DisplayName, roles.ToArray());
    }

    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        var user = userId is null ? null : await _userManager.FindByIdAsync(userId);
        if (user is null)
        {
            return Problem(statusCode: StatusCodes.Status401Unauthorized, title: "User not found.");
        }

        var result = await _userManager.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
        if (!result.Succeeded)
        {
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Could not change password.",
                detail: string.Join(" ", result.Errors.Select(e => e.Description)));
        }

        await _refreshTokenService.RevokeAllForUserAsync(user.Id);
        RefreshCookie.Clear(Response);
        return NoContent();
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
