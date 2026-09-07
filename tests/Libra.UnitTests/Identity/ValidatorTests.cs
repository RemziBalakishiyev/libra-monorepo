using FluentValidation.TestHelper;
using Libra.Application.Identity;
using Libra.Application.Identity.Profile;
using Libra.Application.Identity.Register;

namespace Libra.UnitTests.Identity;

public sealed class ValidatorTests
{
    private readonly RegisterCommandValidator _register = new();
    private readonly UpdateProfileCommandValidator _profile = new();

    [Fact]
    public void Register_accepts_a_valid_command()
    {
        var result = _register.TestValidate(new RegisterCommand("user@example.com", "correct horse battery", "Remzi"));

        result.ShouldNotHaveAnyValidationErrors();
    }

    [Theory]
    [InlineData("", "correct horse battery")]
    [InlineData("not-an-email", "correct horse battery")]
    [InlineData("user@example.com", "short")]
    [InlineData("user@example.com", "")]
    public void Register_rejects_bad_email_or_password(string email, string password)
    {
        var result = _register.TestValidate(new RegisterCommand(email, password, null));

        Assert.False(result.IsValid);
    }

    [Fact]
    public void Register_rejects_over_long_password_and_display_name()
    {
        var result = _register.TestValidate(new RegisterCommand("user@example.com", new string('p', 129), new string('n', 101)));

        result.ShouldHaveValidationErrorFor(command => command.Password);
        result.ShouldHaveValidationErrorFor(command => command.DisplayName);
    }

    [Fact]
    public void Profile_accepts_default_preferences()
    {
        var result = _profile.TestValidate(new UpdateProfileCommand("Remzi", new PreferencesDto("Asia/Baku", "az-AZ", "AZN")));

        result.ShouldNotHaveAnyValidationErrors();
    }

    [Theory]
    [InlineData("Mars/Olympus", "az-AZ", "AZN", "Preferences.TimeZone")]
    [InlineData("Asia/Baku", "xx-NOPE", "AZN", "Preferences.Locale")]
    [InlineData("Asia/Baku", "az-AZ", "azn", "Preferences.Currency")]
    [InlineData("Asia/Baku", "az-AZ", "AZNN", "Preferences.Currency")]
    public void Profile_rejects_unknown_time_zone_locale_or_currency(string timeZone, string locale, string currency, string expectedProperty)
    {
        var result = _profile.TestValidate(new UpdateProfileCommand(null, new PreferencesDto(timeZone, locale, currency)));

        Assert.Contains(result.Errors, error => error.PropertyName == expectedProperty);
    }

    [Theory]
    [InlineData("Europe/Istanbul")]
    [InlineData("America/New_York")]
    [InlineData("UTC")]
    public void Known_iana_time_zones_are_accepted(string timeZone)
    {
        Assert.True(UpdateProfileCommandValidator.BeAKnownTimeZone(timeZone));
    }
}
