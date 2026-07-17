using Evo.Domain.Scheduling;

namespace Evo.Infrastructure.Routing;

public interface ISettingsProvider
{
    Task<SchedulingSettings> GetAsync(string? regionId = null, CancellationToken ct = default);
}
