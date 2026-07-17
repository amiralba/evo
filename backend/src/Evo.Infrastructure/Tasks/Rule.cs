using Evo.Domain.Tasks;

namespace Evo.Infrastructure.Tasks;

/// <summary>Layered override on a TaskTemplate's membership/minutes, scoped store &gt; route &gt; format &gt; chain &gt; global (design §2.9).</summary>
public class Rule
{
    public Guid Id { get; set; }
    public Guid? TaskTemplateId { get; set; }
    public RuleScopeLevel Scope { get; set; }
    public string ConditionJson { get; set; } = "{}";
    public string EffectJson { get; set; } = "{}";
    public int Priority { get; set; }
    public DateOnly EffectiveFrom { get; set; }
    public DateOnly? EffectiveTo { get; set; }
    public Guid? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
