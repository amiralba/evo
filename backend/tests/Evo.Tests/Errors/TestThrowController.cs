using System.ComponentModel.DataAnnotations;
using Evo.Domain.Exceptions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Evo.Tests.Errors;

/// <summary>Test-only controller exercising every branch of the error-shape pipeline (spec 003).</summary>
[ApiController]
[AllowAnonymous]
[Route("test-throw")]
public class TestThrowController : ControllerBase
{
    [HttpGet("not-found")]
    public IActionResult ThrowNotFound() => throw new NotFoundException("Widget");

    [HttpGet("conflict")]
    public IActionResult ThrowConflict() => throw new ConflictException("Widget already exists.");

    [HttpGet("validation")]
    public IActionResult Validation() =>
        throw new EvoValidationException(new Dictionary<string, string[]> { ["field"] = new[] { "Must not be empty." } });

    [HttpGet("unhandled")]
    public IActionResult Unhandled() => throw new InvalidOperationException("boom - sensitive internal detail");

    public record ModelStateProbeRequest([Required] string RequiredField);

    [HttpPost("model-state")]
    public IActionResult ModelStateProbe(ModelStateProbeRequest request) => Ok();
}
