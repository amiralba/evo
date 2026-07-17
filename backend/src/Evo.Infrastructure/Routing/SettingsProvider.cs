using System.Text.Json;
using Evo.Domain.Scheduling;
using Microsoft.EntityFrameworkCore;

namespace Evo.Infrastructure.Routing;

/// <summary>The only mapping from the EF `setting` table to the EF-free SchedulingSettings
/// record the engine consumes. A region row overrides the global (RegionId="") row of the
/// same Key; regionId null is treated as the global-only case.</summary>
public class SettingsProvider : ISettingsProvider
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    private readonly EvoDbContext _db;

    public SettingsProvider(EvoDbContext db)
    {
        _db = db;
    }

    public async Task<SchedulingSettings> GetAsync(string? regionId = null, CancellationToken ct = default)
    {
        var globalRows = await _db.Settings.Where(s => s.RegionId == "").ToListAsync(ct);
        var merged = globalRows.ToDictionary(s => s.Key, s => s.ValueJson);

        if (!string.IsNullOrEmpty(regionId))
        {
            var regionRows = await _db.Settings.Where(s => s.RegionId == regionId).ToListAsync(ct);
            foreach (var row in regionRows)
            {
                merged[row.Key] = row.ValueJson;
            }
        }

        return new SchedulingSettings(
            DailyWorkMinutes: ReadInt(merged, "daily_work_minutes"),
            DefaultServiceMinutes: ReadInt(merged, "default_service_minutes"),
            DayStart: ReadTime(merged, "day_start"),
            Over450ToleranceMinutes: ReadInt(merged, "over_450_tolerance_minutes"),
            ServiceMixCapPct: ReadInt(merged, "service_mix_cap_pct"),
            PlanHorizonWeeks: ReadInt(merged, "plan_horizon_weeks"),
            SnapMinutes: ReadInt(merged, "snap_minutes"),
            Breaks: ReadBreaks(merged, "break_blocks"));
    }

    private static int ReadInt(Dictionary<string, string> values, string key) =>
        JsonSerializer.Deserialize<int>(values[key]);

    private static TimeOnly ReadTime(Dictionary<string, string> values, string key)
    {
        var raw = JsonSerializer.Deserialize<string>(values[key])!;
        return TimeOnly.Parse(raw);
    }

    private static IReadOnlyList<BreakBlock> ReadBreaks(Dictionary<string, string> values, string key)
    {
        var raw = JsonSerializer.Deserialize<List<BreakBlockJson>>(values[key], JsonOptions)!;
        return raw.Select(b => new BreakBlock(b.Label, TimeOnly.Parse(b.Start), TimeOnly.Parse(b.End))).ToList();
    }

    private record BreakBlockJson(string Label, string Start, string End);
}
