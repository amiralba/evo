namespace Evo.Domain.Tasks;

public static class RuleMatcher
{
    public static bool Matches(TaskRuleInput rule, StoreAttributes store, DateOnly date)
    {
        if (date < rule.EffectiveFrom) return false;
        if (rule.EffectiveTo is { } to && date > to) return false;

        var c = rule.Condition;
        if (c.ChainId is { } chainId && chainId != store.ChainId) return false;
        if (c.Format is { } format && format != store.Format) return false;
        if (c.Category is { } category && category != store.Category) return false;
        if (c.Channel is { } channel && channel != store.Channel) return false;
        if (c.Province is { } province && province != store.Province) return false;
        if (c.RouteId is { } routeId && routeId != store.RouteId) return false;
        if (c.StoreId is { } storeId && storeId != store.StoreId) return false;

        return true;
    }
}
