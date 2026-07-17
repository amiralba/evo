using Evo.Api.Audit;
using Evo.Api.Notes;
using Evo.Domain.Auth;
using Evo.Domain.Exceptions;
using Evo.Infrastructure;
using Evo.Infrastructure.Identity;
using Evo.Infrastructure.Notes;
using Evo.Infrastructure.Routing;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Evo.Api.Controllers;

[ApiController]
[Route("api/v1/notes")]
[Authorize(Roles = Roles.Supervisor)]
public class NotesController : ControllerBase
{
    private readonly EvoDbContext _db;
    private readonly IAuditWriter _auditWriter;

    public NotesController(EvoDbContext db, IAuditWriter auditWriter)
    {
        _db = db;
        _auditWriter = auditWriter;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<NoteDto>>> List(
        [FromQuery] NoteStatus? status, [FromQuery] NoteKind? kind, [FromQuery] NoteAnchorType? anchorType)
    {
        var query = _db.Notes.AsQueryable();
        if (status.HasValue) query = query.Where(n => n.Status == status.Value);
        if (kind.HasValue) query = query.Where(n => n.Kind == kind.Value);
        if (anchorType.HasValue) query = query.Where(n => n.AnchorType == anchorType.Value);

        var notes = await query.OrderByDescending(n => n.CreatedAt).ToListAsync();
        return await ToDtosAsync(notes);
    }

    [HttpPatch("{id:guid}")]
    public async Task<ActionResult<NoteDto>> UpdateStatus(Guid id, [FromBody] UpdateNoteStatusRequest request)
    {
        var note = await _db.Notes.FirstOrDefaultAsync(n => n.Id == id) ?? throw new NotFoundException("Note");

        var allowed = (note.Status, request.Status) is
            (NoteStatus.Open, NoteStatus.Acknowledged) or
            (NoteStatus.Open, NoteStatus.Resolved) or
            (NoteStatus.Acknowledged, NoteStatus.Resolved);
        if (!allowed)
        {
            throw new EvoValidationException(new Dictionary<string, string[]>
            {
                ["status"] = [$"Cannot transition from {note.Status} to {request.Status}."],
            });
        }

        var before = note.Status;
        note.Status = request.Status;
        await _db.SaveChangesAsync();
        await _auditWriter.WriteAsync("Note", note.Id.ToString(), "status-change", before: new { Status = before }, after: new { Status = note.Status });

        var dtos = await ToDtosAsync([note]);
        return dtos[0];
    }

    private async Task<List<NoteDto>> ToDtosAsync(List<Note> notes)
    {
        var authorIds = notes.Where(n => n.AuthorId is not null).Select(n => n.AuthorId!.Value).Distinct().ToList();
        var authorNames = await _db.Users.Where(u => authorIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.DisplayName);

        var storeAnchorIds = notes.Where(n => n.AnchorType == NoteAnchorType.Store && n.AnchorId is not null).Select(n => n.AnchorId!.Value).ToList();
        var storeNames = await _db.Stores.Where(s => storeAnchorIds.Contains(s.Id)).ToDictionaryAsync(s => s.Id, s => s.Name);

        var visitAnchorIds = notes.Where(n => n.AnchorType == NoteAnchorType.Visit && n.AnchorId is not null).Select(n => n.AnchorId!.Value).ToList();
        var visits = await _db.PlannedVisits.Where(v => visitAnchorIds.Contains(v.Id)).ToListAsync();
        var visitStoreIds = visits.Select(v => v.StoreId).Distinct().ToList();
        var visitStoreNames = await _db.Stores.Where(s => visitStoreIds.Contains(s.Id)).ToDictionaryAsync(s => s.Id, s => s.Name);
        var visitById = visits.ToDictionary(v => v.Id, v => v);

        string? AnchorLabel(Note n) => n.AnchorType switch
        {
            NoteAnchorType.Store when n.AnchorId is { } storeId => storeNames.GetValueOrDefault(storeId),
            NoteAnchorType.Visit when n.AnchorId is { } visitId && visitById.TryGetValue(visitId, out var v) =>
                $"{visitStoreNames.GetValueOrDefault(v.StoreId, "?")} — {v.VisitDate:yyyy-MM-dd}",
            NoteAnchorType.Day when n.AnchorDay is { } day => day.ToString("yyyy-MM-dd"),
            _ => null,
        };

        return notes.Select(n => new NoteDto(
            n.Id, n.AuthorId, n.AuthorId is { } authorId ? authorNames.GetValueOrDefault(authorId) : null,
            n.AnchorType, n.AnchorId, AnchorLabel(n), n.Kind, n.Body, n.Status, n.CreatedAt)).ToList();
    }
}
