using Evo.Domain.Tasks;
using Evo.Infrastructure;
using Evo.Infrastructure.Notes;
using Evo.Infrastructure.Notifications;
using Evo.Infrastructure.People;
using Evo.Infrastructure.Routing;
using Evo.Infrastructure.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Evo.Seeder.Modules;

/// <summary>
/// M3 — Field execution simulation (spec 009). RegenerateFutureAsync clamps `from` to today
/// (confirmed by reading PlanGenerationService), so past history is materialized via the new
/// seeder-only IPlanGenerationService.MaterializeHistoryAsync, which reuses the same real engine
/// with no today-clamp. Runs LAST (after TaskRuleSeederModule) so routes/stops/templates/rules
/// already exist. Idempotent: re-running does not duplicate outcomes, pings, notes, or notifications.
/// </summary>
public class FieldExecutionSeederModule : ISeederModule
{
    public string Name => "FieldExecution";

    public async Task SeedAsync(EvoDbContext db, SeedProfile profile, Bogus.Faker faker, IServiceProvider services, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var historyDays = profile == SeedProfile.Demo ? 21 : 28;
        var historyFrom = today.AddDays(-historyDays);
        var historyTo = today.AddDays(-1);

        var planGenerationService = services.GetRequiredService<IPlanGenerationService>();
        var activeRoutes = await db.Routes.Where(r => r.Status == RouteStatus.Active).ToListAsync(ct);

        // Route stops are created with EffectiveFrom = "today they were added" (RouteSeederModule),
        // so simulating history requires backdating membership — otherwise no past stop occurs on
        // any historical date and MaterializeHistoryAsync silently produces nothing.
        var routeIds = activeRoutes.Select(r => r.Id).ToList();
        var stopsToBackdate = await db.RouteStops
            .Where(rs => routeIds.Contains(rs.RouteId) && rs.EffectiveTo == null && rs.EffectiveFrom > historyFrom)
            .ToListAsync(ct);
        foreach (var stop in stopsToBackdate)
        {
            stop.EffectiveFrom = historyFrom;
        }
        if (stopsToBackdate.Count > 0)
        {
            await db.SaveChangesAsync(ct);
        }

        var materialized = 0;
        foreach (var route in activeRoutes)
        {
            materialized += await planGenerationService.MaterializeHistoryAsync(route.Id, historyFrom, historyTo, ct);
        }
        Console.WriteLine($"FieldExecution: {materialized} past visits materialized ({historyFrom:yyyy-MM-dd}..{historyTo:yyyy-MM-dd}).");

        var pastVisits = await db.PlannedVisits
            .Where(v => v.VisitDate >= historyFrom && v.VisitDate <= historyTo)
            .ToListAsync(ct);

        var outcomesAssigned = AssignOutcomes(pastVisits, faker);
        Console.WriteLine($"FieldExecution: {outcomesAssigned} visit outcomes assigned.");

        var realizationsCreated = await SeedRealizationsAsync(db, pastVisits, faker, ct);
        Console.WriteLine($"FieldExecution: {realizationsCreated} visit_realization rows created.");

        var pingsCreated = await SeedLocationPingsAsync(db, pastVisits, historyFrom, historyTo, faker, ct);
        Console.WriteLine($"FieldExecution: {pingsCreated} location pings created.");

        var resultsCreated = await SeedTaskResultsAsync(db, pastVisits, faker, ct);
        Console.WriteLine($"FieldExecution: {resultsCreated} task_instance rows flipped to Done with a result.");

        var notesCreated = await SeedNotesAsync(db, pastVisits, faker, ct);
        Console.WriteLine($"FieldExecution: {notesCreated} notes created.");

        var notificationsCreated = await SeedNotificationsAsync(db, faker, ct);
        Console.WriteLine($"FieldExecution: {notificationsCreated} notifications created.");

        await db.SaveChangesAsync(ct);
    }

    private static int AssignOutcomes(List<PlannedVisit> pastVisits, Bogus.Faker faker)
    {
        var assigned = 0;
        foreach (var visit in pastVisits.Where(v => v.Status == PlannedVisitStatus.Planned))
        {
            var roll = faker.Random.Double();
            visit.Status = roll switch
            {
                < 0.85 => PlannedVisitStatus.Done,
                < 0.93 => PlannedVisitStatus.Missed,
                _ => PlannedVisitStatus.Skipped,
            };
            assigned++;
        }
        return assigned;
    }

    private static async Task<int> SeedRealizationsAsync(EvoDbContext db, List<PlannedVisit> pastVisits, Bogus.Faker faker, CancellationToken ct)
    {
        var visitIds = pastVisits.Select(v => v.Id).ToList();
        var alreadyRealized = (await db.VisitRealizations.Where(r => visitIds.Contains(r.PlannedVisitId)).Select(r => r.PlannedVisitId).ToListAsync(ct)).ToHashSet();

        var nonDoneReasons = new[] { VisitOutcomeReason.StoreClosed, VisitOutcomeReason.AgentAbsent, VisitOutcomeReason.Rescheduled, VisitOutcomeReason.NoAccess, VisitOutcomeReason.TimeConstraint };

        var created = 0;
        foreach (var visit in pastVisits)
        {
            if (alreadyRealized.Contains(visit.Id)) continue;

            if (visit.Status == PlannedVisitStatus.Done && visit.PlannedStart is { } start && visit.PlannedEnd is { } end)
            {
                var plannedMinutes = (int)(end - start).TotalMinutes;
                var checkInJitter = faker.Random.Int(0, 20);
                var checkInAt = start.AddMinutes(checkInJitter);
                var actualMinutes = Math.Max(5, plannedMinutes + faker.Random.Int(-10, 15));
                var checkOutAt = checkInAt.AddMinutes(actualMinutes);

                db.VisitRealizations.Add(new VisitRealization
                {
                    Id = Guid.NewGuid(),
                    PlannedVisitId = visit.Id,
                    CheckInAt = checkInAt,
                    CheckOutAt = checkOutAt,
                    ActualMinutes = actualMinutes,
                    OutcomeReason = null,
                });
                created++;
            }
            else if (visit.Status is PlannedVisitStatus.Missed or PlannedVisitStatus.Skipped)
            {
                db.VisitRealizations.Add(new VisitRealization
                {
                    Id = Guid.NewGuid(),
                    PlannedVisitId = visit.Id,
                    CheckInAt = null,
                    CheckOutAt = null,
                    ActualMinutes = null,
                    OutcomeReason = faker.PickRandom(nonDoneReasons),
                });
                created++;
            }
        }

        if (created > 0) await db.SaveChangesAsync(ct);
        return created;
    }

    private static async Task<int> SeedLocationPingsAsync(
        EvoDbContext db, List<PlannedVisit> pastVisits, DateOnly historyFrom, DateOnly historyTo, Bogus.Faker faker, CancellationToken ct)
    {
        var merchandiserIds = pastVisits.Where(v => v.MerchandiserId is not null).Select(v => v.MerchandiserId!.Value).Distinct().ToList();
        var alreadyPinged = (await db.LocationPings.Where(p => merchandiserIds.Contains(p.MerchandiserId)).Select(p => p.MerchandiserId).Distinct().ToListAsync(ct)).ToHashSet();

        var realizationsByVisitId = await db.VisitRealizations
            .Where(r => pastVisits.Select(v => v.Id).Contains(r.PlannedVisitId))
            .ToDictionaryAsync(r => r.PlannedVisitId, r => r, ct);
        var storeIds = pastVisits.Select(v => v.StoreId).Distinct().ToList();
        var stores = await db.Stores.Where(s => storeIds.Contains(s.Id)).ToDictionaryAsync(s => s.Id, ct);

        var created = 0;
        foreach (var merchandiserId in merchandiserIds)
        {
            if (alreadyPinged.Contains(merchandiserId)) continue;

            var visitsForAgent = pastVisits
                .Where(v => v.MerchandiserId == merchandiserId && v.Status == PlannedVisitStatus.Done && realizationsByVisitId.ContainsKey(v.Id))
                .OrderBy(v => v.PlannedStart)
                .ToList();

            for (var date = historyFrom; date <= historyTo; date = date.AddDays(1))
            {
                var dayVisits = visitsForAgent.Where(v => v.VisitDate == date).ToList();
                if (dayVisits.Count == 0) continue;

                foreach (var visit in dayVisits)
                {
                    var realization = realizationsByVisitId[visit.Id];
                    if (realization.CheckInAt is not { } checkInAt) continue;

                    var store = stores.GetValueOrDefault(visit.StoreId);
                    var (lat, lng) = store?.Location is { } point ? (point.Y, point.X) : (39.0 + faker.Random.Double(), 35.0 + faker.Random.Double());

                    // A short cluster of pings around the check-in (arrival, mid-visit, departure).
                    foreach (var offsetMinutes in new[] { -10, 0, 10, 20 })
                    {
                        db.LocationPings.Add(new MerchandiserLocationPing
                        {
                            Id = Guid.NewGuid(),
                            MerchandiserId = merchandiserId,
                            Lat = lat + (faker.Random.Double() - 0.5) * 0.001,
                            Lng = lng + (faker.Random.Double() - 0.5) * 0.001,
                            RecordedAt = checkInAt.AddMinutes(offsetMinutes),
                        });
                        created++;
                    }
                }

                // Background pings through the workday (~09:00-18:00) at ~12-minute intervals,
                // so the day has continuous coverage beyond just around visits.
                var dayStart = date.ToDateTime(new TimeOnly(9, 0));
                var dayEnd = date.ToDateTime(new TimeOnly(18, 0));
                for (var t = dayStart; t < dayEnd; t = t.AddMinutes(12))
                {
                    db.LocationPings.Add(new MerchandiserLocationPing
                    {
                        Id = Guid.NewGuid(),
                        MerchandiserId = merchandiserId,
                        Lat = 39.0 + faker.Random.Double(),
                        Lng = 35.0 + faker.Random.Double(),
                        RecordedAt = new DateTimeOffset(t, TimeSpan.Zero),
                    });
                    created++;
                }
            }
        }

        if (created > 0) await db.SaveChangesAsync(ct);
        return created;
    }

    private static async Task<int> SeedTaskResultsAsync(EvoDbContext db, List<PlannedVisit> pastVisits, Bogus.Faker faker, CancellationToken ct)
    {
        var doneVisitIds = pastVisits.Where(v => v.Status == PlannedVisitStatus.Done).Select(v => v.Id).ToList();
        var instances = await db.TaskInstances
            .Where(ti => ti.PlannedVisitId != null && doneVisitIds.Contains(ti.PlannedVisitId.Value) && ti.ResultJson == null)
            .ToListAsync(ct);

        var templateIds = instances.Select(i => i.TaskTemplateId).Distinct().ToList();
        var proofByTemplateId = await db.TaskTemplates.Where(t => templateIds.Contains(t.Id)).ToDictionaryAsync(t => t.Id, t => t.ProofRequired, ct);

        var flipped = 0;
        foreach (var instance in instances)
        {
            var proof = proofByTemplateId.GetValueOrDefault(instance.TaskTemplateId, ProofRequired.None);
            var completedAt = DateTimeOffset.UtcNow.AddDays(-faker.Random.Int(1, 21));

            object result = proof switch
            {
                ProofRequired.Photo => new TaskResultPhoto(completedAt, Enumerable.Range(1, faker.Random.Int(1, 3))
                    .Select(n => new PhotoRef($"visits/{instance.PlannedVisitId}/{instance.TaskTemplateId}/{n}.jpg", $"https://cdn.evo.local/visits/{instance.PlannedVisitId}/{instance.TaskTemplateId}/{n}.jpg"))
                    .ToList()),
                ProofRequired.Form => new TaskResultForm(completedAt, new Dictionary<string, string>
                {
                    ["stok_durumu"] = faker.PickRandom("yeterli", "az", "tükendi"),
                    ["fiyat_etiketi"] = faker.PickRandom("var", "eksik"),
                }),
                _ => new TaskResultNone(completedAt, faker.Random.Bool(0.3f) ? faker.Lorem.Sentence() : null),
            };

            instance.Status = TaskInstanceStatus.Done;
            instance.ResultJson = TaskResultJson.Serialize(result);
            flipped++;
        }

        if (flipped > 0) await db.SaveChangesAsync(ct);
        return flipped;
    }

    private static async Task<int> SeedNotesAsync(EvoDbContext db, List<PlannedVisit> pastVisits, Bogus.Faker faker, CancellationToken ct)
    {
        if (await db.Notes.AnyAsync(ct)) return 0;

        var fieldAgentUserIds = await db.Merchandisers.Select(m => m.UserId).Take(5).ToListAsync(ct);
        if (fieldAgentUserIds.Count == 0) return 0;

        var storeIds = pastVisits.Select(v => v.StoreId).Distinct().Take(3).ToList();
        var visitIds = pastVisits.Select(v => v.Id).Take(3).ToList();

        var turkishBodies = new[]
        {
            "Mağaza müdürü perşembe servis istemiyor.",
            "Raf yeri değişti, yeni konum için bilgi rica ediyorum.",
            "Ürün stoklarında eksiklik var, tedarik talebi gerekiyor.",
            "Mağaza tadilat nedeniyle bu hafta kapalı olacak.",
            "Fiyat etiketleri güncel değil, kontrol edilmeli.",
            "Ek personel talebi — yoğunluk arttı.",
            "Rakip firma yeni teşhir kurdu, fotoğraf ekte.",
            "Haftalık ziyaret gününün değişmesi talep edildi.",
        };

        var notes = new List<Note>();
        for (var i = 0; i < turkishBodies.Length; i++)
        {
            var anchorType = (NoteAnchorType)((i % 4) + 1);
            Guid? anchorId = anchorType switch
            {
                NoteAnchorType.Store when storeIds.Count > 0 => storeIds[i % storeIds.Count],
                NoteAnchorType.Visit when visitIds.Count > 0 => visitIds[i % visitIds.Count],
                _ => null,
            };
            var anchorDay = anchorType == NoteAnchorType.Day ? DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-faker.Random.Int(1, 14)) : (DateOnly?)null;

            notes.Add(new Note
            {
                Id = Guid.NewGuid(),
                AuthorId = null, // AuthorId resolves to a Merchandiser's UserId conceptually, but a Note author is the field agent's ApplicationUser id — left null here since Merchandiser.UserId list already scoped above is used only to confirm agents exist.
                AnchorType = anchorType,
                AnchorId = anchorId,
                AnchorDay = anchorDay,
                Kind = i % 3 == 0 ? NoteKind.ChangeRequest : NoteKind.Note,
                Body = turkishBodies[i],
                Status = (NoteStatus)((i % 3) + 1),
                CreatedAt = DateTimeOffset.UtcNow.AddDays(-faker.Random.Int(1, 14)),
            });
        }

        // First note gets a real author for a realistic non-null case.
        notes[0].AuthorId = fieldAgentUserIds[0];

        db.Notes.AddRange(notes);
        await db.SaveChangesAsync(ct);
        return notes.Count;
    }

    private static async Task<int> SeedNotificationsAsync(EvoDbContext db, Bogus.Faker faker, CancellationToken ct)
    {
        var assignedMerchandiserIds = await db.Assignments.Where(a => a.EndDate == null).Select(a => a.MerchandiserId).Distinct().ToListAsync(ct);
        var alreadyNotified = (await db.Notifications.Select(n => n.MerchandiserId).Distinct().ToListAsync(ct)).ToHashSet();

        var summaries = new[]
        {
            "{\"summary\":\"Çar: BİM Sincan eklendi, Kantin A çıkarıldı\"}",
            "{\"summary\":\"Perş: Ziyaret süresi 45 dk olarak güncellendi\"}",
            "{\"summary\":\"Rota yayınlandı — 5 durak, bu hafta\"}",
        };

        var created = 0;
        foreach (var merchandiserId in assignedMerchandiserIds)
        {
            if (alreadyNotified.Contains(merchandiserId)) continue;

            db.Notifications.Add(new Notification
            {
                Id = Guid.NewGuid(),
                MerchandiserId = merchandiserId,
                PayloadJson = faker.PickRandom(summaries),
                CreatedAt = DateTimeOffset.UtcNow.AddDays(-faker.Random.Int(0, 10)),
                ReadAt = faker.Random.Bool(0.5f) ? DateTimeOffset.UtcNow.AddDays(-faker.Random.Int(0, 5)) : null,
            });
            created++;
        }

        if (created > 0) await db.SaveChangesAsync(ct);
        return created;
    }
}
