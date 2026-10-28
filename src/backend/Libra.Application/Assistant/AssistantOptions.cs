namespace Libra.Application.Assistant;

/// <summary>
/// Limits for the assistant, bound from <c>Ai:Assistant</c>. Credentials live in the shared <c>Ai:OpenAi</c>
/// section and never leave the backend.
///
/// These are kept apart from <c>Ai:FoodAnalysis</c> on purpose: the two features must not share a budget, a
/// timeout or a rate limit, so one being abused cannot take the other down with it.
/// </summary>
public sealed class AssistantOptions
{
    public const string SectionName = "Ai:Assistant";

    /// <summary>Questions one user may ask per hour.</summary>
    public int MaxQuestionsPerHour { get; set; } = 30;

    /// <summary>How long one provider call may take.</summary>
    public int TimeoutSeconds { get; set; } = 40;

    /// <summary>Upper bound on the answer, so a runaway response cannot cost or block indefinitely.</summary>
    public int MaxOutputTokens { get; set; } = 900;

    /// <summary>Earlier turns handed back to the provider. Anything older is outside the response context.</summary>
    public int MaxHistoryTurns { get; set; } = 6;

    /// <summary>How long a question waits for a concurrency slot before being told the assistant is busy.</summary>
    public int QueueSeconds { get; set; } = 5;

    /// <summary>
    /// Returns a fixture answer instead of calling a provider. Development only, and every answer it produces
    /// is labelled as a fixture in the interface and in evidence.
    /// </summary>
    public bool UseDevelopmentFixture { get; set; }

    /// <summary>What a new conversation is scoped to when the client does not say.</summary>
    public IReadOnlyList<AssistantModule> DefaultModules { get; set; } =
        [AssistantModule.Finance, AssistantModule.Nutrition, AssistantModule.Tasks, AssistantModule.Sleep, AssistantModule.Focus];
}
