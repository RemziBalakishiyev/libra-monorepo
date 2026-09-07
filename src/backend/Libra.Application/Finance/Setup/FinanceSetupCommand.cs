using FluentValidation;
using Libra.Application.Finance.Accounts;

namespace Libra.Application.Finance.Setup;

/// <summary>
/// Idempotent onboarding: creates the missing default categories and, when the user has no account yet and
/// one is supplied, the first account. Never invents an account or an opening balance.
/// </summary>
public sealed record FinanceSetupCommand(CreateAccountCommand? FirstAccount);

public sealed class FinanceSetupCommandValidator : AbstractValidator<FinanceSetupCommand>
{
    public FinanceSetupCommandValidator()
    {
        RuleFor(command => command.FirstAccount!)
            .SetValidator(new CreateAccountCommandValidator())
            .When(command => command.FirstAccount is not null);
    }
}
