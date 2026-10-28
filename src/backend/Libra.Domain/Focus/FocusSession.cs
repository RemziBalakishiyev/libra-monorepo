using System.Text.Json.Serialization;

namespace Libra.Domain.Focus;

/// <summary>How a focus run ended. Breaks are never recorded, so there is no outcome for them.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<FocusOutcome>))]
public enum FocusOutcome
{
    /// <summary>The run reached its configured duration on its own.</summary>
    Completed = 0,

    /// <summary>The user ended it early. It keeps the time actually spent, but is not a completed Pomodoro.</summary>
    Stopped = 1,
}

/// <summary>
/// One stretch the timer was actually running, between a start (or resume) and a pause (or the end).
///
/// Pauses are the gaps between these intervals, which is what makes "active time" different from
/// "wall-clock time between start and end" — the reason the intervals are stored rather than a single span.
/// </summary>
public sealed record FocusInterval
{
    public required DateTime StartedAtUtc { get; init; }

    public required DateTime EndedAtUtc { get; init; }

    public TimeSpan Duration => EndedAtUtc - StartedAtUtc;
}

/// <summary>
/// One finished focus run, as it happened on a device.
///
/// It is written by the device that ran it, identified by a <see cref="ClientSessionId"/> the device generated
/// before the run started. That id — unique per user in the database — is what makes an upload safe to retry
/// from an outbox: a second attempt returns the record that is already stored instead of adding another one or
/// inflating a total.
///
/// Only focus runs are recorded. A break is a local matter and contributes nothing here, so nothing in this
/// type can be mistaken for one. A run that the user ended early keeps the time actually spent but is
/// <see cref="FocusOutcome.Stopped"/>, and is never counted as a completed Pomodoro.
/// </summary>
public sealed class FocusSession
{
    public const int TaskTitleMaxLength = 200;

    /// <summary>The shortest run worth recording, and the longest one this domain accepts.</summary>
    public static readonly TimeSpan MinConfiguredDuration = TimeSpan.FromMinutes(1);

    public static readonly TimeSpan MaxConfiguredDuration = TimeSpan.FromHours(4);

    /// <summary>A run may stay open across pauses, but not indefinitely: a forgotten one is refused, not stored.</summary>
    public static readonly TimeSpan MaxElapsed = TimeSpan.FromHours(24);

    /// <summary>How far ahead of the server clock a device timestamp may sit, to absorb ordinary clock skew.</summary>
    public static readonly TimeSpan FutureTolerance = TimeSpan.FromMinutes(5);

    /// <summary>
    /// PostgreSQL's `timestamptz` keeps microseconds while .NET keeps 100-nanosecond ticks. Rounding on the way
    /// in means a session reports the same instants whether it was just written or read back, so a retried
    /// upload compares equal to the row already on disk.
    /// </summary>
    private static DateTime ToStoredPrecision(DateTime value) =>
        new(value.Ticks - (value.Ticks % 10), DateTimeKind.Utc);

    private readonly List<FocusInterval> intervals = [];

    private FocusSession()
    {
    }

    public Guid Id { get; private set; }

    public Guid UserId { get; private set; }

    /// <summary>
    /// The device's own id for this run, generated before it started. Unique per user, which is what the
    /// outbox relies on: the same run uploaded twice is the same row.
    /// </summary>
    public Guid ClientSessionId { get; private set; }

    /// <summary>
    /// The task this run was attached to, if any. Set to null when that task is deleted — the history of the
    /// time spent survives the task it was spent on.
    /// </summary>
    public Guid? TaskId { get; private set; }

    /// <summary>
    /// What the task was called when the run happened. Kept so a deleted or renamed task still reads correctly
    /// in history, and so the history is legible with no join at all.
    /// </summary>
    public string? TaskTitle { get; private set; }

    /// <summary>The duration the run was configured for, snapshotted when the phase started.</summary>
    public TimeSpan ConfiguredDuration { get; private set; }

    public DateTime StartedAtUtc { get; private set; }

    public DateTime EndedAtUtc { get; private set; }

    /// <summary>Time the timer was actually running: the intervals summed, with every pause excluded.</summary>
    public TimeSpan ActiveDuration { get; private set; }

    public FocusOutcome Outcome { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public IReadOnlyList<FocusInterval> Intervals => intervals;

    /// <summary>True only for a run that reached its configured duration. The four-run cycle counts these.</summary>
    public bool IsCompleted => Outcome == FocusOutcome.Completed;

    public static FocusSession Record(
        Guid userId,
        Guid clientSessionId,
        Guid? taskId,
        string? taskTitle,
        TimeSpan configuredDuration,
        IReadOnlyList<FocusInterval> activeIntervals,
        FocusOutcome outcome,
        DateTime nowUtc)
    {
        ArgumentNullException.ThrowIfNull(activeIntervals);

        if (clientSessionId == Guid.Empty)
        {
            throw new ArgumentException("A focus session needs a client id.", nameof(clientSessionId));
        }

        if (configuredDuration < MinConfiguredDuration || configuredDuration > MaxConfiguredDuration)
        {
            throw new ArgumentOutOfRangeException(
                nameof(configuredDuration),
                configuredDuration,
                $"A focus run is {MinConfiguredDuration.TotalMinutes:F0}–{MaxConfiguredDuration.TotalMinutes:F0} minutes long.");
        }

        var ordered = Normalize(activeIntervals, nowUtc);
        var active = ordered.Aggregate(TimeSpan.Zero, (total, interval) => total + interval.Duration);
        var started = ordered[0].StartedAtUtc;
        var ended = ordered[^1].EndedAtUtc;

        if (ended - started > MaxElapsed)
        {
            throw new ArgumentException($"A focus run cannot span more than {MaxElapsed.TotalHours:F0} hours.", nameof(activeIntervals));
        }

        // A completed run is one that reached its configured duration. A device that claims completion with
        // less time than it configured is describing something else, and the claim is refused rather than
        // stored as a Pomodoro that never happened. One second of tolerance absorbs rounding on the way in.
        if (outcome == FocusOutcome.Completed && active + TimeSpan.FromSeconds(1) < configuredDuration)
        {
            throw new ArgumentException("A completed focus run must have run for its configured duration.", nameof(outcome));
        }

        // Active time can never exceed the wall clock the run occupied; anything else is an impossible payload.
        if (active > ended - started + TimeSpan.FromSeconds(1))
        {
            throw new ArgumentException("Active focus time cannot exceed the interval it was spent in.", nameof(activeIntervals));
        }

        var title = taskTitle?.Trim();
        if (title?.Length > TaskTitleMaxLength)
        {
            title = title[..TaskTitleMaxLength];
        }

        var session = new FocusSession
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            ClientSessionId = clientSessionId,
            TaskId = taskId,
            TaskTitle = string.IsNullOrEmpty(title) ? null : title,
            ConfiguredDuration = configuredDuration,
            StartedAtUtc = started,
            EndedAtUtc = ended,
            ActiveDuration = active,
            Outcome = outcome,
            CreatedAtUtc = ToStoredPrecision(nowUtc),
        };
        session.intervals.AddRange(ordered);
        return session;
    }

    /// <summary>Drops the link to a task that no longer exists, keeping the run and its title snapshot.</summary>
    public void ForgetTask()
    {
        TaskId = null;
    }

    /// <summary>
    /// How much of this run's active time falls inside <paramref name="fromUtc"/>–<paramref name="toUtc"/>.
    ///
    /// A run that crosses local midnight belongs to both days, in the proportion it was actually spent, which
    /// is why the intervals are stored: a single total could only ever be attributed to one of them.
    /// </summary>
    public TimeSpan ActiveDurationWithin(DateTime fromUtc, DateTime toUtc)
    {
        var total = TimeSpan.Zero;
        foreach (var interval in intervals)
        {
            var start = interval.StartedAtUtc > fromUtc ? interval.StartedAtUtc : fromUtc;
            var end = interval.EndedAtUtc < toUtc ? interval.EndedAtUtc : toUtc;
            if (end > start)
            {
                total += end - start;
            }
        }

        return total;
    }

    private static List<FocusInterval> Normalize(IReadOnlyList<FocusInterval> source, DateTime nowUtc)
    {
        if (source.Count == 0)
        {
            throw new ArgumentException("A focus run needs at least one active interval.", nameof(source));
        }

        var ordered = source
            .Select(interval => new FocusInterval
            {
                StartedAtUtc = ToStoredPrecision(DateTime.SpecifyKind(interval.StartedAtUtc, DateTimeKind.Utc)),
                EndedAtUtc = ToStoredPrecision(DateTime.SpecifyKind(interval.EndedAtUtc, DateTimeKind.Utc)),
            })
            .OrderBy(interval => interval.StartedAtUtc)
            .ToList();

        DateTime? previousEnd = null;
        foreach (var interval in ordered)
        {
            if (interval.EndedAtUtc <= interval.StartedAtUtc)
            {
                throw new ArgumentException("A focus interval must end after it started.", nameof(source));
            }

            if (interval.EndedAtUtc > nowUtc + FutureTolerance)
            {
                throw new ArgumentException("A focus interval cannot end in the future.", nameof(source));
            }

            // Overlapping intervals would count the same second twice, so they are refused outright.
            if (previousEnd is DateTime end && interval.StartedAtUtc < end)
            {
                throw new ArgumentException("Focus intervals cannot overlap.", nameof(source));
            }

            previousEnd = interval.EndedAtUtc;
        }

        return ordered;
    }
}
