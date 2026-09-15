using System.Diagnostics;
using Libra.Application.Nutrition.FoodAnalysis;
using Libra.Domain.Nutrition;
using Libra.Infrastructure.Ai;
using Libra.IntegrationTests.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit.Abstractions;

namespace Libra.IntegrationTests.Nutrition;

/// <summary>
/// Marks a test that calls the real provider. It is skipped — with the reason printed in the run output — unless
/// <c>LIBRA_LIVE_AI=1</c> and an API key are both set, so a normal run never spends money or needs the network.
/// </summary>
public sealed class LiveProviderFactAttribute : FactAttribute
{
    public const string EnableVariable = "LIBRA_LIVE_AI";

    public LiveProviderFactAttribute()
    {
        if (!string.Equals(Environment.GetEnvironmentVariable(EnableVariable), "1", StringComparison.Ordinal))
        {
            Skip = $"Live provider check not run: set {EnableVariable}=1 to enable it.";
        }
        else if (LiveFoodAnalyzerSmokeTests.ApiKey is null)
        {
            Skip = $"Live provider check not run: {EnableVariable}=1 but no API key was found in Ai__OpenAi__ApiKey or OPENAI_API_KEY.";
        }
    }
}

/// <summary>
/// One real call to the configured provider, to prove the credentials, model and strict schema actually work
/// together. Every other test in the suite uses deterministic fixtures; this is the only one that leaves the
/// machine, and it says plainly in its output that it did.
/// </summary>
public sealed class LiveFoodAnalyzerSmokeTests(ITestOutputHelper output)
{
    internal static string? ApiKey =>
        Environment.GetEnvironmentVariable("Ai__OpenAi__ApiKey") is { Length: > 0 } configured ? configured
        : Environment.GetEnvironmentVariable("OPENAI_API_KEY") is { Length: > 0 } fallback ? fallback
        : null;

    [LiveProviderFact]
    public async Task The_configured_provider_answers_a_real_photo_within_the_schema()
    {
        var openAi = new OpenAiOptions { ApiKey = ApiKey };
        if (Environment.GetEnvironmentVariable("Ai__OpenAi__Model") is { Length: > 0 } model)
        {
            openAi.Model = model;
        }

        var options = new FoodAnalysisOptions();
        using var http = new HttpClient();
        using var analyzer = new OpenAiFoodAnalyzer(http, Options.Create(openAi), Options.Create(options), NullLogger<OpenAiFoodAnalyzer>.Instance);

        output.WriteLine($"LIVE provider check RAN against model '{openAi.Model}' at {openAi.BaseUrl}.");

        var processor = new FoodImageProcessor(Options.Create(options));
        var processed = processor.Process(FoodAnalysisTestClient.Photo(1024, 768));
        Assert.True(processed.IsValid, $"The fixture photo was rejected as {processed.Rejection}.");

        var image = processed.Image!;
        var started = Stopwatch.GetTimestamp();
        var outcome = await analyzer.AnalyzeAsync(new AiFoodImage(image.Bytes, image.ContentType, image.Width, image.Height), CancellationToken.None);
        output.WriteLine($"Answered in {Stopwatch.GetElapsedTime(started).TotalSeconds:F1} s: {(outcome.IsSuccess ? outcome.Result!.Outcome.ToString() : $"failure {outcome.Failure} ({outcome.Detail})")}");

        // The picture is a drawn shape, not a meal, so "no food" is a perfectly correct answer. What matters is
        // that the provider answered inside the schema at all.
        Assert.True(outcome.IsSuccess, $"The provider call failed: {outcome.Failure} ({outcome.Detail}).");
        var result = outcome.Result!;
        Assert.Equal(AiFoodAnalysisResult.CurrentSchemaVersion, result.SchemaVersion);
        Assert.Equal(openAi.Model, result.Model);
        Assert.True(Enum.IsDefined(result.Outcome));
        Assert.All(result.Items, item => Assert.False(string.IsNullOrWhiteSpace(item.Name)));
        Assert.All(result.Items, item => Assert.True(Enum.IsDefined(item.Basis)));
        Assert.DoesNotContain(result.Items, item => item.EnergyKcal is < 0m);

        if (result.Outcome == FoodAnalysisOutcome.Success)
        {
            Assert.NotEmpty(result.Items);
        }
    }
}
