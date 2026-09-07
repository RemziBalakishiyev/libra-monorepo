using FluentValidation;
using Libra.Application.Common;

namespace Libra.Application.Finance.Transfers;

public sealed record CreateTransferCommand(
    Guid SourceAccountId,
    Guid DestinationAccountId,
    decimal SourceAmount,
    decimal DestinationAmount,
    DateTimeOffset OccurredAtUtc,
    string? Note,
    Guid? ClientRequestId);

public sealed record UpdateTransferCommand(
    Guid SourceAccountId,
    Guid DestinationAccountId,
    decimal SourceAmount,
    decimal DestinationAmount,
    DateTimeOffset OccurredAtUtc,
    string? Note);

public sealed record TransferListQuery(
    int PageNumber = 1,
    int PageSize = Paging.DefaultPageSize,
    DateTimeOffset? From = null,
    DateTimeOffset? To = null,
    Guid? AccountId = null);

public sealed class CreateTransferCommandValidator : AbstractValidator<CreateTransferCommand>
{
    public CreateTransferCommandValidator()
    {
        RuleFor(command => command.SourceAccountId).NotEmpty();
        RuleFor(command => command.DestinationAccountId)
            .NotEmpty()
            .NotEqual(command => command.SourceAccountId).WithMessage(FinanceErrors.SameAccountTransfer);
        RuleFor(command => command.SourceAmount).PositiveMoney();
        RuleFor(command => command.DestinationAmount).PositiveMoney();
        RuleFor(command => command.OccurredAtUtc).KnownInstant();
        RuleFor(command => command.Note).OptionalNote();
    }
}

public sealed class UpdateTransferCommandValidator : AbstractValidator<UpdateTransferCommand>
{
    public UpdateTransferCommandValidator()
    {
        RuleFor(command => command.SourceAccountId).NotEmpty();
        RuleFor(command => command.DestinationAccountId)
            .NotEmpty()
            .NotEqual(command => command.SourceAccountId).WithMessage(FinanceErrors.SameAccountTransfer);
        RuleFor(command => command.SourceAmount).PositiveMoney();
        RuleFor(command => command.DestinationAmount).PositiveMoney();
        RuleFor(command => command.OccurredAtUtc).KnownInstant();
        RuleFor(command => command.Note).OptionalNote();
    }
}

public sealed class TransferListQueryValidator : AbstractValidator<TransferListQuery>
{
    public TransferListQueryValidator()
    {
        RuleFor(query => query.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(query => query.PageSize).InclusiveBetween(1, Paging.MaxPageSize);
        RuleFor(query => query)
            .Must(query => query.From is null || query.To is null || query.From <= query.To)
            .WithMessage("'From' must not be after 'To'.")
            .WithName("From");
    }
}
