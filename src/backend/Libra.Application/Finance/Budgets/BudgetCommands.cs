using FluentValidation;
using Libra.Domain.Finance;

namespace Libra.Application.Finance.Budgets;

public sealed record CreateBudgetCommand(int Year, int Month, string CurrencyCode, Guid? CategoryId, decimal Amount);

public sealed record UpdateBudgetCommand(decimal Amount);

public sealed record BudgetListQuery(int? Year = null, int? Month = null, string? CurrencyCode = null);

public sealed class CreateBudgetCommandValidator : AbstractValidator<CreateBudgetCommand>
{
    public CreateBudgetCommandValidator()
    {
        RuleFor(command => command.Year).InclusiveBetween(MonthlyBudget.MinYear, MonthlyBudget.MaxYear);
        RuleFor(command => command.Month).InclusiveBetween(1, 12);
        RuleFor(command => command.CurrencyCode).CurrencyCode();
        RuleFor(command => command.Amount).PositiveMoney();
    }
}

public sealed class UpdateBudgetCommandValidator : AbstractValidator<UpdateBudgetCommand>
{
    public UpdateBudgetCommandValidator()
    {
        RuleFor(command => command.Amount).PositiveMoney();
    }
}

public sealed class BudgetListQueryValidator : AbstractValidator<BudgetListQuery>
{
    public BudgetListQueryValidator()
    {
        RuleFor(query => query.Year).InclusiveBetween(MonthlyBudget.MinYear, MonthlyBudget.MaxYear).When(query => query.Year is not null);
        RuleFor(query => query.Month).InclusiveBetween(1, 12).When(query => query.Month is not null);
        RuleFor(query => query.CurrencyCode).OptionalCurrencyCode();
    }
}
