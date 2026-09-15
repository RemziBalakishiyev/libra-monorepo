using Libra.Domain.Nutrition;

namespace Libra.Application.Nutrition.FoodAnalysis;

/// <summary>
/// The bounded, versioned result of one photo analysis. Everything the provider returns is validated into this
/// shape before it reaches the database, so a malformed, refused or truncated response can never become a draft.
/// </summary>
public sealed record AiFoodAnalysisResult(
    FoodAnalysisOutcome Outcome,
    IReadOnlyList<FoodEstimateDraft> Items,
    string? Notes,
    decimal? Confidence,
    string Model,
    string SchemaVersion)
{
    /// <summary>Bumped whenever the result schema changes; stored on every draft.</summary>
    public const string CurrentSchemaVersion = "food-analysis.v1";
}

/// <summary>Why an analysis could not produce a result. Each maps to its own Problem Details response.</summary>
public enum AiFoodAnalysisFailure
{
    /// <summary>The provider is not configured, so no analysis can run. Never faked.</summary>
    NotConfigured,

    /// <summary>The provider did not answer in time.</summary>
    Timeout,

    /// <summary>The provider rejected the request or is unavailable.</summary>
    ProviderUnavailable,

    /// <summary>The provider refused to answer (safety refusal).</summary>
    Refused,

    /// <summary>The answer was cut short before the schema was satisfied.</summary>
    Incomplete,

    /// <summary>The answer did not match the schema, or contained values outside the allowed ranges.</summary>
    InvalidOutput,

    /// <summary>Too many analyses are already running.</summary>
    Busy,
}

/// <summary>Success or a named failure. The handler maps each failure to a distinct, honest message.</summary>
public sealed record AiFoodAnalysisOutcome(AiFoodAnalysisResult? Result, AiFoodAnalysisFailure? Failure, string? Detail)
{
    public bool IsSuccess => Result is not null;

    public static AiFoodAnalysisOutcome Success(AiFoodAnalysisResult result) => new(result, null, null);

    public static AiFoodAnalysisOutcome Failed(AiFoodAnalysisFailure failure, string? detail = null) => new(null, failure, detail);
}

/// <summary>The image handed to the analyzer: normalized bytes plus the type they were encoded as.</summary>
public sealed record AiFoodImage(byte[] Bytes, string ContentType, int Width, int Height);

/// <summary>
/// Provider boundary for food-photo analysis (AI-SAFETY, rule 10). The model receives one image and a fixed
/// instruction; it gets no database access, no tools and no user data beyond the picture.
/// </summary>
public interface IAiFoodAnalyzer
{
    /// <summary>True when credentials and configuration allow a real call. False never produces a fake result.</summary>
    bool IsConfigured { get; }

    /// <summary>The model this analyzer would call, for the record kept on every draft.</summary>
    string Model { get; }

    Task<AiFoodAnalysisOutcome> AnalyzeAsync(AiFoodImage image, CancellationToken cancellationToken);
}
