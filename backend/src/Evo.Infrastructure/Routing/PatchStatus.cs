namespace Evo.Infrastructure.Routing;

public enum PatchStatus : byte
{
    Pending = 1,
    Active = 2,
    Expired = 3,
    Cancelled = 4,
}
