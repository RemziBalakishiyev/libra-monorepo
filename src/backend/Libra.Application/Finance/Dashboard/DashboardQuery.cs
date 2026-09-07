using FluentValidation;
using Libra.Domain.Finance;

namespace Libra.Application.Finance.Dashboard;

/// <summary>Currency defaults to the user's preference; year/month default to the current local month.</summary>
public sealed record DashboardQuery(string? CurrencyCode = null, int? Year = null, int? Month = null);

public sealed class DashboardQueryValidator : AbstractValidator<DashboardQuery>
{
    public DashboardQueryValidator()
    {
        RuleFor(query => query.CurrencyCode).OptionalCurrencyCode();
        RuleFor(query => query.Year).InclusiveBetween(MonthlyBudget.MinYear, MonthlyBudget.MaxYear).When(query => query.Year is not null);
        RuleFor(query => query.Month).InclusiveBetween(1, 12).When(query => query.Month is not null);
        RuleFor(query => query)
            .Must(query => (query.Year is null) == (query.Month is null))
            .WithMessage("'Year' and 'Month' must be provided together.")
            .WithName("Month");
    }
}
