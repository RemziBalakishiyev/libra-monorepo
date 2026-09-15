using System.Text.Json.Serialization;

namespace Libra.Domain.Nutrition;

// These enums are part of the API contract and are always serialized by name.

[JsonConverter(typeof(JsonStringEnumConverter<MealType>))]
public enum MealType
{
    Breakfast,
    Lunch,
    Dinner,
    Snack,
}

/// <summary>How the nutrients of a food item were entered, and therefore how the quantity multiplies them.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<FoodQuantityMode>))]
public enum FoodQuantityMode
{
    /// <summary>Nutrients describe one portion; quantity counts portions.</summary>
    PerPortion,

    /// <summary>Nutrients describe 100 g; quantity is the consumed weight in grams.</summary>
    Per100Grams,
}
