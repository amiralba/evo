using Evo.Api.Analytics;
using Evo.Api.Analytics.Dtos;
using Evo.Domain.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Evo.Api.Controllers;

[ApiController]
[Route("api/v1/analytics")]
[Authorize(Roles = Roles.Supervisor)]
public class AnalyticsController : ControllerBase
{
    private readonly IPlanHealthService _planHealthService;
    private readonly IStabilityService _stabilityService;
    private readonly IMobilityService _mobilityService;

    public AnalyticsController(IPlanHealthService planHealthService, IStabilityService stabilityService, IMobilityService mobilityService)
    {
        _planHealthService = planHealthService;
        _stabilityService = stabilityService;
        _mobilityService = mobilityService;
    }

    [HttpGet("plan-health")]
    public async Task<ActionResult<PlanHealthReportDto>> GetPlanHealth([FromQuery] string? region, [FromQuery] DateOnly? from, [FromQuery] DateOnly? to)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var effectiveTo = to ?? today;
        var effectiveFrom = from ?? effectiveTo.AddDays(-28);
        return await _planHealthService.GetReportAsync(region, effectiveFrom, effectiveTo);
    }

    [HttpGet("stability")]
    public async Task<ActionResult<IReadOnlyList<RouteStabilityDto>>> GetStability([FromQuery] string? region)
    {
        return (await _stabilityService.GetRegionStabilityAsync(region)).ToList();
    }

    [HttpGet("mobility")]
    public async Task<ActionResult<IReadOnlyList<MerchandiserMobilityDto>>> GetMobility([FromQuery] string? region, [FromQuery] int months = 12)
    {
        return (await _mobilityService.GetReportAsync(region, months)).ToList();
    }
}
