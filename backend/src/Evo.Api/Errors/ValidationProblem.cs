using System.Diagnostics;
using Evo.Domain.Errors;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Infrastructure;

namespace Evo.Api.Errors;

public static class ValidationProblem
{
    /// <summary>
    /// Replaces the default [ApiController] model-binding 400 with the unified error shape:
    /// code=validation_error + errors={field:[messages]}. Distinct from EvoValidationException
    /// (422, domain-rule violations) — this handles malformed/incomplete requests.
    /// </summary>
    public static ActionResult Factory(ActionContext context)
    {
        var errors = context.ModelState
            .Where(entry => entry.Value?.Errors.Count > 0)
            .ToDictionary(
                entry => entry.Key,
                entry => entry.Value!.Errors.Select(e => e.ErrorMessage).ToArray());

        var problemDetails = new ProblemDetails
        {
            Status = StatusCodes.Status400BadRequest,
            Title = "One or more validation errors occurred.",
        };
        problemDetails.Extensions["code"] = ErrorCodes.ValidationError;
        problemDetails.Extensions["errors"] = errors;
        problemDetails.Extensions["traceId"] = Activity.Current?.Id ?? context.HttpContext.TraceIdentifier;

        return new ObjectResult(problemDetails)
        {
            StatusCode = StatusCodes.Status400BadRequest,
            ContentTypes = { "application/problem+json" },
        };
    }
}
