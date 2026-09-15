using Libra.Application.Common;

namespace Libra.UnitTests.Finance;

public sealed class LocalCalendarTests
{
    private const string Baku = "Asia/Baku";

    [Fact]
    public void Month_range_for_Baku_starts_four_hours_before_UTC_midnight()
    {
        var month = LocalCalendar.Month(Baku, 2026, 9);

        Assert.Equal(new DateTime(2026, 8, 31, 20, 0, 0, DateTimeKind.Utc), month.StartUtc);
        Assert.Equal(new DateTime(2026, 9, 30, 20, 0, 0, DateTimeKind.Utc), month.EndUtc);
        Assert.Equal(30, month.DaysInMonth);
    }

    [Fact]
    public void MonthOf_assigns_instants_near_the_boundary_to_the_local_month()
    {
        var lateAugust = LocalCalendar.MonthOf(Baku, new DateTime(2026, 8, 31, 19, 30, 0, DateTimeKind.Utc));
        var earlySeptember = LocalCalendar.MonthOf(Baku, new DateTime(2026, 8, 31, 21, 0, 0, DateTimeKind.Utc));

        Assert.Equal((2026, 8), (lateAugust.Year, lateAugust.Month));
        Assert.Equal((2026, 9), (earlySeptember.Year, earlySeptember.Month));
    }

    [Fact]
    public void DaysElapsed_counts_local_days_and_clamps_to_the_month()
    {
        var september = LocalCalendar.Month(Baku, 2026, 9);

        Assert.Equal(0, LocalCalendar.DaysElapsed(september, new DateTime(2026, 8, 20, 0, 0, 0, DateTimeKind.Utc)));
        Assert.Equal(1, LocalCalendar.DaysElapsed(september, new DateTime(2026, 8, 31, 21, 0, 0, DateTimeKind.Utc))); // 1 Sep 01:00 Baku
        Assert.Equal(5, LocalCalendar.DaysElapsed(september, new DateTime(2026, 9, 5, 10, 0, 0, DateTimeKind.Utc)));
        Assert.Equal(30, LocalCalendar.DaysElapsed(september, new DateTime(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc)));
    }

    [Fact]
    public void Day_range_covers_one_local_day_and_is_half_open()
    {
        var day = LocalCalendar.Day(Baku, new DateOnly(2026, 9, 7));

        Assert.Equal(new DateTime(2026, 9, 6, 20, 0, 0, DateTimeKind.Utc), day.StartUtc);
        Assert.Equal(new DateTime(2026, 9, 7, 20, 0, 0, DateTimeKind.Utc), day.EndUtc);

        // 23:30 local on the 7th belongs to the 7th; 00:15 local on the 8th does not.
        var lateEvening = new DateTime(2026, 9, 7, 19, 30, 0, DateTimeKind.Utc);
        var afterMidnight = new DateTime(2026, 9, 7, 20, 15, 0, DateTimeKind.Utc);
        Assert.True(lateEvening >= day.StartUtc && lateEvening < day.EndUtc);
        Assert.False(afterMidnight < day.EndUtc);
        Assert.Equal(new DateOnly(2026, 9, 8), LocalCalendar.ToLocalDate(Baku, afterMidnight));
    }

    [Fact]
    public void Unknown_time_zone_throws()
    {
        Assert.ThrowsAny<TimeZoneNotFoundException>(() => LocalCalendar.Month("Mars/Olympus", 2026, 1));
    }
}
