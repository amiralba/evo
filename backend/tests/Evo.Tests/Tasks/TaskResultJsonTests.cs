using Evo.Domain.Tasks;

namespace Evo.Tests.Tasks;

public class TaskResultJsonTests
{
    [Fact]
    public void None_RoundTrips()
    {
        var result = new TaskResultNone(new DateTimeOffset(2026, 7, 17, 10, 0, 0, TimeSpan.Zero), "Görev tamamlandı");
        var json = TaskResultJson.Serialize(result);
        var deserialized = TaskResultJson.TryDeserialize(json, ResultKind.None) as TaskResultNone;

        Assert.NotNull(deserialized);
        Assert.Equal(result.CompletedAt, deserialized!.CompletedAt);
        Assert.Equal(result.Note, deserialized.Note);
    }

    [Fact]
    public void Photo_RoundTrips_WithPhotoList()
    {
        var result = new TaskResultPhoto(
            new DateTimeOffset(2026, 7, 17, 10, 0, 0, TimeSpan.Zero),
            [new PhotoRef("visits/v1/t1/1.jpg", "https://example.com/1.jpg"), new PhotoRef("visits/v1/t1/2.jpg", "https://example.com/2.jpg")]);
        var json = TaskResultJson.Serialize(result);
        var deserialized = TaskResultJson.TryDeserialize(json, ResultKind.Photo) as TaskResultPhoto;

        Assert.NotNull(deserialized);
        Assert.Equal(2, deserialized!.Photos.Count);
        Assert.Equal(result.Photos[0].ObjectKey, deserialized.Photos[0].ObjectKey);
        Assert.Equal(result.Photos[1].Url, deserialized.Photos[1].Url);
    }

    [Fact]
    public void Form_RoundTrips_WithAnswersDict()
    {
        var result = new TaskResultForm(
            new DateTimeOffset(2026, 7, 17, 10, 0, 0, TimeSpan.Zero),
            new Dictionary<string, string> { ["stok_durumu"] = "yeterli", ["fiyat_etiketi"] = "var" });
        var json = TaskResultJson.Serialize(result);
        var deserialized = TaskResultJson.TryDeserialize(json, ResultKind.Form) as TaskResultForm;

        Assert.NotNull(deserialized);
        Assert.Equal(2, deserialized!.Answers.Count);
        Assert.Equal("yeterli", deserialized.Answers["stok_durumu"]);
        Assert.Equal("var", deserialized.Answers["fiyat_etiketi"]);
    }
}
