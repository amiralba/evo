using Microsoft.AspNetCore.Mvc;
using System.Reflection;

namespace Evo.Api.Controllers;

public record HealthResponse(string Status, string Version);

[ApiController]
[Route("api/v1/health")]
public class HealthController : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<HealthResponse>(StatusCodes.Status200OK)]
    public ActionResult<HealthResponse> Get()
    {
        var version = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.0.0";
        return Ok(new HealthResponse("ok", version));
    }
}
