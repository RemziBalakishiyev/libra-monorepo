using FluentValidation;
using Libra.Domain.Finance;

namespace Libra.Application.Finance.Accounts;

public sealed record CreateAccountCommand(
    string Name,
    FinancialAccountType Type,
    string CurrencyCode,
    decimal OpeningBalance,
    bool IsIncludedInTotal = true);

public sealed record UpdateAccountCommand(
    string Name,
    FinancialAccountType Type,
    string CurrencyCode,
    decimal OpeningBalance,
    bool IsIncludedInTotal,
    bool IsArchived);

public sealed class CreateAccountCommandValidator : AbstractValidator<CreateAccountCommand>
{
    public CreateAccountCommandValidator()
    {
        RuleFor(command => command.Name).NotEmpty().MaximumLength(FinancialAccount.NameMaxLength);
        RuleFor(command => command.Type).IsInEnum();
        RuleFor(command => command.CurrencyCode).CurrencyCode();
        RuleFor(command => command.OpeningBalance).SignedMoney();
    }
}

public sealed class UpdateAccountCommandValidator : AbstractValidator<UpdateAccountCommand>
{
    public UpdateAccountCommandValidator()
    {
        RuleFor(command => command.Name).NotEmpty().MaximumLength(FinancialAccount.NameMaxLength);
        RuleFor(command => command.Type).IsInEnum();
        RuleFor(command => command.CurrencyCode).CurrencyCode();
        RuleFor(command => command.OpeningBalance).SignedMoney();
    }
}
