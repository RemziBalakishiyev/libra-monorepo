using FluentValidation;
using Libra.Domain.Finance;

namespace Libra.Application.Finance;

internal static class FinanceValidation
{
    /// <summary>Upper bound that comfortably fits numeric(18,2).</summary>
    public const decimal MaxAmount = 9_999_999_999_999.99m;

    public static IRuleBuilderOptions<T, decimal> PositiveMoney<T>(this IRuleBuilder<T, decimal> rule) =>
        rule
            .GreaterThan(0).WithMessage("'{PropertyName}' must be greater than zero.")
            .LessThanOrEqualTo(MaxAmount)
            .Must(Money.HasValidScale).WithMessage("'{PropertyName}' must have at most two decimal places.");

    public static IRuleBuilderOptions<T, decimal> SignedMoney<T>(this IRuleBuilder<T, decimal> rule) =>
        rule
            .InclusiveBetween(-MaxAmount, MaxAmount)
            .Must(Money.HasValidScale).WithMessage("'{PropertyName}' must have at most two decimal places.");

    public static IRuleBuilderOptions<T, string> CurrencyCode<T>(this IRuleBuilder<T, string> rule) =>
        rule
            .NotEmpty()
            .Must(code => Money.IsCurrencyCode(code?.Trim().ToUpperInvariant()))
            .WithMessage("'{PropertyName}' must be a three-letter currency code.");

    public static IRuleBuilderOptions<T, string?> OptionalCurrencyCode<T>(this IRuleBuilder<T, string?> rule) =>
        rule
            .Must(code => code is null || Money.IsCurrencyCode(code.Trim().ToUpperInvariant()))
            .WithMessage("'{PropertyName}' must be a three-letter currency code.");

    public static IRuleBuilderOptions<T, string?> OptionalNote<T>(this IRuleBuilder<T, string?> rule) =>
        rule.MaximumLength(FinancialTransaction.NoteMaxLength);

    public static IRuleBuilderOptions<T, DateTimeOffset> KnownInstant<T>(this IRuleBuilder<T, DateTimeOffset> rule) =>
        rule
            .NotEqual(default(DateTimeOffset))
            .Must(instant => instant.Year is >= MonthlyBudget.MinYear and <= MonthlyBudget.MaxYear)
            .WithMessage("'{PropertyName}' must be between the years 2000 and 2100.");
}
