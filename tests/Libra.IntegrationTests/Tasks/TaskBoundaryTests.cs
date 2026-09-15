using System.Net;
using Libra.Application.Tasks;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Tasks;

/// <summary>
/// Ownership, and the two boundaries that decide what "today" and "late" mean: the local midnight of the
/// profile time zone, and the planned time inside a day.
/// </summary>
[Collection(LibraApiCollection.Name)]
public sealed class TaskBoundaryTests(LibraApiFactory factory)
{
    /// <summary>A zone where the current local hour sits comfortably inside the day, so "earlier today" and
    /// "later today" both exist. Picked from the current instant rather than assumed.</summary>
    private static (string Zone, TimeOnly LocalNow) ZoneWithDaytimeNow()
    {
        string[] candidates = ["Asia/Baku", "Europe/London", "America/New_York", "Asia/Tokyo", "Australia/Sydney", "Pacific/Honolulu", "Asia/Kolkata"];
        foreach (var zone in candidates)
        {
            var local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, TimeZoneInfo.FindSystemTimeZoneById(zone));
            if (local.Hour is >= 6 and <= 20)
            {
                return (zone, TimeOnly.FromDateTime(local));
            }
        }

        throw new InvalidOperationException("No candidate zone is in its daytime right now.");
    }

    [Fact]
    public async Task Every_task_endpoint_requires_a_token()
    {
        using var anonymous = factory.CreateClient();
        var id = Guid.CreateVersion7();

        using var day = await anonymous.GetAsync(TaskTestClient.Today);
        using var list = await anonymous.GetAsync(TaskTestClient.Tasks);
        using var create = await anonymous.PostTaskAsync("Su iç");
        using var read = await anonymous.GetAsync($"{TaskTestClient.Tasks}/{id}");
        using var completion = await anonymous.SetCompletionAsync(id, true);
        using var deleted = await anonymous.DeleteTaskAsync(id);
        using var series = await anonymous.GetAsync($"{TaskTestClient.Series}/{id}");

        Assert.All(
            new[] { day, list, create, read, completion, deleted, series },
            response => Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode));
    }

    [Fact]
    public async Task Another_users_task_is_indistinguishable_from_one_that_does_not_exist()
    {
        using var owner = await factory.NewTaskUserAsync("b-owner");
        using var stranger = await factory.NewTaskUserAsync("b-stranger");
        var today = await owner.TodayAsync();
        var task = await owner.AddTaskAsync("Şəxsi", today, recurrence: TaskTestClient.Daily());

        using var read = await stranger.GetAsync($"{TaskTestClient.Tasks}/{task.Id}");
        using var edit = await stranger.PutTaskAsync(task, title: "Oğurlanmış");
        using var completion = await stranger.SetCompletionAsync(task.Id, true);
        using var deleted = await stranger.DeleteTaskAsync(task.Id);
        using var series = await stranger.GetAsync($"{TaskTestClient.Series}/{task.SeriesId}");
        using var stopped = await stranger.StopSeriesAsync(task.SeriesId!.Value);

        Assert.All(
            new[] { read, edit, completion, deleted, series, stopped },
            response => Assert.Equal(HttpStatusCode.NotFound, response.StatusCode));

        // Nothing the stranger did reached the owner's day, and the stranger's own day is still empty.
        var ownerDay = await owner.TaskDayAsync();
        Assert.Equal(1, ownerDay.Counts.Scheduled);
        Assert.Equal(0, ownerDay.Counts.Completed);
        Assert.Equal("Şəxsi", Assert.Single(ownerDay.Tasks).Title);
        Assert.Equal(0, (await stranger.TaskDayAsync()).Counts.Scheduled);
    }

    [Fact]
    public async Task A_retry_key_is_scoped_to_its_own_user()
    {
        using var first = await factory.NewTaskUserAsync("b-key1");
        using var second = await factory.NewTaskUserAsync("b-key2");
        var shared = Guid.NewGuid();

        var mine = await first.AddTaskAsync("Mənim", await first.TodayAsync(), clientRequestId: shared);
        var theirs = await second.AddTaskAsync("Onun", await second.TodayAsync(), clientRequestId: shared);

        Assert.NotEqual(mine.Id, theirs.Id);
        Assert.Equal("Onun", Assert.Single((await second.TaskDayAsync()).Tasks).Title);
    }

    [Fact]
    public async Task Today_follows_the_profile_time_zone_rather_than_the_server()
    {
        using var client = await factory.NewTaskUserAsync("b-timezone");

        // Two zones far enough apart that they are almost never on the same calendar day.
        await client.SetTimeZoneAsync("Pacific/Kiritimati"); // UTC+14
        var far = await client.TaskDayAsync();
        await client.SetTimeZoneAsync("Pacific/Niue"); // UTC-11
        var near = await client.TaskDayAsync();

        Assert.Equal("Pacific/Kiritimati", far.TimeZone);
        Assert.Equal("Pacific/Niue", near.TimeZone);
        Assert.Equal(LocalDateIn("Pacific/Kiritimati"), far.Date);
        Assert.Equal(LocalDateIn("Pacific/Niue"), near.Date);
        // 25 hours apart: the two zones are never on the same local day at the same instant.
        Assert.NotEqual(far.Date, near.Date);
    }

    [Fact]
    public async Task A_task_belongs_to_the_local_day_its_owner_is_living_in()
    {
        using var client = await factory.NewTaskUserAsync("b-localday");
        await client.SetTimeZoneAsync("Pacific/Kiritimati");
        var localToday = LocalDateIn("Pacific/Kiritimati");

        var task = await client.AddTaskAsync("Bu gün", localToday);
        var day = await client.TaskDayAsync();

        Assert.Equal(localToday, day.Date);
        Assert.Equal(task.Id, Assert.Single(day.Tasks).Id);
        Assert.Equal(0, day.Counts.Overdue);

        // Moving the profile west turns the same planned day into a future one, and it leaves "today".
        await client.SetTimeZoneAsync("Pacific/Niue");
        var west = await client.TaskDayAsync();
        Assert.NotEqual(localToday, west.Date);
        Assert.Equal(0, west.Counts.Scheduled);
        Assert.Contains((await client.ListAsync(TaskView.Upcoming)).Items, row => row.Id == task.Id);
    }

    [Fact]
    public async Task A_timed_task_is_late_only_after_its_local_time_has_passed()
    {
        using var client = await factory.NewTaskUserAsync("b-timed");
        var (zone, localNow) = ZoneWithDaytimeNow();
        await client.SetTimeZoneAsync(zone);
        var today = await client.TodayAsync();

        var past = await client.AddTaskAsync("Keçmiş saat", today, localNow.AddHours(-2));
        var future = await client.AddTaskAsync("Gələcək saat", today, localNow.AddHours(2));
        var untimed = await client.AddTaskAsync("Saatsız", today);

        var day = await client.TaskDayAsync();
        var byId = day.Tasks.ToDictionary(task => task.Id);

        Assert.True(byId[past.Id].IsOverdue);
        Assert.False(byId[future.Id].IsOverdue);
        // Without a time the task has all day; it is not late until the day itself is over.
        Assert.False(byId[untimed.Id].IsOverdue);

        // Today's own overdue tasks stay inside today's n / N: the separate count is for earlier days.
        Assert.Equal(3, day.Counts.Scheduled);
        Assert.Equal(0, day.Counts.Overdue);
        Assert.Empty(day.Overdue);
    }

    [Fact]
    public async Task Yesterdays_timed_task_is_overdue_whatever_the_clock_says_today()
    {
        using var client = await factory.NewTaskUserAsync("b-yesterday");
        var (zone, localNow) = ZoneWithDaytimeNow();
        await client.SetTimeZoneAsync(zone);
        var today = await client.TodayAsync();

        // Late in yesterday's evening — already past, however early it is today.
        await client.AddTaskAsync("Dünən axşam", today.AddDays(-1), localNow.AddMinutes(1) > new TimeOnly(23, 30) ? new TimeOnly(23, 30) : new TimeOnly(23, 59));

        var day = await client.TaskDayAsync();

        Assert.Equal(1, day.Counts.Overdue);
        Assert.True(Assert.Single(day.Overdue).IsOverdue);
    }

    private static DateOnly LocalDateIn(string zone) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, TimeZoneInfo.FindSystemTimeZoneById(zone)));
}
