using Libra.Domain.Identity;

namespace Libra.UnitTests.Identity;

public sealed class UserTests
{
    private static readonly DateTime Now = new(2026, 9, 5, 10, 0, 0, DateTimeKind.Utc);

    [Theory]
    [InlineData("  Remzi@Example.COM ", "remzi@example.com")]
    [InlineData("a@b.c", "a@b.c")]
    public void NormalizeEmail_trims_and_lower_cases(string input, string expected)
    {
        Assert.Equal(expected, User.NormalizeEmail(input));
    }

    [Fact]
    public void Register_keeps_display_email_and_sets_defaults()
    {
        var user = User.Register("  Remzi@Example.COM ", "  ", Now);

        Assert.Equal("Remzi@Example.COM", user.Email);
        Assert.Equal("remzi@example.com", user.NormalizedEmail);
        Assert.Null(user.DisplayName);
        Assert.Equal(Now, user.CreatedAtUtc);
        Assert.Equal(user.Id, user.Preferences.UserId);
        Assert.Equal(UserPreference.DefaultTimeZone, user.Preferences.TimeZone);
        Assert.Equal(UserPreference.DefaultLocale, user.Preferences.Locale);
        Assert.Equal(UserPreference.DefaultCurrency, user.Preferences.Currency);
    }

    [Fact]
    public void UpdateDisplayName_trims_and_bumps_updated_at()
    {
        var user = User.Register("x@example.com", null, Now);
        var later = Now.AddMinutes(5);

        user.UpdateDisplayName("  Libra User ", later);

        Assert.Equal("Libra User", user.DisplayName);
        Assert.Equal(later, user.UpdatedAtUtc);
    }

    [Fact]
    public void Preferences_update_upper_cases_currency()
    {
        var user = User.Register("x@example.com", null, Now);

        user.Preferences.Update("Europe/Istanbul", "tr-TR", "try", Now);

        Assert.Equal("TRY", user.Preferences.Currency);
    }
}
