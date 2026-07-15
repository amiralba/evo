using System.Diagnostics;
using Microsoft.AspNetCore.Http;
using Evo.Domain.Errors;
using Microsoft.AspNetCore.Mvc;

namespace Evo.Api.Errors;

public static class EvoProblemDetails
{
    /// <summary>
    /// Registered via AddProblemDetails(options => options.CustomizeProblemDetails = ...).
    /// Normalizes every ProblemDetails the framework generates (401/403/404 short-circuits,
    /// model-binding 400s, IExceptionHandler output): drops the RFC 7807 "instance" field,
    /// stamps a traceId, and backfills a default "code" by status if one wasn't already set.
    /// </summary>
    public static void Customize(ProblemDetailsContext context)
    {
        context.ProblemDetails.Instance = null;
        context.ProblemDetails.Extensions["traceId"] =
            Activity.Current?.Id ?? context.HttpContext.TraceIdentifier;

        if (!context.ProblemDetails.Extensions.ContainsKey("code"))
        {
            context.ProblemDetails.Extensions["code"] = context.ProblemDetails.Status switch
            {
                401 => ErrorCodes.Unauthorized,
                403 => ErrorCodes.Forbidden,
                404 => ErrorCodes.NotFound,
                409 => ErrorCodes.Conflict,
                _ => ErrorCodes.InternalError,
            };
        }
    }
}

public static class ControllerBaseExtensions
{
    /// <summary>
    /// Emits the unified error shape directly from a controller action. Bypasses
    /// IProblemDetailsService (so the CustomizeProblemDetails hook never runs against it) —
    /// traceId and the "instance"-omission are therefore applied inline here to match.
    /// </summary>
    public static ObjectResult EvoProblem(this ControllerBase controller, int status, string code, string title, string? detail = null)
    {
        var problemDetails = new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = detail,
        };
        problemDetails.Extensions["code"] = code;
        problemDetails.Extensions["traceId"] = Activity.Current?.Id ?? controller.HttpContext.TraceIdentifier;

        return new ObjectResult(problemDetails)
        {
            StatusCode = status,
            ContentTypes = { "application/problem+json" },
        };
    }
}
