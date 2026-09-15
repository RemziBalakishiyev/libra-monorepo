using Libra.Domain.Nutrition;

namespace Libra.Application.Nutrition.FoodAnalysis;

/// <summary>The entry input an estimate normalizes to, or the reason it cannot be one yet.</summary>
public sealed record NormalizedEstimate(
    FoodQuantityMode QuantityMode,
    decimal? Quantity,
    decimal? EnergyKcalPerUnit,
    decimal? ProteinGramsPerUnit,
    decimal? CarbGramsPerUnit,
    decimal? FatGramsPerUnit)
{
    /// <summary>False while any value the entry needs is still unknown; the user supplies it during review.</summary>
    public bool IsComplete =>
        Quantity is decimal quantity
        && NutritionAmounts.IsQuantity(quantity)
        && EnergyKcalPerUnit is not null
        && ProteinGramsPerUnit is not null
        && CarbGramsPerUnit is not null
        && FatGramsPerUnit is not null;
}

/// <summary>
/// Turns a model estimate into the inputs the nutrition entry already understands.
///
/// The rule that matters: a nutrient value describes exactly one basis. A `PicturedPortion` estimate is one
/// portion, so the entry uses `PerPortion` with quantity 1 and the values unchanged — the estimated weight is
/// metadata, never a second multiplier. A `Per100Grams` estimate uses `Per100Grams` with the estimated weight as
/// the quantity, so the values are scaled once, by the API's existing weight ÷ 100 rule.
///
/// Unknown nutrients stay unknown here too: nothing is defaulted to zero, and an incomplete estimate is reported
/// as incomplete instead of being filled in.
/// </summary>
public static class FoodAnalysisNormalization
{
    public static NormalizedEstimate Normalize(
        FoodAnalysisBasis basis,
        decimal? estimatedGrams,
        decimal? energyKcal,
        decimal? proteinGrams,
        decimal? carbGrams,
        decimal? fatGrams) =>
        basis == FoodAnalysisBasis.Per100Grams
            ? new NormalizedEstimate(FoodQuantityMode.Per100Grams, estimatedGrams, energyKcal, proteinGrams, carbGrams, fatGrams)
            : new NormalizedEstimate(FoodQuantityMode.PerPortion, 1m, energyKcal, proteinGrams, carbGrams, fatGrams);

    public static NormalizedEstimate Normalize(FoodAnalysisItem item)
    {
        ArgumentNullException.ThrowIfNull(item);
        return Normalize(item.Basis, item.EstimatedGrams, item.EnergyKcal, item.ProteinGrams, item.CarbGrams, item.FatGrams);
    }

    /// <summary>
    /// The same estimate expressed as one pictured portion. Used to prove that the two representations describe
    /// the same food: the contribution is identical either way.
    /// </summary>
    public static FoodEstimateDraft ToPicturedPortion(FoodEstimateDraft estimate)
    {
        ArgumentNullException.ThrowIfNull(estimate);

        if (estimate.Basis == FoodAnalysisBasis.PicturedPortion)
        {
            return estimate;
        }

        if (estimate.EstimatedGrams is not decimal grams || grams <= 0m)
        {
            throw new InvalidOperationException("A per-100 g estimate needs an estimated weight before it can describe a portion.");
        }

        var factor = grams / 100m;
        return estimate with
        {
            Basis = FoodAnalysisBasis.PicturedPortion,
            EnergyKcal = Scale(estimate.EnergyKcal, factor),
            ProteinGrams = Scale(estimate.ProteinGrams, factor),
            CarbGrams = Scale(estimate.CarbGrams, factor),
            FatGrams = Scale(estimate.FatGrams, factor),
        };
    }

    /// <summary>
    /// What a normalized estimate contributes, using the same arithmetic as the domain: one multiplication from
    /// the entered values, rounded exactly once. Unknown values contribute nothing and stay unknown.
    /// </summary>
    public static (decimal? EnergyKcal, decimal? ProteinGrams, decimal? CarbGrams, decimal? FatGrams) Contribution(NormalizedEstimate estimate)
    {
        ArgumentNullException.ThrowIfNull(estimate);

        if (estimate.Quantity is not decimal quantity)
        {
            return (null, null, null, null);
        }

        var multiplier = NutritionAmounts.Multiplier(estimate.QuantityMode, quantity);
        return (
            Apply(estimate.EnergyKcalPerUnit, multiplier),
            Apply(estimate.ProteinGramsPerUnit, multiplier),
            Apply(estimate.CarbGramsPerUnit, multiplier),
            Apply(estimate.FatGramsPerUnit, multiplier));
    }

    private static decimal? Apply(decimal? value, decimal multiplier) =>
        value is decimal amount ? NutritionAmounts.RoundNutrient(amount * multiplier) : null;

    private static decimal? Scale(decimal? value, decimal factor) =>
        value is decimal amount ? NutritionAmounts.RoundNutrient(amount * factor) : null;
}
