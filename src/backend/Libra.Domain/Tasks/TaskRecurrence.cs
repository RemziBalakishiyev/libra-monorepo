namespace Libra.Domain.Tasks;

/// <summary>
/// The schedule of a repeating task: daily, or weekly on chosen weekdays, between a start date and an optional
/// end date. Weekdays are stored as a bitmask (bit 0 = Monday … bit 6 = Sunday) so a schedule is one small
/// column that the database can range-check.
///
/// Dates here are local calendar labels, never instants: a task planned for "9 September" stays on 9 September
/// whatever the user's time zone does, and a daylight-saving jump cannot move it to another day.
/// </summary>
public sealed record TaskRecurrence
{
    /// <summary>How far back a series may start. Keeps the first generation pass bounded.</summary>
    public const int MaxPastStartDays = 365;

    /// <summary>How far ahead a series may be scheduled to end.</summary>
    public const int MaxFutureEndDays = 730;

    private TaskRecurrence(TaskRecurrenceKind kind, int weekdayMask, DateOnly startDate, DateOnly? endDate)
    {
        Kind = kind;
        WeekdayMask = weekdayMask;
        StartDate = startDate;
        EndDate = endDate;
    }

    public TaskRecurrenceKind Kind { get; }

    /// <summary>Bit 0 = Monday … bit 6 = Sunday. Zero for every kind except <see cref="TaskRecurrenceKind.Weekly"/>.</summary>
    public int WeekdayMask { get; }

    public DateOnly StartDate { get; }

    /// <summary>Last date the series may produce. Null means open-ended (bounded by the generation horizon).</summary>
    public DateOnly? EndDate { get; }

    /// <summary>ISO weekday numbers (1 = Monday … 7 = Sunday), ascending.</summary>
    public IReadOnlyList<int> Weekdays =>
        [.. Enumerable.Range(1, 7).Where(day => (WeekdayMask & (1 << (day - 1))) != 0)];

    public static TaskRecurrence Daily(DateOnly startDate, DateOnly? endDate) =>
        new(TaskRecurrenceKind.Daily, 0, startDate, endDate);

    public static TaskRecurrence Weekly(IEnumerable<int> weekdays, DateOnly startDate, DateOnly? endDate)
    {
        ArgumentNullException.ThrowIfNull(weekdays);

        var mask = 0;
        foreach (var day in weekdays)
        {
            if (day is < 1 or > 7)
            {
                throw new ArgumentOutOfRangeException(nameof(weekdays), day, "Weekdays are 1 (Monday) to 7 (Sunday).");
            }

            mask |= 1 << (day - 1);
        }

        if (mask == 0)
        {
            throw new ArgumentException("A weekly schedule needs at least one weekday.", nameof(weekdays));
        }

        return new TaskRecurrence(TaskRecurrenceKind.Weekly, mask, startDate, endDate);
    }

    public static TaskRecurrence FromMask(TaskRecurrenceKind kind, int weekdayMask, DateOnly startDate, DateOnly? endDate) =>
        new(kind, kind == TaskRecurrenceKind.Weekly ? weekdayMask : 0, startDate, endDate);

    /// <summary>True when the rule itself is usable. The API validator reports the reason; this is the guard.</summary>
    public bool IsValid(DateOnly today) =>
        Kind is TaskRecurrenceKind.Daily or TaskRecurrenceKind.Weekly
        && (Kind != TaskRecurrenceKind.Weekly || (WeekdayMask is > 0 and < 128))
        && (Kind != TaskRecurrenceKind.Daily || WeekdayMask == 0)
        && StartDate >= today.AddDays(-MaxPastStartDays)
        && StartDate <= today.AddDays(MaxFutureEndDays)
        && (EndDate is null || (EndDate >= StartDate && EndDate <= today.AddDays(MaxFutureEndDays)));

    public bool Includes(DateOnly date)
    {
        if (date < StartDate || (EndDate is DateOnly end && date > end))
        {
            return false;
        }

        return Kind switch
        {
            TaskRecurrenceKind.Daily => true,
            TaskRecurrenceKind.Weekly => (WeekdayMask & (1 << IsoWeekdayIndex(date))) != 0,
            _ => false,
        };
    }

    /// <summary>
    /// Every scheduled date in <c>[from, to]</c>, ascending. Both bounds are local calendar dates and the caller
    /// is responsible for keeping the window bounded.
    /// </summary>
    public IEnumerable<DateOnly> DatesBetween(DateOnly from, DateOnly to)
    {
        var first = from < StartDate ? StartDate : from;
        var last = EndDate is DateOnly end && end < to ? end : to;
        for (var date = first; date <= last; date = date.AddDays(1))
        {
            if (Includes(date))
            {
                yield return date;
            }
        }
    }

    /// <summary>0 for Monday … 6 for Sunday, matching the bit layout.</summary>
    private static int IsoWeekdayIndex(DateOnly date) => ((int)date.DayOfWeek + 6) % 7;
}
