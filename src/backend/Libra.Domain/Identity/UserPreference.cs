namespace Libra.Domain.Identity;

/// <summary>
/// Per-user display preferences. Defaults are Azerbaijan-centric but nothing else in the domain assumes them.
/// </summary>
public sealed class UserPreference
{
    public const string DefaultTimeZone = "Asia/Baku";
    public const string DefaultLocale = "az-AZ";
    public const string DefaultCurrency = "AZN";

    private UserPreference()
    {
    }

    public Guid UserId { get; private set; }

    /// <summary>IANA time zone identifier used to compute day/month boundaries.</summary>
    public string TimeZone { get; private set; } = DefaultTimeZone;

    /// <summary>BCP 47 locale tag used for formatting.</summary>
    public string Locale { get; private set; } = DefaultLocale;

    /// <summary>ISO 4217 code used as the default currency for new records.</summary>
    public string Currency { get; private set; } = DefaultCurrency;

    public DateTime UpdatedAtUtc { get; private set; }

    public static UserPreference CreateDefault(Guid userId, DateTime nowUtc) =>
        new()
        {
            UserId = userId,
            TimeZone = DefaultTimeZone,
            Locale = DefaultLocale,
            Currency = DefaultCurrency,
            UpdatedAtUtc = nowUtc,
        };

    public void Update(string timeZone, string locale, string currency, DateTime nowUtc)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(timeZone);
        ArgumentException.ThrowIfNullOrWhiteSpace(locale);
        ArgumentException.ThrowIfNullOrWhiteSpace(currency);

        TimeZone = timeZone.Trim();
        Locale = locale.Trim();
        Currency = currency.Trim().ToUpperInvariant();
        UpdatedAtUtc = nowUtc;
    }
}
