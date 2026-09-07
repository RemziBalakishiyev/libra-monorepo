using FluentValidation;
using Libra.Application.Identity.Register;

namespace Libra.Application.Identity.Login;

public sealed record LoginCommand(string Email, string Password);

public sealed class LoginCommandValidator : AbstractValidator<LoginCommand>
{
    public LoginCommandValidator()
    {
        RuleFor(command => command.Email)
            .NotEmpty()
            .MaximumLength(RegisterCommandValidator.EmailMaxLength);

        RuleFor(command => command.Password)
            .NotEmpty()
            .MaximumLength(RegisterCommandValidator.PasswordMaxLength);
    }
}
