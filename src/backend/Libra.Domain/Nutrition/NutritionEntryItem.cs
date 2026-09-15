namespace Libra.Domain.Nutrition;

/// <summary>The inputs for one food item, exactly as the user entered them.</summary>
public sealed record NutritionItemDraft(
    string Name,
    FoodQuantityMode QuantityMode,
    decimal Quantity,
    decimal EnergyKcalPerUnit,
    decimal ProteinGramsPerUnit,
    decimal CarbGramsPerUnit,
    decimal FatGramsPerUnit);

/// <summary>
/// One food inside a meal. Both the entered inputs (mode, quantity, per-unit nutrients) and the computed
/// totals are stored, so an entry is a snapshot: editing another entry, or copying this one into another day,
/// never changes what this meal recorded.
/// </summary>
public sealed class NutritionEntryItem
{
    public const int NameMaxLength = 120;

    private NutritionEntryItem()
    {
        Name = string.Empty;
    }

    public Guid Id { get; private set; }

    public Guid EntryId { get; private set; }

    /// <summary>Denormalized owner so every read can filter on the user without joining the entry.</summary>
    public Guid UserId { get; private set; }

    public string Name { get; private set; }

    public FoodQuantityMode QuantityMode { get; private set; }

    /// <summary>Portions when <see cref="QuantityMode"/> is PerPortion, grams when it is Per100Grams.</summary>
    public decimal Quantity { get; private set; }

    /// <summary>Energy of one portion or of 100 g, as entered. Never derived from the macros.</summary>
    public decimal EnergyKcalPerUnit { get; private set; }

    public decimal ProteinGramsPerUnit { get; private set; }

    public decimal CarbGramsPerUnit { get; private set; }

    public decimal FatGramsPerUnit { get; private set; }

    public decimal EnergyKcal { get; private set; }

    public decimal ProteinGrams { get; private set; }

    public decimal CarbGrams { get; private set; }

    public decimal FatGrams { get; private set; }

    /// <summary>Display order inside the entry.</summary>
    public int Position { get; private set; }

    internal static NutritionEntryItem Create(Guid userId, Guid entryId, NutritionItemDraft draft, int position)
    {
        ArgumentNullException.ThrowIfNull(draft);

        var name = draft.Name?.Trim();
        if (string.IsNullOrEmpty(name))
        {
            throw new ArgumentException("Food name is required.", nameof(draft));
        }

        ArgumentOutOfRangeException.ThrowIfGreaterThan(name.Length, NameMaxLength, nameof(draft));

        if (!Enum.IsDefined(draft.QuantityMode))
        {
            throw new ArgumentException("Unknown quantity mode.", nameof(draft));
        }

        if (!NutritionAmounts.IsQuantity(draft.Quantity))
        {
            throw new ArgumentException("Quantity must be greater than zero.", nameof(draft));
        }

        foreach (var nutrient in new[] { draft.EnergyKcalPerUnit, draft.ProteinGramsPerUnit, draft.CarbGramsPerUnit, draft.FatGramsPerUnit })
        {
            if (!NutritionAmounts.IsNutrient(nutrient))
            {
                throw new ArgumentException("Nutrient values must be zero or more with at most two decimals.", nameof(draft));
            }
        }

        var multiplier = NutritionAmounts.Multiplier(draft.QuantityMode, draft.Quantity);
        return new NutritionEntryItem
        {
            Id = Guid.CreateVersion7(),
            EntryId = entryId,
            UserId = userId,
            Name = name,
            QuantityMode = draft.QuantityMode,
            Quantity = draft.Quantity,
            EnergyKcalPerUnit = draft.EnergyKcalPerUnit,
            ProteinGramsPerUnit = draft.ProteinGramsPerUnit,
            CarbGramsPerUnit = draft.CarbGramsPerUnit,
            FatGramsPerUnit = draft.FatGramsPerUnit,
            EnergyKcal = NutritionAmounts.RoundNutrient(draft.EnergyKcalPerUnit * multiplier),
            ProteinGrams = NutritionAmounts.RoundNutrient(draft.ProteinGramsPerUnit * multiplier),
            CarbGrams = NutritionAmounts.RoundNutrient(draft.CarbGramsPerUnit * multiplier),
            FatGrams = NutritionAmounts.RoundNutrient(draft.FatGramsPerUnit * multiplier),
            Position = position,
        };
    }

    /// <summary>The inputs of this item, for copying it into a new entry.</summary>
    public NutritionItemDraft ToDraft() =>
        new(Name, QuantityMode, Quantity, EnergyKcalPerUnit, ProteinGramsPerUnit, CarbGramsPerUnit, FatGramsPerUnit);
}
