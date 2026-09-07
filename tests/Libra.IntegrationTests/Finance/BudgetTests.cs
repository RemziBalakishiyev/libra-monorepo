using System.Net;
using System.Net.Http.Json;
using Libra.Application.Finance;
using Libra.Application.Finance.Budgets;
using Libra.Domain.Finance;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Finance;

[Collection(LibraApiCollection.Name)]
public sealed class BudgetTests(LibraApiFactory factory)
{
    [Fact]
    public async Task Budget_scope_is_unique_per_month_currency_and_category()
    {
        using var client = await factory.NewUserClientAsync("budget");
        await client.SetupAsync();
        var market = await client.CategoryAsync(FinanceCategoryKind.Expense, "Market");
        var (year, month) = FinanceTestClient.CurrentBakuMonth();

        await client.AddBudgetAsync(year, month, 1000m);
        await client.AddBudgetAsync(year, month, 300m, categoryId: market.Id);
        await client.AddBudgetAsync(year, month, 500m, currency: "USD");

        using var duplicateOverall = await client.PostAsJsonAsync(FinanceTestClient.Budgets, new CreateBudgetCommand(year, month, "azn", null, 1m));
        using var duplicateCategory = await client.PostAsJsonAsync(FinanceTestClient.Budgets, new CreateBudgetCommand(year, month, "AZN", market.Id, 1m));

        Assert.Equal(HttpStatusCode.Conflict, duplicateOverall.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, duplicateCategory.StatusCode);

        var list = (await client.GetFromJsonAsync<List<BudgetResponse>>($"{FinanceTestClient.Budgets}?year={year}&month={month}"))!;
        Assert.Equal(3, list.Count);
    }

    [Fact]
    public async Task Category_budgets_require_an_active_expense_category()
    {
        using var client = await factory.NewUserClientAsync("budget");
        await client.SetupAsync();
        var income = await client.CategoryAsync(FinanceCategoryKind.Income);
        var (year, month) = FinanceTestClient.CurrentBakuMonth();

        using var incomeBudget = await client.PostAsJsonAsync(FinanceTestClient.Budgets, new CreateBudgetCommand(year, month, "AZN", income.Id, 10m));
        using var badMonth = await client.PostAsJsonAsync(FinanceTestClient.Budgets, new CreateBudgetCommand(year, 13, "AZN", null, 10m));
        using var badAmount = await client.PostAsJsonAsync(FinanceTestClient.Budgets, new CreateBudgetCommand(year, month, "AZN", null, 0m));

        Assert.Equal(HttpStatusCode.Conflict, incomeBudget.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, badMonth.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, badAmount.StatusCode);
    }

    [Fact]
    public async Task Usage_remaining_percent_and_over_budget_follow_same_currency_expenses_only()
    {
        using var client = await factory.NewUserClientAsync("budget");
        var cash = (await client.SetupAsync(openingBalance: 1000m)).Accounts.Single();
        var usd = await client.CreateAccountAsync("USD", currency: "USD", openingBalance: 100m);
        var market = await client.CategoryAsync(FinanceCategoryKind.Expense, "Market");
        var home = await client.CategoryAsync(FinanceCategoryKind.Expense, "Ev");
        var salary = await client.CategoryAsync(FinanceCategoryKind.Income);
        var (year, month) = FinanceTestClient.CurrentBakuMonth();
        var overall = await client.AddBudgetAsync(year, month, 200m);
        var marketBudget = await client.AddBudgetAsync(year, month, 50m, categoryId: market.Id);

        await client.AddTransactionAsync(cash.Id, market.Id, FinancialTransactionType.Expense, 80m);
        await client.AddTransactionAsync(cash.Id, home.Id, FinancialTransactionType.Expense, 70m);
        await client.AddTransactionAsync(cash.Id, salary.Id, FinancialTransactionType.Income, 500m);
        await client.AddTransactionAsync(usd.Id, market.Id, FinancialTransactionType.Expense, 30m); // other currency, ignored

        var overallAfter = (await client.GetFromJsonAsync<BudgetResponse>($"{FinanceTestClient.Budgets}/{overall.Id}"))!;
        var marketAfter = (await client.GetFromJsonAsync<BudgetResponse>($"{FinanceTestClient.Budgets}/{marketBudget.Id}"))!;

        Assert.Equal(150m, overallAfter.UsedAmount);
        Assert.Equal(50m, overallAfter.RemainingAmount);
        Assert.Equal(75m, overallAfter.UsagePercent);
        Assert.False(overallAfter.IsOverBudget);

        Assert.Equal(80m, marketAfter.UsedAmount);
        Assert.Equal(-30m, marketAfter.RemainingAmount);
        Assert.Equal(160m, marketAfter.UsagePercent);
        Assert.True(marketAfter.IsOverBudget);
        Assert.Equal("Market", marketAfter.CategoryName);

        using var raise = await client.PutAsJsonAsync($"{FinanceTestClient.Budgets}/{marketBudget.Id}", new UpdateBudgetCommand(100m));
        var raised = await raise.Content.ReadFromJsonAsync<BudgetResponse>();
        Assert.Equal(HttpStatusCode.OK, raise.StatusCode);
        Assert.Equal(20m, raised!.RemainingAmount);
        Assert.False(raised.IsOverBudget);

        using var delete = await client.DeleteAsync($"{FinanceTestClient.Budgets}/{marketBudget.Id}");
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);
        var remaining = (await client.GetFromJsonAsync<List<BudgetResponse>>(FinanceTestClient.Budgets))!;
        Assert.Single(remaining);
    }
}
