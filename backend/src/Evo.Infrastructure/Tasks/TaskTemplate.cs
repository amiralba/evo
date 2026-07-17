namespace Evo.Infrastructure.Tasks;

/// <summary>Catalog of possible tasks attached to visits by attribute matching, never manual linking (design §2.10).</summary>
public class TaskTemplate
{
    public Guid Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int DefaultMinutes { get; set; }
    public TaskRecurrence Recurrence { get; set; }
    public ProofRequired ProofRequired { get; set; }
    public string? InstructionsText { get; set; }

    /// <summary>Reserved for the module-stack editor (FOTOĞRAF/FORM/KONTROL/BİLGİ) — unused in M2.</summary>
    public string? ModulesJson { get; set; }

    public string? DefaultDeadlinePolicy { get; set; }
    public Guid? TargetChain { get; set; }
    public byte? TargetFormat { get; set; }
    public DateOnly? ValidUntil { get; set; }
    public bool Active { get; set; } = true;
}
