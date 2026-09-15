using System.Text.Json.Serialization;

namespace Libra.Domain.Nutrition;

// These enums are part of the API contract and are always serialized by name.

/// <summary>Lifecycle of an analysis draft. Only <see cref="Confirmed"/> has a nutrition entry behind it.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<FoodAnalysisStatus>))]
public enum FoodAnalysisStatus
{
    /// <summary>Waiting for the user to review and confirm. Contributes nothing to any total.</summary>
    PendingConfirmation,

    /// <summary>The user confirmed a reviewed version; exactly one nutrition entry exists for it.</summary>
    Confirmed,

    /// <summary>The user threw it away. Kept only until the cleanup sweep removes it.</summary>
    Discarded,
}

/// <summary>What the analysis could say about the photo. A draft exists for every outcome.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<FoodAnalysisOutcome>))]
public enum FoodAnalysisOutcome
{
    /// <summary>Food was identified and estimated; items are present.</summary>
    Success,

    /// <summary>Food is visible but the picture does not support an estimate (blurred, cropped, hidden portions).</summary>
    InsufficientInformation,

    /// <summary>No food in the picture.</summary>
    NoFoodDetected,
}

/// <summary>
/// What the nutrient numbers of an estimated item describe. Normalizing this is the only safe way to turn an
/// estimate into an entry input: a portion basis must never be multiplied by the estimated weight as well.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<FoodAnalysisBasis>))]
public enum FoodAnalysisBasis
{
    /// <summary>The nutrients describe the portion visible in the photo, whatever it weighs.</summary>
    PicturedPortion,

    /// <summary>The nutrients describe 100 g of the food; the weight comes from <c>EstimatedGrams</c>.</summary>
    Per100Grams,
}
