using Libra.Domain.Finance;

namespace Libra.UnitTests.Finance;

public sealed class FinanceDomainTests
{
    private static readonly DateTime Now = new(2026, 9, 5, 10, 0, 0, DateTimeKind.Utc);
    private static readonly Guid Owner = Guid.NewGuid();

    [Theory]
    [InlineData(0.01, true)]
    [InlineData(10, true)]
    [InlineData(1.005, false)]
    [InlineData(0, false)]
    [InlineData(-1, false)]
    public void Positive_amounts_need_at_most_two_decimals(decimal amount, bool expected)
    {
        Assert.Equal(expected, Money.IsPositiveAmount(amount));
    }

    [Theory]
    [InlineData(" azn ", "AZN")]
    [InlineData("usd", "USD")]
    public void Currency_codes_are_normalized(string input, string expected)
    {
        Assert.Equal(expected, Money.NormalizeCurrencyCode(input));
    }

    [Theory]
    [InlineData("AZ")]
    [InlineData("AZNN")]
    [InlineData("A1N")]
    public void Invalid_currency_codes_are_rejected(string input)
    {
        Assert.Throws<ArgumentException>(() => Money.NormalizeCurrencyCode(input));
    }

    [Fact]
    public void Transfer_rejects_same_account_and_unequal_same_currency_amounts()
    {
        var source = FinancialAccount.Create(Owner, "A", FinancialAccountType.Cash, "AZN", 0m, true, Now);
        var destination = FinancialAccount.Create(Owner, "B", FinancialAccountType.Cash, "AZN", 0m, true, Now);

        Assert.Throws<ArgumentException>(() => AccountTransfer.Create(Owner, source, source, 1m, 1m, Now, null, null, Now));
        Assert.Throws<ArgumentException>(() => AccountTransfer.Create(Owner, source, destination, 1m, 2m, Now, null, null, Now));

        var transfer = AccountTransfer.Create(Owner, source, destination, 1m, 1m, Now, "  note  ", null, Now);
        Assert.Equal("note", transfer.Note);
    }

    [Fact]
    public void Transfer_rejects_accounts_of_another_user()
    {
        var source = FinancialAccount.Create(Owner, "A", FinancialAccountType.Cash, "AZN", 0m, true, Now);
        var foreign = FinancialAccount.Create(Guid.NewGuid(), "B", FinancialAccountType.Cash, "AZN", 0m, true, Now);

        Assert.Throws<InvalidOperationException>(() => AccountTransfer.Create(Owner, source, foreign, 1m, 1m, Now, null, null, Now));
    }

    [Fact]
    public void Effective_rate_is_null_for_same_currency_and_rounded_otherwise()
    {
        Assert.Null(AccountTransfer.EffectiveRate("AZN", "AZN", 10m, 10m));
        Assert.Equal(0.588235m, AccountTransfer.EffectiveRate("AZN", "USD", 170m, 100m));
    }

    [Fact]
    public void Transaction_requires_matching_category_kind_and_owner()
    {
        var account = FinancialAccount.Create(Owner, "A", FinancialAccountType.Cash, "AZN", 0m, true, Now);
        var income = FinanceCategory.Create(Owner, "Maaş", FinanceCategoryKind.Income, true, Now);
        var foreignExpense = FinanceCategory.Create(Guid.NewGuid(), "Ev", FinanceCategoryKind.Expense, true, Now);

        Assert.Throws<InvalidOperationException>(() =>
            FinancialTransaction.Create(Owner, account, income, FinancialTransactionType.Expense, 1m, Now, null, null, Now));
        Assert.Throws<InvalidOperationException>(() =>
            FinancialTransaction.Create(Owner, account, foreignExpense, FinancialTransactionType.Expense, 1m, Now, null, null, Now));
        Assert.Throws<ArgumentException>(() =>
            FinancialTransaction.Create(Owner, account, income, FinancialTransactionType.Income, 1.001m, Now, null, null, Now));
    }

    [Fact]
    public void Budget_validates_period_and_amount()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => MonthlyBudget.Create(Owner, 2026, 13, "AZN", null, 1m, Now));
        Assert.Throws<ArgumentOutOfRangeException>(() => MonthlyBudget.Create(Owner, 1999, 1, "AZN", null, 1m, Now));
        Assert.Throws<ArgumentException>(() => MonthlyBudget.Create(Owner, 2026, 1, "AZN", null, 0m, Now));

        var budget = MonthlyBudget.Create(Owner, 2026, 1, "azn", null, 100m, Now);
        Assert.Equal("AZN", budget.CurrencyCode);
        Assert.True(budget.IsOverall);
    }
}
