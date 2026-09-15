namespace Libra.Domain.Nutrition;

/// <summary>
/// Personal daily targets, valid from a local calendar date onwards. A day resolves to the newest goal whose
/// <see cref="EffectiveFrom"/> is on or before it, so changing today's targets leaves earlier days untouched.
/// Every target is optional: an unset target means "not tracked", never a recommended default.
/// </summary>
public sealed class NutritionGoal
{
    private NutritionGoal()
    {
    }

    public Guid Id { get; private set; }

    public Guid UserId { get; private set; }

    public DateOnly EffectiveFrom { get; private set; }

    public decimal? EnergyKcal { get; private set; }

    public decimal? ProteinGrams { get; private set; }

    public decimal? CarbGrams { get; private set; }

    public decimal? FatGrams { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    /// <summary>True when nothing is tracked; the API deletes such a record instead of storing empty targets.</summary>
    public bool IsEmpty => EnergyKcal is null && ProteinGrams is null && CarbGrams is null && FatGrams is null;

    public static NutritionGoal Create(
        Guid userId,
        DateOnly effectiveFrom,
        decimal? energyKcal,
        decimal? proteinGrams,
        decimal? carbGrams,
        decimal? fatGrams,
        DateTime nowUtc)
    {
        var goal = new NutritionGoal
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            EffectiveFrom = effectiveFrom,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
        };
        goal.ChangeTargets(energyKcal, proteinGrams, carbGrams, fatGrams, nowUtc);
        return goal;
    }

    public void ChangeTargets(decimal? energyKcal, decimal? proteinGrams, decimal? carbGrams, decimal? fatGrams, DateTime nowUtc)
    {
        EnergyKcal = Validate(energyKcal, nameof(energyKcal));
        ProteinGrams = Validate(proteinGrams, nameof(proteinGrams));
        CarbGrams = Validate(carbGrams, nameof(carbGrams));
        FatGrams = Validate(fatGrams, nameof(fatGrams));
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>A target must be a positive two-decimal value; null stays null (an explicitly unset target).</summary>
    private static decimal? Validate(decimal? value, string parameterName)
    {
        if (value is null)
        {
            return null;
        }

        if (value <= 0 || value > NutritionAmounts.MaxNutrient || !NutritionAmounts.HasNutrientScale(value.Value))
        {
            throw new ArgumentException("A target must be greater than zero with at most two decimals.", parameterName);
        }

        return value;
    }
}
