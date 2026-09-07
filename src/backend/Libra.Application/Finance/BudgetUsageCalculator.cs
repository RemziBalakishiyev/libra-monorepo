using Libra.Application.Common;
using Libra.Domain.Finance;
using Microsoft.EntityFrameworkCore;

namespace Libra.Application.Finance;

public sealed record BudgetUsage(decimal Amount, decimal UsedAmount)
{
    public decimal RemainingAmount => Amount - UsedAmount;

    public decimal UsagePercent => Amount == 0 ? 0 : decimal.Round(UsedAmount / Amount * 100, 1);

    public bool IsOverBudget => UsedAmount > Amount;
}

/// <summary>
/// Budget usage = expense transactions in the budget currency whose occurred instant falls inside the local
/// month, restricted to the category for category budgets. Income and transfers never count.
/// </summary>
public sealed class BudgetUsageCalculator(ILibraDbContext db)
{
    /// <summary>Expense totals per (currency, category) for one local month, in one query.</summary>
    public async Task<IReadOnlyDictionary<(string Currency, Guid CategoryId), decimal>> ExpenseByCategoryAsync(
        Guid userId,
        LocalMonth month,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(month);

        var rows = await db.FinancialTransactions
            .Where(transaction => transaction.UserId == userId
                && transaction.Type == FinancialTransactionType.Expense
                && transaction.OccurredAtUtc >= month.StartUtc
                && transaction.OccurredAtUtc < month.EndUtc)
            .Join(db.FinancialAccounts, transaction => transaction.AccountId, account => account.Id, (transaction, account) => new { transaction, account })
            .GroupBy(pair => new { pair.account.CurrencyCode, pair.transaction.CategoryId })
            .Select(grouped => new { grouped.Key.CurrencyCode, grouped.Key.CategoryId, Total = grouped.Sum(pair => pair.transaction.Amount) })
            .ToListAsync(cancellationToken);

        return rows.ToDictionary(row => (row.CurrencyCode, row.CategoryId), row => row.Total);
    }

    public static BudgetUsage UsageFor(
        MonthlyBudget budget,
        IReadOnlyDictionary<(string Currency, Guid CategoryId), decimal> expenseByCategory)
    {
        ArgumentNullException.ThrowIfNull(budget);
        ArgumentNullException.ThrowIfNull(expenseByCategory);

        var used = budget.CategoryId is Guid categoryId
            ? expenseByCategory.GetValueOrDefault((budget.CurrencyCode, categoryId))
            : expenseByCategory
                .Where(entry => entry.Key.Currency == budget.CurrencyCode)
                .Sum(entry => entry.Value);

        return new BudgetUsage(budget.Amount, used);
    }
}
