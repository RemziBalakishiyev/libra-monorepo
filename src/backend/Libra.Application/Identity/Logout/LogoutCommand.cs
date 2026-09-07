using FluentValidation;
using Libra.Application.Identity.RefreshSession;

namespace Libra.Application.Identity.Logout;

public sealed record LogoutCommand(string RefreshToken);

public sealed class LogoutCommandValidator : AbstractValidator<LogoutCommand>
{
    public LogoutCommandValidator()
    {
        RuleFor(command => command.RefreshToken)
            .NotEmpty()
            .MaximumLength(RefreshSessionCommandValidator.RefreshTokenMaxLength);
    }
}
