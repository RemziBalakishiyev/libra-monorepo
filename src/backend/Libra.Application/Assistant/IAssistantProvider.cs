using System.Text.Json.Serialization;

namespace Libra.Application.Assistant;

/// <summary>What kind of answer came back. Each one is a different thing to show, never a fallback for another.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<AssistantOutcome>))]
public enum AssistantOutcome
{
    /// <summary>A grounded answer about the snapshot.</summary>
    Answer = 0,

    /// <summary>The snapshot does not contain what the question needs. Said plainly, never guessed around.</summary>
    InsufficientData = 1,

    /// <summary>The question is ambiguous; one focused question comes back instead of an assumption.</summary>
    ClarificationNeeded = 2,

    /// <summary>Out of scope — medical diagnosis, professional advice, anything the assistant must not do.</summary>
    Refusal = 3,
}

/// <summary>
/// One statement about the user's records.
///
/// <see cref="FactIds"/> may name only facts present in the snapshot this answer was built from; the handler
/// rejects the whole answer otherwise. That is what keeps a figure in the interface traceable to a record the
/// user can open.
/// </summary>
public sealed record AssistantObservation(string Text, IReadOnlyList<string> FactIds);

/// <summary>
/// The bounded, validated answer. Suggestions are kept apart from observations on purpose: one describes what
/// the records say, the other proposes what the person might do, and the interface labels them differently.
/// </summary>
public sealed record AssistantAnswer
{
    public const string CurrentSchemaVersion = "assistant-answer.v1";

    public required AssistantOutcome Outcome { get; init; }

    /// <summary>Two or three sentences. Empty for a clarification, which carries its question instead.</summary>
    public required string Summary { get; init; }

    public required IReadOnlyList<AssistantObservation> Observations { get; init; }

    /// <summary>Proposals only. Nothing here is ever acted on by the application.</summary>
    public required IReadOnlyList<string> Suggestions { get; init; }

    /// <summary>Questions the person might ask next. Offered, never asked automatically.</summary>
    public required IReadOnlyList<string> FollowUps { get; init; }

    /// <summary>The one thing that would let the assistant answer. Only for <see cref="AssistantOutcome.ClarificationNeeded"/>.</summary>
    public string? Clarification { get; init; }

    public required string Model { get; init; }

    public required string SchemaVersion { get; init; }

    /// <summary>True when this answer came from the development fixture, so the interface can say so.</summary>
    public bool IsFixture { get; init; }
}

/// <summary>Why an answer could not be produced. Each maps to its own Problem Details response.</summary>
public enum AssistantFailure
{
    /// <summary>No credentials or configuration. The product says the assistant is not active yet; nothing is faked.</summary>
    NotConfigured,
    Timeout,
    ProviderUnavailable,
    Refused,
    Incomplete,

    /// <summary>Schema mismatch, out-of-range values, or a citation of a fact that does not exist.</summary>
    InvalidOutput,

    /// <summary>Too many questions from this user, or too many in flight across the process.</summary>
    Busy,
}

public sealed record AssistantOutcomeResult(AssistantAnswer? Answer, AssistantFailure? Failure, string? Detail)
{
    public bool IsSuccess => Answer is not null;

    public static AssistantOutcomeResult Success(AssistantAnswer answer) => new(answer, null, null);

    public static AssistantOutcomeResult Failed(AssistantFailure failure, string? detail = null) => new(null, failure, detail);
}

/// <summary>One earlier turn, bounded and already answered, passed back for continuity.</summary>
public sealed record AssistantTurn(string Question, string Summary);

/// <summary>
/// What the provider is given for one question: the snapshot, the question, and a bounded tail of the
/// conversation. Nothing else — no database handle, no tools, no credentials, no raw records.
/// </summary>
public sealed record AssistantRequest(
    AssistantContextSnapshot Snapshot,
    string Question,
    IReadOnlyList<AssistantTurn> History);

/// <summary>
/// Provider boundary for the assistant (AI-SAFETY, rule 10), kept separate from <c>IAiFoodAnalyzer</c> so the
/// two features cannot share limits, prompts or failure handling.
///
/// The implementation receives only an <see cref="AssistantRequest"/>. It has no database access, no tools and
/// no ability to mutate anything: this version of the assistant is read-only by construction, not by policy.
/// </summary>
public interface IAssistantProvider
{
    /// <summary>True when credentials and configuration allow a real call. False never produces a fake answer.</summary>
    bool IsConfigured { get; }

    /// <summary>True when answers come from the development fixture, which the interface labels as such.</summary>
    bool IsFixture { get; }

    string Model { get; }

    Task<AssistantOutcomeResult> AskAsync(AssistantRequest request, CancellationToken cancellationToken);
}
