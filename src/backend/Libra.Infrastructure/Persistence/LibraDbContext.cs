using Libra.Application.Common;
using Libra.Domain.Finance;
using Libra.Domain.Identity;
using Libra.Domain.Nutrition;
using Libra.Domain.Sleep;
using Libra.Domain.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Libra.Infrastructure.Persistence;

/// <summary>
/// Single EF Core context for the modular monolith. Module entity configurations are discovered from this assembly.
/// Table and column names are snake_case via EFCore.NamingConventions (see DependencyInjection).
/// </summary>
public sealed class LibraDbContext(DbContextOptions<LibraDbContext> options) : DbContext(options), ILibraDbContext
{
    public DbSet<User> Users => Set<User>();

    public DbSet<UserPreference> UserPreferences => Set<UserPreference>();

    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    public DbSet<FinancialAccount> FinancialAccounts => Set<FinancialAccount>();

    public DbSet<FinanceCategory> FinanceCategories => Set<FinanceCategory>();

    public DbSet<FinancialTransaction> FinancialTransactions => Set<FinancialTransaction>();

    public DbSet<AccountTransfer> AccountTransfers => Set<AccountTransfer>();

    public DbSet<MonthlyBudget> MonthlyBudgets => Set<MonthlyBudget>();

    public DbSet<RecurringTransaction> RecurringTransactions => Set<RecurringTransaction>();

    public DbSet<RecurringOccurrence> RecurringOccurrences => Set<RecurringOccurrence>();

    public DbSet<Debt> Debts => Set<Debt>();

    public DbSet<DebtMovement> DebtMovements => Set<DebtMovement>();

    public DbSet<NutritionEntry> NutritionEntries => Set<NutritionEntry>();

    public DbSet<NutritionEntryItem> NutritionEntryItems => Set<NutritionEntryItem>();

    public DbSet<NutritionGoal> NutritionGoals => Set<NutritionGoal>();

    public DbSet<FoodAnalysisDraft> FoodAnalysisDrafts => Set<FoodAnalysisDraft>();

    public DbSet<FoodAnalysisItem> FoodAnalysisItems => Set<FoodAnalysisItem>();

    public DbSet<FoodAnalysisImage> FoodAnalysisImages => Set<FoodAnalysisImage>();

    public DbSet<TaskItem> Tasks => Set<TaskItem>();

    public DbSet<TaskSeries> TaskSeries => Set<TaskSeries>();

    public DbSet<TaskCompletionEvent> TaskCompletionEvents => Set<TaskCompletionEvent>();

    public DbSet<SleepSession> SleepSessions => Set<SleepSession>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);

        modelBuilder.ApplyConfigurationsFromAssembly(typeof(LibraDbContext).Assembly);
    }
}
