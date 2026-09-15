namespace Libra.Application.Nutrition.FoodAnalysis;

/// <summary>
/// Limits and retention for photo analysis, bound from the `Ai:FoodAnalysis` configuration section. Credentials
/// live in the same section but never leave the backend, and never appear in the mobile bundle.
/// </summary>
public sealed class FoodAnalysisOptions
{
    public const string SectionName = "Ai:FoodAnalysis";

    /// <summary>Largest upload accepted, before normalization. Anything bigger is rejected, not resized.</summary>
    public int MaxUploadBytes { get; set; } = 8 * 1024 * 1024;

    /// <summary>Largest decoded picture accepted, as a guard against decompression bombs.</summary>
    public int MaxImagePixels { get; set; } = 50_000_000;

    /// <summary>Smallest useful picture; below this an estimate would be guesswork.</summary>
    public int MinImageDimension { get; set; } = 64;

    /// <summary>Longest edge after normalization. Smaller pictures are never upscaled.</summary>
    public int MaxStoredDimension { get; set; } = 1024;

    /// <summary>JPEG quality used when re-encoding the normalized picture.</summary>
    public int JpegQuality { get; set; } = 82;

    /// <summary>How long a pending draft stays confirmable. After this the sweep removes it.</summary>
    public int DraftLifetimeMinutes { get; set; } = 120;

    /// <summary>How long the stored picture is kept, confirmed or not. Nutrition entries are never touched.</summary>
    public int ImageRetentionMinutes { get; set; } = 120;

    /// <summary>How often the cleanup sweep runs.</summary>
    public int CleanupIntervalMinutes { get; set; } = 15;

    /// <summary>Analyses one user may start per hour.</summary>
    public int MaxAnalysesPerHour { get; set; } = 20;

    /// <summary>Provider calls that may run at once across the process.</summary>
    public int MaxConcurrentAnalyses { get; set; } = 4;

    /// <summary>How long one provider call may take.</summary>
    public int TimeoutSeconds { get; set; } = 45;

    /// <summary>Upper bound on the model's answer, so a runaway response cannot cost or block indefinitely.</summary>
    public int MaxOutputTokens { get; set; } = 1200;

    public TimeSpan DraftLifetime => TimeSpan.FromMinutes(Math.Max(1, DraftLifetimeMinutes));

    public TimeSpan ImageRetention => TimeSpan.FromMinutes(Math.Max(1, ImageRetentionMinutes));

    public TimeSpan CleanupInterval => TimeSpan.FromMinutes(Math.Max(1, CleanupIntervalMinutes));

    public TimeSpan Timeout => TimeSpan.FromSeconds(Math.Clamp(TimeoutSeconds, 5, 300));

    public bool IsValid() =>
        MaxUploadBytes is > 0 and <= 64 * 1024 * 1024
        && MaxImagePixels > 0
        && MinImageDimension is > 0 and < 4096
        && MaxStoredDimension is >= 256 and <= 4096
        && JpegQuality is >= 40 and <= 100
        && DraftLifetimeMinutes > 0
        && ImageRetentionMinutes > 0
        && CleanupIntervalMinutes > 0
        && MaxAnalysesPerHour > 0
        && MaxConcurrentAnalyses is > 0 and <= 64
        && MaxOutputTokens is >= 256 and <= 32_000;
}

/// <summary>Provider credentials and model choice, bound from `Ai:OpenAi`.</summary>
public sealed class OpenAiOptions
{
    public const string SectionName = "Ai:OpenAi";

    /// <summary>Backend-only secret. Set through user-secrets or an environment variable, never in source.</summary>
    public string? ApiKey { get; set; }

    public string BaseUrl { get; set; } = "https://api.openai.com/v1";

    /// <summary>
    /// Vision model with strict Structured Outputs on the Responses API. `gpt-5.6-luna` is the cheapest such
    /// model at the time of writing ($0.20 / 1M input tokens, $1.20 / 1M output tokens).
    /// </summary>
    public string Model { get; set; } = "gpt-5.6-luna";

    /// <summary>Detail level for the image part; "low" keeps a food photo cheap, "auto" lets the model decide.</summary>
    public string ImageDetail { get; set; } = "auto";

    public bool IsConfigured => !string.IsNullOrWhiteSpace(ApiKey);
}
