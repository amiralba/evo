namespace Evo.Tests.Routing;

/// <summary>All Routing tests share the EvoDb_RoutingTests database and each test class wipes
/// its own tables on setup — running test classes in parallel races those wipes/inserts against
/// each other. This collection forces xUnit to run them sequentially.</summary>
[CollectionDefinition("RoutingDb", DisableParallelization = true)]
public class RoutingDbCollection;
