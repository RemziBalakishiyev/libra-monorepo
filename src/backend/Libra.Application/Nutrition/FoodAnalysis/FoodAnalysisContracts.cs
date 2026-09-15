using Libra.Domain.Nutrition;

namespace Libra.Application.Nutrition.FoodAnalysis;

/// <summary>
/// One estimated food as the model reported it, plus the entry input it normalizes to. `suggested*` fields are
/// the only sanctioned way to turn an estimate into a meal item: a `PicturedPortion` basis becomes one portion
/// and a `Per100Grams` basis becomes the estimated weight, so the weight and the portion count are never applied
/// as two multipliers to the same food.
/// </summary>
public sealed record FoodAnalysisItemResponse
{
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public string? PortionDescription { get; init; }
    public decimal? EstimatedGrams { get; init; }
    public required FoodAnalysisBasis Basis { get; init; }

    /// <summary>The estimate as given, on <see cref="Basis"/>. Null means the model did not judge it.</summary>
    public decimal? EnergyKcal { get; init; }
    public decimal? ProteinGrams { get; init; }
    public decimal? CarbGrams { get; init; }
    public decimal? FatGrams { get; init; }
    public decimal? Confidence { get; init; }
    public required int Position { get; init; }

    /// <summary>Entry input: portions for a pictured portion, grams for a per-100 g estimate.</summary>
    public required FoodQuantityMode SuggestedQuantityMode { get; init; }
    public required decimal SuggestedQuantity { get; init; }
    public decimal? SuggestedEnergyKcalPerUnit { get; init; }
    public decimal? SuggestedProteinGramsPerUnit { get; init; }
    public decimal? SuggestedCarbGramsPerUnit { get; init; }
    public decimal? SuggestedFatGramsPerUnit { get; init; }

    /// <summary>False when a required value is missing, so the client asks for it instead of inventing one.</summary>
    public required bool IsComplete { get; init; }
}

public sealed record FoodAnalysisDraftResponse
{
    public required Guid Id { get; init; }
    public required FoodAnalysisStatus Status { get; init; }
    public required FoodAnalysisOutcome Outcome { get; init; }
    public required string SchemaVersion { get; init; }
    public required string Model { get; init; }
    public string? Notes { get; init; }
    public decimal? Confidence { get; init; }
    public required Guid ImageId { get; init; }
    public required bool HasImage { get; init; }
    public required DateTime CreatedAtUtc { get; init; }
    public required DateTime ExpiresAtUtc { get; init; }
    public required bool IsExpired { get; init; }
    public Guid? ConfirmedEntryId { get; init; }
    public required IReadOnlyList<FoodAnalysisItemResponse> Items { get; init; }
}

internal static class FoodAnalysisErrors
{
    public const string DraftNotFound = "Analysis draft not found";
    public const string ImageNotFound = "Analysis image not found";
    public const string DraftExpired = "Analysis draft has expired";
    public const string DraftDiscarded = "Analysis draft was discarded";
    public const string AnalysisUnavailable = "Photo analysis is not available";
    public const string AnalysisTimedOut = "Photo analysis timed out";
    public const string AnalysisRefused = "Photo analysis was refused";
    public const string AnalysisIncomplete = "Photo analysis did not finish";
    public const string AnalysisInvalid = "Photo analysis returned an unusable result";
    public const string AnalysisBusy = "Too many analyses are running";
    public const string RateLimited = "Too many photo analyses";
    public const string ImageRejected = "Image was rejected";
}
