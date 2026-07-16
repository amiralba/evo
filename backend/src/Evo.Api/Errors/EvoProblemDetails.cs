using System.Diagnostics;
using Evo.Domain.Errors;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Evo.Api.Errors;

public static class EvoProblemDetails
{
    /// <summary>
    /// Registered via AddProblemDetails(options => options.CustomizeProblemDetails = ...).
    /// Normalizes every ProblemDetails the framework generates (401/403/404 short-circuits,
    /// model-binding 400s, IExceptionHandler output): drops the RFC 7807 "instance" field,
    /// stamps a traceId, backfills a default "code" by status if one wasn't already set, and
    /// attaches the Turkish userTitle/userMessage pair for that code.
    /// </summary>
    public static void Customize(ProblemDetailsContext context)
    {
        var code = context.ProblemDetails.Extensions.TryGetValue("code", out var existing) && existing is string existingCode
            ? existingCode
            : DefaultCodeForStatus(context.ProblemDetails.Status);

        Finalize(context.ProblemDetails, context.HttpContext, code);
    }

    /// <summary>
    /// Shared tail applied to every unified error response, whether or not it went through
    /// IProblemDetailsService (the two paths that bypass it — EvoProblem and the model-state
    /// factory — call this directly so the shape is identical everywhere).
    /// </summary>
    public static void Finalize(ProblemDetails problemDetails, HttpContext httpContext, string code)
    {
        problemDetails.Instance = null;
        problemDetails.Extensions["code"] = code;
        problemDetails.Extensions["traceId"] = Activity.Current?.Id ?? httpContext.TraceIdentifier;

        var userMessage = UserErrorMessages.For(code);
        problemDetails.Extensions["userTitle"] = userMessage.Title;
        problemDetails.Extensions["userMessage"] = userMessage.Message;
    }

    private static string DefaultCodeForStatus(int? status) => status switch
    {
        401 => ErrorCodes.Unauthorized,
        403 => ErrorCodes.Forbidden,
        404 => ErrorCodes.NotFound,
        409 => ErrorCodes.Conflict,
        _ => ErrorCodes.InternalError,
    };
}

public static class ControllerBaseExtensions
{
    /// <summary>Emits the unified error shape directly from a controller action.</summary>
    public static ObjectResult EvoProblem(this ControllerBase controller, int status, string code, string title, string? detail = null)
    {
        var problemDetails = new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = detail,
        };
        EvoProblemDetails.Finalize(problemDetails, controller.HttpContext, code);

        return new ObjectResult(problemDetails)
        {
            StatusCode = status,
            ContentTypes = { "application/problem+json" },
        };
    }
}
