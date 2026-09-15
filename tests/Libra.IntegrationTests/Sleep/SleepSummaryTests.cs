using System.Net;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Sleep;

/// <summary>
/// The seven-day summary and who may see it. The rules under test: a night counts on the date the user woke up
/// in their own time zone, a date with nothing recorded is not a zero, and the figures come from their own
/// query rather than whichever page of the history is on screen.
/// </summary>
[Collection(LibraApiCollection.Name)]
public sealed class SleepSummaryTests(LibraApiFactory factory)
{
    /// <summary>The UTC instant of a given local date's midnight in a zone.</summary>
    private static DateTimeOffset LocalMidnight(string zone, DateOnly date)
    {
        var timeZone = TimeZoneInfo.FindSystemTimeZoneById(zone);
        var local = date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified);
        return new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(local, timeZone), TimeSpan.Zero);
    }

    /// <summary>
    /// A local midnight to hang fixtures on: the most recent one that is at least three hours in the past. The
    /// margin is what lets a test place a nap "two hours after midnight" and still be describing something that
    /// has already happened, whatever time of day the suite runs at.
    /// </summary>
    private static (DateTimeOffset Midnight, DateOnly Date) Anchor(string zone)
    {
        var date = LocalToday(zone);
        var midnight = LocalMidnight(zone, date);
        if (midnight > DateTimeOffset.UtcNow.AddHours(-3))
        {
            date = date.AddDays(-1);
            midnight = LocalMidnight(zone, date);
        }

        return (midnight, date);
    }

    private static DateOnly LocalToday(string zone) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, TimeZoneInfo.FindSystemTimeZoneById(zone)));

    [Fact]
    public async Task The_window_is_seven_local_dates_ending_today()
    {
        using var client = await factory.NewSleepUserAsync("m-window");

        var summary = await client.SummaryAsync();

        Assert.Equal("Asia/Baku", summary.TimeZone);
        Assert.Equal(7, summary.Days.Count);
        Assert.Equal(LocalToday("Asia/Baku"), summary.To);
        Assert.Equal(summary.To.AddDays(-6), summary.From);
        Assert.Equal(summary.Days.Select(day => day.Date), Enumerable.Range(0, 7).Select(offset => summary.From.AddDays(offset)));
    }

    [Fact]
    public async Task A_date_with_no_record_is_not_zero_sleep()
    {
        using var client = await factory.NewSleepUserAsync("m-empty");

        var summary = await client.SummaryAsync();

        Assert.All(summary.Days, day => Assert.Null(day.TotalMinutes));
        Assert.All(summary.Days, day => Assert.Equal(0, day.SessionCount));
        // With nothing recorded there is no average to report, and no denominator to imply one.
        Assert.Null(summary.AverageMinutes);
        Assert.Equal(0, summary.RecordedDays);
    }

    [Fact]
    public async Task A_night_across_midnight_counts_once_on_the_date_the_user_woke_up()
    {
        using var client = await factory.NewSleepUserAsync("m-midnight");
        await client.SetTimeZoneAsync("Asia/Baku");
        var (midnight, date) = Anchor("Asia/Baku");

        // Seven hours before a local midnight until one hour after it: a night that really crosses the
        // boundary, and one that is always already over whenever the suite runs.
        await client.RecordAsync(midnight.AddHours(-7), midnight.AddHours(1));

        var summary = await client.SummaryAsync();
        var wakeDay = summary.Days.Single(day => day.Date == date);
        var startDay = summary.Days.Single(day => day.Date == date.AddDays(-1));

        Assert.Equal(480, wakeDay.TotalMinutes);
        Assert.Equal(1, wakeDay.SessionCount);
        // The night is counted once, and not on the evening it began.
        Assert.Null(startDay.TotalMinutes);
        Assert.Equal(1, summary.SessionCount);
        Assert.Equal(480, summary.TotalMinutes);
    }

    [Fact]
    public async Task Several_nights_on_one_date_are_summed()
    {
        using var client = await factory.NewSleepUserAsync("m-nap");
        await client.SetTimeZoneAsync("Asia/Baku");
        var (midnight, date) = Anchor("Asia/Baku");

        // A night ending just after local midnight, plus a nap later that morning. Both land on the same date.
        await client.RecordAsync(midnight.AddHours(-7), midnight.AddMinutes(30));
        await client.RecordAsync(midnight.AddHours(1), midnight.AddHours(2));

        var summary = await client.SummaryAsync();
        var day = summary.Days.Single(entry => entry.Date == date);

        Assert.Equal(450 + 60, day.TotalMinutes);
        Assert.Equal(2, day.SessionCount);
    }

    [Fact]
    public async Task An_open_session_contributes_to_no_total()
    {
        using var client = await factory.NewSleepUserAsync("m-open");
        await client.SetTimeZoneAsync("Asia/Baku");
        var (midnight, _) = Anchor("Asia/Baku");
        await client.RecordAsync(midnight.AddHours(-7), midnight.AddHours(1));
        var running = await client.StartAsync(DateTimeOffset.UtcNow.AddMinutes(-40));

        var summary = await client.SummaryAsync();

        Assert.Equal(480, summary.TotalMinutes);
        Assert.Equal(1, summary.SessionCount);
        Assert.Equal(1, summary.RecordedDays);
        // The running session is reported separately, so the screen can show it without counting it.
        Assert.NotNull(summary.Active);
        Assert.Equal(running.Id, summary.Active!.Id);
    }

    [Fact]
    public async Task The_average_is_over_recorded_days_and_says_how_many_there_were()
    {
        using var client = await factory.NewSleepUserAsync("m-average");
        await client.SetTimeZoneAsync("Asia/Baku");

        // Two nights only: 8 h and 6 h, ending on two different earlier local dates. The average is over those
        // two days, not over seven.
        var (midnight, _) = Anchor("Asia/Baku");
        await client.RecordAsync(midnight.AddDays(-2).AddHours(-7), midnight.AddDays(-2).AddHours(1));
        await client.RecordAsync(midnight.AddDays(-1).AddHours(-5), midnight.AddDays(-1).AddHours(1));

        var summary = await client.SummaryAsync();

        Assert.Equal(2, summary.RecordedDays);
        Assert.Equal(840, summary.TotalMinutes);
        Assert.Equal(420, summary.AverageMinutes);
        Assert.Equal(5, summary.Days.Count(day => day.TotalMinutes is null));
        // Seven dates are still shown; only two of them carry a figure.
        Assert.Equal(7, summary.Days.Count);
    }

    [Fact]
    public async Task Elapsed_time_survives_a_daylight_saving_change()
    {
        using var client = await factory.NewSleepUserAsync("m-dst");
        await client.SetTimeZoneAsync("Europe/London");

        // The clocks went forward on 2026-03-29 in London: 01:00 became 02:00. A night from 23:00 to 07:00 local
        // is therefore seven real hours, and the stored instants say so.
        var start = new DateTimeOffset(2026, 3, 28, 23, 0, 0, TimeSpan.Zero);
        var end = new DateTimeOffset(2026, 3, 29, 6, 0, 0, TimeSpan.Zero);
        var session = await client.RecordAsync(start, end);

        Assert.Equal(420, session.DurationMinutes);
        // And it is attributed to the local morning it ended on.
        Assert.Equal(new DateOnly(2026, 3, 29), session.WakeDate);
    }

    [Fact]
    public async Task Changing_the_profile_zone_regroups_the_same_nights()
    {
        using var client = await factory.NewSleepUserAsync("m-regroup");
        await client.SetTimeZoneAsync("Pacific/Kiritimati"); // UTC+14
        var wake = DateTimeOffset.UtcNow.AddHours(-2);
        var session = await client.RecordAsync(wake.AddHours(-8), wake);
        var far = (await client.SummaryAsync()).Days.Single(day => day.TotalMinutes is not null);

        await client.SetTimeZoneAsync("Pacific/Niue"); // UTC-11
        var near = (await client.SummaryAsync()).Days.Single(day => day.TotalMinutes is not null);

        // The recorded minutes never move; only which local date they are counted on can.
        Assert.Equal(480, far.TotalMinutes);
        Assert.Equal(480, near.TotalMinutes);
        Assert.NotEqual(far.Date, near.Date);
        var reread = (await client.HistoryAsync()).Items.Single(item => item.Id == session.Id);
        Assert.Equal(session.DurationMinutes, reread.DurationMinutes);
    }

    [Fact]
    public async Task The_totals_cover_every_matching_night_not_one_page_of_history()
    {
        using var client = await factory.NewSleepUserAsync("m-paging");
        await client.SetTimeZoneAsync("Asia/Baku");

        // One night per local date across the whole window, each 6 hours long and ending just after that date's
        // midnight, so every one of them is in the past.
        var (midnight, date) = Anchor("Asia/Baku");
        for (var offset = 0; offset < 7; offset++)
        {
            var end = midnight.AddDays(-offset).AddMinutes(1);
            await client.RecordAsync(end.AddHours(-6), end);
        }

        var page = await client.HistoryAsync(pageNumber: 1, pageSize: 2);
        // The window is asked for explicitly so the assertion does not depend on the hour the suite runs at.
        var summary = await client.SummaryAsync(date);

        Assert.Equal(2, page.Items.Count);
        Assert.Equal(7, page.TotalCount);
        // The summary is its own query: the two rows on screen do not decide the week's figures.
        Assert.Equal(7, summary.RecordedDays);
        Assert.Equal(7 * 360, summary.TotalMinutes);
        Assert.Equal(360, summary.AverageMinutes);
    }

    [Fact]
    public async Task The_summary_reports_the_latest_completed_night()
    {
        using var client = await factory.NewSleepUserAsync("m-latest");
        await client.RecordAsync(DateTimeOffset.UtcNow.AddHours(-30), DateTimeOffset.UtcNow.AddHours(-24));
        var newest = await client.RecordAsync(DateTimeOffset.UtcNow.AddHours(-9), DateTimeOffset.UtcNow.AddHours(-1));

        var summary = await client.SummaryAsync();

        Assert.NotNull(summary.Latest);
        Assert.Equal(newest.Id, summary.Latest!.Id);
        Assert.Null(summary.Active);
    }

    [Fact]
    public async Task Every_sleep_endpoint_requires_a_token()
    {
        using var anonymous = factory.CreateClient();
        var id = Guid.CreateVersion7();

        using var active = await anonymous.GetAsync(SleepTestClient.Active);
        using var summary = await anonymous.GetAsync(SleepTestClient.Summary);
        using var history = await anonymous.GetAsync(SleepTestClient.Sessions);
        using var start = await anonymous.PostStartAsync();
        using var stop = await anonymous.PostStopAsync(id);
        using var deleted = await anonymous.DeleteSessionAsync(id);

        Assert.All(
            new[] { active, summary, history, start, stop, deleted },
            response => Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode));
    }

    [Fact]
    public async Task Another_users_session_is_indistinguishable_from_one_that_does_not_exist()
    {
        using var owner = await factory.NewSleepUserAsync("m-owner");
        using var stranger = await factory.NewSleepUserAsync("m-stranger");
        var session = await owner.StartAsync(DateTimeOffset.UtcNow.AddHours(-3));

        using var read = await stranger.GetAsync($"{SleepTestClient.Sessions}/{session.Id}");
        using var stop = await stranger.PostStopAsync(session.Id);
        using var correct = await stranger.PutSessionAsync(session, quality: 1);
        using var deleted = await stranger.DeleteSessionAsync(session.Id);

        Assert.All(
            new[] { read, stop, correct, deleted },
            response => Assert.Equal(HttpStatusCode.NotFound, response.StatusCode));

        // Nothing the stranger did reached the owner's night, and the stranger's own history is still empty.
        var running = await owner.ActiveAsync();
        Assert.NotNull(running);
        Assert.True(running!.IsOpen);
        Assert.Equal(0, (await stranger.HistoryAsync()).TotalCount);
        Assert.Null(await stranger.ActiveAsync());
    }

    [Fact]
    public async Task One_users_open_session_does_not_block_another_users()
    {
        using var first = await factory.NewSleepUserAsync("m-user1");
        using var second = await factory.NewSleepUserAsync("m-user2");

        var mine = await first.StartAsync();
        var theirs = await second.StartAsync();

        Assert.NotEqual(mine.Id, theirs.Id);
        Assert.Equal(mine.Id, (await first.ActiveAsync())!.Id);
        Assert.Equal(theirs.Id, (await second.ActiveAsync())!.Id);
    }

    [Fact]
    public async Task A_retry_key_is_scoped_to_its_own_user()
    {
        using var first = await factory.NewSleepUserAsync("m-key1");
        using var second = await factory.NewSleepUserAsync("m-key2");
        var shared = Guid.NewGuid();

        var mine = await first.StartAsync(clientRequestId: shared);
        var theirs = await second.StartAsync(clientRequestId: shared);

        Assert.NotEqual(mine.Id, theirs.Id);
    }
}
