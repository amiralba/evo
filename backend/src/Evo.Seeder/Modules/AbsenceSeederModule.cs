using Evo.Infrastructure;
using Evo.Infrastructure.People;
using Evo.Infrastructure.Routing;
using Evo.Infrastructure.Stores;
using Microsoft.EntityFrameworkCore;

namespace Evo.Seeder.Modules;

/// <summary>
/// M4 — Analytics & Onarım (spec 010). Seeds absences + a temporary store closure that collide
/// with active routes' future plans, so the Onarım workbench has real disruptions to demo.
/// Idempotent: skips if absences already exist. Runs after RouteSeederModule/FieldExecutionSeederModule
/// so real routes/assignments/plans exist to collide with.
/// </summary>
public class AbsenceSeederModule : ISeederModule
{
    public string Name => "Absence";

    public async Task SeedAsync(EvoDbContext db, SeedProfile profile, Bogus.Faker faker, IServiceProvider services, CancellationToken ct)
    {
        if (await db.Absences.AnyAsync(ct))
        {
            Console.WriteLine("Absence: absences already present — skipping.");
            return;
        }

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var activeAssignments = await db.Assignments
            .Where(a => a.EndDate == null)
            .ToListAsync(ct);
        if (activeAssignments.Count == 0)
        {
            Console.WriteLine("Absence: no active assignments to seed against — skipping.");
            return;
        }

        var absenceReasons = new[] { AbsenceReason.SickLeave, AbsenceReason.AnnualLeave, AbsenceReason.Unpaid };
        var absenceNotes = new[] { "Rapor aldı", "Yıllık izin", "Ücretsiz izin talebi onaylandı" };

        var pickCount = Math.Min(3, activeAssignments.Count);
        var picked = faker.PickRandom(activeAssignments, pickCount).ToList();

        var absencesCreated = 0;
        foreach (var assignment in picked)
        {
            var startOffset = faker.Random.Int(2, 5);
            var start = today.AddDays(startOffset);
            var end = start.AddDays(faker.Random.Int(1, 2));

            db.Absences.Add(new Absence
            {
                Id = Guid.NewGuid(),
                MerchandiserId = assignment.MerchandiserId,
                StartDate = start,
                EndDate = end,
                Reason = faker.PickRandom(absenceReasons),
                Note = faker.PickRandom(absenceNotes),
                CreatedAt = DateTimeOffset.UtcNow,
            });
            absencesCreated++;
        }
        await db.SaveChangesAsync(ct);
        Console.WriteLine($"Absence: {absencesCreated} absences seeded, colliding with active routes' future plans.");

        var closureCreated = 0;
        var activeStopStoreIds = await db.RouteStops
            .Where(rs => rs.EffectiveTo == null)
            .Select(rs => rs.StoreId)
            .Distinct()
            .ToListAsync(ct);
        var candidateStoreId = activeStopStoreIds.FirstOrDefault();
        if (candidateStoreId != Guid.Empty && !await db.StoreFlags.AnyAsync(f => f.StoreId == candidateStoreId && f.Type == StoreFlagType.ClosedTemp, ct))
        {
            db.StoreFlags.Add(new StoreFlag
            {
                Id = Guid.NewGuid(),
                StoreId = candidateStoreId,
                Type = StoreFlagType.ClosedTemp,
                Reason = "Tadilat nedeniyle geçici kapalı",
                StartsOn = today.AddDays(3),
                EndsOn = today.AddDays(6),
            });
            await db.SaveChangesAsync(ct);
            closureCreated = 1;
        }
        Console.WriteLine($"Absence: {closureCreated} temporary store closure seeded.");
    }
}
