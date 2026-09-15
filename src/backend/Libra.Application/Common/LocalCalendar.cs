namespace Libra.Application.Common;

/// <summary>A local calendar day expressed as a half-open UTC range.</summary>
public sealed record LocalDay(DateOnly Date, string TimeZoneId, DateTime StartUtc, DateTime EndUtc);

/// <summary>A local calendar month expressed as a half-open UTC range.</summary>
public sealed record LocalMonth(int Year, int Month, string TimeZoneId, DateTime StartUtc, DateTime EndUtc)
{
    public int DaysInMonth => DateTime.DaysInMonth(Year, Month);
}

/// <summary>
/// The single place that turns the user's IANA time zone into UTC query ranges (DOMAIN.md, "Day boundaries").
/// </summary>
public static class LocalCalendar
{
    public static TimeZoneInfo Resolve(string timeZoneId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(timeZoneId);
        return TimeZoneInfo.FindSystemTimeZoneById(timeZoneId);
    }

    public static LocalMonth Month(string timeZoneId, int year, int month)
    {
        var zone = Resolve(timeZoneId);
        var localStart = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Unspecified);
        var localEnd = localStart.AddMonths(1);
        return new LocalMonth(
            year,
            month,
            timeZoneId,
            TimeZoneInfo.ConvertTimeToUtc(localStart, zone),
            TimeZoneInfo.ConvertTimeToUtc(localEnd, zone));
    }

    /// <summary>The local calendar month that contains <paramref name="instantUtc"/>.</summary>
    public static LocalMonth MonthOf(string timeZoneId, DateTime instantUtc)
    {
        var local = ToLocalDate(timeZoneId, instantUtc);
        return Month(timeZoneId, local.Year, local.Month);
    }

    /// <summary>The half-open UTC range [start, end) that covers one local calendar day.</summary>
    public static LocalDay Day(string timeZoneId, DateOnly date)
    {
        var zone = Resolve(timeZoneId);
        var localStart = date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified);
        var localEnd = date.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified);
        return new LocalDay(
            date,
            timeZoneId,
            TimeZoneInfo.ConvertTimeToUtc(localStart, zone),
            TimeZoneInfo.ConvertTimeToUtc(localEnd, zone));
    }

    public static DateOnly ToLocalDate(string timeZoneId, DateTime instantUtc)
    {
        var zone = Resolve(timeZoneId);
        var local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(instantUtc, DateTimeKind.Utc), zone);
        return DateOnly.FromDateTime(local);
    }

    /// <summary>
    /// Days of the month that have started locally: through today for the current month, the full month for
    /// past months, and zero for future months. Used for daily averages.
    /// </summary>
    public static int DaysElapsed(LocalMonth month, DateTime nowUtc)
    {
        ArgumentNullException.ThrowIfNull(month);

        if (nowUtc < month.StartUtc)
        {
            return 0;
        }

        if (nowUtc >= month.EndUtc)
        {
            return month.DaysInMonth;
        }

        var today = ToLocalDate(month.TimeZoneId, nowUtc);
        return today.Day;
    }
}
