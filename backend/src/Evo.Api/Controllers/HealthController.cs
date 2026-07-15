using Microsoft.AspNetCore.Mvc;
using System.Reflection;

namespace Evo.Api.Controllers;

[ApiController]
[Route("api/v1/health")]
public class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        var version = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.0.0";
        return Ok(new { status = "ok", version });
    }
}
