using FluentValidation;
using Libra.Domain.Finance;

namespace Libra.Application.Finance.Recurring;

/// <summary>A template as stored: the plan, never a transaction. Init-only so EF Core can filter over the projection.</summary>
public sealed record RecurringTemplateResponse
{
    public required Guid Id { get; init; }
    public required string Title { get; init; }
    public required FinancialTransactionType Type { get; init; }
    public required decimal Amount { get; init; }
    public required string CurrencyCode { get; init; }
    public required Guid CategoryId { get; init; }
    public required string CategoryName { get; init; }
    public required Guid AccountId { get; init; }
    public required string AccountName { get; init; }
    public required int DayOfMonth { get; init; }
    public required DateOnly StartDate { get; init; }
    public DateOnly? EndDate { get; init; }
    public required bool IsActive { get; init; }
    public string? Note { get; init; }
    public Guid? ClientRequestId { get; init; }
    public required DateTime CreatedAtUtc { get; init; }
    public required DateTime UpdatedAtUtc { get; init; }
}

/// <summary>
/// One template in one month. Pending rows are computed and carry the template's current values; recorded and
/// skipped rows carry the snapshot the user acted on, which survives later edits to the template.
/// </summary>
public sealed record RecurringOccurrenceResponse(
    Guid TemplateId,
    Guid? OccurrenceId,
    int Year,
    int Month,
    DateOnly DueDate,
    RecurringOccurrenceStatus Status,
    string Title,
    FinancialTransactionType Type,
    decimal Amount,
    string CurrencyCode,
    Guid CategoryId,
    string CategoryName,
    Guid AccountId,
    string AccountName,
    Guid? TransactionId,
    DateTime? RecordedAtUtc,
    bool TemplateIsActive,
    DateTime? UpdatedAtUtc);

/// <summary>
/// The month's occurrences plus per-currency totals. Pending totals are what the plan still expects; nothing in
/// them has touched a balance. Recorded totals are what the confirmed transactions added up to.
/// </summary>
public sealed record RecurringMonthResponse(
    int Year,
    int Month,
    string TimeZone,
    IReadOnlyList<RecurringOccurrenceResponse> Occurrences,
    IReadOnlyList<CurrencyAmount> PendingTotals,
    IReadOnlyList<CurrencyAmount> RecordedTotals);

public sealed record CurrencyAmount(string CurrencyCode, decimal Income, decimal Expense);

public sealed record RecordOccurrenceResponse(RecurringOccurrenceResponse Occurrence, TransactionResponse Transaction);

public sealed record CreateRecurringTemplateCommand(
    string Title,
    FinancialTransactionType Type,
    decimal Amount,
    Guid CategoryId,
    Guid AccountId,
    int DayOfMonth,
    DateOnly StartDate,
    DateOnly? EndDate,
    string? Note,
    Guid? ClientRequestId);

public sealed record UpdateRecurringTemplateCommand(
    string Title,
    FinancialTransactionType Type,
    decimal Amount,
    Guid CategoryId,
    Guid AccountId,
    int DayOfMonth,
    DateOnly StartDate,
    DateOnly? EndDate,
    string? Note,
    bool IsActive,
    DateTime? ExpectedUpdatedAtUtc);

/// <summary>
/// The user's review before money is recorded: which account, how much, and on which calendar date. Absent
/// fields fall back to the template. The client request id makes a retried confirmation safe; the month itself
/// is the stronger guard.
/// </summary>
public sealed record RecordOccurrenceCommand(
    Guid? AccountId,
    decimal? Amount,
    DateOnly? OccurredOn,
    string? Note,
    Guid? ClientRequestId);

public sealed record RecurringMonthQuery(int? Year = null, int? Month = null);

public sealed class CreateRecurringTemplateCommandValidator : AbstractValidator<CreateRecurringTemplateCommand>
{
    public CreateRecurringTemplateCommandValidator()
    {
        RuleFor(command => command.Title).NotEmpty().MaximumLength(RecurringTransaction.TitleMaxLength);
        RuleFor(command => command.Type).IsInEnum();
        RuleFor(command => command.Amount).PositiveMoney();
        RuleFor(command => command.CategoryId).NotEmpty();
        RuleFor(command => command.AccountId).NotEmpty();
        RuleFor(command => command.DayOfMonth).InclusiveBetween(RecurringTransaction.MinDayOfMonth, RecurringTransaction.MaxDayOfMonth);
        RuleFor(command => command.StartDate).Must(date => date.Year is >= MonthlyBudget.MinYear and <= MonthlyBudget.MaxYear).WithMessage("'{PropertyName}' must be between the years 2000 and 2100.");
        RuleFor(command => command.EndDate).GreaterThanOrEqualTo(command => command.StartDate).When(command => command.EndDate is not null);
        RuleFor(command => command.Note).OptionalNote();
    }
}

public sealed class UpdateRecurringTemplateCommandValidator : AbstractValidator<UpdateRecurringTemplateCommand>
{
    public UpdateRecurringTemplateCommandValidator()
    {
        RuleFor(command => command.Title).NotEmpty().MaximumLength(RecurringTransaction.TitleMaxLength);
        RuleFor(command => command.Type).IsInEnum();
        RuleFor(command => command.Amount).PositiveMoney();
        RuleFor(command => command.CategoryId).NotEmpty();
        RuleFor(command => command.AccountId).NotEmpty();
        RuleFor(command => command.DayOfMonth).InclusiveBetween(RecurringTransaction.MinDayOfMonth, RecurringTransaction.MaxDayOfMonth);
        RuleFor(command => command.StartDate).Must(date => date.Year is >= MonthlyBudget.MinYear and <= MonthlyBudget.MaxYear).WithMessage("'{PropertyName}' must be between the years 2000 and 2100.");
        RuleFor(command => command.EndDate).GreaterThanOrEqualTo(command => command.StartDate).When(command => command.EndDate is not null);
        RuleFor(command => command.Note).OptionalNote();
    }
}

public sealed class RecordOccurrenceCommandValidator : AbstractValidator<RecordOccurrenceCommand>
{
    public RecordOccurrenceCommandValidator()
    {
        RuleFor(command => command.Amount!.Value).PositiveMoney().When(command => command.Amount is not null);
        RuleFor(command => command.Note).OptionalNote();
    }
}

public sealed class RecurringMonthQueryValidator : AbstractValidator<RecurringMonthQuery>
{
    public RecurringMonthQueryValidator()
    {
        RuleFor(query => query.Year).InclusiveBetween(MonthlyBudget.MinYear, MonthlyBudget.MaxYear).When(query => query.Year is not null);
        RuleFor(query => query.Month).InclusiveBetween(1, 12).When(query => query.Month is not null);
        RuleFor(query => query)
            .Must(query => (query.Year is null) == (query.Month is null))
            .WithMessage("'Year' and 'Month' must be given together.")
            .WithName("Month");
    }
}

internal static class RecurringErrors
{
    public const string TemplateNotFound = "Recurring template not found";
    public const string NotScheduled = "This month is outside the template's schedule";
    public const string Inactive = "Recurring template is inactive";
    public const string AlreadyRecorded = "This month is already recorded";
    public const string NothingToUndo = "This month has no recording to undo";
    public const string TemplateHasHistory = "Recurring template has recorded months and can only be deactivated";
    public const string CurrencyMismatch = "Account currency does not match the template currency";
    public const string StaleEdit = "The template changed since it was loaded";
    public const string IdempotencyKeyReused = "This client request id was already used for a different month";
    public const string TransactionLinked = "This transaction records a recurring month; undo it from the recurring screen instead";
}
