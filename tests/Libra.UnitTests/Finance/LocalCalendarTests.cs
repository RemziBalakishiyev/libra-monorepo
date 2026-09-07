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
    public void Unknown_time_zone_throws()
    {
        Assert.ThrowsAny<TimeZoneNotFoundException>(() => LocalCalendar.Month("Mars/Olympus", 2026, 1));
    }
}
