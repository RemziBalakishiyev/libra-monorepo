using FluentValidation;

namespace Libra.Application.Identity.RefreshSession;

public sealed record RefreshSessionCommand(string RefreshToken);

public sealed class RefreshSessionCommandValidator : AbstractValidator<RefreshSessionCommand>
{
    public const int RefreshTokenMaxLength = 128;

    public RefreshSessionCommandValidator()
    {
        RuleFor(command => command.RefreshToken)
            .NotEmpty()
            .MaximumLength(RefreshTokenMaxLength);
    }
}
