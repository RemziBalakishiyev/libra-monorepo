using Libra.Application.Nutrition.FoodAnalysis;
using Libra.Domain.Nutrition;

namespace Libra.UnitTests.Nutrition;

/// <summary>
/// Turning an estimate into meal-entry input. The rule under test throughout: an estimated weight and a portion
/// count are never both applied to the same food.
/// </summary>
public sealed class FoodAnalysisNormalizationTests
{
    [Fact]
    public void A_pictured_portion_is_one_portion_and_the_weight_is_only_metadata()
    {
        var normalized = FoodAnalysisNormalization.Normalize(
            FoodAnalysisBasis.PicturedPortion, estimatedGrams: 250m, energyKcal: 430m, proteinGrams: 21m, carbGrams: 40m, fatGrams: 19m);

        Assert.Equal(FoodQuantityMode.PerPortion, normalized.QuantityMode);
        // 250 g would otherwise become a 250× multiplier on values that already describe the whole plate.
        Assert.Equal(1m, normalized.Quantity);
        Assert.Equal(430m, normalized.EnergyKcalPerUnit);

        var contribution = FoodAnalysisNormalization.Contribution(normalized);
        Assert.Equal(430m, contribution.EnergyKcal);
        Assert.Equal(21m, contribution.ProteinGrams);
    }

    [Fact]
    public void A_per_hundred_grams_estimate_is_scaled_once_by_the_weight()
    {
        var normalized = FoodAnalysisNormalization.Normalize(
            FoodAnalysisBasis.Per100Grams, estimatedGrams: 180m, energyKcal: 130m, proteinGrams: 2.7m, carbGrams: 28.2m, fatGrams: 0.3m);

        Assert.Equal(FoodQuantityMode.Per100Grams, normalized.QuantityMode);
        Assert.Equal(180m, normalized.Quantity);
        Assert.Equal(130m, normalized.EnergyKcalPerUnit);

        var contribution = FoodAnalysisNormalization.Contribution(normalized);
        Assert.Equal(234m, contribution.EnergyKcal);
        Assert.Equal(4.86m, contribution.ProteinGrams);
        Assert.Equal(50.76m, contribution.CarbGrams);
        Assert.Equal(0.54m, contribution.FatGrams);
    }

    [Fact]
    public void The_two_representations_of_one_food_contribute_the_same_amount()
    {
        var perHundred = new FoodEstimateDraft(
            "Düyü", "one bowl", EstimatedGrams: 180m, FoodAnalysisBasis.Per100Grams,
            EnergyKcal: 130m, ProteinGrams: 2.7m, CarbGrams: 28.2m, FatGrams: 0.3m, Confidence: 0.5m);

        var asPortion = FoodAnalysisNormalization.ToPicturedPortion(perHundred);

        var fromGrams = FoodAnalysisNormalization.Contribution(FoodAnalysisNormalization.Normalize(
            perHundred.Basis, perHundred.EstimatedGrams, perHundred.EnergyKcal, perHundred.ProteinGrams, perHundred.CarbGrams, perHundred.FatGrams));
        var fromPortion = FoodAnalysisNormalization.Contribution(FoodAnalysisNormalization.Normalize(
            asPortion.Basis, asPortion.EstimatedGrams, asPortion.EnergyKcal, asPortion.ProteinGrams, asPortion.CarbGrams, asPortion.FatGrams));

        Assert.Equal(fromGrams, fromPortion);
        Assert.Equal(234m, fromPortion.EnergyKcal);
        // The weight survives as metadata even though it no longer multiplies anything.
        Assert.Equal(180m, asPortion.EstimatedGrams);
    }

    [Fact]
    public void Changing_the_quantity_scales_the_contribution_and_nothing_else()
    {
        var normalized = FoodAnalysisNormalization.Normalize(
            FoodAnalysisBasis.Per100Grams, estimatedGrams: 180m, energyKcal: 130m, proteinGrams: 2.7m, carbGrams: 28.2m, fatGrams: 0.3m);

        var doubled = FoodAnalysisNormalization.Contribution(normalized with { Quantity = 360m });
        var halved = FoodAnalysisNormalization.Contribution(normalized with { Quantity = 90m });

        Assert.Equal(468m, doubled.EnergyKcal);
        Assert.Equal(117m, halved.EnergyKcal);
        Assert.Equal(130m, normalized.EnergyKcalPerUnit);
    }

    [Fact]
    public void An_unknown_nutrient_contributes_nothing_and_stays_unknown()
    {
        var normalized = FoodAnalysisNormalization.Normalize(
            FoodAnalysisBasis.Per100Grams, estimatedGrams: 200m, energyKcal: 90m, proteinGrams: null, carbGrams: 12m, fatGrams: null);

        var contribution = FoodAnalysisNormalization.Contribution(normalized);

        Assert.Equal(180m, contribution.EnergyKcal);
        Assert.Null(contribution.ProteinGrams);
        Assert.Equal(24m, contribution.CarbGrams);
        Assert.Null(contribution.FatGrams);
        Assert.False(normalized.IsComplete);
    }

    [Fact]
    public void An_estimate_missing_its_weight_is_incomplete_rather_than_assumed()
    {
        var normalized = FoodAnalysisNormalization.Normalize(
            FoodAnalysisBasis.Per100Grams, estimatedGrams: null, energyKcal: 90m, proteinGrams: 3m, carbGrams: 12m, fatGrams: 1m);

        Assert.Null(normalized.Quantity);
        Assert.False(normalized.IsComplete);
        Assert.Equal((null, null, null, null), FoodAnalysisNormalization.Contribution(normalized));
    }

    [Fact]
    public void A_complete_estimate_reports_itself_complete()
    {
        var normalized = FoodAnalysisNormalization.Normalize(
            FoodAnalysisBasis.PicturedPortion, estimatedGrams: null, energyKcal: 250m, proteinGrams: 18m, carbGrams: 3m, fatGrams: 19m);

        // A pictured portion needs no weight at all: the quantity is the portion itself.
        Assert.True(normalized.IsComplete);
    }

    [Fact]
    public void Entered_energy_is_never_recomputed_from_the_macros()
    {
        // 18 g protein + 3 g carb + 19 g fat would be 255 kcal under the 4/4/9 rule; the model said 250.
        var normalized = FoodAnalysisNormalization.Normalize(
            FoodAnalysisBasis.PicturedPortion, estimatedGrams: null, energyKcal: 250m, proteinGrams: 18m, carbGrams: 3m, fatGrams: 19m);

        Assert.Equal(250m, FoodAnalysisNormalization.Contribution(normalized).EnergyKcal);
    }

    [Fact]
    public void A_per_hundred_gram_estimate_without_a_weight_cannot_be_rewritten_as_a_portion()
    {
        var estimate = new FoodEstimateDraft(
            "Şorba", null, EstimatedGrams: null, FoodAnalysisBasis.Per100Grams,
            EnergyKcal: 40m, ProteinGrams: 1m, CarbGrams: 4m, FatGrams: 1m, Confidence: null);

        Assert.Throws<InvalidOperationException>(() => FoodAnalysisNormalization.ToPicturedPortion(estimate));
    }

    [Fact]
    public void Rounding_happens_once_at_the_end_of_a_contribution()
    {
        // 33.33 per 100 g × 1.5 = 49.995, which must round to 50.00 rather than to 49.99 through an early step.
        var normalized = FoodAnalysisNormalization.Normalize(
            FoodAnalysisBasis.Per100Grams, estimatedGrams: 150m, energyKcal: 33.33m, proteinGrams: null, carbGrams: null, fatGrams: null);

        Assert.Equal(50.00m, FoodAnalysisNormalization.Contribution(normalized).EnergyKcal);
    }
}
