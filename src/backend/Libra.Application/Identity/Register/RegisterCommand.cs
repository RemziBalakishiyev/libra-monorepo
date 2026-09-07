using FluentValidation;

namespace Libra.Application.Identity.Register;

public sealed record RegisterCommand(string Email, string Password, string? DisplayName);

public sealed class RegisterCommandValidator : AbstractValidator<RegisterCommand>
{
    public const int PasswordMinLength = 8;
    public const int PasswordMaxLength = 128;
    public const int EmailMaxLength = 320;
    public const int DisplayNameMaxLength = 100;

    public RegisterCommandValidator()
    {
        RuleFor(command => command.Email)
            .NotEmpty()
            .MaximumLength(EmailMaxLength)
            .EmailAddress();

        RuleFor(command => command.Password)
            .NotEmpty()
            .MinimumLength(PasswordMinLength)
            .MaximumLength(PasswordMaxLength);

        RuleFor(command => command.DisplayName)
            .MaximumLength(DisplayNameMaxLength);
    }
}
