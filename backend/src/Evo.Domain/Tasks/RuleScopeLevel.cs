namespace Evo.Domain.Tasks;

/// <summary>
/// Specificity order for rule resolution (design §2.9): store &gt; route &gt; format &gt; chain &gt; global.
/// The numeric value IS the specificity — higher wins when rules conflict at the same priority.
/// </summary>
public enum RuleScopeLevel
{
    Global = 0,
    Chain = 1,
    Format = 2,
    Route = 3,
    Store = 4,
}
