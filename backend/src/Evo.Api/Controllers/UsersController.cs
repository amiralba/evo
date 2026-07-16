using Evo.Api.Audit;
using Evo.Api.Auth;
using Evo.Api.Auth.Dtos;
using Evo.Api.Errors;
using Evo.Domain.Auth;
using Evo.Domain.Errors;
using Evo.Domain.Exceptions;
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
    private readonly IAuditWriter _auditWriter;

    public UsersController(UserManager<ApplicationUser> userManager, IRefreshTokenService refreshTokenService, IAuditWriter auditWriter)
    {
        _userManager = userManager;
        _refreshTokenService = refreshTokenService;
        _auditWriter = auditWriter;
    }

    public record UpdateUserRequest(string DisplayName);

    [HttpPost]
    public async Task<ActionResult<UserSummary>> Create(CreateUserRequest request)
    {
        if (request.Role != Roles.Supervisor)
        {
            return this.EvoProblem(
                StatusCodes.Status403Forbidden,
                ErrorCodes.UserOnlySupervisorCreatable,
                "Only Supervisor accounts can be created via this API.",
                "Field agents are provisioned by the seeder only (see docs/AUTH.md).");
        }

        if (await _userManager.FindByEmailAsync(request.Email) is not null)
        {
            throw new ConflictException($"A user with email '{request.Email}' already exists.");
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
            throw new EvoValidationException(ToErrorsDictionary(result));
        }

        await _userManager.AddToRoleAsync(user, Roles.Supervisor);

        var summary = new UserSummary(user.Id, user.Email!, user.DisplayName, new[] { Roles.Supervisor }, user.IsActive);
        await _auditWriter.WriteAsync("User", user.Id.ToString(), "created", after: summary);

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
        var user = await _userManager.FindByIdAsync(id.ToString()) ?? throw new NotFoundException("User");
        var roles = await _userManager.GetRolesAsync(user);
        return new UserSummary(user.Id, user.Email ?? string.Empty, user.DisplayName, roles.ToArray(), user.IsActive);
    }

    [HttpPatch("{id:guid}")]
    public async Task<ActionResult<UserSummary>> Update(Guid id, UpdateUserRequest request)
    {
        var user = await _userManager.FindByIdAsync(id.ToString()) ?? throw new NotFoundException("User");

        user.DisplayName = request.DisplayName;
        await _userManager.UpdateAsync(user);

        var roles = await _userManager.GetRolesAsync(user);
        return new UserSummary(user.Id, user.Email ?? string.Empty, user.DisplayName, roles.ToArray(), user.IsActive);
    }

    [HttpPost("{id:guid}/activate")]
    public async Task<IActionResult> Activate(Guid id)
    {
        var user = await _userManager.FindByIdAsync(id.ToString()) ?? throw new NotFoundException("User");

        user.IsActive = true;
        await _userManager.UpdateAsync(user);
        await _auditWriter.WriteAsync("User", user.Id.ToString(), "activated", before: new { IsActive = false }, after: new { IsActive = true });
        return NoContent();
    }

    [HttpPost("{id:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(Guid id)
    {
        var user = await _userManager.FindByIdAsync(id.ToString()) ?? throw new NotFoundException("User");

        user.IsActive = false;
        await _userManager.UpdateAsync(user);
        await _refreshTokenService.RevokeAllForUserAsync(user.Id);
        await _auditWriter.WriteAsync("User", user.Id.ToString(), "deactivated", before: new { IsActive = true }, after: new { IsActive = false });
        return NoContent();
    }

    private static Dictionary<string, string[]> ToErrorsDictionary(IdentityResult result) =>
        new() { ["identity"] = result.Errors.Select(e => e.Description).ToArray() };
}
