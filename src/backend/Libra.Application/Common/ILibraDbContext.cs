using Libra.Domain.Finance;
using Libra.Domain.Identity;
using Libra.Domain.Nutrition;
using Libra.Domain.Sleep;
using Libra.Domain.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace Libra.Application.Common;

/// <summary>
/// Persistence surface used by use-case handlers. Implemented by the single EF Core context in Infrastructure.
/// Each module adds its own sets here; handlers must still filter every user-owned set by UserId.
/// </summary>
public interface ILibraDbContext
{
    DbSet<User> Users { get; }

    DbSet<UserPreference> UserPreferences { get; }

    DbSet<RefreshToken> RefreshTokens { get; }

    DbSet<FinancialAccount> FinancialAccounts { get; }

    DbSet<FinanceCategory> FinanceCategories { get; }

    DbSet<FinancialTransaction> FinancialTransactions { get; }

    DbSet<AccountTransfer> AccountTransfers { get; }

    DbSet<MonthlyBudget> MonthlyBudgets { get; }

    DbSet<RecurringTransaction> RecurringTransactions { get; }

    DbSet<RecurringOccurrence> RecurringOccurrences { get; }

    DbSet<Debt> Debts { get; }

    DbSet<DebtMovement> DebtMovements { get; }

    DbSet<NutritionEntry> NutritionEntries { get; }

    DbSet<NutritionEntryItem> NutritionEntryItems { get; }

    DbSet<NutritionGoal> NutritionGoals { get; }

    DbSet<FoodAnalysisDraft> FoodAnalysisDrafts { get; }

    DbSet<FoodAnalysisItem> FoodAnalysisItems { get; }

    DbSet<FoodAnalysisImage> FoodAnalysisImages { get; }

    DbSet<TaskItem> Tasks { get; }

    DbSet<TaskSeries> TaskSeries { get; }

    DbSet<TaskCompletionEvent> TaskCompletionEvents { get; }

    DbSet<SleepSession> SleepSessions { get; }

    /// <summary>Transactions and raw SQL (advisory locks). Use sparingly; most handlers need only SaveChanges.</summary>
    DatabaseFacade Database { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
