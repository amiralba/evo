using System.Text.Json;

namespace Evo.Domain.Tasks;

public static class TaskResultJson
{
    public static string Serialize(object result) => JsonSerializer.Serialize(result, result.GetType());

    public static object? TryDeserialize(string json, ResultKind kind) => kind switch
    {
        ResultKind.None => JsonSerializer.Deserialize<TaskResultNone>(json),
        ResultKind.Photo => JsonSerializer.Deserialize<TaskResultPhoto>(json),
        ResultKind.Form => JsonSerializer.Deserialize<TaskResultForm>(json),
        _ => null,
    };
}
