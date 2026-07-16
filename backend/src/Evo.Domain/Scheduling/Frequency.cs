namespace Evo.Domain.Scheduling;

/// <summary>Design §2.3 — consumed by the pure FrequencyExpander.</summary>
public enum Frequency : byte
{
    Daily = 1,
    Weekly = 2,
    Biweekly = 3,
}
