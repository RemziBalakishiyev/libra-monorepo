namespace Libra.Application.Sleep;

/// <summary>
/// One sleep session as the client sees it. Both ends are UTC instants; `durationMinutes` is derived from them
/// on the server, so no client ever has to add up a timer to know how long a night was.
/// </summary>
public sealed record SleepSessionResponse
{
    public required Guid Id { get; init; }
    public required DateTime StartedAtUtc { get; init; }
    public DateTime? EndedAtUtc { get; init; }
    public required bool IsOpen { get; init; }

    /// <summary>Null while the session is still running.</summary>
    public int? DurationMinutes { get; init; }

    /// <summary>The local calendar date this session is counted on: the day the user woke up.</summary>
    public DateOnly? WakeDate { get; init; }

    public int? Quality { get; init; }
    public string? Note { get; init; }
    public Guid? ClientRequestId { get; init; }
    public required DateTime CreatedAtUtc { get; init; }

    /// <summary>Send this back with a correction; a newer value on the server means someone else changed it.</summary>
    public required DateTime UpdatedAtUtc { get; init; }
}

/// <summary>
/// One local calendar date in the summary. `totalMinutes` is null when nothing was recorded that day — which is
/// not the same as sleeping zero minutes, and is shown as "Qeyd yoxdur" rather than a 0.
/// </summary>
public sealed record SleepDayResponse(DateOnly Date, int? TotalMinutes, int SessionCount);

/// <summary>
/// The last seven local dates plus the average over the ones that actually have a record.
///
/// <c>AverageMinutes</c> is the mean over <c>RecordedDays</c>, not over seven, and it is null when the window
/// holds nothing. The denominator is part of the contract so the client can say what the average is an average
/// of instead of implying a week of data it does not have.
/// </summary>
public sealed record SleepSummaryResponse(
    string TimeZone,
    DateOnly From,
    DateOnly To,
    IReadOnlyList<SleepDayResponse> Days,
    int? AverageMinutes,
    int RecordedDays,
    int TotalMinutes,
    int SessionCount,
    SleepSessionResponse? Active,
    SleepSessionResponse? Latest);

internal static class SleepErrors
{
    public const string SessionNotFound = "Sleep session not found";
    public const string AlreadyOpen = "A sleep session is already running";
    public const string Overlaps = "Sleep sessions overlap";
    public const string StaleEdit = "Sleep session was changed elsewhere";
    public const string InvalidInterval = "Sleep interval is not usable";
}
