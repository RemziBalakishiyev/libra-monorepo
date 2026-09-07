using FluentValidation;
using Libra.Application.Common;
using Libra.Domain.Finance;

namespace Libra.Application.Finance.Transactions;

public sealed record CreateTransactionCommand(
    Guid AccountId,
    Guid CategoryId,
    FinancialTransactionType Type,
    decimal Amount,
    DateTimeOffset OccurredAtUtc,
    string? Note,
    Guid? ClientRequestId);

public sealed record UpdateTransactionCommand(
    Guid AccountId,
    Guid CategoryId,
    FinancialTransactionType Type,
    decimal Amount,
    DateTimeOffset OccurredAtUtc,
    string? Note);

public sealed record TransactionListQuery(
    int PageNumber = 1,
    int PageSize = Paging.DefaultPageSize,
    DateTimeOffset? From = null,
    DateTimeOffset? To = null,
    FinancialTransactionType? Type = null,
    Guid? AccountId = null,
    Guid? CategoryId = null,
    string? CurrencyCode = null);

public sealed class CreateTransactionCommandValidator : AbstractValidator<CreateTransactionCommand>
{
    public CreateTransactionCommandValidator()
    {
        RuleFor(command => command.AccountId).NotEmpty();
        RuleFor(command => command.CategoryId).NotEmpty();
        RuleFor(command => command.Type).IsInEnum();
        RuleFor(command => command.Amount).PositiveMoney();
        RuleFor(command => command.OccurredAtUtc).KnownInstant();
        RuleFor(command => command.Note).OptionalNote();
    }
}

public sealed class UpdateTransactionCommandValidator : AbstractValidator<UpdateTransactionCommand>
{
    public UpdateTransactionCommandValidator()
    {
        RuleFor(command => command.AccountId).NotEmpty();
        RuleFor(command => command.CategoryId).NotEmpty();
        RuleFor(command => command.Type).IsInEnum();
        RuleFor(command => command.Amount).PositiveMoney();
        RuleFor(command => command.OccurredAtUtc).KnownInstant();
        RuleFor(command => command.Note).OptionalNote();
    }
}

public sealed class TransactionListQueryValidator : AbstractValidator<TransactionListQuery>
{
    public TransactionListQueryValidator()
    {
        RuleFor(query => query.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(query => query.PageSize).InclusiveBetween(1, Paging.MaxPageSize);
        RuleFor(query => query.Type).IsInEnum().When(query => query.Type is not null);
        RuleFor(query => query.CurrencyCode).OptionalCurrencyCode();
        RuleFor(query => query)
            .Must(query => query.From is null || query.To is null || query.From <= query.To)
            .WithMessage("'From' must not be after 'To'.")
            .WithName("From");
    }
}
