using Libra.Domain.Finance;

namespace Libra.Application.Finance;

public sealed record AccountResponse(
    Guid Id,
    string Name,
    FinancialAccountType Type,
    string CurrencyCode,
    decimal OpeningBalance,
    decimal CurrentBalance,
    bool IsIncludedInTotal,
    bool IsArchived,
    bool HasActivity,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc);

public sealed record CategoryResponse(
    Guid Id,
    string Name,
    FinanceCategoryKind Kind,
    bool IsSystemDefault,
    bool IsArchived,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc);

/// <summary>Init-only so EF Core can compose filters over the projection (constructor projections cannot be composed).</summary>
public sealed record TransactionResponse
{
    public required Guid Id { get; init; }
    public required Guid AccountId { get; init; }
    public required string AccountName { get; init; }
    public required string CurrencyCode { get; init; }
    public required Guid CategoryId { get; init; }
    public required string CategoryName { get; init; }
    public required FinancialTransactionType Type { get; init; }
    public required decimal Amount { get; init; }
    public required DateTime OccurredAtUtc { get; init; }
    public string? Note { get; init; }
    public Guid? ClientRequestId { get; init; }
    public required DateTime CreatedAtUtc { get; init; }
    public required DateTime UpdatedAtUtc { get; init; }
}

/// <summary>Init-only for the same composability reason as <see cref="TransactionResponse"/>.</summary>
public sealed record TransferResponse
{
    public required Guid Id { get; init; }
    public required Guid SourceAccountId { get; init; }
    public required string SourceAccountName { get; init; }
    public required string SourceCurrencyCode { get; init; }
    public required decimal SourceAmount { get; init; }
    public required Guid DestinationAccountId { get; init; }
    public required string DestinationAccountName { get; init; }
    public required string DestinationCurrencyCode { get; init; }
    public required decimal DestinationAmount { get; init; }
    public decimal? EffectiveRate { get; init; }
    public required DateTime OccurredAtUtc { get; init; }
    public string? Note { get; init; }
    public Guid? ClientRequestId { get; init; }
    public required DateTime CreatedAtUtc { get; init; }
    public required DateTime UpdatedAtUtc { get; init; }
}

public sealed record BudgetResponse(
    Guid Id,
    int Year,
    int Month,
    string CurrencyCode,
    Guid? CategoryId,
    string? CategoryName,
    decimal Amount,
    decimal UsedAmount,
    decimal RemainingAmount,
    decimal UsagePercent,
    bool IsOverBudget,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc);

public sealed record CategoryBreakdownItem(Guid CategoryId, string CategoryName, decimal Amount, decimal Percent);

public sealed record AccountBalanceItem(
    Guid AccountId,
    string Name,
    FinancialAccountType Type,
    string CurrencyCode,
    decimal Balance,
    bool IsIncludedInTotal);

public sealed record CurrencyTotal(string CurrencyCode, decimal TotalBalance, int AccountCount);

public sealed record BudgetSummary(
    Guid BudgetId,
    decimal Amount,
    decimal UsedAmount,
    decimal RemainingAmount,
    decimal UsagePercent,
    bool IsOverBudget);

public sealed record DashboardResponse(
    string CurrencyCode,
    int Year,
    int Month,
    string TimeZone,
    DateTime PeriodStartUtc,
    DateTime PeriodEndUtc,
    decimal TotalBalance,
    decimal MonthlyIncome,
    decimal MonthlyExpense,
    decimal MonthlyNet,
    decimal DailyAverageExpense,
    int DaysElapsed,
    BudgetSummary? OverallBudget,
    IReadOnlyList<CategoryBreakdownItem> ExpenseByCategory,
    IReadOnlyList<TransactionResponse> RecentTransactions,
    IReadOnlyList<AccountBalanceItem> Accounts,
    IReadOnlyList<AccountBalanceItem> NegativeAccounts,
    IReadOnlyList<CurrencyTotal> OtherCurrencies,
    IReadOnlyList<string> AvailableCurrencies);

public sealed record FinanceSetupResponse(
    bool IsComplete,
    int CategoriesCreated,
    bool AccountCreated,
    IReadOnlyList<CategoryResponse> Categories,
    IReadOnlyList<AccountResponse> Accounts);

/// <summary>Outcome of an idempotent create: the record plus whether this call created it.</summary>
public sealed record CreateOutcome<TResponse>(TResponse Response, bool Created);

internal static class FinanceMapping
{
    public static CategoryResponse ToResponse(this FinanceCategory category) =>
        new(category.Id, category.Name, category.Kind, category.IsSystemDefault, category.IsArchived, category.CreatedAtUtc, category.UpdatedAtUtc);

    public static AccountResponse ToResponse(this FinancialAccount account, decimal balance, bool hasActivity) =>
        new(
            account.Id,
            account.Name,
            account.Type,
            account.CurrencyCode,
            account.OpeningBalance,
            balance,
            account.IsIncludedInTotal,
            account.IsArchived,
            hasActivity,
            account.CreatedAtUtc,
            account.UpdatedAtUtc);
}

internal static class FinanceErrors
{
    public const string AccountNotFound = "Account not found";
    public const string CategoryNotFound = "Category not found";
    public const string TransactionNotFound = "Transaction not found";
    public const string TransferNotFound = "Transfer not found";
    public const string BudgetNotFound = "Budget not found";

    public const string AccountArchived = "Account is archived";
    public const string CategoryArchived = "Category is archived";
    public const string CategoryKindMismatch = "Category kind does not match the transaction type";
    public const string CurrencyLocked = "Account currency cannot change after activity exists";
    public const string OpeningBalanceLocked = "Opening balance cannot change after activity exists";
    public const string AccountInUse = "Account has activity and can only be archived";
    public const string CategoryInUse = "Category is in use and can only be archived";
    public const string CategoryNameTaken = "A category with this name already exists";
    public const string BudgetExists = "A budget already exists for this month, currency, and category";
    public const string BudgetCategoryNotExpense = "Budget category must be an active expense category";

    public const string SameAccountTransfer = "Source and destination accounts must differ";
    public const string SameCurrencyAmountsDiffer = "Same-currency transfers must have equal source and destination amounts";
}
