using System.Collections.Concurrent;
using Libra.Application.Nutrition.FoodAnalysis;
using Libra.Domain.Nutrition;

namespace Libra.IntegrationTests.Infrastructure;

/// <summary>
/// A deterministic stand-in for the provider. The real adapter is exercised against fixtures in the unit suite;
/// here the interesting behaviour is everything around the call — drafts, ownership, confirmation, cleanup — so
/// the analyzer answers from a script instead of the network. Nothing in the application can tell the difference.
/// </summary>
public sealed class FakeFoodAnalyzer : IAiFoodAnalyzer
{
    private readonly ConcurrentQueue<AiFoodAnalysisOutcome> _scripted = new();
    private int _calls;

    public bool Configured { get; set; } = true;

    public string ModelName { get; set; } = "fixture/food-analysis";

    public int Calls => Volatile.Read(ref _calls);

    /// <summary>The picture the last call received, so tests can prove the normalized bytes are what travel.</summary>
    public AiFoodImage? LastImage { get; private set; }

    public bool IsConfigured => Configured;

    public string Model => ModelName;

    public Task<AiFoodAnalysisOutcome> AnalyzeAsync(AiFoodImage image, CancellationToken cancellationToken)
    {
        Interlocked.Increment(ref _calls);
        LastImage = image;

        if (!Configured)
        {
            return Task.FromResult(AiFoodAnalysisOutcome.Failed(AiFoodAnalysisFailure.NotConfigured));
        }

        return Task.FromResult(_scripted.TryDequeue(out var scripted) ? scripted : AiFoodAnalysisOutcome.Success(TwoFoods()));
    }

    /// <summary>Queues the answer the next call returns. Later calls fall back to the default two-food result.</summary>
    public FakeFoodAnalyzer Returns(AiFoodAnalysisOutcome outcome)
    {
        _scripted.Enqueue(outcome);
        return this;
    }

    public FakeFoodAnalyzer Returns(AiFoodAnalysisResult result) => Returns(AiFoodAnalysisOutcome.Success(result));

    public FakeFoodAnalyzer Fails(AiFoodAnalysisFailure failure, string? detail = null) =>
        Returns(AiFoodAnalysisOutcome.Failed(failure, detail));

    public void Reset()
    {
        _scripted.Clear();
        Configured = true;
        ModelName = "fixture/food-analysis";
        LastImage = null;
        Interlocked.Exchange(ref _calls, 0);
    }

    /// <summary>
    /// One estimate on each basis: a whole plate, and a food described per 100 g with a weight. Together they
    /// cover both normalization paths in a single draft.
    /// </summary>
    public static AiFoodAnalysisResult TwoFoods(string? notes = "Part of the plate is out of frame.", decimal? confidence = 0.6m) =>
        Result(
            [
                new FoodEstimateDraft("Omlet", "bir boşqab", 180m, FoodAnalysisBasis.PicturedPortion, 250m, 18m, 3m, 19m, 0.7m),
                new FoodEstimateDraft("Düyü", "yarım kasa", 180m, FoodAnalysisBasis.Per100Grams, 130m, 2.7m, 28.2m, 0.3m, 0.5m),
            ],
            notes,
            confidence);

    /// <summary>An estimate the model could not complete: energy known, macros unknown. Never zeroes.</summary>
    public static AiFoodAnalysisResult PartiallyKnownFood() =>
        Result(
            [new FoodEstimateDraft("Şorba", "bir kasa", null, FoodAnalysisBasis.PicturedPortion, 180m, null, null, null, 0.3m)],
            "The ingredients are not visible.",
            0.3m);

    public static AiFoodAnalysisResult NoFood() =>
        Result([], "There is no food in this picture.", 0.9m, FoodAnalysisOutcome.NoFoodDetected);

    public static AiFoodAnalysisResult TooUnclear() =>
        Result([], "The picture is too blurred to judge.", 0.1m, FoodAnalysisOutcome.InsufficientInformation);

    public static AiFoodAnalysisResult Result(
        IReadOnlyList<FoodEstimateDraft> items,
        string? notes = null,
        decimal? confidence = null,
        FoodAnalysisOutcome outcome = FoodAnalysisOutcome.Success) =>
        new(outcome, items, notes, confidence, "fixture/food-analysis", AiFoodAnalysisResult.CurrentSchemaVersion);
}

/// <summary>
/// Image storage held in memory for the duration of a test run. It keeps the same contract as the file-system
/// store, so deletion during confirmation and cleanup is observable rather than inferred.
/// </summary>
public sealed class InMemoryImageStore : IImageStore
{
    private readonly ConcurrentDictionary<string, byte[]> _files = new();

    public int Count => _files.Count;

    public bool Contains(string storageKey) => _files.ContainsKey(storageKey);

    public Task<string> SaveAsync(byte[] bytes, string contentType, CancellationToken cancellationToken)
    {
        var key = $"test/{Guid.NewGuid():N}.jpg";
        _files[key] = bytes;
        return Task.FromResult(key);
    }

    public Task<byte[]?> ReadAsync(string storageKey, CancellationToken cancellationToken) =>
        Task.FromResult(_files.TryGetValue(storageKey, out var bytes) ? bytes : null);

    public Task DeleteAsync(string storageKey, CancellationToken cancellationToken)
    {
        _files.TryRemove(storageKey, out _);
        return Task.CompletedTask;
    }

    public void Reset() => _files.Clear();
}
