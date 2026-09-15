using Libra.Domain.Tasks;

namespace Libra.UnitTests.Tasks;

/// <summary>
/// The rules a task carries on its own: what a title may be, when it is late, and what completing it does —
/// and, just as importantly, what completing it does not do.
/// </summary>
public sealed class TaskDomainTests
{
    private static readonly DateTime Now = new(2026, 9, 8, 9, 30, 0, DateTimeKind.Utc);
    private static readonly DateOnly Today = new(2026, 9, 8);

    private static TaskItem Task(DateOnly? date = null, TimeOnly? time = null, TaskPriority priority = TaskPriority.Normal) =>
        TaskItem.Create(Guid.CreateVersion7(), "Dərman qəbul et", null, date ?? Today, time, priority, clientRequestId: null, Now);

    [Fact]
    public void A_title_is_trimmed_and_a_note_of_only_spaces_is_no_note()
    {
        var task = TaskItem.Create(Guid.CreateVersion7(), "  Su iç  ", "   ", Today, null, TaskPriority.Low, null, Now);

        Assert.Equal("Su iç", task.Title);
        Assert.Null(task.Note);
        Assert.Equal(TaskState.Pending, task.State);
        Assert.Null(task.CompletedAtUtc);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\n ")]
    public void A_title_that_is_only_whitespace_is_refused(string title)
    {
        Assert.Throws<ArgumentException>(() => TaskItem.Create(Guid.CreateVersion7(), title, null, Today, null, TaskPriority.Normal, null, Now));
    }

    [Fact]
    public void A_title_or_note_beyond_its_bound_is_refused()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            TaskItem.Create(Guid.CreateVersion7(), new string('a', TaskItem.TitleMaxLength + 1), null, Today, null, TaskPriority.Normal, null, Now));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            TaskItem.Create(Guid.CreateVersion7(), "Su iç", new string('a', TaskItem.NoteMaxLength + 1), Today, null, TaskPriority.Normal, null, Now));
    }

    [Fact]
    public void An_undefined_priority_is_refused()
    {
        Assert.Throws<ArgumentException>(() => TaskItem.Create(Guid.CreateVersion7(), "Su iç", null, Today, null, (TaskPriority)42, null, Now));
    }

    [Fact]
    public void Seconds_are_never_part_of_a_planned_time()
    {
        var task = Task(time: new TimeOnly(9, 15, 45));

        Assert.Equal(new TimeOnly(9, 15), task.PlannedTime);
    }

    [Fact]
    public void A_task_without_a_time_stays_on_time_until_its_day_ends()
    {
        var task = Task(date: Today);

        Assert.False(task.IsOverdue(Today, new TimeOnly(23, 59)));
        // The next local day has started; the day it was planned for is over.
        Assert.True(task.IsOverdue(Today.AddDays(1), new TimeOnly(0, 0)));
        Assert.Equal(Today.AddDays(1).ToDateTime(TimeOnly.MinValue), task.LocalDueAt());
    }

    [Fact]
    public void A_task_with_a_time_is_late_from_that_minute()
    {
        var task = Task(date: Today, time: new TimeOnly(9, 0));

        Assert.False(task.IsOverdue(Today, new TimeOnly(8, 59)));
        Assert.True(task.IsOverdue(Today, new TimeOnly(9, 0)));
        Assert.Equal(Today.ToDateTime(new TimeOnly(9, 0)), task.LocalDueAt());
    }

    [Fact]
    public void A_completed_task_is_never_overdue()
    {
        var task = Task(date: Today.AddDays(-3));
        task.SetCompleted(true, Now);

        Assert.False(task.IsOverdue(Today, new TimeOnly(12, 0)));
    }

    [Fact]
    public void Completing_an_overdue_task_leaves_the_day_it_was_planned_for_alone()
    {
        var planned = Today.AddDays(-4);
        var task = Task(date: planned);

        Assert.True(task.SetCompleted(true, Now));

        Assert.Equal(planned, task.PlannedDate);
        Assert.Equal(Now, task.CompletedAtUtc);
    }

    [Fact]
    public void Repeating_the_state_it_is_already_in_changes_nothing()
    {
        var task = Task();
        Assert.True(task.SetCompleted(true, Now));
        var completedAt = task.CompletedAtUtc;

        // The second "completed" is not a toggle and not a second event; it is simply already true.
        Assert.False(task.SetCompleted(true, Now.AddMinutes(5)));
        Assert.Equal(completedAt, task.CompletedAtUtc);

        Assert.True(task.SetCompleted(false, Now.AddMinutes(6)));
        Assert.Null(task.CompletedAtUtc);
        Assert.Equal(TaskState.Pending, task.State);
        Assert.False(task.SetCompleted(false, Now.AddMinutes(7)));
    }

    [Fact]
    public void A_removed_occurrence_stays_removed()
    {
        var task = Task();
        task.Remove(Now);

        Assert.Equal(TaskState.Removed, task.State);
        Assert.False(task.SetCompleted(true, Now));
        Assert.Equal(TaskState.Removed, task.State);
    }

    [Fact]
    public void Series_defaults_reach_a_pending_occurrence_but_never_a_completed_one()
    {
        var pending = Task();
        var done = Task();
        done.SetCompleted(true, Now);

        pending.ApplySeriesDefaults("Yeni ad", "qeyd", new TimeOnly(7, 0), TaskPriority.High, Now.AddDays(1));
        done.ApplySeriesDefaults("Yeni ad", "qeyd", new TimeOnly(7, 0), TaskPriority.High, Now.AddDays(1));

        Assert.Equal("Yeni ad", pending.Title);
        Assert.Equal(TaskPriority.High, pending.Priority);
        // History keeps the shape it was completed under.
        Assert.Equal("Dərman qəbul et", done.Title);
        Assert.Equal(TaskPriority.Normal, done.Priority);
    }
}
