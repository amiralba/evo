using Evo.Domain.Errors;

namespace Evo.Domain.Exceptions;

public class ConflictException : EvoException
{
    public ConflictException(string message)
        : base(message, ErrorCodes.Conflict, 409)
    {
    }
}
