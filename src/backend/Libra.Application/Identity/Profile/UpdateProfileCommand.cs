using System.Globalization;
using System.Text.RegularExpressions;
using FluentValidation;
using Libra.Application.Identity.Register;

namespace Libra.Application.Identity.Profile;

public sealed record UpdateProfileCommand(string? DisplayName, PreferencesDto Preferences);

public sealed partial class UpdateProfileCommandValidator : AbstractValidator<UpdateProfileCommand>
{
    public UpdateProfileCommandValidator()
    {
        RuleFor(command => command.DisplayName)
            .MaximumLength(RegisterCommandValidator.DisplayNameMaxLength);

        RuleFor(command => command.Preferences)
            .NotNull();

        When(command => command.Preferences is not null, () =>
        {
            RuleFor(command => command.Preferences.TimeZone)
                .NotEmpty()
                .MaximumLength(64)
                .Must(BeAKnownTimeZone).WithMessage("'{PropertyName}' must be a valid IANA time zone identifier.");

            RuleFor(command => command.Preferences.Locale)
                .NotEmpty()
                .MaximumLength(16)
                .Must(BeAKnownLocale).WithMessage("'{PropertyName}' must be a valid BCP 47 locale.");

            RuleFor(command => command.Preferences.Currency)
                .NotEmpty()
                .Matches(CurrencyCodePattern()).WithMessage("'{PropertyName}' must be a three-letter ISO 4217 code.");
        });
    }

    public static bool BeAKnownTimeZone(string timeZone) =>
        !string.IsNullOrWhiteSpace(timeZone) && TimeZoneInfo.TryFindSystemTimeZoneById(timeZone, out _);

    public static bool BeAKnownLocale(string locale)
    {
        if (string.IsNullOrWhiteSpace(locale))
        {
            return false;
        }

        try
        {
            CultureInfo.GetCultureInfo(locale, predefinedOnly: true);
            return true;
        }
        catch (CultureNotFoundException)
        {
            return false;
        }
    }

    [GeneratedRegex("^[A-Z]{3}$")]
    private static partial Regex CurrencyCodePattern();
}
