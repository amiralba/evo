using Evo.Api.Auth;
using Evo.Api.Auth.Dtos;
using Evo.Domain.Auth;
using Evo.Infrastructure.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace Evo.Api.Controllers;

[ApiController]
[Authorize(Roles = Roles.Supervisor)]
[Route("api/v1/users")]
public class UsersController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IRefreshTokenService _refreshTokenService;

    public UsersController(UserManager<ApplicationUser> userManager, IRefreshTokenService refreshTokenService)
    {
        _userManager = userManager;
        _refreshTokenService = refreshTokenService;
    }

    public record UpdateUserRequest(string DisplayName);

    [HttpPost]
    public async Task<ActionResult<UserSummary>> Create(CreateUserRequest request)
    {
        if (request.Role != Roles.Supervisor)
        {
            return Problem(
                statusCode: StatusCodes.Status403Forbidden,
                title: "Only Supervisor accounts can be created via this API.",
                detail: "Field agents are provisioned by the seeder only (see docs/AUTH.md).");
        }

        var user = new ApplicationUser
        {
            UserName = request.Email,
            Email = request.Email,
            DisplayName = request.DisplayName,
            EmailConfirmed = true,
            IsActive = true,
        };

        var result = await _userManager.CreateAsync(user, request.TemporaryPassword);
        if (!result.Succeeded)
        {
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Could not create user.",
                detail: string.Join(" ", result.Errors.Select(e => e.Description)));
        }

        await _userManager.AddToRoleAsync(user, Roles.Supervisor);

        var summary = new UserSummary(user.Id, user.Email!, user.DisplayName, new[] { Roles.Supervisor }, user.IsActive);
        return CreatedAtAction(nameof(GetById), new { id = user.Id }, summary);
    }

    [HttpGet]
    public async Task<ActionResult<List<UserSummary>>> List()
    {
        var users = _userManager.Users.ToList();
        var summaries = new List<UserSummary>();
        foreach (var user in users)
        {
            var roles = await _userManager.GetRolesAsync(user);
            summaries.Add(new UserSummary(user.Id, user.Email ?? string.Empty, user.DisplayName, roles.ToArray(), user.IsActive));
        }
        return summaries;
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<UserSummary>> GetById(Guid id)
    {
        var user = await _userManager.FindByIdAsync(id.ToString());
        if (user is null)
        {
            return NotFound();
        }
        var roles = await _userManager.GetRolesAsync(user);
        return new UserSummary(user.Id, user.Email ?? string.Empty, user.DisplayName, roles.ToArray(), user.IsActive);
    }

    [HttpPatch("{id:guid}")]
    public async Task<ActionResult<UserSummary>> Update(Guid id, UpdateUserRequest request)
    {
        var user = await _userManager.FindByIdAsync(id.ToString());
        if (user is null)
        {
            return NotFound();
        }

        user.DisplayName = request.DisplayName;
        await _userManager.UpdateAsync(user);

        var roles = await _userManager.GetRolesAsync(user);
        return new UserSummary(user.Id, user.Email ?? string.Empty, user.DisplayName, roles.ToArray(), user.IsActive);
    }

    [HttpPost("{id:guid}/activate")]
    public async Task<IActionResult> Activate(Guid id)
    {
        var user = await _userManager.FindByIdAsync(id.ToString());
        if (user is null)
        {
            return NotFound();
        }

        user.IsActive = true;
        await _userManager.UpdateAsync(user);
        return NoContent();
    }

    [HttpPost("{id:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(Guid id)
    {
        var user = await _userManager.FindByIdAsync(id.ToString());
        if (user is null)
        {
            return NotFound();
        }

        user.IsActive = false;
        await _userManager.UpdateAsync(user);
        await _refreshTokenService.RevokeAllForUserAsync(user.Id);
        return NoContent();
    }
}
