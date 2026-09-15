using System.Net;
using System.Net.Http.Json;
using Libra.Application.Tasks;
using Libra.Domain.Tasks;
using Libra.Infrastructure.Persistence;
using Libra.IntegrationTests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Libra.IntegrationTests.Tasks;

/// <summary>
/// Repeating tasks. Each scheduled date is its own row with its own completion state, generation is idempotent
/// under concurrency, and neither editing nor stopping a series rewrites what already happened.
/// </summary>
[Collection(LibraApiCollection.Name)]
public sealed class TaskRecurrenceEndpointTests(LibraApiFactory factory)
{
    private static async Task<List<TaskResponse>> UpcomingAsync(HttpClient client) =>
        [.. (await client.ListAsync(TaskView.Upcoming, pageSize: 100)).Items];

    [Fact]
    public async Task A_daily_task_gets_one_occurrence_per_day_up_to_the_horizon()
    {
        using var client = await factory.NewTaskUserAsync("r-daily");
        var today = await client.TodayAsync();

        var first = await client.AddTaskAsync("Su iç", today, recurrence: TaskTestClient.Daily());

        Assert.Equal(today, first.PlannedDate);
        Assert.NotNull(first.SeriesId);
        Assert.Equal(TaskRecurrenceKind.Daily, first.SeriesKind);

        var upcoming = await UpcomingAsync(client);
        Assert.Equal(TaskSeries.HorizonDays, upcoming.Count);
        Assert.Equal(today.AddDays(1), upcoming[0].PlannedDate);
        Assert.Equal(today.AddDays(TaskSeries.HorizonDays), upcoming[^1].PlannedDate);
        // Every occurrence is its own task.
        Assert.Equal(upcoming.Count, upcoming.Select(task => task.Id).Distinct().Count());
    }

    [Fact]
    public async Task A_weekly_task_only_lands_on_the_chosen_weekdays()
    {
        using var client = await factory.NewTaskUserAsync("r-weekly");
        var today = await client.TodayAsync();

        await client.AddTaskAsync("İdman", today, recurrence: TaskTestClient.Weekly([1, 4]));

        var dates = (await UpcomingAsync(client)).Select(task => task.PlannedDate).ToList();

        Assert.NotEmpty(dates);
        Assert.All(dates, date => Assert.Contains(date.DayOfWeek, new[] { DayOfWeek.Monday, DayOfWeek.Thursday }));
        Assert.Equal(dates.OrderBy(date => date), dates);
    }

    [Fact]
    public async Task Completing_today_leaves_tomorrow_alone()
    {
        using var client = await factory.NewTaskUserAsync("r-independent");
        var today = await client.TodayAsync();
        var first = await client.AddTaskAsync("Su iç", today, recurrence: TaskTestClient.Daily());

        await client.CompleteAsync(first.Id);

        var day = await client.TaskDayAsync();
        Assert.Equal(1, day.Counts.Scheduled);
        Assert.Equal(1, day.Counts.Completed);

        var tomorrow = await client.TaskDayAsync(today.AddDays(1));
        Assert.Equal(1, tomorrow.Counts.Scheduled);
        Assert.Equal(0, tomorrow.Counts.Completed);
        Assert.False(Assert.Single(tomorrow.Tasks).IsCompleted);
    }

    [Fact]
    public async Task Repeated_and_concurrent_reads_never_duplicate_an_occurrence()
    {
        using var client = await factory.NewTaskUserAsync("r-generate");
        var today = await client.TodayAsync();
        await client.AddTaskAsync("Su iç", today, recurrence: TaskTestClient.Daily());

        // Four readers generating at once, then a fifth pass, all against the same unique index.
        await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => client.TaskDayAsync(today.AddDays(2))));
        await client.TaskDayAsync();

        var dates = (await UpcomingAsync(client)).Select(task => task.PlannedDate).ToList();
        Assert.Equal(dates.Count, dates.Distinct().Count());
        Assert.Equal(1, (await client.TaskDayAsync(today.AddDays(2))).Counts.Scheduled);
    }

    [Fact]
    public async Task A_deleted_occurrence_does_not_come_back_on_the_next_generation()
    {
        using var client = await factory.NewTaskUserAsync("r-deleted");
        var today = await client.TodayAsync();
        await client.AddTaskAsync("Su iç", today, recurrence: TaskTestClient.Daily());
        var target = today.AddDays(3);
        var occurrence = Assert.Single((await client.TaskDayAsync(target)).Tasks);

        using (var deleted = await client.DeleteTaskAsync(occurrence.Id))
        {
            Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        }

        // Every later read runs generation again; the tombstone keeps that date taken.
        await client.TaskDayAsync();
        await client.ListAsync(TaskView.Upcoming, pageSize: 100);

        Assert.Equal(0, (await client.TaskDayAsync(target)).Counts.Scheduled);
        Assert.DoesNotContain(await UpcomingAsync(client), task => task.PlannedDate == target);
    }

    [Fact]
    public async Task Editing_a_series_reaches_the_future_and_leaves_completed_history_intact()
    {
        using var client = await factory.NewTaskUserAsync("r-edit");
        var today = await client.TodayAsync();
        var first = await client.AddTaskAsync("Köhnə ad", today, recurrence: TaskTestClient.Daily());
        await client.CompleteAsync(first.Id);

        var series = await client.GetSeriesAsync(first.SeriesId!.Value);
        using (var response = await client.PutSeriesAsync(series, title: "Yeni ad", plannedTime: new TimeOnly(7, 0), priority: TaskPriority.High))
        {
            response.EnsureSuccessStatusCode();
        }

        // Today's occurrence was already completed, so it keeps the shape it was completed under.
        var done = (await client.GetTaskAsync(first.Id)).Task;
        Assert.Equal("Köhnə ad", done.Title);
        Assert.Null(done.PlannedTime);
        Assert.True(done.IsCompleted);

        var upcoming = await UpcomingAsync(client);
        Assert.All(upcoming, task =>
        {
            Assert.Equal("Yeni ad", task.Title);
            Assert.Equal(new TimeOnly(7, 0), task.PlannedTime);
            Assert.Equal(TaskPriority.High, task.Priority);
        });
    }

    [Fact]
    public async Task Narrowing_the_rule_drops_the_dates_it_no_longer_wants()
    {
        using var client = await factory.NewTaskUserAsync("r-narrow");
        var today = await client.TodayAsync();
        var first = await client.AddTaskAsync("Su iç", today, recurrence: TaskTestClient.Daily());
        var series = await client.GetSeriesAsync(first.SeriesId!.Value);

        using (var response = await client.PutSeriesAsync(series, recurrence: TaskTestClient.Weekly([1], series.StartDate)))
        {
            response.EnsureSuccessStatusCode();
        }

        var upcoming = await UpcomingAsync(client);
        Assert.NotEmpty(upcoming);
        Assert.All(upcoming, task => Assert.Equal(DayOfWeek.Monday, task.PlannedDate.DayOfWeek));

        // And a later generation pass does not bring the dropped days back.
        await client.TaskDayAsync();
        Assert.All(await UpcomingAsync(client), task => Assert.Equal(DayOfWeek.Monday, task.PlannedDate.DayOfWeek));
    }

    [Fact]
    public async Task Stopping_a_series_ends_the_future_and_keeps_what_was_done()
    {
        using var client = await factory.NewTaskUserAsync("r-stop");
        var today = await client.TodayAsync();
        var first = await client.AddTaskAsync("Su iç", today, recurrence: TaskTestClient.Daily());
        await client.CompleteAsync(first.Id);

        using (var stopped = await client.StopSeriesAsync(first.SeriesId!.Value))
        {
            stopped.EnsureSuccessStatusCode();
            var series = (await stopped.Content.ReadFromJsonAsync<TaskSeriesResponse>())!;
            Assert.True(series.IsStopped);
            Assert.Equal(today, series.EndDate);
        }

        Assert.Empty(await UpcomingAsync(client));
        // The completed day survives, and so does its place in the record.
        var done = (await client.GetTaskAsync(first.Id)).Task;
        Assert.True(done.IsCompleted);
        Assert.Equal(today, done.PlannedDate);
        Assert.Equal(1, (await client.TaskDayAsync()).Counts.Completed);

        // A stopped series stays stopped through later reads, which run generation again.
        await client.TaskDayAsync();
        Assert.Empty(await UpcomingAsync(client));
    }

    [Fact]
    public async Task A_stopped_series_cannot_be_edited()
    {
        using var client = await factory.NewTaskUserAsync("r-stopped-edit");
        var today = await client.TodayAsync();
        var first = await client.AddTaskAsync("Su iç", today, recurrence: TaskTestClient.Daily());
        var series = await client.GetSeriesAsync(first.SeriesId!.Value);
        using (var stopped = await client.StopSeriesAsync(series.Id))
        {
            stopped.EnsureSuccessStatusCode();
        }

        using var response = await client.PutSeriesAsync(series, title: "Yenidən");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task A_missed_day_of_a_series_is_generated_and_reported_as_overdue()
    {
        using var client = await factory.NewTaskUserAsync("r-missed");
        var today = await client.TodayAsync();

        // A schedule that started three days ago: the days already gone are still owed.
        await client.AddTaskAsync("Su iç", today, recurrence: TaskTestClient.Daily(today.AddDays(-3)));

        var day = await client.TaskDayAsync();
        Assert.Equal(1, day.Counts.Scheduled);
        Assert.Equal(3, day.Counts.Overdue);
        Assert.Equal([today.AddDays(-3), today.AddDays(-2), today.AddDays(-1)], day.Overdue.Select(task => task.PlannedDate));
    }

    [Theory]
    [InlineData(TaskRecurrenceKind.Weekly, null)]
    [InlineData(TaskRecurrenceKind.Weekly, new[] { 9 })]
    [InlineData(TaskRecurrenceKind.Weekly, new[] { 2, 2 })]
    public async Task An_invalid_weekly_rule_is_refused(TaskRecurrenceKind kind, int[]? weekdays)
    {
        using var client = await factory.NewTaskUserAsync("r-invalid");
        var today = await client.TodayAsync();

        using var response = await client.PostTaskAsync("Pis qayda", today, recurrence: new TaskRecurrenceCommand(kind, weekdays, null, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, (await client.TaskDayAsync()).Counts.Scheduled);
    }

    [Fact]
    public async Task A_schedule_that_ends_before_it_starts_is_refused()
    {
        using var client = await factory.NewTaskUserAsync("r-range");
        var today = await client.TodayAsync();

        using var response = await client.PostTaskAsync("Pis aralıq", today, recurrence: TaskTestClient.Daily(today, today.AddDays(-1)));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task A_schedule_starting_further_back_than_allowed_is_refused()
    {
        using var client = await factory.NewTaskUserAsync("r-toofar");
        var today = await client.TodayAsync();

        using var response = await client.PostTaskAsync("Çox köhnə", today, recurrence: TaskTestClient.Daily(today.AddDays(-(TaskRecurrence.MaxPastStartDays + 1))));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task A_retried_recurring_create_produces_one_schedule()
    {
        using var client = await factory.NewTaskUserAsync("r-idempotent");
        var today = await client.TodayAsync();
        var requestId = Guid.NewGuid();

        var first = await client.AddTaskAsync("Su iç", today, recurrence: TaskTestClient.Daily(), clientRequestId: requestId);
        using var repeat = await client.PostTaskAsync("Su iç", today, recurrence: TaskTestClient.Daily(), clientRequestId: requestId);

        Assert.Equal(HttpStatusCode.OK, repeat.StatusCode);
        var replayed = (await repeat.Content.ReadFromJsonAsync<TaskResponse>())!;
        Assert.Equal(first.Id, replayed.Id);
        Assert.Equal(first.SeriesId, replayed.SeriesId);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LibraDbContext>();
        Assert.Equal(1, await db.TaskSeries.CountAsync(series => series.ClientRequestId == requestId));
    }
}
