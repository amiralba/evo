namespace Evo.Domain.Exceptions;

/// <summary>
/// Base of the domain-exception taxonomy the API's IExceptionHandler (spec 003) maps to the
/// unified error shape: HTTP status = StatusCode, machine-readable code = Code, and Errors (if
/// present) renders as the response's field-level "errors" dictionary.
/// </summary>
public abstract class EvoException : Exception
{
    public string Code { get; }
    public int StatusCode { get; }
    public IReadOnlyDictionary<string, string[]>? Errors { get; }

    protected EvoException(string message, string code, int statusCode, IReadOnlyDictionary<string, string[]>? errors = null)
        : base(message)
    {
        Code = code;
        StatusCode = statusCode;
        Errors = errors;
    }
}
