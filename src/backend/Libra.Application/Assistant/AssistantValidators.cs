using FluentValidation;
using Libra.Domain.Assistant;

namespace Libra.Application.Assistant;

public sealed class AskAssistantCommandValidator : AbstractValidator<AskAssistantCommand>
{
    public AskAssistantCommandValidator()
    {
        RuleFor(command => command.Question).NotEmpty().MaximumLength(AssistantMessage.QuestionMaxLength);
        RuleFor(command => command.Period).IsInEnum().When(command => command.Period is not null);
        RuleForEach(command => command.Modules).IsInEnum();
        // More than the five that exist would mean a client sending something it invented.
        RuleFor(command => command.Modules).Must(modules => modules is null || modules.Count <= 5)
            .WithMessage("'{PropertyName}' lists more modules than exist.");
    }
}

public sealed class AssistantHistoryQueryValidator : AbstractValidator<AssistantHistoryQuery>
{
    public AssistantHistoryQueryValidator()
    {
        RuleFor(query => query.PageNumber).GreaterThan(0);
        RuleFor(query => query.PageSize).InclusiveBetween(1, Common.Paging.MaxPageSize);
    }
}
