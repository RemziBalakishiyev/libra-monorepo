namespace Libra.Domain.Nutrition;

/// <summary>
/// Shared numeric rules for nutrition. Energy and macros are two-decimal <see cref="decimal"/> values;
/// quantities keep three decimals so half portions and gram weights stay exact. Nothing here derives energy
/// from macros: a food label's kcal is what the user entered and is never recomputed from protein/carbs/fat.
/// </summary>
public static class NutritionAmounts
{
    /// <summary>Decimals kept for energy and macro values, entered and computed.</summary>
    public const int NutrientScale = 2;

    /// <summary>Decimals kept for quantities (0.5 portions, 12.5 g).</summary>
    public const int QuantityScale = 3;

    /// <summary>Upper bound per entered nutrient value; comfortably fits numeric(10,2).</summary>
    public const decimal MaxNutrient = 100_000m;

    /// <summary>Upper bound for a quantity: 10 000 portions or 10 000 g in one item.</summary>
    public const decimal MaxQuantity = 10_000m;

    public static bool HasNutrientScale(decimal value) => decimal.Round(value, NutrientScale) == value;

    public static bool HasQuantityScale(decimal value) => decimal.Round(value, QuantityScale) == value;

    /// <summary>An entered nutrient value: zero is allowed (a drink with no fat), negatives never are.</summary>
    public static bool IsNutrient(decimal value) => value >= 0 && value <= MaxNutrient && HasNutrientScale(value);

    /// <summary>A consumed quantity: strictly positive, so "how much" is always an explicit answer.</summary>
    public static bool IsQuantity(decimal value) => value > 0 && value <= MaxQuantity && HasQuantityScale(value);

    /// <summary>
    /// Multiplier the entered nutrients are scaled by: portions as-is, grams divided by 100. Kept unrounded so
    /// totals are computed from the source values and rounded once, at the end.
    /// </summary>
    public static decimal Multiplier(FoodQuantityMode mode, decimal quantity) =>
        mode == FoodQuantityMode.Per100Grams ? quantity / 100m : quantity;

    /// <summary>Rounds a computed total to the stored scale. The only rounding step in a calculation.</summary>
    public static decimal RoundNutrient(decimal value) => decimal.Round(value, NutrientScale, MidpointRounding.AwayFromZero);
}
