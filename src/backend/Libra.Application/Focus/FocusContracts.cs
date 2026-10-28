using Libra.Domain.Focus;

namespace Libra.Application.Focus;

/// <summary>
/// One recorded focus run. Durations are whole seconds, not the rounded minutes a screen displayed, so a
/// summary built from them is the time actually spent.
/// </summary>
public sealed record FocusSessionResponse
{
    public required Guid Id { get; init; }

    /// <summary>The device's own id for this run. Echoed back so an outbox can retire its pending copy.</summary>
    public required Guid ClientSessionId { get; init; }

    public Guid? TaskId { get; init; }

    public string? TaskTitle { get; init; }

    public required int ConfiguredSeconds { get; init; }

    public required DateTime StartedAtUtc { get; init; }

    public required DateTime EndedAtUtc { get; init; }

    /// <summary>Time the timer was actually running, with every pause excluded.</summary>
    public required int ActiveSeconds { get; init; }

    public required FocusOutcome Outcome { get; init; }

    public required DateTime CreatedAtUtc { get; init; }
}

/// <summary>
/// What one profile-local day holds.
///
/// <c>ActiveSeconds</c> is the focus time spent *on that date*: a run that crossed local midnight contributes
/// to both days in the proportion it was actually spent. <c>CompletedSessions</c> counts only runs that
/// reached their configured duration, on the date they finished — a run the user ended early contributes its
/// time but is never a completed Pomodoro.
/// </summary>
public sealed record FocusDayResponse(DateOnly Date, int ActiveSeconds, int CompletedSessions, int StoppedSessions);

/// <summary>Today's focus, and nothing more: this is a summary, not an analytics surface.</summary>
public sealed record FocusSummaryResponse(string TimeZone, FocusDayResponse Today);

internal static class FocusErrors
{
    public const string InvalidRun = "Focus run is not usable";
    public const string TaskNotFound = "Task not found";
}
