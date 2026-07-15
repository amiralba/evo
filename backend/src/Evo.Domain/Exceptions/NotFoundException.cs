using Evo.Domain.Errors;

namespace Evo.Domain.Exceptions;

public class NotFoundException : EvoException
{
    public NotFoundException(string? entityName = null)
        : base(entityName is null ? "The requested resource was not found." : $"{entityName} was not found.", ErrorCodes.NotFound, 404)
    {
    }
}
