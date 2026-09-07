using System.Net;
using System.Net.Http.Json;
using Libra.Application.Common;
using Libra.Application.Finance;
using Libra.Application.Finance.Transfers;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Finance;

[Collection(LibraApiCollection.Name)]
public sealed class TransferTests(LibraApiFactory factory)
{
    [Fact]
    public async Task Same_currency_transfers_require_equal_amounts_and_distinct_accounts()
    {
        using var client = await factory.NewUserClientAsync("xfer");
        var cash = (await client.SetupAsync(openingBalance: 100m)).Accounts.Single();
        var card = await client.CreateAccountAsync("Kart");

        using var unequal = await client.PostAsJsonAsync(FinanceTestClient.Transfers,
            new CreateTransferCommand(cash.Id, card.Id, 10m, 9m, DateTimeOffset.UtcNow, null, null));
        using var same = await client.PostAsJsonAsync(FinanceTestClient.Transfers,
            new CreateTransferCommand(cash.Id, cash.Id, 10m, 10m, DateTimeOffset.UtcNow, null, null));
        using var zero = await client.PostAsJsonAsync(FinanceTestClient.Transfers,
            new CreateTransferCommand(cash.Id, card.Id, 0m, 0m, DateTimeOffset.UtcNow, null, null));

        Assert.Equal(HttpStatusCode.BadRequest, unequal.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, same.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, zero.StatusCode);
    }

    [Fact]
    public async Task Cross_currency_transfer_uses_both_amounts_and_reports_an_effective_rate()
    {
        using var client = await factory.NewUserClientAsync("xfer");
        var azn = (await client.SetupAsync(openingBalance: 1000m)).Accounts.Single();
        var usd = await client.CreateAccountAsync("USD kart", currency: "USD", openingBalance: 0m);

        var transfer = await client.AddTransferAsync(azn.Id, usd.Id, 170m, 100m);

        Assert.Equal(170m, transfer.SourceAmount);
        Assert.Equal(100m, transfer.DestinationAmount);
        Assert.Equal("AZN", transfer.SourceCurrencyCode);
        Assert.Equal("USD", transfer.DestinationCurrencyCode);
        Assert.Equal(0.588235m, transfer.EffectiveRate);
        Assert.Equal(830m, (await client.GetAccountAsync(azn.Id)).CurrentBalance);
        Assert.Equal(100m, (await client.GetAccountAsync(usd.Id)).CurrentBalance);

        var sameCurrency = await client.AddTransferAsync(usd.Id, usd.Id == azn.Id ? usd.Id : (await client.CreateAccountAsync("USD 2", currency: "USD")).Id, 10m);
        Assert.Null(sameCurrency.EffectiveRate);
    }

    [Fact]
    public async Task Transfers_never_count_as_income_expense_or_budget_usage()
    {
        using var client = await factory.NewUserClientAsync("xfer");
        var cash = (await client.SetupAsync(openingBalance: 500m)).Accounts.Single();
        var card = await client.CreateAccountAsync("Kart");
        var (year, month) = FinanceTestClient.CurrentBakuMonth();
        var budget = await client.AddBudgetAsync(year, month, 300m);

        await client.AddTransferAsync(cash.Id, card.Id, 200m);

        var dashboard = await client.DashboardAsync();
        Assert.Equal(0m, dashboard.MonthlyIncome);
        Assert.Equal(0m, dashboard.MonthlyExpense);
        Assert.Equal(0m, dashboard.MonthlyNet);
        Assert.Equal(500m, dashboard.TotalBalance);
        Assert.NotNull(dashboard.OverallBudget);
        Assert.Equal(0m, dashboard.OverallBudget.UsedAmount);

        var budgetAfter = (await client.GetFromJsonAsync<BudgetResponse>($"{FinanceTestClient.Budgets}/{budget.Id}"))!;
        Assert.Equal(0m, budgetAfter.UsedAmount);
        Assert.Equal(300m, budgetAfter.RemainingAmount);

        var transactions = (await client.GetFromJsonAsync<PagedResponse<TransactionResponse>>(FinanceTestClient.Transactions))!;
        Assert.Empty(transactions.Items);
    }

    [Fact]
    public async Task Transfers_are_idempotent_by_client_request_id_and_can_be_updated_and_deleted()
    {
        using var client = await factory.NewUserClientAsync("xfer");
        var cash = (await client.SetupAsync(openingBalance: 100m)).Accounts.Single();
        var card = await client.CreateAccountAsync("Kart");
        var requestId = Guid.NewGuid();
        var command = new CreateTransferCommand(cash.Id, card.Id, 25m, 25m, DateTimeOffset.UtcNow, null, requestId);

        using var first = await client.PostAsJsonAsync(FinanceTestClient.Transfers, command);
        using var second = await client.PostAsJsonAsync(FinanceTestClient.Transfers, command);
        var created = (await first.Content.ReadFromJsonAsync<TransferResponse>())!;
        var replayed = (await second.Content.ReadFromJsonAsync<TransferResponse>())!;

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal(created.Id, replayed.Id);
        Assert.Equal(75m, (await client.GetAccountAsync(cash.Id)).CurrentBalance);

        using var update = await client.PutAsJsonAsync($"{FinanceTestClient.Transfers}/{created.Id}",
            new UpdateTransferCommand(card.Id, cash.Id, 10m, 10m, DateTimeOffset.UtcNow, "reversed"));
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.Equal(110m, (await client.GetAccountAsync(cash.Id)).CurrentBalance);
        Assert.Equal(-10m, (await client.GetAccountAsync(card.Id)).CurrentBalance);

        using var delete = await client.DeleteAsync($"{FinanceTestClient.Transfers}/{created.Id}");
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);
        Assert.Equal(100m, (await client.GetAccountAsync(cash.Id)).CurrentBalance);
        Assert.Equal(0m, (await client.GetAccountAsync(card.Id)).CurrentBalance);

        var list = (await client.GetFromJsonAsync<PagedResponse<TransferResponse>>(FinanceTestClient.Transfers))!;
        Assert.Empty(list.Items);
    }
}
