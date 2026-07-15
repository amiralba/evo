using Evo.Domain.Errors;

namespace Evo.Domain.Exceptions;

/// <summary>
/// A well-formed request that violates a domain/business rule — distinct from model-binding
/// failures (400, handled by the ApiBehaviorOptions factory). Maps to 422 Unprocessable Entity.
/// </summary>
public class EvoValidationException : EvoException
{
    public EvoValidationException(IReadOnlyDictionary<string, string[]> errors)
        : base("The request failed validation.", ErrorCodes.ValidationError, 422, errors)
    {
    }
}
