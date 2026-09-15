using System.Net.Http.Json;
using Libra.Application.Common;
using Libra.Application.Tasks;
using Libra.Domain.Tasks;

namespace Libra.IntegrationTests.Infrastructure;

/// <summary>Thin HTTP helpers for the tasks suite. Every call goes through the public API.</summary>
internal static class TaskTestClient
{
    public const string Tasks = "/api/tasks";
    public const string Today = "/api/tasks/today";
    public const string Series = "/api/tasks/series";

    /// <summary>Registers a fresh user and returns a client carrying its bearer token.</summary>
    public static async Task<HttpClient> NewTaskUserAsync(this LibraApiFactory factory, string prefix = "task")
    {
        var client = factory.CreateClient();
        var session = await client.RegisterAsync(AuthTestClient.UniqueEmail(prefix));
        return client.WithBearer(session.AccessToken);
    }

    /// <summary>The user's local today, as the API resolves it in the profile time zone.</summary>
    public static async Task<DateOnly> TodayAsync(this HttpClient client) => (await client.TaskDayAsync()).Date;

    public static async Task<TaskDayResponse> TaskDayAsync(this HttpClient client, DateOnly? date = null) =>
        (await client.GetFromJsonAsync<TaskDayResponse>(date is null ? Today : $"{Today}?date={date:yyyy-MM-dd}"))!;

    public static Task<HttpResponseMessage> PostTaskAsync(
        this HttpClient client,
        string title = "Su iç",
        DateOnly? plannedDate = null,
        TimeOnly? plannedTime = null,
        TaskPriority priority = TaskPriority.Normal,
        string? note = null,
        TaskRecurrenceCommand? recurrence = null,
        Guid? clientRequestId = null) =>
        client.PostAsJsonAsync(Tasks, new CreateTaskCommand(title, note, plannedDate ?? DateOnly.FromDateTime(DateTime.UtcNow), plannedTime, priority, recurrence, clientRequestId));

    public static async Task<TaskResponse> AddTaskAsync(
        this HttpClient client,
        string title = "Su iç",
        DateOnly? plannedDate = null,
        TimeOnly? plannedTime = null,
        TaskPriority priority = TaskPriority.Normal,
        string? note = null,
        TaskRecurrenceCommand? recurrence = null,
        Guid? clientRequestId = null)
    {
        using var response = await client.PostTaskAsync(title, plannedDate, plannedTime, priority, note, recurrence, clientRequestId);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<TaskResponse>())!;
    }

    public static async Task<TaskDetailResponse> GetTaskAsync(this HttpClient client, Guid id) =>
        (await client.GetFromJsonAsync<TaskDetailResponse>($"{Tasks}/{id}"))!;

    public static Task<HttpResponseMessage> PutTaskAsync(this HttpClient client, TaskResponse task, string? title = null, DateOnly? plannedDate = null, TimeOnly? plannedTime = null, TaskPriority? priority = null, string? note = null, DateTime? expectedUpdatedAtUtc = null)
    {
        ArgumentNullException.ThrowIfNull(task);
        var command = new UpdateTaskCommand(
            title ?? task.Title,
            note ?? task.Note,
            plannedDate ?? task.PlannedDate,
            plannedTime ?? task.PlannedTime,
            priority ?? task.Priority,
            expectedUpdatedAtUtc ?? task.UpdatedAtUtc);
        return client.PutAsJsonAsync($"{Tasks}/{task.Id}", command);
    }

    public static Task<HttpResponseMessage> SetCompletionAsync(this HttpClient client, Guid id, bool completed) =>
        client.PostAsJsonAsync($"{Tasks}/{id}/completion", new SetTaskCompletionCommand(completed));

    public static async Task<TaskResponse> CompleteAsync(this HttpClient client, Guid id, bool completed = true)
    {
        using var response = await client.SetCompletionAsync(id, completed);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<TaskResponse>())!;
    }

    public static Task<HttpResponseMessage> DeleteTaskAsync(this HttpClient client, Guid id) => client.DeleteAsync($"{Tasks}/{id}");

    public static async Task<PagedResponse<TaskResponse>> ListAsync(this HttpClient client, TaskView view = TaskView.Today, int pageNumber = 1, int pageSize = 20) =>
        (await client.GetFromJsonAsync<PagedResponse<TaskResponse>>($"{Tasks}?view={view}&pageNumber={pageNumber}&pageSize={pageSize}"))!;

    public static async Task<TaskSeriesResponse> GetSeriesAsync(this HttpClient client, Guid id) =>
        (await client.GetFromJsonAsync<TaskSeriesResponse>($"{Series}/{id}"))!;

    public static Task<HttpResponseMessage> PutSeriesAsync(this HttpClient client, TaskSeriesResponse series, string? title = null, TaskRecurrenceCommand? recurrence = null, TimeOnly? plannedTime = null, TaskPriority? priority = null, DateTime? expectedUpdatedAtUtc = null)
    {
        ArgumentNullException.ThrowIfNull(series);
        var rule = recurrence ?? new TaskRecurrenceCommand(series.Kind, series.Weekdays, series.StartDate, series.EndDate);
        var command = new UpdateTaskSeriesCommand(title ?? series.Title, series.Note, plannedTime ?? series.PlannedTime, priority ?? series.Priority, rule, expectedUpdatedAtUtc ?? series.UpdatedAtUtc);
        return client.PutAsJsonAsync($"{Series}/{series.Id}", command);
    }

    public static Task<HttpResponseMessage> StopSeriesAsync(this HttpClient client, Guid id) =>
        client.PostAsync($"{Series}/{id}/stop", content: null);

    public static TaskRecurrenceCommand Daily(DateOnly? start = null, DateOnly? end = null) =>
        new(TaskRecurrenceKind.Daily, null, start, end);

    public static TaskRecurrenceCommand Weekly(IReadOnlyList<int> weekdays, DateOnly? start = null, DateOnly? end = null) =>
        new(TaskRecurrenceKind.Weekly, weekdays, start, end);
}
