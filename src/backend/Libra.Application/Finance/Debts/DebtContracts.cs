using FluentValidation;
using Libra.Application.Common;
using Libra.Domain.Finance;

namespace Libra.Application.Finance.Debts;

/// <summary>One movement in a debt's history. <c>CashEffect</c> is signed: negative when cash left the account.</summary>
public sealed record DebtMovementResponse(
    Guid Id,
    DebtMovementKind Kind,
    Guid AccountId,
    string AccountName,
    decimal Amount,
    decimal CashEffect,
    DateTime OccurredAtUtc,
    string? Note,
    bool IsReversed,
    DateTime? ReversedAtUtc,
    DateTime CreatedAtUtc);

/// <summary>
/// Everything derived on read: remaining = principal − valid payments; status and overdue follow from that and
/// from the profile-time-zone date. Nothing here is a stored number that could drift from the payments.
/// <c>MovedCashAtOpening</c> is true when creating the debt moved cash — the opening movement exists and is not
/// reversed.
/// </summary>
public sealed record DebtResponse(
    Guid Id,
    DebtDirection Direction,
    string CounterpartyName,
    decimal Principal,
    decimal PaidAmount,
    decimal RemainingAmount,
    string CurrencyCode,
    DateOnly OpenedOn,
    DateOnly? DueOn,
    DebtStatus Status,
    bool IsOverdue,
    bool MovedCashAtOpening,
    bool HasMovements,
    string? Note,
    Guid? ClientRequestId,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc);

public sealed record DebtDetailResponse(DebtResponse Debt, IReadOnlyList<DebtMovementResponse> History);

/// <summary>Outstanding amounts per currency over every debt of the user, aggregated in SQL, never over a page.</summary>
public sealed record DebtCurrencySummary(
    string CurrencyCode,
    decimal ReceivableOutstanding,
    decimal PayableOutstanding,
    decimal OverdueReceivable,
    decimal OverduePayable,
    int OpenReceivables,
    int OpenPayables,
    int OverdueCount);

public sealed record DebtSummaryResponse(string TimeZone, DateOnly Today, IReadOnlyList<DebtCurrencySummary> Currencies);

/// <summary>
/// Creating a debt records an obligation. Whether cash moves at the same time is the caller's explicit choice:
/// with <see cref="AccountId"/> the principal is lent out or borrowed <em>now</em> from that account; without it
/// the obligation already existed and no balance changes.
/// </summary>
public sealed record CreateDebtCommand(
    DebtDirection Direction,
    string CounterpartyName,
    decimal Principal,
    string CurrencyCode,
    DateOnly OpenedOn,
    DateOnly? DueOn,
    string? Note,
    Guid? AccountId,
    Guid? ClientRequestId);

public sealed record UpdateDebtCommand(
    string CounterpartyName,
    decimal Principal,
    DateOnly OpenedOn,
    DateOnly? DueOn,
    string? Note,
    DateTime? ExpectedUpdatedAtUtc);

public sealed record RecordDebtPaymentCommand(
    Guid AccountId,
    decimal Amount,
    DateOnly PaidOn,
    string? Note,
    Guid? ClientRequestId);

public sealed record DebtListQuery(
    DebtDirection? Direction = null,
    bool IncludeSettled = false,
    string? CurrencyCode = null,
    int PageNumber = 1,
    int PageSize = Paging.DefaultPageSize);

public sealed class CreateDebtCommandValidator : AbstractValidator<CreateDebtCommand>
{
    public CreateDebtCommandValidator()
    {
        RuleFor(command => command.Direction).IsInEnum();
        RuleFor(command => command.CounterpartyName).NotEmpty().MaximumLength(Debt.CounterpartyMaxLength);
        RuleFor(command => command.Principal).PositiveMoney();
        RuleFor(command => command.CurrencyCode).CurrencyCode();
        RuleFor(command => command.OpenedOn).Must(date => date.Year is >= MonthlyBudget.MinYear and <= MonthlyBudget.MaxYear).WithMessage("'{PropertyName}' must be between the years 2000 and 2100.");
        RuleFor(command => command.DueOn).GreaterThanOrEqualTo(command => command.OpenedOn).When(command => command.DueOn is not null);
        RuleFor(command => command.Note).OptionalNote();
    }
}

public sealed class UpdateDebtCommandValidator : AbstractValidator<UpdateDebtCommand>
{
    public UpdateDebtCommandValidator()
    {
        RuleFor(command => command.CounterpartyName).NotEmpty().MaximumLength(Debt.CounterpartyMaxLength);
        RuleFor(command => command.Principal).PositiveMoney();
        RuleFor(command => command.OpenedOn).Must(date => date.Year is >= MonthlyBudget.MinYear and <= MonthlyBudget.MaxYear).WithMessage("'{PropertyName}' must be between the years 2000 and 2100.");
        RuleFor(command => command.DueOn).GreaterThanOrEqualTo(command => command.OpenedOn).When(command => command.DueOn is not null);
        RuleFor(command => command.Note).OptionalNote();
    }
}

public sealed class RecordDebtPaymentCommandValidator : AbstractValidator<RecordDebtPaymentCommand>
{
    public RecordDebtPaymentCommandValidator()
    {
        RuleFor(command => command.AccountId).NotEmpty();
        RuleFor(command => command.Amount).PositiveMoney();
        RuleFor(command => command.PaidOn).Must(date => date.Year is >= MonthlyBudget.MinYear and <= MonthlyBudget.MaxYear).WithMessage("'{PropertyName}' must be between the years 2000 and 2100.");
        RuleFor(command => command.Note).OptionalNote();
    }
}

public sealed class DebtListQueryValidator : AbstractValidator<DebtListQuery>
{
    public DebtListQueryValidator()
    {
        RuleFor(query => query.Direction).IsInEnum().When(query => query.Direction is not null);
        RuleFor(query => query.CurrencyCode).OptionalCurrencyCode();
        RuleFor(query => query.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(query => query.PageSize).InclusiveBetween(1, Paging.MaxPageSize);
    }
}

internal static class DebtErrors
{
    public const string DebtNotFound = "Debt not found";
    public const string PaymentNotFound = "Payment not found";
    public const string CurrencyMismatch = "Account currency does not match the debt currency";
    public const string PaymentExceedsRemaining = "Payment is larger than the remaining principal";
    public const string AlreadySettled = "This debt is already settled";
    public const string StructureLocked = "Principal, currency and opening date are fixed once money has moved";
    public const string HasMovements = "This debt has cash movements and cannot be deleted";
    public const string StaleEdit = "The debt changed since it was loaded";
    public const string ConcurrentPayment = "Another payment was recorded at the same time";
    public const string IdempotencyKeyReused = "This client request id was already used with different input";
}
