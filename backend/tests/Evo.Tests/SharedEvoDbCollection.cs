namespace Evo.Tests;

/// <summary>Test classes that use the shared EvoDb (via WebApplicationFactory) and the deterministic
/// FakeStoreSyncSource store set — routing state from one class would otherwise leak into another
/// if they ran in parallel. Forces sequential execution across those classes.</summary>
[CollectionDefinition("SharedEvoDb", DisableParallelization = true)]
public class SharedEvoDbCollection;
