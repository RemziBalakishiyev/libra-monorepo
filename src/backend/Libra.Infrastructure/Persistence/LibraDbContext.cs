using Libra.Application.Common;
using Libra.Domain.Finance;
using Libra.Domain.Identity;
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

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);

        modelBuilder.ApplyConfigurationsFromAssembly(typeof(LibraDbContext).Assembly);
    }
}
