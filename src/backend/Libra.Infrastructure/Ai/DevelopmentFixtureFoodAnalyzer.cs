using Libra.Application.Nutrition.FoodAnalysis;
using Libra.Domain.Nutrition;
using Microsoft.Extensions.Logging;

namespace Libra.Infrastructure.Ai;

/// <summary>
/// A fixed estimate for local development and demonstrations, used **only** when
/// <c>Ai:FoodAnalysis:UseDevelopmentFixture</c> is explicitly true and the host is running in Development.
/// Registration is refused anywhere else (see <see cref="DependencyInjection"/>), so a missing API key can never
/// quietly turn into a fake analysis: without credentials the real adapter answers <c>NotConfigured</c>, which the
/// API reports as a 503.
///
/// Everything it returns is labelled as a fixture — the model name is stored on every draft it produces — so a
/// draft made this way is recognisable in the database and on screen.
/// </summary>
public sealed class DevelopmentFixtureFoodAnalyzer(ILogger<DevelopmentFixtureFoodAnalyzer> logger) : IAiFoodAnalyzer
{
    public const string ModelName = "development-fixture";

    public bool IsConfigured => true;

    public string Model => ModelName;

    public Task<AiFoodAnalysisOutcome> AnalyzeAsync(AiFoodImage image, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(image);
        logger.LogWarning("Food analysis answered from the development fixture; no provider call was made.");

        // One food on each basis, plus a macro left unknown, so every path of the review screen is exercised.
        var items = new[]
        {
            new FoodEstimateDraft("Omlet", "bir boşqab", 180m, FoodAnalysisBasis.PicturedPortion, 250m, 18m, 3m, 19m, 0.7m),
            new FoodEstimateDraft("Düyü", "yarım kasa", 180m, FoodAnalysisBasis.Per100Grams, 130m, null, 28.2m, 0.3m, 0.5m),
        };

        return Task.FromResult(AiFoodAnalysisOutcome.Success(new AiFoodAnalysisResult(
            FoodAnalysisOutcome.Success,
            items,
            "Nümunə nəticəsi: boşqabın bir hissəsi kadrdan kənardadır.",
            0.6m,
            ModelName,
            AiFoodAnalysisResult.CurrentSchemaVersion)));
    }
}
