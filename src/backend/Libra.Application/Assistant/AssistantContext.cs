using System.Text.Json.Serialization;

namespace Libra.Application.Assistant;

/// <summary>Which modules a snapshot was built from. The user chooses; nothing is included by default.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<AssistantModule>))]
public enum AssistantModule
{
    Finance = 0,
    Nutrition = 1,
    Tasks = 2,
    Sleep = 3,
    Focus = 4,
}

/// <summary>
/// Whether a fact actually has a value, and if not, why.
///
/// This distinction is the whole point of the type: "no records" and "zero" are different answers, and an
/// assistant that confuses them tells the user they ate nothing when they simply did not log anything.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<FactAvailability>))]
public enum FactAvailability
{
    /// <summary>A real, complete value.</summary>
    Available = 0,

    /// <summary>The query ran and found nothing recorded. Not a zero.</summary>
    NoRecords = 1,

    /// <summary>Some of the period has records and some does not; the value covers only what exists.</summary>
    Partial = 2,

    /// <summary>The module could not be read at all. Never substituted with anything.</summary>
    Unavailable = 3,
}

/// <summary>
/// One grounded fact, with a stable id inside its snapshot.
///
/// The id is what an observation may cite, and the only thing it may cite. Values are computed by this
/// application from the user's own records; the model never supplies a replacement, and the client renders
/// figures from here rather than from the model's prose.
/// </summary>
public sealed record AssistantFact
{
    /// <summary>Stable within one snapshot, e.g. <c>finance.expense.month</c>. Cited by observations.</summary>
    public required string Id { get; init; }

    public required AssistantModule Module { get; init; }

    /// <summary>What the figure is, in the interface language.</summary>
    public required string Label { get; init; }

    public required FactAvailability Availability { get; init; }

    /// <summary>The number, when there is one. Null for every availability except Available and Partial.</summary>
    public decimal? Value { get; init; }

    /// <summary>"AZN", "kkal", "dəqiqə", "tapşırıq" — the unit the value is in. Currencies are never mixed.</summary>
    public string? Unit { get; init; }

    /// <summary>A short non-numeric value, for facts that are not a measurement.</summary>
    public string? Text { get; init; }

    /// <summary>The local calendar period this fact covers, as the client displays it.</summary>
    public required string Period { get; init; }

    /// <summary>What the figure does and does not count, where that is easy to get wrong.</summary>
    public string? Caveat { get; init; }

    /// <summary>Where the user can go to see the records behind it, e.g. <c>/finance</c>.</summary>
    public string? SourceRoute { get; init; }
}

/// <summary>
/// Everything the assistant is allowed to know for one question: bounded, owner-scoped, and collected at a
/// stated moment so an older answer never appears to describe today's figures.
///
/// It holds aggregates and labelled figures only. No raw notes, no photographs, no identifiers beyond the
/// module routes a person can already open themselves.
/// </summary>
public sealed record AssistantContextSnapshot
{
    /// <summary>Bumped whenever the snapshot shape changes; stored with every answer.</summary>
    public const string CurrentSchemaVersion = "assistant-context.v1";

    public required string SchemaVersion { get; init; }

    public required string TimeZone { get; init; }

    /// <summary>The user's local today, resolved in their own time zone.</summary>
    public required DateOnly Today { get; init; }

    public required DateOnly RangeFrom { get; init; }

    public required DateOnly RangeTo { get; init; }

    /// <summary>When these figures were read. Shown with the answer so the reader knows how fresh it is.</summary>
    public required DateTime CollectedAtUtc { get; init; }

    public required IReadOnlyList<AssistantModule> Modules { get; init; }

    public required IReadOnlyList<AssistantFact> Facts { get; init; }

    /// <summary>True when every selected module failed to read; the handler answers unavailable, not empty.</summary>
    public bool IsEmpty => Facts.Count == 0;

    public AssistantFact? Find(string id) => Facts.FirstOrDefault(fact => string.Equals(fact.Id, id, StringComparison.Ordinal));
}
