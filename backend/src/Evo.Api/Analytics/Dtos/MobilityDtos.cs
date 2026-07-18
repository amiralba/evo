namespace Evo.Api.Analytics.Dtos;

public record MerchandiserMobilityDto(
    Guid MerchandiserId, string Name, int DistinctRoutesHeld, int IntraRouteReshuffles,
    double RegionalMedianRoutesHeld, bool Outlier);
