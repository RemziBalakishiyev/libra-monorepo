namespace Libra.Domain.Nutrition;

/// <summary>One estimated food as the model reported it, before any human edit.</summary>
public sealed record FoodEstimateDraft(
    string Name,
    string? PortionDescription,
    decimal? EstimatedGrams,
    FoodAnalysisBasis Basis,
    decimal? EnergyKcal,
    decimal? ProteinGrams,
    decimal? CarbGrams,
    decimal? FatGrams,
    decimal? Confidence);

/// <summary>
/// The model's estimate for one food, kept exactly as it arrived. Nutrients are nullable on purpose: a value the
/// model could not judge stays unknown instead of becoming a zero the user would never notice.
/// </summary>
public sealed class FoodAnalysisItem
{
    public const int NameMaxLength = 120;
    public const int PortionDescriptionMaxLength = 160;

    private FoodAnalysisItem()
    {
        Name = string.Empty;
    }

    public Guid Id { get; private set; }

    public Guid DraftId { get; private set; }

    public Guid UserId { get; private set; }

    public string Name { get; private set; }

    /// <summary>Free text such as "one medium bowl". Untrusted model output, shown as data only.</summary>
    public string? PortionDescription { get; private set; }

    public decimal? EstimatedGrams { get; private set; }

    /// <summary>What <see cref="EnergyKcal"/> and the macros describe.</summary>
    public FoodAnalysisBasis Basis { get; private set; }

    public decimal? EnergyKcal { get; private set; }

    public decimal? ProteinGrams { get; private set; }

    public decimal? CarbGrams { get; private set; }

    public decimal? FatGrams { get; private set; }

    /// <summary>The model's own assessment (0–1). Not a measured accuracy, and never shown as one.</summary>
    public decimal? Confidence { get; private set; }

    public int Position { get; private set; }

    internal static FoodAnalysisItem Create(Guid userId, Guid draftId, FoodEstimateDraft estimate, int position)
    {
        ArgumentNullException.ThrowIfNull(estimate);

        var name = estimate.Name?.Trim();
        if (string.IsNullOrEmpty(name))
        {
            throw new ArgumentException("An estimated food needs a name.", nameof(estimate));
        }

        ArgumentOutOfRangeException.ThrowIfGreaterThan(name.Length, NameMaxLength, nameof(estimate));

        if (!Enum.IsDefined(estimate.Basis))
        {
            throw new ArgumentException("Unknown nutrient basis.", nameof(estimate));
        }

        foreach (var nutrient in new[] { estimate.EnergyKcal, estimate.ProteinGrams, estimate.CarbGrams, estimate.FatGrams })
        {
            if (nutrient is decimal value && !NutritionAmounts.IsNutrient(value))
            {
                throw new ArgumentException("Estimated nutrients must be zero or more with at most two decimals.", nameof(estimate));
            }
        }

        if (estimate.EstimatedGrams is decimal grams && !NutritionAmounts.IsQuantity(grams))
        {
            throw new ArgumentException("Estimated grams must be greater than zero.", nameof(estimate));
        }

        if (estimate.Confidence is decimal confidence && (confidence < 0m || confidence > 1m))
        {
            throw new ArgumentException("Confidence must be between 0 and 1.", nameof(estimate));
        }

        var portion = estimate.PortionDescription?.Trim();
        if (portion is { Length: > PortionDescriptionMaxLength })
        {
            portion = portion[..PortionDescriptionMaxLength];
        }

        return new FoodAnalysisItem
        {
            Id = Guid.CreateVersion7(),
            DraftId = draftId,
            UserId = userId,
            Name = name,
            PortionDescription = string.IsNullOrEmpty(portion) ? null : portion,
            EstimatedGrams = estimate.EstimatedGrams,
            Basis = estimate.Basis,
            EnergyKcal = estimate.EnergyKcal,
            ProteinGrams = estimate.ProteinGrams,
            CarbGrams = estimate.CarbGrams,
            FatGrams = estimate.FatGrams,
            Confidence = estimate.Confidence,
            Position = position,
        };
    }
}

/// <summary>
/// A photo analysis waiting for the user's decision. It holds the model's original estimates and nothing else:
/// no nutrition entry exists until <see cref="Confirm"/> runs, so a pending, discarded or expired draft
/// contributes nothing to any day total. Confirming is one-way and records the entry it produced, which is what
/// makes a repeated or concurrent confirmation return the first entry instead of creating a second one.
/// </summary>
public sealed class FoodAnalysisDraft
{
    public const int MaxItems = NutritionEntry.MaxItems;
    public const int NotesMaxLength = 500;
    public const int ModelMaxLength = 80;
    public const int SchemaVersionMaxLength = 40;

    private readonly List<FoodAnalysisItem> _items = [];

    private FoodAnalysisDraft()
    {
        Model = string.Empty;
        SchemaVersion = string.Empty;
    }

    public Guid Id { get; private set; }

    public Guid UserId { get; private set; }

    public Guid ImageId { get; private set; }

    public FoodAnalysisStatus Status { get; private set; }

    public FoodAnalysisOutcome Outcome { get; private set; }

    /// <summary>Schema the result was validated against, so old drafts stay readable after the schema moves on.</summary>
    public string SchemaVersion { get; private set; }

    public string Model { get; private set; }

    /// <summary>Clarification the model offered ("plate partly hidden"). Untrusted text, shown as data.</summary>
    public string? Notes { get; private set; }

    public decimal? Confidence { get; private set; }

    /// <summary>Client-generated id that makes a retried analysis idempotent per user.</summary>
    public Guid? ClientRequestId { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    /// <summary>After this instant the draft can no longer be confirmed and the sweep may remove it.</summary>
    public DateTime ExpiresAtUtc { get; private set; }

    public Guid? ConfirmedEntryId { get; private set; }

    public DateTime? ConfirmedAtUtc { get; private set; }

    public IReadOnlyList<FoodAnalysisItem> Items => _items;

    public bool IsExpired(DateTime nowUtc) => Status == FoodAnalysisStatus.PendingConfirmation && nowUtc >= ExpiresAtUtc;

    public static FoodAnalysisDraft Create(
        Guid userId,
        Guid imageId,
        FoodAnalysisOutcome outcome,
        string schemaVersion,
        string model,
        string? notes,
        decimal? confidence,
        IEnumerable<FoodEstimateDraft> items,
        Guid? clientRequestId,
        DateTime nowUtc,
        TimeSpan lifetime)
    {
        ArgumentNullException.ThrowIfNull(items);
        ArgumentException.ThrowIfNullOrWhiteSpace(schemaVersion);
        ArgumentException.ThrowIfNullOrWhiteSpace(model);
        ArgumentOutOfRangeException.ThrowIfLessThanOrEqual(lifetime, TimeSpan.Zero);

        if (!Enum.IsDefined(outcome))
        {
            throw new ArgumentException("Unknown analysis outcome.", nameof(outcome));
        }

        var estimates = items.ToList();
        if (estimates.Count > MaxItems)
        {
            throw new ArgumentException($"An analysis can hold at most {MaxItems} estimated foods.", nameof(items));
        }

        if (outcome == FoodAnalysisOutcome.Success && estimates.Count == 0)
        {
            throw new ArgumentException("A successful analysis must contain at least one estimated food.", nameof(items));
        }

        var draft = new FoodAnalysisDraft
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            ImageId = imageId,
            Status = FoodAnalysisStatus.PendingConfirmation,
            Outcome = outcome,
            SchemaVersion = schemaVersion.Trim()[..Math.Min(schemaVersion.Trim().Length, SchemaVersionMaxLength)],
            Model = model.Trim()[..Math.Min(model.Trim().Length, ModelMaxLength)],
            Notes = CleanNotes(notes),
            Confidence = confidence is decimal value && value >= 0m && value <= 1m ? value : null,
            ClientRequestId = clientRequestId,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
            ExpiresAtUtc = nowUtc.Add(lifetime),
        };

        draft._items.AddRange(estimates.Select((estimate, index) => FoodAnalysisItem.Create(userId, draft.Id, estimate, index)));
        return draft;
    }

    /// <summary>Records the entry the user confirmed. Throws when the draft is not in a confirmable state.</summary>
    public void Confirm(Guid entryId, DateTime nowUtc)
    {
        if (Status != FoodAnalysisStatus.PendingConfirmation)
        {
            throw new InvalidOperationException($"A {Status} draft cannot be confirmed again.");
        }

        if (IsExpired(nowUtc))
        {
            throw new InvalidOperationException("An expired draft cannot be confirmed.");
        }

        Status = FoodAnalysisStatus.Confirmed;
        ConfirmedEntryId = entryId;
        ConfirmedAtUtc = nowUtc;
        UpdatedAtUtc = nowUtc;
    }

    public void Discard(DateTime nowUtc)
    {
        if (Status == FoodAnalysisStatus.Confirmed)
        {
            throw new InvalidOperationException("A confirmed draft cannot be discarded; delete the entry instead.");
        }

        Status = FoodAnalysisStatus.Discarded;
        UpdatedAtUtc = nowUtc;
    }

    private static string? CleanNotes(string? notes)
    {
        var trimmed = notes?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return null;
        }

        return trimmed.Length > NotesMaxLength ? trimmed[..NotesMaxLength] : trimmed;
    }
}
