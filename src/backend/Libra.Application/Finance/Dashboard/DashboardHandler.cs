using Libra.Application.Common;
using Libra.Application.Finance.Debts;
using Libra.Application.Finance.Transactions;
using Libra.Domain.Finance;
using Microsoft.EntityFrameworkCore;

namespace Libra.Application.Finance.Dashboard;

/// <summary>
/// Single-currency dashboard for one local month. Other currencies are reported as separate totals and are never
/// added into the selected currency.
/// </summary>
public sealed class DashboardHandler(
    ILibraDbContext db,
    AccountBalanceCalculator balances,
    BudgetUsageCalculator budgets,
    TransactionsHandler transactions,
    DebtsHandler debts,
    TimeProvider clock)
{
    private const int RecentTransactionCount = 10;

    public async Task<Result<DashboardResponse>> HandleAsync(Guid userId, DashboardQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var settings = await UserFinanceSettings.LoadAsync(db, userId, cancellationToken);
        var currency = Money.NormalizeCurrencyCode(query.CurrencyCode ?? settings.Currency);
        var month = query.Year is int year && query.Month is int monthNumber
            ? LocalCalendar.Month(settings.TimeZone, year, monthNumber)
            : LocalCalendar.MonthOf(settings.TimeZone, nowUtc);

        var accounts = await db.FinancialAccounts
            .AsNoTracking()
            .Where(account => account.UserId == userId && !account.IsArchived)
            .OrderBy(account => account.Name)
            .ThenBy(account => account.Id)
            .ToListAsync(cancellationToken);
        var deltas = await balances.DeltasAsync(userId, nowUtc, cancellationToken);

        var balanceItems = accounts
            .Select(account => new AccountBalanceItem(
                account.Id,
                account.Name,
                account.Type,
                account.CurrencyCode,
                AccountBalanceCalculator.BalanceOf(account, deltas),
                account.IsIncludedInTotal))
            .ToList();

        var selected = balanceItems.Where(item => item.CurrencyCode == currency).ToList();
        var totalBalance = selected.Where(item => item.IsIncludedInTotal).Sum(item => item.Balance);
        var otherCurrencies = balanceItems
            .Where(item => item.CurrencyCode != currency && item.IsIncludedInTotal)
            .GroupBy(item => item.CurrencyCode)
            .Select(group => new CurrencyTotal(group.Key, group.Sum(item => item.Balance), group.Count()))
            .OrderBy(total => total.CurrencyCode)
            .ToList();
        var availableCurrencies = balanceItems.Select(item => item.CurrencyCode).Distinct().Order().ToList();

        var monthlyTotals = await db.FinancialTransactions
            .Where(transaction => transaction.UserId == userId
                && transaction.OccurredAtUtc >= month.StartUtc
                && transaction.OccurredAtUtc < month.EndUtc)
            .Join(db.FinancialAccounts, transaction => transaction.AccountId, account => account.Id, (transaction, account) => new { transaction, account })
            .Where(pair => pair.account.CurrencyCode == currency)
            .GroupBy(pair => pair.transaction.Type)
            .Select(grouped => new { Type = grouped.Key, Total = grouped.Sum(pair => pair.transaction.Amount) })
            .ToListAsync(cancellationToken);
        var monthlyIncome = monthlyTotals.Where(row => row.Type == FinancialTransactionType.Income).Sum(row => row.Total);
        var monthlyExpense = monthlyTotals.Where(row => row.Type == FinancialTransactionType.Expense).Sum(row => row.Total);

        var expenseByCategory = await budgets.ExpenseByCategoryAsync(userId, month, cancellationToken);
        var categoryIds = expenseByCategory.Keys.Where(key => key.Currency == currency).Select(key => key.CategoryId).ToList();
        var categoryNames = categoryIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await db.FinanceCategories
                .AsNoTracking()
                .Where(category => category.UserId == userId && categoryIds.Contains(category.Id))
                .ToDictionaryAsync(category => category.Id, category => category.Name, cancellationToken);
        var breakdown = expenseByCategory
            .Where(entry => entry.Key.Currency == currency)
            .Select(entry => new CategoryBreakdownItem(
                entry.Key.CategoryId,
                categoryNames.GetValueOrDefault(entry.Key.CategoryId, string.Empty),
                entry.Value,
                monthlyExpense == 0 ? 0 : decimal.Round(entry.Value / monthlyExpense * 100, 1)))
            .OrderByDescending(item => item.Amount)
            .ThenBy(item => item.CategoryName)
            .ToList();

        var overallBudget = await db.MonthlyBudgets
            .AsNoTracking()
            .SingleOrDefaultAsync(
                budget => budget.UserId == userId && budget.Year == month.Year && budget.Month == month.Month && budget.CurrencyCode == currency && budget.CategoryId == null,
                cancellationToken);
        BudgetSummary? budgetSummary = null;
        if (overallBudget is not null)
        {
            var use = BudgetUsageCalculator.UsageFor(overallBudget, expenseByCategory);
            budgetSummary = new BudgetSummary(overallBudget.Id, use.Amount, use.UsedAmount, use.RemainingAmount, use.UsagePercent, use.IsOverBudget);
        }

        var recent = await transactions.Projection(userId)
            .Where(row => row.CurrencyCode == currency)
            .OrderByDescending(row => row.OccurredAtUtc)
            .ThenByDescending(row => row.Id)
            .Take(RecentTransactionCount)
            .ToListAsync(cancellationToken);

        var daysElapsed = LocalCalendar.DaysElapsed(month, nowUtc);
        var dailyAverage = daysElapsed == 0 ? 0 : decimal.Round(monthlyExpense / daysElapsed, 2);

        // Principal movements are neither income nor expense; they are reported on their own and added to the
        // month's net only for the total change in cash, so the two figures never blur into one another.
        var principalRows = await db.DebtMovements
            .Where(movement => movement.UserId == userId && movement.ReversedAtUtc == null && movement.OccurredAtUtc >= month.StartUtc && movement.OccurredAtUtc < month.EndUtc)
            .Join(db.Debts, movement => movement.DebtId, debt => debt.Id, (movement, debt) => new { movement, debt })
            .Where(pair => pair.debt.CurrencyCode == currency)
            .GroupBy(pair => new { pair.debt.Direction, pair.movement.Kind })
            .Select(group => new { group.Key.Direction, group.Key.Kind, Total = group.Sum(pair => pair.movement.Amount) })
            .ToListAsync(cancellationToken);
        var monthlyPrincipalNet = principalRows.Sum(row => DebtMovement.CashEffect(row.Direction, row.Kind, row.Total));
        var debtSummary = (await debts.SummaryAsync(userId, cancellationToken)).Currencies.SingleOrDefault(summary => summary.CurrencyCode == currency);
        var receivables = debtSummary?.ReceivableOutstanding ?? 0;
        var payables = debtSummary?.PayableOutstanding ?? 0;
        var position = new DebtPosition(
            monthlyPrincipalNet,
            monthlyIncome - monthlyExpense + monthlyPrincipalNet,
            receivables,
            payables,
            debtSummary?.OverdueReceivable ?? 0,
            debtSummary?.OverduePayable ?? 0,
            debtSummary?.OverdueCount ?? 0,
            totalBalance + receivables - payables);

        return Result.Success(new DashboardResponse(
            currency,
            month.Year,
            month.Month,
            settings.TimeZone,
            month.StartUtc,
            month.EndUtc,
            totalBalance,
            monthlyIncome,
            monthlyExpense,
            monthlyIncome - monthlyExpense,
            dailyAverage,
            daysElapsed,
            budgetSummary,
            breakdown,
            recent,
            selected,
            selected.Where(item => item.Balance < 0).ToList(),
            otherCurrencies,
            availableCurrencies,
            position));
    }
}
