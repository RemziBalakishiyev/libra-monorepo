using Libra.Domain.Focus;

namespace Libra.UnitTests.Focus;

/// <summary>
/// The rules a recorded focus run has to obey, independent of any database: what counts as active time, what
/// may be called completed, and what the domain refuses outright rather than storing in a shape that would
/// make a later total wrong.
/// </summary>
public sealed class FocusSessionTests
{
    private static readonly DateTime Now = new(2026, 9, 30, 12, 0, 0, DateTimeKind.Utc);
    private static readonly Guid User = Guid.CreateVersion7();

    private static FocusInterval Interval(double startMinutesAgo, double endMinutesAgo) => new()
    {
        StartedAtUtc = Now.AddMinutes(-startMinutesAgo),
        EndedAtUtc = Now.AddMinutes(-endMinutesAgo),
    };

    private static FocusSession Record(
        IReadOnlyList<FocusInterval>? intervals = null,
        TimeSpan? configured = null,
        FocusOutcome outcome = FocusOutcome.Completed,
        Guid? taskId = null,
        string? taskTitle = null) =>
        FocusSession.Record(
            User,
            Guid.CreateVersion7(),
            taskId,
            taskTitle,
            configured ?? TimeSpan.FromMinutes(25),
            intervals ?? [Interval(25, 0)],
            outcome,
            Now);

    [Fact]
    public void Active_time_is_the_intervals_summed_and_excludes_every_pause()
    {
        // Ran 10 minutes, paused 5, ran 15 more: 30 minutes of wall clock, 25 of focus.
        var session = Record([Interval(30, 20), Interval(15, 0)]);

        Assert.Equal(TimeSpan.FromMinutes(25), session.ActiveDuration);
        Assert.Equal(TimeSpan.FromMinutes(30), session.EndedAtUtc - session.StartedAtUtc);
    }

    [Fact]
    public void A_stopped_run_keeps_the_time_it_actually_ran_and_is_not_a_completed_pomodoro()
    {
        var session = Record([Interval(9, 0)], outcome: FocusOutcome.Stopped);

        Assert.Equal(TimeSpan.FromMinutes(9), session.ActiveDuration);
        Assert.False(session.IsCompleted);
        Assert.Equal(FocusOutcome.Stopped, session.Outcome);
    }

    [Fact]
    public void A_run_cannot_claim_completion_without_having_run_its_configured_duration()
    {
        // Nine minutes of focus is not a finished 25-minute Pomodoro, whatever the device says.
        var error = Assert.Throws<ArgumentException>(() => Record([Interval(9, 0)], outcome: FocusOutcome.Completed));

        Assert.Contains("configured duration", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void A_completed_run_is_accepted_a_hair_under_its_duration()
    {
        // Storage precision and a device clock both round; a second of slack is not a missing Pomodoro.
        var session = Record([new FocusInterval { StartedAtUtc = Now.AddSeconds(-1500).AddMilliseconds(400), EndedAtUtc = Now }]);

        Assert.True(session.IsCompleted);
    }

    [Theory]
    [InlineData(30)]
    [InlineData(4 * 60 * 60 + 1)]
    public void A_configured_duration_outside_the_allowed_range_is_refused(int seconds)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => Record(configured: TimeSpan.FromSeconds(seconds), outcome: FocusOutcome.Stopped));
    }

    [Fact]
    public void Overlapping_intervals_are_refused_so_a_second_is_never_counted_twice()
    {
        var error = Assert.Throws<ArgumentException>(() => Record([Interval(30, 10), Interval(15, 0)], outcome: FocusOutcome.Stopped));

        Assert.Contains("overlap", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void An_interval_that_ends_before_it_starts_is_refused()
    {
        Assert.Throws<ArgumentException>(() => Record([new FocusInterval { StartedAtUtc = Now, EndedAtUtc = Now.AddMinutes(-5) }], outcome: FocusOutcome.Stopped));
    }

    [Fact]
    public void A_run_with_no_interval_never_ran()
    {
        Assert.Throws<ArgumentException>(() => Record([], outcome: FocusOutcome.Stopped));
    }

    [Fact]
    public void An_interval_ending_in_the_future_is_refused_beyond_ordinary_clock_skew()
    {
        // A minute ahead is skew and is accepted; an hour ahead is a device claiming the future.
        var skewed = FocusSession.Record(User, Guid.CreateVersion7(), null, null, TimeSpan.FromMinutes(25),
            [new FocusInterval { StartedAtUtc = Now.AddMinutes(-24), EndedAtUtc = Now.AddMinutes(1) }], FocusOutcome.Completed, Now);
        Assert.True(skewed.IsCompleted);

        Assert.Throws<ArgumentException>(() => FocusSession.Record(User, Guid.CreateVersion7(), null, null, TimeSpan.FromMinutes(25),
            [new FocusInterval { StartedAtUtc = Now, EndedAtUtc = Now.AddHours(1) }], FocusOutcome.Stopped, Now));
    }

    [Fact]
    public void Intervals_are_stored_in_order_whatever_order_they_arrive_in()
    {
        var session = Record([Interval(15, 0), Interval(30, 20)]);

        Assert.Equal(Now.AddMinutes(-30), session.StartedAtUtc);
        Assert.Equal(Now, session.EndedAtUtc);
        Assert.Equal([Now.AddMinutes(-30), Now.AddMinutes(-15)], session.Intervals.Select(interval => interval.StartedAtUtc));
    }

    [Fact]
    public void Active_time_is_split_across_a_boundary_by_the_intervals_that_cross_it()
    {
        // Ten minutes either side of a boundary five minutes into the second interval.
        var session = Record([Interval(30, 20), Interval(15, 0)]);
        var boundary = Now.AddMinutes(-10);

        Assert.Equal(TimeSpan.FromMinutes(15), session.ActiveDurationWithin(DateTime.MinValue, boundary));
        Assert.Equal(TimeSpan.FromMinutes(10), session.ActiveDurationWithin(boundary, DateTime.MaxValue));
        // The two halves are the whole: a crossing run is never counted twice or lost.
        Assert.Equal(session.ActiveDuration, session.ActiveDurationWithin(DateTime.MinValue, boundary) + session.ActiveDurationWithin(boundary, DateTime.MaxValue));
    }

    [Fact]
    public void A_paused_gap_that_spans_the_boundary_belongs_to_neither_day()
    {
        // Ran, paused across the boundary, ran again: the pause is counted nowhere.
        var session = Record([Interval(40, 30), Interval(10, 0)], outcome: FocusOutcome.Stopped);
        var boundary = Now.AddMinutes(-20);

        Assert.Equal(TimeSpan.FromMinutes(10), session.ActiveDurationWithin(DateTime.MinValue, boundary));
        Assert.Equal(TimeSpan.FromMinutes(10), session.ActiveDurationWithin(boundary, DateTime.MaxValue));
    }

    [Fact]
    public void A_task_title_is_trimmed_to_the_stored_length_and_the_link_can_be_forgotten()
    {
        var taskId = Guid.CreateVersion7();
        var session = Record(taskId: taskId, taskTitle: new string('a', FocusSession.TaskTitleMaxLength + 50));

        Assert.Equal(FocusSession.TaskTitleMaxLength, session.TaskTitle!.Length);

        // Deleting the task drops the link; the history of the time spent, and what it was called, survives.
        session.ForgetTask();
        Assert.Null(session.TaskId);
        Assert.NotNull(session.TaskTitle);
        Assert.Equal(TimeSpan.FromMinutes(25), session.ActiveDuration);
    }

    [Fact]
    public void A_run_needs_a_client_id_so_an_upload_can_be_retried_safely()
    {
        Assert.Throws<ArgumentException>(() => FocusSession.Record(User, Guid.Empty, null, null, TimeSpan.FromMinutes(25), [Interval(25, 0)], FocusOutcome.Completed, Now));
    }
}
