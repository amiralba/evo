namespace Evo.Domain.Onarim;

public record CandidateInput(
    Guid Id,
    string Name,
    bool OnLeaveThatDay,
    int CurrentDayMinutes,
    int DailyCapacity,
    bool SameProvince,
    int? HomeDistanceBucket);

public record RankedCandidate(
    Guid Id,
    string Name,
    bool Available,
    int CapacityMinutesAfterMove,
    bool WithinCapacity,
    string RegionProximity,
    string Reasoning,
    int Rank);

/// <summary>Onarım candidate ranking — pure, deterministic (design §7.3b: narrow + rank, human decides).
/// No Evo.Infrastructure reference (layering rule).</summary>
public static class CandidateRanker
{
    public static IReadOnlyList<RankedCandidate> Rank(IReadOnlyList<CandidateInput> candidates, int plannedMinutes)
    {
        var scored = candidates.Select(c =>
        {
            var capacityAfterMove = c.DailyCapacity - (c.CurrentDayMinutes + plannedMinutes);
            var withinCapacity = capacityAfterMove >= 0 && !c.OnLeaveThatDay;
            var available = withinCapacity;
            var proximity = c.SameProvince ? "same_province" : "other_province";

            var reasoning = c.OnLeaveThatDay
                ? $"{c.Name} is on leave that day."
                : !withinCapacity
                    ? $"{c.Name} would be over daily capacity by {-capacityAfterMove} min."
                    : $"{c.Name} has {capacityAfterMove} min spare capacity, {(c.SameProvince ? "same province" : "other province")}.";

            return (c, available, capacityAfterMove, withinCapacity, proximity, reasoning);
        }).ToList();

        var ordered = scored
            .OrderByDescending(s => s.available)
            .ThenByDescending(s => s.c.SameProvince)
            .ThenBy(s => s.c.HomeDistanceBucket ?? int.MaxValue)
            .ThenByDescending(s => s.capacityAfterMove)
            .ThenBy(s => s.c.Id)
            .ToList();

        return ordered.Select((s, i) => new RankedCandidate(
            s.c.Id, s.c.Name, s.available, s.capacityAfterMove, s.withinCapacity, s.proximity, s.reasoning, i + 1)).ToList();
    }
}
