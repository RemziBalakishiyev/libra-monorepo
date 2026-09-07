using Libra.Application.Common;
using Libra.Domain.Finance;
using Microsoft.EntityFrameworkCore;

namespace Libra.Application.Finance.Budgets;

public sealed class BudgetsHandler(ILibraDbContext db, BudgetUsageCalculator usage, TimeProvider clock)
{
    public async Task<IReadOnlyList<BudgetResponse>> ListAsync(Guid userId, BudgetListQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var currency = query.CurrencyCode is null ? null : Money.NormalizeCurrencyCode(query.CurrencyCode);
        var budgets = await db.MonthlyBudgets
            .AsNoTracking()
            .Where(budget => budget.UserId == userId
                && (query.Year == null || budget.Year == query.Year)
                && (query.Month == null || budget.Month == query.Month)
                && (currency == null || budget.CurrencyCode == currency))
            .OrderByDescending(budget => budget.Year)
            .ThenByDescending(budget => budget.Month)
            .ThenBy(budget => budget.CurrencyCode)
            .ThenBy(budget => budget.CategoryId == null ? 0 : 1)
            .ThenBy(budget => budget.Id)
            .ToListAsync(cancellationToken);

        return await MapAsync(userId, budgets, cancellationToken);
    }

    public async Task<Result<BudgetResponse>> GetAsync(Guid userId, Guid budgetId, CancellationToken cancellationToken)
    {
        var budget = await db.MonthlyBudgets
            .AsNoTracking()
            .SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == budgetId, cancellationToken);
        if (budget is null)
        {
            return Result.NotFound<BudgetResponse>(FinanceErrors.BudgetNotFound);
        }

        var mapped = await MapAsync(userId, [budget], cancellationToken);
        return Result.Success(mapped[0]);
    }

    public async Task<Result<BudgetResponse>> CreateAsync(Guid userId, CreateBudgetCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var currency = Money.NormalizeCurrencyCode(command.CurrencyCode);

        if (command.CategoryId is Guid categoryId)
        {
            var category = await db.FinanceCategories
                .AsNoTracking()
                .SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == categoryId, cancellationToken);
            if (category is null)
            {
                return Result.NotFound<BudgetResponse>(FinanceErrors.CategoryNotFound);
            }

            if (category.Kind != FinanceCategoryKind.Expense || category.IsArchived)
            {
                return Result.Conflict<BudgetResponse>(FinanceErrors.BudgetCategoryNotExpense);
            }
        }

        var exists = await db.MonthlyBudgets.AnyAsync(
            candidate => candidate.UserId == userId
                && candidate.Year == command.Year
                && candidate.Month == command.Month
                && candidate.CurrencyCode == currency
                && candidate.CategoryId == command.CategoryId,
            cancellationToken);
        if (exists)
        {
            return Result.Conflict<BudgetResponse>(FinanceErrors.BudgetExists);
        }

        var budget = MonthlyBudget.Create(userId, command.Year, command.Month, currency, command.CategoryId, command.Amount, clock.GetUtcNow().UtcDateTime);
        db.MonthlyBudgets.Add(budget);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (exception.IsUniqueViolation())
        {
            return Result.Conflict<BudgetResponse>(FinanceErrors.BudgetExists);
        }

        var mapped = await MapAsync(userId, [budget], cancellationToken);
        return Result.Success(mapped[0]);
    }

    public async Task<Result<BudgetResponse>> UpdateAsync(Guid userId, Guid budgetId, UpdateBudgetCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var budget = await db.MonthlyBudgets
            .SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == budgetId, cancellationToken);
        if (budget is null)
        {
            return Result.NotFound<BudgetResponse>(FinanceErrors.BudgetNotFound);
        }

        budget.ChangeAmount(command.Amount, clock.GetUtcNow().UtcDateTime);
        await db.SaveChangesAsync(cancellationToken);

        var mapped = await MapAsync(userId, [budget], cancellationToken);
        return Result.Success(mapped[0]);
    }

    public async Task<Result<bool>> DeleteAsync(Guid userId, Guid budgetId, CancellationToken cancellationToken)
    {
        var budget = await db.MonthlyBudgets
            .SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == budgetId, cancellationToken);
        if (budget is null)
        {
            return Result.NotFound<bool>(FinanceErrors.BudgetNotFound);
        }

        db.MonthlyBudgets.Remove(budget);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success(true);
    }

    private async Task<IReadOnlyList<BudgetResponse>> MapAsync(Guid userId, List<MonthlyBudget> budgets, CancellationToken cancellationToken)
    {
        if (budgets.Count == 0)
        {
            return [];
        }

        var settings = await UserFinanceSettings.LoadAsync(db, userId, cancellationToken);

        var categoryIds = budgets.Where(budget => budget.CategoryId != null).Select(budget => budget.CategoryId!.Value).Distinct().ToList();
        var categoryNames = categoryIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await db.FinanceCategories
                .AsNoTracking()
                .Where(category => category.UserId == userId && categoryIds.Contains(category.Id))
                .ToDictionaryAsync(category => category.Id, category => category.Name, cancellationToken);

        var responses = new List<BudgetResponse>(budgets.Count);
        foreach (var period in budgets.GroupBy(budget => (budget.Year, budget.Month)))
        {
            var month = LocalCalendar.Month(settings.TimeZone, period.Key.Year, period.Key.Month);
            var expenses = await usage.ExpenseByCategoryAsync(userId, month, cancellationToken);

            foreach (var budget in period)
            {
                var use = BudgetUsageCalculator.UsageFor(budget, expenses);
                responses.Add(new BudgetResponse(
                    budget.Id,
                    budget.Year,
                    budget.Month,
                    budget.CurrencyCode,
                    budget.CategoryId,
                    budget.CategoryId is Guid categoryId ? categoryNames.GetValueOrDefault(categoryId) : null,
                    budget.Amount,
                    use.UsedAmount,
                    use.RemainingAmount,
                    use.UsagePercent,
                    use.IsOverBudget,
                    budget.CreatedAtUtc,
                    budget.UpdatedAtUtc));
            }
        }

        // Preserve the original ordering of the query.
        var order = budgets.Select((budget, index) => (budget.Id, index)).ToDictionary(pair => pair.Id, pair => pair.index);
        return responses.OrderBy(response => order[response.Id]).ToList();
    }
}
