using Evo.Domain.Errors;
using Evo.Domain.Exceptions;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace Evo.Api.Errors;

/// <summary>
/// Maps the domain-exception taxonomy (EvoException and subclasses) to the unified error shape,
/// and turns any other unhandled exception into a generic 500 — exception details/stack are only
/// included in the response when running in Development.
/// </summary>
public class EvoExceptionHandler : IExceptionHandler
{
    private readonly IProblemDetailsService _problemDetailsService;
    private readonly IHostEnvironment _environment;

    public EvoExceptionHandler(IProblemDetailsService problemDetailsService, IHostEnvironment environment)
    {
        _problemDetailsService = problemDetailsService;
        _environment = environment;
    }

    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        ProblemDetails problemDetails;

        if (exception is EvoException evoException)
        {
            problemDetails = new ProblemDetails
            {
                Status = evoException.StatusCode,
                Title = exception.GetType().Name,
                Detail = evoException.Message,
            };
            problemDetails.Extensions["code"] = evoException.Code;
            if (evoException.Errors is not null)
            {
                problemDetails.Extensions["errors"] = evoException.Errors;
            }
        }
        else
        {
            problemDetails = new ProblemDetails
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = "An unexpected error occurred.",
                Detail = _environment.IsDevelopment() ? exception.ToString() : "An unexpected error occurred. Contact support with the traceId if this persists.",
            };
            problemDetails.Extensions["code"] = ErrorCodes.InternalError;
        }

        httpContext.Response.StatusCode = problemDetails.Status.Value;

        return await _problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problemDetails,
            Exception = exception,
        });
    }
}
