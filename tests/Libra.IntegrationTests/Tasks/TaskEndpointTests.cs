using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using Libra.Application.Tasks;
using Libra.Domain.Tasks;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Tasks;

/// <summary>
/// Creating, reading, editing and deleting tasks through the API, and the three views that show them. The
/// invariant behind the views: a task appears in exactly one of them, and the counts describe the whole set.
/// </summary>
[Collection(LibraApiCollection.Name)]
public sealed class TaskEndpointTests(LibraApiFactory factory)
{
    [Fact]
    public async Task A_new_task_starts_pending_on_the_day_it_was_planned_for()
    {
        using var client = await factory.NewTaskUserAsync("t-create");
        var today = await client.TodayAsync();

        var task = await client.AddTaskAsync("  Dərman qəbul et  ", today, new TimeOnly(9, 0), TaskPriority.High, note: "  səhər  ");

        Assert.Equal("Dərman qəbul et", task.Title);
        Assert.Equal("səhər", task.Note);
        Assert.Equal(today, task.PlannedDate);
        Assert.Equal(new TimeOnly(9, 0), task.PlannedTime);
        Assert.Equal(TaskPriority.High, task.Priority);
        Assert.Equal(TaskState.Pending, task.State);
        Assert.False(task.IsCompleted);
        Assert.Null(task.CompletedAtUtc);
        Assert.Null(task.SeriesId);
    }

    [Fact]
    public async Task Today_reports_the_day_it_describes_and_counts_only_that_day()
    {
        using var client = await factory.NewTaskUserAsync("t-day");
        var today = await client.TodayAsync();
        await client.AddTaskAsync("Bu gün 1", today);
        var second = await client.AddTaskAsync("Bu gün 2", today);
        await client.AddTaskAsync("Sabah", today.AddDays(1));
        await client.CompleteAsync(second.Id);

        var day = await client.TaskDayAsync();

        Assert.Equal(today, day.Date);
        Assert.Equal("Asia/Baku", day.TimeZone);
        Assert.Equal(2, day.Counts.Scheduled);
        Assert.Equal(1, day.Counts.Completed);
        Assert.Equal(0, day.Counts.Overdue);
        // Tomorrow's task is not part of today's n / N.
        Assert.Equal(2, day.Tasks.Count);
        Assert.DoesNotContain(day.Tasks, task => task.Title == "Sabah");
    }

    [Fact]
    public async Task Yesterdays_unfinished_task_is_overdue_and_counted_apart()
    {
        using var client = await factory.NewTaskUserAsync("t-overdue");
        var today = await client.TodayAsync();
        await client.AddTaskAsync("Dünəndən qalan", today.AddDays(-1));
        await client.AddTaskAsync("Bu gün", today);

        var day = await client.TaskDayAsync();

        Assert.Equal(1, day.Counts.Scheduled);
        Assert.Equal(0, day.Counts.Completed);
        // The late task is owed, but it never inflates today's own progress.
        Assert.Equal(1, day.Counts.Overdue);
        var overdue = Assert.Single(day.Overdue);
        Assert.Equal("Dünəndən qalan", overdue.Title);
        Assert.True(overdue.IsOverdue);
        Assert.Equal(today.AddDays(-1), overdue.PlannedDate);
    }

    [Fact]
    public async Task The_three_views_are_disjoint_and_each_shows_a_task_once()
    {
        using var client = await factory.NewTaskUserAsync("t-views");
        var today = await client.TodayAsync();
        var late = await client.AddTaskAsync("Gecikmiş", today.AddDays(-2));
        var now = await client.AddTaskAsync("Bu gün", today);
        var soon = await client.AddTaskAsync("Qarşıdakı", today.AddDays(3));
        var done = await client.AddTaskAsync("Tamamlanan", today);
        await client.CompleteAsync(done.Id);

        var todayView = await client.ListAsync(TaskView.Today);
        var upcoming = await client.ListAsync(TaskView.Upcoming);
        var completed = await client.ListAsync(TaskView.Completed);

        // "Today" carries everything still owed up to and including today.
        Assert.Equal([late.Id, now.Id], todayView.Items.Select(task => task.Id));
        Assert.Equal([soon.Id], upcoming.Items.Select(task => task.Id));
        Assert.Equal([done.Id], completed.Items.Select(task => task.Id));

        var everywhere = todayView.Items.Concat(upcoming.Items).Concat(completed.Items).Select(task => task.Id).ToList();
        Assert.Equal(everywhere.Count, everywhere.Distinct().Count());
    }

    [Fact]
    public async Task Ordering_is_stable_and_puts_the_timed_and_urgent_work_first()
    {
        using var client = await factory.NewTaskUserAsync("t-order");
        var today = await client.TodayAsync();
        var untimedLow = await client.AddTaskAsync("B saatsız", today, priority: TaskPriority.Low);
        var untimedHigh = await client.AddTaskAsync("A saatsız", today, priority: TaskPriority.High);
        var late = await client.AddTaskAsync("Gec saat", today, new TimeOnly(18, 0));
        var early = await client.AddTaskAsync("Erkən saat", today, new TimeOnly(7, 30));

        var day = await client.TaskDayAsync();

        // Timed first in clock order, then untimed by priority, then title.
        Assert.Equal([early.Id, late.Id, untimedHigh.Id, untimedLow.Id], day.Tasks.Select(task => task.Id));
        var again = await client.TaskDayAsync();
        Assert.Equal(day.Tasks.Select(task => task.Id), again.Tasks.Select(task => task.Id));
    }

    [Fact]
    public async Task Counts_describe_every_matching_task_not_just_the_first_page()
    {
        using var client = await factory.NewTaskUserAsync("t-paging");
        var today = await client.TodayAsync();
        for (var index = 0; index < 25; index++)
        {
            var task = await client.AddTaskAsync($"Tapşırıq {index:00}", today);
            if (index % 5 == 0)
            {
                await client.CompleteAsync(task.Id);
            }
        }

        var day = await client.TaskDayAsync();
        var firstPage = await client.ListAsync(TaskView.Today, pageNumber: 1, pageSize: 10);

        Assert.Equal(25, day.Counts.Scheduled);
        Assert.Equal(5, day.Counts.Completed);
        // The day shows everything planned for it, done or not; the counts say how much of it is done.
        Assert.Equal(25, day.Tasks.Count);
        // The "Today" list is the pending slice, and it is paged — but its total is not.
        Assert.Equal(10, firstPage.Items.Count);
        Assert.Equal(20, firstPage.TotalCount);
    }

    [Fact]
    public async Task An_edit_keeps_the_task_and_moves_only_what_it_was_asked_to_move()
    {
        using var client = await factory.NewTaskUserAsync("t-edit");
        var today = await client.TodayAsync();
        var task = await client.AddTaskAsync("Köhnə ad", today);

        using var response = await client.PutTaskAsync(task, title: "Yeni ad", plannedDate: today.AddDays(2), priority: TaskPriority.High);
        response.EnsureSuccessStatusCode();
        var updated = (await response.Content.ReadFromJsonAsync<TaskResponse>())!;

        Assert.Equal(task.Id, updated.Id);
        Assert.Equal("Yeni ad", updated.Title);
        Assert.Equal(today.AddDays(2), updated.PlannedDate);
        Assert.Equal(TaskPriority.High, updated.Priority);
        Assert.True(updated.UpdatedAtUtc > task.UpdatedAtUtc);
        Assert.Equal(0, (await client.TaskDayAsync()).Counts.Scheduled);
    }

    [Fact]
    public async Task Deleting_a_task_removes_it_from_every_view()
    {
        using var client = await factory.NewTaskUserAsync("t-delete");
        var today = await client.TodayAsync();
        var task = await client.AddTaskAsync("Silinəcək", today);

        using (var deleted = await client.DeleteTaskAsync(task.Id))
        {
            Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        }

        using var missing = await client.GetAsync($"{TaskTestClient.Tasks}/{task.Id}");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        Assert.Equal(0, (await client.TaskDayAsync()).Counts.Scheduled);
        Assert.Empty((await client.ListAsync(TaskView.Today)).Items);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task A_title_of_only_whitespace_is_refused(string title)
    {
        using var client = await factory.NewTaskUserAsync("t-title");

        using var response = await client.PostTaskAsync(title);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, (await client.TaskDayAsync()).Counts.Scheduled);
    }

    [Fact]
    public async Task A_title_beyond_the_bound_and_an_unknown_priority_are_refused()
    {
        using var client = await factory.NewTaskUserAsync("t-bounds");
        var today = await client.TodayAsync();

        using var tooLong = await client.PostTaskAsync(new string('a', 201), today);
        using var badPriority = await client.PostAsJsonAsync(
            TaskTestClient.Tasks,
            new { title = "Su iç", plannedDate = today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), priority = "Urgent" });

        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, badPriority.StatusCode);
    }

    [Fact]
    public async Task A_retried_create_returns_the_first_task_instead_of_a_second_one()
    {
        using var client = await factory.NewTaskUserAsync("t-idempotent");
        var today = await client.TodayAsync();
        var requestId = Guid.NewGuid();

        var first = await client.AddTaskAsync("Bir dəfə", today, clientRequestId: requestId);
        using var repeat = await client.PostTaskAsync("Bir dəfə", today, clientRequestId: requestId);

        Assert.Equal(HttpStatusCode.OK, repeat.StatusCode);
        var replayed = (await repeat.Content.ReadFromJsonAsync<TaskResponse>())!;
        Assert.Equal(first.Id, replayed.Id);
        Assert.Equal(1, (await client.TaskDayAsync()).Counts.Scheduled);
    }

    [Fact]
    public async Task Concurrent_creates_under_one_retry_key_produce_one_task()
    {
        using var client = await factory.NewTaskUserAsync("t-race-create");
        var today = await client.TodayAsync();
        var requestId = Guid.NewGuid();

        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => client.PostTaskAsync("Eyni anda", today, clientRequestId: requestId)));

        var ids = new List<Guid>();
        foreach (var response in responses)
        {
            Assert.True(response.StatusCode is HttpStatusCode.Created or HttpStatusCode.OK, $"A concurrent create answered {(int)response.StatusCode}.");
            ids.Add((await response.Content.ReadFromJsonAsync<TaskResponse>())!.Id);
            response.Dispose();
        }

        Assert.Single(ids.Distinct());
        Assert.Equal(1, (await client.TaskDayAsync()).Counts.Scheduled);
    }

    [Fact]
    public async Task A_task_can_be_planned_far_into_the_future()
    {
        using var client = await factory.NewTaskUserAsync("t-future");
        var today = await client.TodayAsync();

        var task = await client.AddTaskAsync("Gələn il", today.AddDays(300));

        Assert.Equal(today.AddDays(300), task.PlannedDate);
        Assert.Contains((await client.ListAsync(TaskView.Upcoming, pageSize: 100)).Items, row => row.Id == task.Id);
    }
}
