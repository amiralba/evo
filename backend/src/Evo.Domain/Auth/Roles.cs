namespace Evo.Domain.Auth;

public static class Roles
{
    public const string Supervisor = "Supervisor";
    public const string FieldAgent = "FieldAgent";

    public static readonly string[] All = { Supervisor, FieldAgent };
}
