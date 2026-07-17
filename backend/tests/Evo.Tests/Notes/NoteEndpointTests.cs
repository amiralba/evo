using System.Net;
using System.Net.Http.Json;
using Evo.Api.Notes;
using Evo.Domain.Auth;
using Evo.Infrastructure;
using Evo.Infrastructure.Notes;
using Evo.Tests.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Tests.Notes;

[Collection("TasksDb")]
public class NoteEndpointTests : IClassFixture<EvoApiTestFactory>
{
    private readonly EvoApiTestFactory _factory;

    public NoteEndpointTests(EvoApiTestFactory factory)
    {
        _factory = factory;
    }

    private async Task<Guid> SeedNoteAsync(string suffix, NoteStatus status)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EvoDbContext>();
        var note = new Note
        {
            Id = Guid.NewGuid(), AnchorType = NoteAnchorType.General, Kind = NoteKind.Note,
            Body = "Test note " + suffix, Status = status, CreatedAt = DateTimeOffset.UtcNow,
        };
        db.Notes.Add(note);
        await db.SaveChangesAsync();
        return note.Id;
    }

    [Fact]
    public async Task Supervisor_ListsNotesFilteredByStatus()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var openId = await SeedNoteAsync(suffix, NoteStatus.Open);
        var resolvedId = await SeedNoteAsync(suffix, NoteStatus.Resolved);

        var email = $"notes-test-supervisor-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        var response = await client.GetAsync("/api/v1/notes?status=Open");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var notes = await response.Content.ReadFromJsonAsync<List<NoteDto>>();
        Assert.Contains(notes!, n => n.Id == openId);
        Assert.DoesNotContain(notes!, n => n.Id == resolvedId);
    }

    [Fact]
    public async Task FieldAgent_ListNotes_Returns403()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var email = $"notes-test-fieldagent-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.FieldAgent);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        var response = await client.GetAsync("/api/v1/notes");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task PatchStatus_OpenToAcknowledged_Succeeds_ResolvedToOpen_Returns422()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var noteId = await SeedNoteAsync(suffix, NoteStatus.Open);

        var email = $"notes-test-transition-{suffix}@evo.local";
        await TestAuthHelper.EnsureUserAsync(_factory, email, "Passw0rd!", Roles.Supervisor);
        var client = await TestAuthHelper.LoginAsync(_factory, email, "Passw0rd!");

        var ackResponse = await client.PatchAsJsonAsync($"/api/v1/notes/{noteId}", new UpdateNoteStatusRequest(NoteStatus.Acknowledged));
        Assert.Equal(HttpStatusCode.OK, ackResponse.StatusCode);
        var acked = await ackResponse.Content.ReadFromJsonAsync<NoteDto>();
        Assert.Equal(NoteStatus.Acknowledged, acked!.Status);

        var resolveResponse = await client.PatchAsJsonAsync($"/api/v1/notes/{noteId}", new UpdateNoteStatusRequest(NoteStatus.Resolved));
        Assert.Equal(HttpStatusCode.OK, resolveResponse.StatusCode);

        var illegalResponse = await client.PatchAsJsonAsync($"/api/v1/notes/{noteId}", new UpdateNoteStatusRequest(NoteStatus.Open));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, illegalResponse.StatusCode);
    }
}
