using System.Text.RegularExpressions;

namespace Libra.Domain.Finance;

/// <summary>Shared money rules: two-decimal amounts and normalized three-letter currency codes.</summary>
public static partial class Money
{
    public const int Scale = 2;
    public const int CurrencyCodeLength = 3;

    public static bool HasValidScale(decimal amount) => decimal.Round(amount, Scale) == amount;

    public static bool IsPositiveAmount(decimal amount) => amount > 0 && HasValidScale(amount);

    public static bool IsCurrencyCode(string? code) => code is not null && CurrencyCodePattern().IsMatch(code);

    /// <summary>Trims and upper-cases a code; throws when the result is not three ASCII letters.</summary>
    public static string NormalizeCurrencyCode(string code)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(code);
        var normalized = code.Trim().ToUpperInvariant();
        return IsCurrencyCode(normalized)
            ? normalized
            : throw new ArgumentException("Currency code must be three letters.", nameof(code));
    }

    [GeneratedRegex("^[A-Z]{3}$")]
    private static partial Regex CurrencyCodePattern();
}
