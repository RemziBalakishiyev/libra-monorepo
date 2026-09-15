using Libra.Application.Sleep;
using Libra.Domain.Sleep;

namespace Libra.UnitTests.Sleep;

/// <summary>
/// What a session knows on its own: that its duration is the distance between two instants, that a completed
/// night is bounded while a forgotten one is not, and that stopping it twice does not move its end.
/// </summary>
public sealed class SleepSessionTests
{
    private static readonly DateTime Now = new(2026, 9, 10, 6, 30, 0, DateTimeKind.Utc);
    private static readonly Guid User = Guid.CreateVersion7();

    private static SleepSession Open(DateTime? startedAt = null) =>
        SleepSession.Start(User, startedAt ?? Now.AddHours(-8), clientRequestId: null, Now);

    [Fact]
    public void A_started_session_is_open_and_has_no_duration_yet()
    {
        var session = Open();

        Assert.True(session.IsOpen);
        Assert.Null(session.EndedAtUtc);
        Assert.Null(session.Duration);
        Assert.Equal(TimeSpan.FromHours(8), session.Elapsed(Now));
    }

    [Fact]
    public void Duration_is_the_distance_between_the_two_instants()
    {
        var session = Open(Now.AddHours(-7).AddMinutes(-30));

        session.Stop(Now, Now);

        Assert.False(session.IsOpen);
        Assert.Equal(TimeSpan.FromMinutes(450), session.Duration);
        // Elapsed on a closed session is the recorded night, not the time since it ended.
        Assert.Equal(TimeSpan.FromMinutes(450), session.Elapsed(Now.AddHours(3)));
    }

    [Fact]
    public void Elapsed_counts_real_time_across_a_daylight_saving_jump()
    {
        // Europe/Istanbul-style clocks do not matter here: both ends are UTC instants, so a local jump adds
        // nothing. 23:30 to 07:30 UTC is eight hours whatever the wall clock did in between.
        var session = SleepSession.Start(User, new DateTime(2026, 3, 28, 23, 30, 0, DateTimeKind.Utc), null, new DateTime(2026, 3, 28, 23, 30, 0, DateTimeKind.Utc));
        session.Stop(new DateTime(2026, 3, 29, 7, 30, 0, DateTimeKind.Utc), new DateTime(2026, 3, 29, 7, 30, 0, DateTimeKind.Utc));

        Assert.Equal(TimeSpan.FromHours(8), session.Duration);
    }

    [Fact]
    public void Stopping_an_already_closed_session_changes_nothing()
    {
        var session = Open();
        Assert.True(session.Stop(Now, Now));
        var recorded = session.EndedAtUtc;

        // The second stop is a no-op, so a retried request cannot stretch the night.
        Assert.False(session.Stop(Now.AddHours(2), Now.AddHours(2)));
        Assert.Equal(recorded, session.EndedAtUtc);
    }

    [Fact]
    public void A_session_cannot_end_before_it_started()
    {
        var session = Open();

        Assert.Throws<ArgumentException>(() => session.Stop(session.StartedAtUtc.AddMinutes(-1), Now));
    }

    [Fact]
    public void Neither_end_may_sit_in_the_future_beyond_the_clock_tolerance()
    {
        Assert.Throws<ArgumentException>(() => SleepSession.Start(User, Now.AddHours(1), null, Now));
        // A few minutes of clock skew is tolerated rather than treated as an error.
        var session = SleepSession.Start(User, Now.AddMinutes(2), null, Now);
        Assert.Equal(Now.AddMinutes(2), session.StartedAtUtc);

        var open = Open();
        Assert.Throws<ArgumentException>(() => open.Stop(Now.AddHours(2), Now));
    }

    [Fact]
    public void A_completed_session_is_bounded_at_twenty_four_hours()
    {
        var session = Open(Now.AddHours(-25));

        Assert.Throws<ArgumentException>(() => session.Stop(Now, Now));
        // It is still open, so nothing was clipped and the user can correct it.
        Assert.True(session.IsOpen);
        Assert.Equal(TimeSpan.FromHours(25), session.Elapsed(Now));
    }

    [Fact]
    public void An_open_session_is_never_bounded_however_long_it_has_run()
    {
        var forgotten = Open(Now.AddDays(-3));

        Assert.True(forgotten.IsOpen);
        Assert.Equal(TimeSpan.FromDays(3), forgotten.Elapsed(Now));

        // Correction is the way out: it closes the night at a sane moment without inventing one.
        forgotten.Correct(Now.AddHours(-8), Now, quality: 4, note: null, Now);
        Assert.Equal(TimeSpan.FromHours(8), forgotten.Duration);
    }

    [Fact]
    public void A_correction_may_leave_the_session_open()
    {
        var session = Open(Now.AddDays(-2));

        session.Correct(Now.AddHours(-2), endedAtUtc: null, quality: null, note: null, Now);

        Assert.True(session.IsOpen);
        Assert.Equal(Now.AddHours(-2), session.StartedAtUtc);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(6)]
    [InlineData(-1)]
    public void A_rating_outside_one_to_five_is_refused(int quality)
    {
        var session = Open();

        Assert.Throws<ArgumentOutOfRangeException>(() => session.Rate(quality, null, Now));
    }

    [Fact]
    public void A_rating_is_optional_and_a_blank_note_is_no_note()
    {
        var session = Open();
        session.Stop(Now, Now);

        session.Rate(null, "   ", Now);

        Assert.Null(session.Quality);
        Assert.Null(session.Note);
        // Waking up never depended on the rating in the first place.
        Assert.False(session.IsOpen);
    }

    [Fact]
    public void A_note_beyond_its_bound_is_refused()
    {
        var session = Open();

        Assert.Throws<ArgumentOutOfRangeException>(() => session.Rate(3, new string('a', SleepSession.NoteMaxLength + 1), Now));
    }

    [Fact]
    public void A_recorded_session_is_complete_from_the_start()
    {
        var session = SleepSession.Record(User, Now.AddHours(-9), Now.AddHours(-1), 5, "  dincəldim  ", null, Now);

        Assert.False(session.IsOpen);
        Assert.Equal(TimeSpan.FromHours(8), session.Duration);
        Assert.Equal(5, session.Quality);
        Assert.Equal("dincəldim", session.Note);
    }

    [Fact]
    public void An_echoed_timestamp_older_than_the_stored_one_is_a_stale_edit()
    {
        var stored = new DateTime(2026, 9, 10, 6, 0, 0, DateTimeKind.Utc);

        Assert.False(SleepHandler.IsStale(null, stored));
        Assert.False(SleepHandler.IsStale(stored, stored));
        Assert.True(SleepHandler.IsStale(stored.AddSeconds(-1), stored));
    }
}
