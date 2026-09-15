using Libra.Domain.Nutrition;

namespace Libra.Application.Nutrition;

/// <summary>Energy and macros of one item, entry, meal group, or day. Grams for macros, kcal for energy.</summary>
public sealed record NutritionTotals(decimal EnergyKcal, decimal ProteinGrams, decimal CarbGrams, decimal FatGrams)
{
    public static readonly NutritionTotals Zero = new(0m, 0m, 0m, 0m);
}

/// <summary>Init-only so EF Core can compose the projection (constructor projections cannot be composed).</summary>
public sealed record NutritionItemResponse
{
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public required FoodQuantityMode QuantityMode { get; init; }

    /// <summary>Portions for PerPortion, grams for Per100Grams.</summary>
    public required decimal Quantity { get; init; }

    /// <summary>The entered nutrients of one portion or of 100 g. Energy is never derived from the macros.</summary>
    public required decimal EnergyKcalPerUnit { get; init; }
    public required decimal ProteinGramsPerUnit { get; init; }
    public required decimal CarbGramsPerUnit { get; init; }
    public required decimal FatGramsPerUnit { get; init; }

    /// <summary>What this item contributed, computed from the inputs above and rounded once.</summary>
    public required decimal EnergyKcal { get; init; }
    public required decimal ProteinGrams { get; init; }
    public required decimal CarbGrams { get; init; }
    public required decimal FatGrams { get; init; }
    public required int Position { get; init; }
}

/// <summary>Init-only for the same composability reason as <see cref="NutritionItemResponse"/>.</summary>
public sealed record NutritionEntryResponse
{
    public required Guid Id { get; init; }
    public required MealType MealType { get; init; }
    public required DateTime ConsumedAtUtc { get; init; }
    public string? Note { get; init; }
    public Guid? ClientRequestId { get; init; }
    public required decimal EnergyKcal { get; init; }
    public required decimal ProteinGrams { get; init; }
    public required decimal CarbGrams { get; init; }
    public required decimal FatGrams { get; init; }
    public required IReadOnlyList<NutritionItemResponse> Items { get; init; }
    public required DateTime CreatedAtUtc { get; init; }
    public required DateTime UpdatedAtUtc { get; init; }
}

public sealed record NutritionGoalResponse(
    Guid Id,
    DateOnly EffectiveFrom,
    decimal? EnergyKcal,
    decimal? ProteinGrams,
    decimal? CarbGrams,
    decimal? FatGrams,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc);

/// <summary>The goal that applies today plus the full history, so a client can explain when a change took effect.</summary>
public sealed record NutritionGoalsResponse(DateOnly Date, string TimeZone, NutritionGoalResponse? Current, IReadOnlyList<NutritionGoalResponse> History);

public sealed record NutritionMealGroup(MealType MealType, NutritionTotals Totals, IReadOnlyList<NutritionEntryResponse> Entries);

/// <summary>
/// One local calendar day. Totals are summed in the database over every stored entry of the day, never from a
/// page of the list endpoint, and the goal is the one that applies to this date (null when nothing is set).
/// </summary>
public sealed record NutritionDayResponse(
    DateOnly Date,
    string TimeZone,
    DateTime StartUtc,
    DateTime EndUtc,
    NutritionTotals Totals,
    int EntryCount,
    NutritionGoalResponse? Goal,
    IReadOnlyList<NutritionMealGroup> Meals);

internal static class NutritionErrors
{
    public const string EntryNotFound = "Nutrition entry not found";
    public const string GoalNotFound = "Nutrition goal not found";
}

internal static class NutritionMapping
{
    public static NutritionGoalResponse ToResponse(this NutritionGoal goal) =>
        new(goal.Id, goal.EffectiveFrom, goal.EnergyKcal, goal.ProteinGrams, goal.CarbGrams, goal.FatGrams, goal.CreatedAtUtc, goal.UpdatedAtUtc);

    public static NutritionTotals Totals(this NutritionEntryResponse entry) =>
        new(entry.EnergyKcal, entry.ProteinGrams, entry.CarbGrams, entry.FatGrams);

    public static NutritionTotals Sum(this IEnumerable<NutritionTotals> totals)
    {
        var (energy, protein, carbs, fat) = (0m, 0m, 0m, 0m);
        foreach (var total in totals)
        {
            energy += total.EnergyKcal;
            protein += total.ProteinGrams;
            carbs += total.CarbGrams;
            fat += total.FatGrams;
        }

        return new NutritionTotals(energy, protein, carbs, fat);
    }
}
