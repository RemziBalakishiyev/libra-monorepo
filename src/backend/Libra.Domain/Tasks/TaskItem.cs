namespace Libra.Domain.Tasks;

/// <summary>
/// One task on one day. A standalone task and one occurrence of a repeating series are the same row: the
/// occurrence carries <see cref="SeriesId"/>, and every scheduled date gets its own row, so completing today
/// says nothing about tomorrow and nothing about the series.
///
/// <see cref="PlannedDate"/> and <see cref="PlannedTime"/> are local calendar labels; created, updated and
/// completed instants are UTC. Completing a task never rewrites the day it was planned for.
/// </summary>
public sealed class TaskItem
{
    public const int TitleMaxLength = 200;
    public const int NoteMaxLength = 1000;

    private TaskItem()
    {
        Title = string.Empty;
    }

    public Guid Id { get; private set; }

    public Guid UserId { get; private set; }

    /// <summary>Null for a standalone task; the series this occurrence belongs to otherwise.</summary>
    public Guid? SeriesId { get; private set; }

    public string Title { get; private set; }

    public string? Note { get; private set; }

    /// <summary>The local day the task is planned for. Never derived from a stored instant.</summary>
    public DateOnly PlannedDate { get; private set; }

    /// <summary>Optional local time of day. Without it the task is due by the end of its planned day.</summary>
    public TimeOnly? PlannedTime { get; private set; }

    public TaskPriority Priority { get; private set; }

    public TaskState State { get; private set; }

    public DateTime? CompletedAtUtc { get; private set; }

    /// <summary>Client-generated id that makes retried creates idempotent per user.</summary>
    public Guid? ClientRequestId { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public bool IsCompleted => State == TaskState.Completed;

    public static TaskItem Create(
        Guid userId,
        string title,
        string? note,
        DateOnly plannedDate,
        TimeOnly? plannedTime,
        TaskPriority priority,
        Guid? clientRequestId,
        DateTime nowUtc,
        Guid? seriesId = null)
    {
        var task = new TaskItem
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            SeriesId = seriesId,
            ClientRequestId = clientRequestId,
            State = TaskState.Pending,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
        };
        task.Apply(title, note, plannedDate, plannedTime, priority, nowUtc);
        return task;
    }

    /// <summary>Edits this occurrence only. A series occurrence keeps its link and its completion state.</summary>
    public void Update(string title, string? note, DateOnly plannedDate, TimeOnly? plannedTime, TaskPriority priority, DateTime nowUtc) =>
        Apply(title, note, plannedDate, plannedTime, priority, nowUtc);

    /// <summary>
    /// Applies the series' current text to a still-pending future occurrence. Past and completed occurrences are
    /// left exactly as they were, so editing a series never rewrites history.
    /// </summary>
    public void ApplySeriesDefaults(string title, string? note, TimeOnly? plannedTime, TaskPriority priority, DateTime nowUtc)
    {
        if (State != TaskState.Pending)
        {
            return;
        }

        Apply(title, note, PlannedDate, plannedTime, priority, nowUtc);
    }

    /// <summary>
    /// Moves the task to an explicit desired state. Returns false when it was already there, so a repeated
    /// "completed = true" neither reopens the task nor records a second history event.
    /// </summary>
    public bool SetCompleted(bool completed, DateTime nowUtc)
    {
        if (State == TaskState.Removed)
        {
            return false;
        }

        if (completed == IsCompleted)
        {
            return false;
        }

        State = completed ? TaskState.Completed : TaskState.Pending;
        CompletedAtUtc = completed ? nowUtc : null;
        UpdatedAtUtc = nowUtc;
        return true;
    }

    /// <summary>
    /// Tombstones one occurrence of a series. The row survives so the next generation pass cannot bring the
    /// date back, and any completion history it already produced stays attached to it.
    /// </summary>
    public void Remove(DateTime nowUtc)
    {
        State = TaskState.Removed;
        CompletedAtUtc = null;
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>
    /// The local instant the task stops being "on time": the end of its planned day when no time was given,
    /// otherwise the planned time itself. Kept here so the rule has one home.
    /// </summary>
    public DateTime LocalDueAt() =>
        PlannedTime is TimeOnly time
            ? PlannedDate.ToDateTime(time, DateTimeKind.Unspecified)
            : PlannedDate.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified);

    public bool IsOverdue(DateOnly today, TimeOnly localNow) =>
        State == TaskState.Pending
        && (PlannedDate < today || (PlannedDate == today && PlannedTime is TimeOnly time && time <= localNow));

    private void Apply(string title, string? note, DateOnly plannedDate, TimeOnly? plannedTime, TaskPriority priority, DateTime nowUtc)
    {
        if (!Enum.IsDefined(priority))
        {
            throw new ArgumentException("Unknown task priority.", nameof(priority));
        }

        Title = CleanTitle(title);
        Note = CleanNote(note);
        PlannedDate = plannedDate;
        // Seconds are never part of a plan; a time is a minute on the clock.
        PlannedTime = plannedTime is TimeOnly time ? new TimeOnly(time.Hour, time.Minute) : null;
        Priority = priority;
        UpdatedAtUtc = nowUtc;
    }

    internal static string CleanTitle(string title)
    {
        var trimmed = title?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            throw new ArgumentException("A task needs a title.", nameof(title));
        }

        ArgumentOutOfRangeException.ThrowIfGreaterThan(trimmed.Length, TitleMaxLength, nameof(title));
        return trimmed;
    }

    internal static string? CleanNote(string? note)
    {
        var trimmed = note?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return null;
        }

        ArgumentOutOfRangeException.ThrowIfGreaterThan(trimmed.Length, NoteMaxLength, nameof(note));
        return trimmed;
    }
}

/// <summary>
/// One completion or reopening, kept forever. Reopening a task clears its current completed state but never
/// removes the events that recorded how it got there.
/// </summary>
public sealed class TaskCompletionEvent
{
    private TaskCompletionEvent()
    {
    }

    public Guid Id { get; private set; }

    public Guid UserId { get; private set; }

    public Guid TaskId { get; private set; }

    public TaskCompletionEventKind Kind { get; private set; }

    public DateTime OccurredAtUtc { get; private set; }

    public static TaskCompletionEvent Record(TaskItem task, TaskCompletionEventKind kind, DateTime nowUtc)
    {
        ArgumentNullException.ThrowIfNull(task);
        return new TaskCompletionEvent
        {
            Id = Guid.CreateVersion7(),
            UserId = task.UserId,
            TaskId = task.Id,
            Kind = kind,
            OccurredAtUtc = nowUtc,
        };
    }
}
