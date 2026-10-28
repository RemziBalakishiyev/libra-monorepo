using Libra.Application.Common;

namespace Libra.Application.Assistant;

/// <summary>One fact as the client sees it, for a metric card or a source row.</summary>
public sealed record AssistantFactResponse(
    string Id,
    AssistantModule Module,
    string Label,
    FactAvailability Availability,
    decimal? Value,
    string? Unit,
    string? Text,
    string Period,
    string? Caveat,
    string? SourceRoute);

/// <summary>The snapshot behind one answer, shown under "Mənbələr" with the moment it was collected.</summary>
public sealed record AssistantSnapshotResponse(
    string TimeZone,
    DateOnly RangeFrom,
    DateOnly RangeTo,
    DateTime CollectedAtUtc,
    IReadOnlyList<AssistantModule> Modules,
    IReadOnlyList<AssistantFactResponse> Facts);

public sealed record AssistantObservationResponse(string Text, IReadOnlyList<string> FactIds);

/// <summary>
/// One answered turn. The figures the interface renders come from <see cref="Snapshot"/>, never from the
/// model's prose, and every observation's fact ids were validated against that snapshot before it was stored.
/// </summary>
public sealed record AssistantAnswerResponse(
    AssistantOutcome Outcome,
    string Summary,
    IReadOnlyList<AssistantObservationResponse> Observations,
    IReadOnlyList<string> Suggestions,
    IReadOnlyList<string> FollowUps,
    string? Clarification,
    string Model,
    bool IsFixture,
    AssistantSnapshotResponse Snapshot);

public sealed record AssistantMessageResponse(
    Guid Id,
    string Role,
    string Text,
    DateTime CreatedAtUtc,
    AssistantAnswerResponse? Answer);

public sealed record AssistantConversationResponse(
    Guid Id,
    string Title,
    IReadOnlyList<AssistantModule> Modules,
    AssistantPeriod Period,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc,
    IReadOnlyList<AssistantMessageResponse> Messages);

public sealed record AssistantConversationSummary(
    Guid Id,
    string Title,
    IReadOnlyList<AssistantModule> Modules,
    AssistantPeriod Period,
    DateTime UpdatedAtUtc);

/// <summary>
/// Whether the assistant can answer at all, and what the client should offer.
///
/// <c>IsConfigured</c> false is shown as "AI köməkçi hələ aktiv deyil"; the client never substitutes canned
/// advice for an answer.
/// </summary>
public sealed record AssistantStatusResponse(bool IsConfigured, bool IsFixture, string? Model, IReadOnlyList<AssistantModule> DefaultModules);

/// <summary>One question. The client id makes a retry after an uncertain answer safe to repeat.</summary>
public sealed record AskAssistantCommand(
    Guid? ConversationId,
    string Question,
    IReadOnlyList<AssistantModule>? Modules,
    AssistantPeriod? Period,
    Guid? ClientRequestId);

public sealed record AssistantHistoryQuery(int PageNumber = 1, int PageSize = Paging.DefaultPageSize);

internal static class AssistantErrors
{
    public const string NotConfigured = "AI assistant is not configured";
    public const string ConversationNotFound = "Conversation not found";
    public const string ProviderUnavailable = "AI assistant is unavailable";
    public const string InvalidAnswer = "AI assistant returned an unusable answer";
    public const string Busy = "Too many assistant questions";
}
