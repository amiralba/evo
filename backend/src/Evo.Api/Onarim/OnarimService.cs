using System.Text.Json;
using Evo.Api.Onarim.Dtos;
using Evo.Domain.Onarim;
using Evo.Domain.Scheduling;
using Evo.Infrastructure;
using Evo.Infrastructure.Routing;
using Microsoft.EntityFrameworkCore;
using Route = Evo.Infrastructure.Routing.Route;

namespace Evo.Api.Onarim;

/// <summary>Onarım absence-repair workbench (design §7.3b): narrows and ranks candidates per
/// disrupted visit; the human decides per row, the system never auto-plans.</summary>
public class OnarimService : IOnarimService
{
    private readonly EvoDbContext _db;
    private readonly DisruptionSource _disruptions;
    private readonly IPlanGenerationService _planGenerationService;

    public OnarimService(EvoDbContext db, DisruptionSource disruptions, IPlanGenerationService planGenerationService)
    {
        _db = db;
        _disruptions = disruptions;
        _planGenerationService = planGenerationService;
    }

    private static DateOnly Today() => DateOnly.FromDateTime(DateTime.UtcNow);

    public async Task<IReadOnlyList<DisruptionDto>> GetDisruptionsAsync(string? region, CancellationToken ct = default)
    {
        var today = Today();
        var all = await _disruptions.GetActiveOrFutureAsync(today, ct);

        var result = new List<DisruptionDto>();
        foreach (var d in all)
        {
            var visits = await GetCollidingVisitsAsync(d, today, ct);
            if (region is not null)
            {
                var routeIds = visits.Select(v => v.RouteId).Distinct().ToList();
                var provinces = await _db.Routes.Where(r => routeIds.Contains(r.Id)).Select(r => r.Province).Distinct().ToListAsync(ct);
                if (!provinces.Contains(region))
                {
                    continue;
                }
            }
            result.Add(new DisruptionDto(d.Id, d.Kind.ToString(), d.Label, d.Start, d.End, visits.Count));
        }
        return result;
    }

    private async Task<IReadOnlyList<PlannedVisit>> GetCollidingVisitsAsync(Disruption d, DateOnly today, CancellationToken ct)
    {
        var query = _db.PlannedVisits.Where(v => v.VisitDate >= today && v.VisitDate <= d.End && v.VisitDate >= d.Start && v.Status == PlannedVisitStatus.Planned);
        query = d.Kind == DisruptionKind.Absence
            ? query.Where(v => v.MerchandiserId == d.MerchandiserId)
            : query.Where(v => v.StoreId == d.StoreId);
        return await query.ToListAsync(ct);
    }

    public async Task<IReadOnlyList<AffectedVisitDto>> GetAffectedWithCandidatesAsync(Guid disruptionId, CancellationToken ct = default)
    {
        var today = Today();
        var disruption = await _disruptions.GetByIdAsync(disruptionId, today, ct) ?? throw new Domain.Exceptions.NotFoundException("Disruption");
        var visits = await GetCollidingVisitsAsync(disruption, today, ct);
        if (visits.Count == 0)
        {
            return [];
        }

        var routeIds = visits.Select(v => v.RouteId).Distinct().ToList();
        var storeIds = visits.Select(v => v.StoreId).Distinct().ToList();
        var routes = await _db.Routes.Where(r => routeIds.Contains(r.Id)).ToDictionaryAsync(r => r.Id, ct);
        var stores = await _db.Stores.Where(s => storeIds.Contains(s.Id)).ToDictionaryAsync(s => s.Id, ct);

        var absences = await _db.Absences.Where(a => a.EndDate >= today).ToListAsync(ct);

        var result = new List<AffectedVisitDto>();
        foreach (var visit in visits)
        {
            var route = routes.GetValueOrDefault(visit.RouteId);
            var store = stores.GetValueOrDefault(visit.StoreId);
            var plannedMinutes = visit.PlannedStart is not null && visit.PlannedEnd is not null
                ? (int)(visit.PlannedEnd.Value - visit.PlannedStart.Value).TotalMinutes
                : 0;
            var startMinutes = visit.PlannedStart is not null
                ? visit.PlannedStart.Value.Hour * 60 + visit.PlannedStart.Value.Minute
                : 0;

            var candidates = await RankCandidatesAsync(visit, route, plannedMinutes, absences, ct);

            result.Add(new AffectedVisitDto(
                visit.Id, visit.RouteId, route?.RouteCode ?? "?", visit.StoreId, store?.Name ?? "?",
                visit.VisitDate, startMinutes, plannedMinutes, candidates));
        }
        return result;
    }

    private async Task<IReadOnlyList<CandidateDto>> RankCandidatesAsync(
        PlannedVisit visit, Route? route, int plannedMinutes, IReadOnlyList<Infrastructure.People.Absence> absences, CancellationToken ct)
    {
        var province = route?.Province;

        var otherAssignments = await _db.Assignments
            .Where(a => a.EndDate == null && a.MerchandiserId != visit.MerchandiserId)
            .ToListAsync(ct);
        var candidateRouteIds = otherAssignments.Select(a => a.RouteId).Distinct().ToList();
        var candidateRoutes = await _db.Routes.Where(r => candidateRouteIds.Contains(r.Id)).ToDictionaryAsync(r => r.Id, ct);
        var candidateMerchandiserIds = otherAssignments.Select(a => a.MerchandiserId).Distinct().ToList();
        var names = await _db.Merchandisers
            .Where(m => candidateMerchandiserIds.Contains(m.Id))
            .Join(_db.Users, m => m.UserId, u => u.Id, (m, u) => new { m.Id, u.DisplayName })
            .ToDictionaryAsync(x => x.Id, x => x.DisplayName, ct);

        var dayMinutesByMerchandiser = await _db.PlannedVisits
            .Where(v => v.VisitDate == visit.VisitDate && v.MerchandiserId != null && candidateMerchandiserIds.Contains(v.MerchandiserId!.Value) && v.Status == PlannedVisitStatus.Planned)
            .ToListAsync(ct);

        var inputs = new List<CandidateInput>();
        var routeByMerchandiser = new Dictionary<Guid, Guid>();
        foreach (var assignment in otherAssignments)
        {
            var candidateRoute = candidateRoutes.GetValueOrDefault(assignment.RouteId);
            var onLeave = absences.Any(a => a.MerchandiserId == assignment.MerchandiserId && visit.VisitDate >= a.StartDate && visit.VisitDate <= a.EndDate);
            var currentMinutes = dayMinutesByMerchandiser
                .Where(v => v.MerchandiserId == assignment.MerchandiserId)
                .Sum(v => v.PlannedStart is not null && v.PlannedEnd is not null ? (int)(v.PlannedEnd.Value - v.PlannedStart.Value).TotalMinutes : 0);
            var capacity = candidateRoute?.DailyWorkMinutes ?? 480;
            var sameProvince = candidateRoute?.Province == province;

            inputs.Add(new CandidateInput(
                assignment.MerchandiserId, names.GetValueOrDefault(assignment.MerchandiserId, "?"),
                onLeave, currentMinutes, capacity, sameProvince, null));
            routeByMerchandiser[assignment.MerchandiserId] = assignment.RouteId;
        }

        var ranked = CandidateRanker.Rank(inputs, plannedMinutes);
        return ranked.Select(r => new CandidateDto(
            r.Id, r.Name, routeByMerchandiser.GetValueOrDefault(r.Id), r.Available, r.CapacityMinutesAfterMove,
            r.WithinCapacity, r.RegionProximity, r.Reasoning, r.Rank)).ToList();
    }

    public async Task<Guid> ApplyAsync(Guid disruptionId, ApplyOnarimRequest request, Guid? actorId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.Reason) || string.IsNullOrWhiteSpace(request.Objective))
        {
            throw new Domain.Exceptions.EvoValidationException(new Dictionary<string, string[]>
            {
                ["reason"] = ["A reason and objective are required to apply an Onarım repair."],
            });
        }

        var today = Today();
        var disruption = await _disruptions.GetByIdAsync(disruptionId, today, ct) ?? throw new Domain.Exceptions.NotFoundException("Disruption");
        var visits = (await GetCollidingVisitsAsync(disruption, today, ct)).ToDictionary(v => v.Id, v => v);

        var touchedRouteIds = new HashSet<Guid>();
        var reassignTempCreated = new HashSet<(Guid RouteId, Guid TargetMerchandiserId)>();

        foreach (var decision in request.Decisions)
        {
            if (!visits.TryGetValue(decision.PlannedVisitId, out var visit))
            {
                continue;
            }

            switch (decision.Action)
            {
                case OnarimAction.Skip:
                    _db.Patches.Add(new Patch
                    {
                        Id = Guid.NewGuid(),
                        RouteId = visit.RouteId,
                        Type = PatchType.SkipStore,
                        StoreId = visit.StoreId,
                        StartsOn = visit.VisitDate,
                        EndsOn = visit.VisitDate,
                        Status = PatchStatus.Active,
                        Reason = request.Reason,
                        CreatedBy = actorId,
                    });
                    touchedRouteIds.Add(visit.RouteId);
                    break;

                case OnarimAction.MoveDay when decision.TargetDate is { } targetDate:
                    var moveParams = new PatchParams.MoveVisitParams(visit.VisitDate, targetDate, null);
                    _db.Patches.Add(new Patch
                    {
                        Id = Guid.NewGuid(),
                        RouteId = visit.RouteId,
                        Type = PatchType.MoveVisit,
                        StoreId = visit.StoreId,
                        StartsOn = visit.VisitDate < targetDate ? visit.VisitDate : targetDate,
                        EndsOn = visit.VisitDate > targetDate ? visit.VisitDate : targetDate,
                        ParamsJson = JsonSerializer.Serialize(moveParams),
                        Status = PatchStatus.Active,
                        Reason = request.Reason,
                        CreatedBy = actorId,
                    });
                    touchedRouteIds.Add(visit.RouteId);
                    break;

                case OnarimAction.ReassignRoute when decision.TargetMerchandiserId is { } targetMerchandiserId:
                    if (reassignTempCreated.Add((visit.RouteId, targetMerchandiserId)))
                    {
                        _db.Patches.Add(new Patch
                        {
                            Id = Guid.NewGuid(),
                            RouteId = visit.RouteId,
                            Type = PatchType.ReassignTemp,
                            CoverMerchandiserId = targetMerchandiserId,
                            StartsOn = disruption.Start < today ? today : disruption.Start,
                            EndsOn = disruption.End,
                            Status = PatchStatus.Active,
                            Reason = request.Reason,
                            CreatedBy = actorId,
                        });
                        touchedRouteIds.Add(visit.RouteId);
                    }
                    break;

                case OnarimAction.ReassignPerson when decision.TargetRouteId is { } targetRouteId && decision.TargetMerchandiserId is { } targetPersonId:
                    var plannedMinutes = visit.PlannedStart is not null && visit.PlannedEnd is not null
                        ? (int)(visit.PlannedEnd.Value - visit.PlannedStart.Value).TotalMinutes
                        : 0;
                    var crossParams = new PatchParams.CrossReassignVisitParams(visit.RouteId, targetRouteId, visit.Id, targetPersonId, visit.StoreId, plannedMinutes);
                    _db.Patches.Add(new Patch
                    {
                        Id = Guid.NewGuid(),
                        RouteId = visit.RouteId,
                        Type = PatchType.CrossReassignVisit,
                        StoreId = visit.StoreId,
                        StartsOn = visit.VisitDate,
                        EndsOn = visit.VisitDate,
                        ParamsJson = JsonSerializer.Serialize(crossParams),
                        Status = PatchStatus.Active,
                        Reason = request.Reason,
                        CreatedBy = actorId,
                    });
                    touchedRouteIds.Add(visit.RouteId);
                    touchedRouteIds.Add(targetRouteId);
                    break;
            }
        }

        var errorCodes = request.Decisions.Select(d => "V14").Distinct().ToList();
        var entry = new DecisionJournalEntry
        {
            Id = Guid.NewGuid(),
            Kind = DecisionKind.Repair,
            Description = $"Onarım repair applied for disruption {disruption.Label} ({disruption.Kind}), {request.Decisions.Count} decision(s).",
            Reason = request.Reason,
            Objective = request.Objective,
            ErrorsJson = JsonSerializer.Serialize(errorCodes),
            AuthorId = actorId,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        _db.DecisionJournal.Add(entry);

        await _db.SaveChangesAsync(ct);

        foreach (var routeId in touchedRouteIds)
        {
            await _planGenerationService.RegenerateFutureAsync(routeId, today, today.AddDays(42), ct);
        }

        return entry.Id;
    }
}
