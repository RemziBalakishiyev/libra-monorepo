using Libra.Domain.Tasks;

namespace Libra.Application.Tasks;

/// <summary>
/// One task as the client sees it. `plannedDate` and `plannedTime` are local calendar labels; the timestamps
/// are UTC instants. `isOverdue` is resolved by the server in the profile time zone, so no client has to guess
/// where the day boundary is.
/// </summary>
public sealed record TaskResponse
{
    public required Guid Id { get; init; }
    public required string Title { get; init; }
    public string? Note { get; init; }
    public required DateOnly PlannedDate { get; init; }
    public TimeOnly? PlannedTime { get; init; }
    public required TaskPriority Priority { get; init; }
    public required TaskState State { get; init; }
    public required bool IsCompleted { get; init; }
    public DateTime? CompletedAtUtc { get; init; }
    public required bool IsOverdue { get; init; }

    /// <summary>Set when this task is one occurrence of a repeating series.</summary>
    public Guid? SeriesId { get; init; }
    public TaskRecurrenceKind? SeriesKind { get; init; }

    public Guid? ClientRequestId { get; init; }
    public required DateTime CreatedAtUtc { get; init; }

    /// <summary>Send this back with an edit; a newer value on the server means someone else already changed it.</summary>
    public required DateTime UpdatedAtUtc { get; init; }
}

/// <summary>Counts over the whole matching set, never over one page of a list.</summary>
public sealed record TaskCounts(int Scheduled, int Completed, int Overdue)
{
    public static readonly TaskCounts Zero = new(0, 0, 0);
}

/// <summary>
/// One local day: what is scheduled for it, what is already done, and what is still owed from earlier days.
/// Overdue tasks are counted apart from the day's own n / N so a late task never inflates today's progress.
/// </summary>
public sealed record TaskDayResponse(
    DateOnly Date,
    string TimeZone,
    TaskCounts Counts,
    IReadOnlyList<TaskResponse> Tasks,
    IReadOnlyList<TaskResponse> Overdue);

public sealed record TaskSeriesResponse(
    Guid Id,
    string Title,
    string? Note,
    TimeOnly? PlannedTime,
    TaskPriority Priority,
    TaskRecurrenceKind Kind,
    IReadOnlyList<int> Weekdays,
    DateOnly StartDate,
    DateOnly? EndDate,
    bool IsStopped,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc);

/// <summary>One entry of a task's completion history, newest first.</summary>
public sealed record TaskHistoryEntry(TaskCompletionEventKind Kind, DateTime OccurredAtUtc);

/// <summary>A task together with its series rule and its completion history.</summary>
public sealed record TaskDetailResponse(TaskResponse Task, TaskSeriesResponse? Series, IReadOnlyList<TaskHistoryEntry> History);

/// <summary>Which slice of the list the client is asking for. Each shows a task at most once.</summary>
public enum TaskView
{
    /// <summary>Today's scheduled tasks plus everything still owed from earlier days.</summary>
    Today,

    /// <summary>Pending tasks planned after today.</summary>
    Upcoming,

    /// <summary>Completed tasks, newest completion first.</summary>
    Completed,
}

internal static class TaskErrors
{
    public const string TaskNotFound = "Task not found";
    public const string SeriesNotFound = "Task series not found";
    public const string StaleEdit = "Task was changed elsewhere";
    public const string SeriesStopped = "Task series is stopped";
}
