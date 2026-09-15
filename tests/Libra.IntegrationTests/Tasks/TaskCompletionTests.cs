using System.Net;
using System.Net.Http.Json;
using Libra.Application.Tasks;
using Libra.Domain.Tasks;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Tasks;

/// <summary>
/// Completion as a state rather than a switch. A retried request is harmless, a concurrent one cannot double
/// anything, and reopening adds to the record instead of erasing it.
/// </summary>
[Collection(LibraApiCollection.Name)]
public sealed class TaskCompletionTests(LibraApiFactory factory)
{
    [Fact]
    public async Task Completing_a_task_records_it_once()
    {
        using var client = await factory.NewTaskUserAsync("c-complete");
        var task = await client.AddTaskAsync("Su iç", await client.TodayAsync());

        var completed = await client.CompleteAsync(task.Id);

        Assert.True(completed.IsCompleted);
        Assert.Equal(TaskState.Completed, completed.State);
        Assert.NotNull(completed.CompletedAtUtc);
        var detail = await client.GetTaskAsync(task.Id);
        Assert.Equal(TaskCompletionEventKind.Completed, Assert.Single(detail.History).Kind);
    }

    [Fact]
    public async Task Repeating_completed_true_neither_reopens_the_task_nor_adds_a_second_event()
    {
        using var client = await factory.NewTaskUserAsync("c-repeat");
        var task = await client.AddTaskAsync("Su iç", await client.TodayAsync());

        var first = await client.CompleteAsync(task.Id);
        var second = await client.CompleteAsync(task.Id);
        var third = await client.CompleteAsync(task.Id);

        Assert.True(second.IsCompleted);
        Assert.True(third.IsCompleted);
        // The completion instant is the first one; nothing about the task moved on the retries.
        Assert.Equal(first.CompletedAtUtc, third.CompletedAtUtc);
        Assert.Single((await client.GetTaskAsync(task.Id)).History);
    }

    [Fact]
    public async Task Concurrent_completions_of_one_task_record_it_once()
    {
        using var client = await factory.NewTaskUserAsync("c-race");
        var task = await client.AddTaskAsync("Eyni anda", await client.TodayAsync());

        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => client.SetCompletionAsync(task.Id, true)));

        foreach (var response in responses)
        {
            Assert.True(
                response.StatusCode is HttpStatusCode.OK or HttpStatusCode.Conflict,
                $"A concurrent completion answered {(int)response.StatusCode}.");
            response.Dispose();
        }

        var detail = await client.GetTaskAsync(task.Id);
        Assert.True(detail.Task.IsCompleted);
        Assert.Single(detail.History);
        Assert.Equal(1, (await client.TaskDayAsync()).Counts.Completed);
    }

    [Fact]
    public async Task Reopening_clears_the_completed_state_and_keeps_the_history()
    {
        using var client = await factory.NewTaskUserAsync("c-reopen");
        var task = await client.AddTaskAsync("Su iç", await client.TodayAsync());

        await client.CompleteAsync(task.Id);
        var reopened = await client.CompleteAsync(task.Id, completed: false);

        Assert.False(reopened.IsCompleted);
        Assert.Null(reopened.CompletedAtUtc);
        Assert.Equal(TaskState.Pending, reopened.State);

        var history = (await client.GetTaskAsync(task.Id)).History;
        Assert.Equal(2, history.Count);
        // Newest first: the reopen, then the completion it undid.
        Assert.Equal(TaskCompletionEventKind.Reopened, history[0].Kind);
        Assert.Equal(TaskCompletionEventKind.Completed, history[1].Kind);

        var day = await client.TaskDayAsync();
        Assert.Equal(1, day.Counts.Scheduled);
        Assert.Equal(0, day.Counts.Completed);
    }

    [Fact]
    public async Task Repeating_completed_false_on_a_pending_task_records_nothing()
    {
        using var client = await factory.NewTaskUserAsync("c-noop");
        var task = await client.AddTaskAsync("Su iç", await client.TodayAsync());

        await client.CompleteAsync(task.Id, completed: false);
        await client.CompleteAsync(task.Id, completed: false);

        Assert.Empty((await client.GetTaskAsync(task.Id)).History);
    }

    [Fact]
    public async Task Completing_an_overdue_task_does_not_move_it_to_today()
    {
        using var client = await factory.NewTaskUserAsync("c-overdue");
        var today = await client.TodayAsync();
        var task = await client.AddTaskAsync("Keçən həftədən", today.AddDays(-6));

        var completed = await client.CompleteAsync(task.Id);

        // The day it was planned for is a fact about the plan, not about when it was ticked off.
        Assert.Equal(today.AddDays(-6), completed.PlannedDate);
        Assert.False(completed.IsOverdue);
        var day = await client.TaskDayAsync();
        Assert.Equal(0, day.Counts.Scheduled);
        Assert.Equal(0, day.Counts.Overdue);
        Assert.Empty(day.Overdue);
    }

    [Fact]
    public async Task An_edit_from_a_stale_read_is_refused_instead_of_overwriting()
    {
        using var client = await factory.NewTaskUserAsync("c-stale");
        var today = await client.TodayAsync();
        var task = await client.AddTaskAsync("İlkin ad", today);

        // Someone else (or another screen) saves first.
        using var winner = await client.PutTaskAsync(task, title: "Qalib ad");
        winner.EnsureSuccessStatusCode();

        // The stale client still holds the version it read before that.
        using var loser = await client.PutTaskAsync(task, title: "Köhnə ad");

        Assert.Equal(HttpStatusCode.Conflict, loser.StatusCode);
        Assert.Equal("application/problem+json", loser.Content.Headers.ContentType?.MediaType);
        Assert.Equal("Qalib ad", (await client.GetTaskAsync(task.Id)).Task.Title);
    }

    [Fact]
    public async Task An_edit_without_a_version_still_applies()
    {
        using var client = await factory.NewTaskUserAsync("c-noversion");
        var today = await client.TodayAsync();
        var task = await client.AddTaskAsync("İlkin ad", today);

        // A client that never read a version cannot be stale-checked; the write is accepted as before.
        using var response = await client.PutAsJsonAsync(
            $"{TaskTestClient.Tasks}/{task.Id}",
            new UpdateTaskCommand("Yeni ad", null, today, null, TaskPriority.Normal, null));

        response.EnsureSuccessStatusCode();
        Assert.Equal("Yeni ad", (await response.Content.ReadFromJsonAsync<TaskResponse>())!.Title);
    }

    [Fact]
    public async Task A_missing_task_is_a_404_for_every_operation()
    {
        using var client = await factory.NewTaskUserAsync("c-missing");
        var id = Guid.CreateVersion7();

        using var read = await client.GetAsync($"{TaskTestClient.Tasks}/{id}");
        using var completion = await client.SetCompletionAsync(id, true);
        using var deleted = await client.DeleteTaskAsync(id);

        Assert.Equal(HttpStatusCode.NotFound, read.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, completion.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, deleted.StatusCode);
    }
}
