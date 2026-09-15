namespace Libra.Domain.Tasks;

/// <summary>
/// The rule behind a repeating task. The series itself is never a task: it only says which local dates should
/// have one, and each of those dates gets its own <see cref="TaskItem"/> with its own completion state.
///
/// Stopping a series is not deleting it. The rule keeps its history — the occurrences it already produced stay,
/// completed ones included — and only stops producing new pending dates.
/// </summary>
public sealed class TaskSeries
{
    /// <summary>How far ahead occurrences are materialized. Past this, dates exist only as a rule.</summary>
    public const int HorizonDays = 30;

    /// <summary>Backstop on one generation pass; the recurrence bounds keep normal series far below it.</summary>
    public const int MaxOccurrencesPerPass = 500;

    private TaskSeries()
    {
        Title = string.Empty;
    }

    public Guid Id { get; private set; }

    public Guid UserId { get; private set; }

    public string Title { get; private set; }

    public string? Note { get; private set; }

    public TimeOnly? PlannedTime { get; private set; }

    public TaskPriority Priority { get; private set; }

    public TaskRecurrenceKind Kind { get; private set; }

    public int WeekdayMask { get; private set; }

    public DateOnly StartDate { get; private set; }

    public DateOnly? EndDate { get; private set; }

    /// <summary>Set when the user stopped the series. Completed occurrences stay; pending future ones go.</summary>
    public DateTime? StoppedAtUtc { get; private set; }

    /// <summary>Retry key of the create that produced this series, so two retries cannot become two schedules.</summary>
    public Guid? ClientRequestId { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public bool IsStopped => StoppedAtUtc is not null;

    public TaskRecurrence Recurrence => TaskRecurrence.FromMask(Kind, WeekdayMask, StartDate, EndDate);

    public static TaskSeries Create(
        Guid userId,
        string title,
        string? note,
        TimeOnly? plannedTime,
        TaskPriority priority,
        TaskRecurrence recurrence,
        Guid? clientRequestId,
        DateTime nowUtc)
    {
        ArgumentNullException.ThrowIfNull(recurrence);
        if (recurrence.Kind == TaskRecurrenceKind.None)
        {
            throw new ArgumentException("A series needs a repeating schedule.", nameof(recurrence));
        }

        var series = new TaskSeries
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            ClientRequestId = clientRequestId,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
        };
        series.Apply(title, note, plannedTime, priority, recurrence, nowUtc);
        return series;
    }

    public void Update(string title, string? note, TimeOnly? plannedTime, TaskPriority priority, TaskRecurrence recurrence, DateTime nowUtc)
    {
        ArgumentNullException.ThrowIfNull(recurrence);
        if (IsStopped)
        {
            throw new InvalidOperationException("A stopped series cannot be edited.");
        }

        Apply(title, note, plannedTime, priority, recurrence, nowUtc);
    }

    /// <summary>Ends the series today. The rule stops producing dates after <paramref name="today"/>.</summary>
    public void Stop(DateOnly today, DateTime nowUtc)
    {
        StoppedAtUtc = nowUtc;
        EndDate = EndDate is DateOnly end && end < today ? end : today;
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>
    /// The dates this series should have occurrences for right now: from its start (so a missed day is still
    /// reported rather than silently dropped) through the generation horizon or its own end date, whichever
    /// comes first. The result is capped, and the cap keeps the newest dates.
    /// </summary>
    public IReadOnlyList<DateOnly> DatesToMaterialize(DateOnly today)
    {
        var horizon = today.AddDays(HorizonDays);
        var dates = Recurrence.DatesBetween(StartDate, EndDate is DateOnly end && end < horizon ? end : horizon).ToList();
        return dates.Count <= MaxOccurrencesPerPass ? dates : dates[^MaxOccurrencesPerPass..];
    }

    private void Apply(string title, string? note, TimeOnly? plannedTime, TaskPriority priority, TaskRecurrence recurrence, DateTime nowUtc)
    {
        if (!Enum.IsDefined(priority))
        {
            throw new ArgumentException("Unknown task priority.", nameof(priority));
        }

        Title = TaskItem.CleanTitle(title);
        Note = TaskItem.CleanNote(note);
        PlannedTime = plannedTime is TimeOnly time ? new TimeOnly(time.Hour, time.Minute) : null;
        Priority = priority;
        Kind = recurrence.Kind;
        WeekdayMask = recurrence.WeekdayMask;
        StartDate = recurrence.StartDate;
        EndDate = recurrence.EndDate;
        UpdatedAtUtc = nowUtc;
    }
}
