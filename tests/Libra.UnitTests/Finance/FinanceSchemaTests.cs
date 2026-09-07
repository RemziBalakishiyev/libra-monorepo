using Libra.Domain.Finance;
using Libra.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;

namespace Libra.UnitTests.Finance;

/// <summary>Database constraints must mirror the application invariants (built from the EF model, no connection).</summary>
public sealed class FinanceSchemaTests
{
    private static readonly LibraDbContext Context = new(
        new DbContextOptionsBuilder<LibraDbContext>()
            .UseNpgsql("Host=localhost;Database=model-only")
            .UseSnakeCaseNamingConvention()
            .Options);

    /// <summary>The design-time model keeps check constraints and provider annotations that the runtime model drops.</summary>
    private static readonly IModel Model = Context.GetService<IDesignTimeModel>().Model;

    [Theory]
    [InlineData(typeof(FinancialAccount), "ck_financial_accounts_type")]
    [InlineData(typeof(FinancialAccount), "ck_financial_accounts_currency_length")]
    [InlineData(typeof(FinanceCategory), "ck_finance_categories_kind")]
    [InlineData(typeof(FinancialTransaction), "ck_financial_transactions_amount_positive")]
    [InlineData(typeof(FinancialTransaction), "ck_financial_transactions_type")]
    [InlineData(typeof(AccountTransfer), "ck_account_transfers_amounts_positive")]
    [InlineData(typeof(AccountTransfer), "ck_account_transfers_distinct_accounts")]
    [InlineData(typeof(MonthlyBudget), "ck_monthly_budgets_amount_positive")]
    [InlineData(typeof(MonthlyBudget), "ck_monthly_budgets_month")]
    [InlineData(typeof(MonthlyBudget), "ck_monthly_budgets_year")]
    public void Check_constraint_exists(Type entity, string name)
    {
        var constraints = Model.FindEntityType(entity)!.GetCheckConstraints().Select(constraint => constraint.Name);

        Assert.Contains(name, constraints);
    }

    [Theory]
    [InlineData(typeof(FinancialAccount), nameof(FinancialAccount.OpeningBalance))]
    [InlineData(typeof(FinancialTransaction), nameof(FinancialTransaction.Amount))]
    [InlineData(typeof(AccountTransfer), nameof(AccountTransfer.SourceAmount))]
    [InlineData(typeof(AccountTransfer), nameof(AccountTransfer.DestinationAmount))]
    [InlineData(typeof(MonthlyBudget), nameof(MonthlyBudget.Amount))]
    public void Money_columns_are_numeric_18_2(Type entity, string property)
    {
        var column = Model.FindEntityType(entity)!.FindProperty(property)!;

        Assert.Equal(typeof(decimal), column.ClrType);
        Assert.Equal(18, column.GetPrecision());
        Assert.Equal(2, column.GetScale());
    }

    [Fact]
    public void Unique_indexes_protect_idempotency_and_budget_scope()
    {
        var transactionIndexes = Model.FindEntityType(typeof(FinancialTransaction))!.GetIndexes().ToList();
        Assert.Contains(transactionIndexes, index => index.IsUnique && index.GetFilter() == "client_request_id IS NOT NULL");

        var transferIndexes = Model.FindEntityType(typeof(AccountTransfer))!.GetIndexes().ToList();
        Assert.Contains(transferIndexes, index => index.IsUnique && index.GetFilter() == "client_request_id IS NOT NULL");

        var budgetIndexes = Model.FindEntityType(typeof(MonthlyBudget))!.GetIndexes().ToList();
        var scope = Assert.Single(budgetIndexes, index => index.IsUnique);
        Assert.Equal(
            ["UserId", "Year", "Month", "CurrencyCode", "CategoryId"],
            scope.Properties.Select(property => property.Name));
        Assert.Equal(false, scope["Npgsql:NullsDistinct"]);

        var categoryIndexes = Model.FindEntityType(typeof(FinanceCategory))!.GetIndexes().ToList();
        Assert.Contains(categoryIndexes, index => index.IsUnique && index.Properties.Select(property => property.Name).SequenceEqual(["UserId", "Kind", "Name"]));
    }

    [Fact]
    public void Activity_foreign_keys_restrict_account_and_category_deletion()
    {
        var transaction = Model.FindEntityType(typeof(FinancialTransaction))!;
        var transfer = Model.FindEntityType(typeof(AccountTransfer))!;
        var budget = Model.FindEntityType(typeof(MonthlyBudget))!;

        Assert.All(transaction.GetForeignKeys().Where(key => key.PrincipalEntityType.ClrType != typeof(Libra.Domain.Identity.User)),
            key => Assert.Equal(DeleteBehavior.Restrict, key.DeleteBehavior));
        Assert.All(transfer.GetForeignKeys().Where(key => key.PrincipalEntityType.ClrType != typeof(Libra.Domain.Identity.User)),
            key => Assert.Equal(DeleteBehavior.Restrict, key.DeleteBehavior));
        Assert.All(budget.GetForeignKeys().Where(key => key.PrincipalEntityType.ClrType != typeof(Libra.Domain.Identity.User)),
            key => Assert.Equal(DeleteBehavior.Restrict, key.DeleteBehavior));
    }
}
