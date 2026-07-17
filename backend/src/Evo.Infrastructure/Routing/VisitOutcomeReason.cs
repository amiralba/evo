namespace Evo.Infrastructure.Routing;

public enum VisitOutcomeReason : byte
{
    StoreClosed = 1,
    NoAccess = 2,
    AgentAbsent = 3,
    TimeConstraint = 4,
    Rescheduled = 5,
    Other = 6,
}
