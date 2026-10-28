using Libra.Application.Focus;
using Libra.Domain.Focus;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Focus;

/// <summary>
/// What a day's focus adds up to, in the user's own time zone: the split across local midnight, the runs that
/// count as completed sessions and the ones that only contribute time, and the breaks that are never here at
/// all because they are never uploaded.
/// </summary>
[Collection(LibraApiCollection.Name)]
public sealed class FocusSummaryTests(LibraApiFactory factory)
{
    private const string Baku = "Asia/Baku";

    /// <summary>The UTC instant of a local wall-clock moment in the fixed test zone (+04, no DST).</summary>
    private static DateTimeOffset Local(DateOnly date, int hour, int minute = 0) =>
        new DateTimeOffset(date.ToDateTime(new TimeOnly(hour, minute)), TimeSpan.FromHours(4)).ToUniversalTime();

    [Fact]
    public async Task An_empty_day_is_zero_and_says_so_without_inventing_a_session()
    {
        using var client = await factory.NewFocusUserAsync("fs-empty");
        await client.SetTimeZoneAsync(Baku);

        var summary = await client.FocusSummaryAsync();

        Assert.Equal(Baku, summary.TimeZone);
        Assert.Equal(0, summary.Today.ActiveSeconds);
        Assert.Equal(0, summary.Today.CompletedSessions);
        Assert.Equal(0, summary.Today.StoppedSessions);
    }

    [Fact]
    public async Task A_stopped_run_contributes_its_time_but_never_a_completed_session()
    {
        using var client = await factory.NewFocusUserAsync("fs-stopped");
        await client.SetTimeZoneAsync(Baku);
        var today = await client.TodayAsync();

        await client.SaveAsync(FocusTestClient.Run(Guid.CreateVersion7(), Local(today, 10), minutes: 25));
        await client.SaveAsync(FocusTestClient.Run(Guid.CreateVersion7(), Local(today, 11), minutes: 25, outcome: FocusOutcome.Stopped, activeMinutes: 9));

        var summary = await client.FocusSummaryAsync(today);

        Assert.Equal((25 + 9) * 60, summary.Today.ActiveSeconds);
        Assert.Equal(1, summary.Today.CompletedSessions);
        Assert.Equal(1, summary.Today.StoppedSessions);
    }

    [Fact]
    public async Task A_run_across_local_midnight_is_split_between_the_two_days()
    {
        using var client = await factory.NewFocusUserAsync("fs-midnight");
        await client.SetTimeZoneAsync(Baku);
        var today = await client.TodayAsync();
        var yesterday = today.AddDays(-1);

        // 23:50 to 00:15 local: ten minutes belong to yesterday, fifteen to today.
        await client.SaveAsync(new SaveFocusSessionCommand(
            Guid.CreateVersion7(),
            null,
            null,
            25 * 60,
            [new FocusIntervalInput(Local(yesterday, 23, 50), Local(today, 0, 15))],
            FocusOutcome.Completed));

        var yesterdaySummary = await client.FocusSummaryAsync(yesterday);
        var todaySummary = await client.FocusSummaryAsync(today);

        Assert.Equal(10 * 60, yesterdaySummary.Today.ActiveSeconds);
        Assert.Equal(15 * 60, todaySummary.Today.ActiveSeconds);
        // The session itself is counted once, on the local date it finished.
        Assert.Equal(0, yesterdaySummary.Today.CompletedSessions);
        Assert.Equal(1, todaySummary.Today.CompletedSessions);
    }

    [Fact]
    public async Task Paused_time_is_excluded_from_the_day_total()
    {
        using var client = await factory.NewFocusUserAsync("fs-paused");
        await client.SetTimeZoneAsync(Baku);
        var today = await client.TodayAsync();

        // Ran 10 minutes, paused 20, ran 15 more: 45 minutes of wall clock, 25 of focus.
        await client.SaveAsync(new SaveFocusSessionCommand(
            Guid.CreateVersion7(),
            null,
            null,
            25 * 60,
            [
                new FocusIntervalInput(Local(today, 9), Local(today, 9, 10)),
                new FocusIntervalInput(Local(today, 9, 30), Local(today, 9, 45)),
            ],
            FocusOutcome.Completed));

        var summary = await client.FocusSummaryAsync(today);

        Assert.Equal(25 * 60, summary.Today.ActiveSeconds);
        Assert.Equal(1, summary.Today.CompletedSessions);
    }

    [Fact]
    public async Task The_day_is_the_users_own_day_not_the_servers()
    {
        using var client = await factory.NewFocusUserAsync("fs-zone");
        await client.SetTimeZoneAsync("Pacific/Kiritimati"); // UTC+14, the earliest zone there is.
        var today = await client.TodayAsync();

        var summary = await client.FocusSummaryAsync();

        Assert.Equal("Pacific/Kiritimati", summary.TimeZone);
        Assert.Equal(today, summary.Today.Date);
    }

    [Fact]
    public async Task Yesterdays_focus_does_not_appear_in_todays_summary()
    {
        using var client = await factory.NewFocusUserAsync("fs-yesterday");
        await client.SetTimeZoneAsync(Baku);
        var today = await client.TodayAsync();

        await client.SaveAsync(FocusTestClient.Run(Guid.CreateVersion7(), Local(today.AddDays(-1), 15), minutes: 50));

        var summary = await client.FocusSummaryAsync(today);

        Assert.Equal(0, summary.Today.ActiveSeconds);
        Assert.Equal(0, summary.Today.CompletedSessions);
    }
}
