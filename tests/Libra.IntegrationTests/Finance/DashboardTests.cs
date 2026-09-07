using System.Net.Http.Json;
using Libra.Application.Identity;
using Libra.Application.Identity.Profile;
using Libra.Domain.Finance;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Finance;

[Collection(LibraApiCollection.Name)]
public sealed class DashboardTests(LibraApiFactory factory)
{
    [Fact]
    public async Task Dashboard_groups_by_currency_and_never_mixes_them()
    {
        using var client = await factory.NewUserClientAsync("dash");
        var azn = (await client.SetupAsync(openingBalance: 100m)).Accounts.Single();
        var savings = await client.CreateAccountAsync("Yığım", openingBalance: 900m, type: FinancialAccountType.Savings, includedInTotal: false);
        var usd = await client.CreateAccountAsync("USD", currency: "USD", openingBalance: 40m);
        var eur = await client.CreateAccountAsync("EUR", currency: "EUR", openingBalance: 15m);
        var salary = await client.CategoryAsync(FinanceCategoryKind.Income);
        var market = await client.CategoryAsync(FinanceCategoryKind.Expense, "Market");
        var home = await client.CategoryAsync(FinanceCategoryKind.Expense, "Ev");

        await client.AddTransactionAsync(azn.Id, salary.Id, FinancialTransactionType.Income, 300m);
        await client.AddTransactionAsync(azn.Id, market.Id, FinancialTransactionType.Expense, 60m);
        await client.AddTransactionAsync(azn.Id, home.Id, FinancialTransactionType.Expense, 40m);
        await client.AddTransactionAsync(usd.Id, market.Id, FinancialTransactionType.Expense, 10m);

        var dashboard = await client.DashboardAsync();

        Assert.Equal("AZN", dashboard.CurrencyCode);
        Assert.Equal("Asia/Baku", dashboard.TimeZone);
        Assert.Equal(300m, dashboard.TotalBalance); // savings excluded from the total, USD/EUR never added
        Assert.Equal(300m, dashboard.MonthlyIncome);
        Assert.Equal(100m, dashboard.MonthlyExpense);
        Assert.Equal(200m, dashboard.MonthlyNet);
        Assert.True(dashboard.DaysElapsed >= 1);
        Assert.Equal(decimal.Round(100m / dashboard.DaysElapsed, 2), dashboard.DailyAverageExpense);
        Assert.Null(dashboard.OverallBudget);

        Assert.Equal(["Market", "Ev"], dashboard.ExpenseByCategory.Select(item => item.CategoryName));
        Assert.Equal([60m, 40m], dashboard.ExpenseByCategory.Select(item => item.Amount));
        Assert.Equal([60m, 40m], dashboard.ExpenseByCategory.Select(item => item.Percent));

        Assert.Equal(3, dashboard.RecentTransactions.Count);
        Assert.All(dashboard.RecentTransactions, transaction => Assert.Equal("AZN", transaction.CurrencyCode));
        Assert.Equal(2, dashboard.Accounts.Count);
        Assert.Contains(dashboard.Accounts, account => account.AccountId == savings.Id && account.Balance == 900m && !account.IsIncludedInTotal);
        Assert.Empty(dashboard.NegativeAccounts);

        Assert.Equal(["EUR", "USD"], dashboard.OtherCurrencies.Select(total => total.CurrencyCode));
        Assert.Equal([15m, 30m], dashboard.OtherCurrencies.Select(total => total.TotalBalance));
        Assert.Equal(["AZN", "EUR", "USD"], dashboard.AvailableCurrencies);

        var usdDashboard = await client.DashboardAsync("usd");
        Assert.Equal("USD", usdDashboard.CurrencyCode);
        Assert.Equal(30m, usdDashboard.TotalBalance);
        Assert.Equal(10m, usdDashboard.MonthlyExpense);
        Assert.Single(usdDashboard.RecentTransactions);
        Assert.Contains(usdDashboard.OtherCurrencies, total => total.CurrencyCode == "AZN" && total.TotalBalance == 300m);
        Assert.DoesNotContain(usdDashboard.Accounts, account => account.AccountId == eur.Id);
    }

    [Fact]
    public async Task Dashboard_uses_the_preferred_currency_when_none_is_requested()
    {
        using var client = await factory.NewUserClientAsync("dash");
        await client.SetupAsync(currency: "USD", openingBalance: 5m);
        using var update = await client.PutAsJsonAsync("/api/profile", new UpdateProfileCommand(null, new PreferencesDto("Asia/Baku", "az-AZ", "USD")));
        update.EnsureSuccessStatusCode();

        var dashboard = await client.DashboardAsync();

        Assert.Equal("USD", dashboard.CurrencyCode);
        Assert.Equal(5m, dashboard.TotalBalance);
    }

    [Fact]
    public async Task Month_boundaries_follow_Asia_Baku_not_UTC()
    {
        using var client = await factory.NewUserClientAsync("dash");
        var cash = (await client.SetupAsync(openingBalance: 1000m)).Accounts.Single();
        var expense = await client.CategoryAsync(FinanceCategoryKind.Expense);

        // 2026-08-31 19:30Z is 23:30 on 31 August in Baku (UTC+4): August.
        await client.AddTransactionAsync(cash.Id, expense.Id, FinancialTransactionType.Expense, 11m, new DateTimeOffset(2026, 8, 31, 19, 30, 0, TimeSpan.Zero));
        // 2026-08-31 21:00Z is 01:00 on 1 September in Baku: September, even though UTC still says August.
        await client.AddTransactionAsync(cash.Id, expense.Id, FinancialTransactionType.Expense, 22m, new DateTimeOffset(2026, 8, 31, 21, 0, 0, TimeSpan.Zero));
        // 2026-09-30 20:00Z is exactly 00:00 on 1 October in Baku: October.
        await client.AddTransactionAsync(cash.Id, expense.Id, FinancialTransactionType.Expense, 33m, new DateTimeOffset(2026, 9, 30, 20, 0, 0, TimeSpan.Zero));

        var august = await client.DashboardAsync(year: 2026, month: 8);
        var september = await client.DashboardAsync(year: 2026, month: 9);
        var october = await client.DashboardAsync(year: 2026, month: 10);

        Assert.Equal(11m, august.MonthlyExpense);
        Assert.Equal(22m, september.MonthlyExpense);
        Assert.Equal(33m, october.MonthlyExpense);
        Assert.Equal(new DateTime(2026, 8, 31, 20, 0, 0, DateTimeKind.Utc), september.PeriodStartUtc);
        Assert.Equal(new DateTime(2026, 9, 30, 20, 0, 0, DateTimeKind.Utc), september.PeriodEndUtc);
        Assert.Equal(31, august.DaysElapsed); // past month: full length
    }
}
