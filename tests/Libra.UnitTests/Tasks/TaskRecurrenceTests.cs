using Libra.Application.Tasks;
using Libra.Domain.Tasks;

namespace Libra.UnitTests.Tasks;

/// <summary>
/// The three schedules and the dates they produce. Everything downstream — one row per date, one completion
/// state per row — rests on this being exact.
/// </summary>
public sealed class TaskRecurrenceTests
{
    private static readonly DateOnly Today = new(2026, 9, 8); // A Tuesday.
    private static readonly DateTime Now = new(2026, 9, 8, 6, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void A_daily_schedule_produces_every_day_in_the_window()
    {
        var rule = TaskRecurrence.Daily(Today, Today.AddDays(4));

        Assert.Equal(
            [Today, Today.AddDays(1), Today.AddDays(2), Today.AddDays(3), Today.AddDays(4)],
            rule.DatesBetween(Today, Today.AddDays(10)));
    }

    [Fact]
    public void A_weekly_schedule_produces_only_the_chosen_weekdays()
    {
        // Monday and Friday, starting on a Tuesday: the first date is that week's Friday.
        var rule = TaskRecurrence.Weekly([1, 5], Today, null);

        var dates = rule.DatesBetween(Today, Today.AddDays(13)).ToList();

        Assert.Equal([new(2026, 9, 11), new(2026, 9, 14), new(2026, 9, 18), new(2026, 9, 21)], dates);
        Assert.All(dates, date => Assert.Contains(date.DayOfWeek, new[] { DayOfWeek.Monday, DayOfWeek.Friday }));
        Assert.Equal([1, 5], rule.Weekdays);
    }

    [Fact]
    public void Weekdays_round_trip_through_the_stored_mask()
    {
        var rule = TaskRecurrence.Weekly([7, 1, 3], Today, null);

        var stored = TaskRecurrence.FromMask(TaskRecurrenceKind.Weekly, rule.WeekdayMask, Today, null);

        Assert.Equal([1, 3, 7], stored.Weekdays);
        Assert.True(stored.Includes(new DateOnly(2026, 9, 13))); // Sunday
        Assert.False(stored.Includes(new DateOnly(2026, 9, 12))); // Saturday
    }

    [Theory]
    [InlineData(0)]
    [InlineData(8)]
    [InlineData(-1)]
    public void A_weekday_outside_Monday_to_Sunday_is_refused(int weekday)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => TaskRecurrence.Weekly([weekday], Today, null));
    }

    [Fact]
    public void A_weekly_schedule_with_no_weekday_is_refused()
    {
        Assert.Throws<ArgumentException>(() => TaskRecurrence.Weekly([], Today, null));
    }

    [Fact]
    public void A_schedule_that_ends_before_it_starts_is_not_usable()
    {
        Assert.False(TaskRecurrence.Daily(Today, Today.AddDays(-1)).IsValid(Today));
        Assert.True(TaskRecurrence.Daily(Today, Today).IsValid(Today));
    }

    [Fact]
    public void A_schedule_reaching_too_far_back_or_forward_is_not_usable()
    {
        Assert.False(TaskRecurrence.Daily(Today.AddDays(-TaskRecurrence.MaxPastStartDays - 1), null).IsValid(Today));
        Assert.True(TaskRecurrence.Daily(Today.AddDays(-TaskRecurrence.MaxPastStartDays), null).IsValid(Today));
        Assert.False(TaskRecurrence.Daily(Today, Today.AddDays(TaskRecurrence.MaxFutureEndDays + 1)).IsValid(Today));
    }

    [Fact]
    public void A_daily_series_materializes_every_missed_day_up_to_the_horizon()
    {
        var series = TaskSeries.Create(Guid.CreateVersion7(), "Su iç", null, null, TaskPriority.Normal, TaskRecurrence.Daily(Today.AddDays(-3), null), null, Now);

        var dates = series.DatesToMaterialize(Today);

        // Nothing missed is dropped: the three past days are there, and the horizon bounds the future.
        Assert.Equal(Today.AddDays(-3), dates[0]);
        Assert.Equal(Today.AddDays(TaskSeries.HorizonDays), dates[^1]);
        Assert.Equal(3 + 1 + TaskSeries.HorizonDays, dates.Count);
    }

    [Fact]
    public void A_series_never_materializes_past_its_own_end_date()
    {
        var series = TaskSeries.Create(Guid.CreateVersion7(), "Su iç", null, null, TaskPriority.Normal, TaskRecurrence.Daily(Today, Today.AddDays(2)), null, Now);

        Assert.Equal([Today, Today.AddDays(1), Today.AddDays(2)], series.DatesToMaterialize(Today));
    }

    [Fact]
    public void Stopping_a_series_ends_it_today_and_leaves_the_past_alone()
    {
        var series = TaskSeries.Create(Guid.CreateVersion7(), "Su iç", null, null, TaskPriority.Normal, TaskRecurrence.Daily(Today.AddDays(-2), null), null, Now);

        series.Stop(Today, Now);

        Assert.True(series.IsStopped);
        Assert.Equal(Today, series.EndDate);
        Assert.Equal([Today.AddDays(-2), Today.AddDays(-1), Today], series.DatesToMaterialize(Today));
        Assert.Throws<InvalidOperationException>(() =>
            series.Update("Yeni", null, null, TaskPriority.High, TaskRecurrence.Daily(Today, null), Now));
    }

    [Fact]
    public void A_series_cannot_be_built_from_a_non_repeating_rule()
    {
        Assert.Throws<ArgumentException>(() =>
            TaskSeries.Create(Guid.CreateVersion7(), "Su iç", null, null, TaskPriority.Normal, TaskRecurrence.FromMask(TaskRecurrenceKind.None, 0, Today, null), null, Now));
    }

    [Fact]
    public void A_command_without_a_start_date_falls_back_to_the_planned_day()
    {
        var rule = TasksHandler.Build(new TaskRecurrenceCommand(TaskRecurrenceKind.Weekly, [2, 4], null, null), Today);

        Assert.Equal(Today, rule.StartDate);
        Assert.Equal([2, 4], rule.Weekdays);
    }

    [Fact]
    public void An_echoed_timestamp_older_than_the_stored_one_is_a_stale_edit()
    {
        var stored = new DateTime(2026, 9, 8, 10, 0, 0, DateTimeKind.Utc);

        Assert.False(TasksHandler.IsStale(null, stored));
        Assert.False(TasksHandler.IsStale(stored, stored));
        Assert.True(TasksHandler.IsStale(stored.AddSeconds(-1), stored));
    }
}
