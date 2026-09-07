using System.Net;
using System.Net.Http.Json;
using Libra.Application.Finance;
using Libra.Application.Finance.Accounts;
using Libra.Application.Finance.Transactions;
using Libra.Application.Finance.Transfers;
using Libra.Domain.Finance;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Finance;

[Collection(LibraApiCollection.Name)]
public sealed class AccountTests(LibraApiFactory factory)
{
    [Fact]
    public async Task Balance_is_opening_plus_income_minus_expense_plus_incoming_minus_outgoing_transfers()
    {
        using var client = await factory.NewUserClientAsync("acct");
        var setup = await client.SetupAsync(openingBalance: 100m);
        var cash = setup.Accounts.Single();
        var card = await client.CreateAccountAsync("Kart", openingBalance: 50m);
        var income = await client.CategoryAsync(FinanceCategoryKind.Income);
        var expense = await client.CategoryAsync(FinanceCategoryKind.Expense);

        await client.AddTransactionAsync(cash.Id, income.Id, FinancialTransactionType.Income, 200m);
        await client.AddTransactionAsync(cash.Id, expense.Id, FinancialTransactionType.Expense, 30.25m);
        await client.AddTransferAsync(cash.Id, card.Id, 70m);
        await client.AddTransferAsync(card.Id, cash.Id, 10m);

        var cashAfter = await client.GetAccountAsync(cash.Id);
        var cardAfter = await client.GetAccountAsync(card.Id);

        Assert.Equal(100m + 200m - 30.25m - 70m + 10m, cashAfter.CurrentBalance);
        Assert.Equal(50m + 70m - 10m, cardAfter.CurrentBalance);
        Assert.True(cashAfter.HasActivity);
        Assert.True(cardAfter.HasActivity);
    }

    [Fact]
    public async Task Negative_balances_are_allowed_and_reported()
    {
        using var client = await factory.NewUserClientAsync("acct");
        var cash = (await client.SetupAsync(openingBalance: 10m)).Accounts.Single();
        var expense = await client.CategoryAsync(FinanceCategoryKind.Expense);

        await client.AddTransactionAsync(cash.Id, expense.Id, FinancialTransactionType.Expense, 25m);

        var after = await client.GetAccountAsync(cash.Id);
        Assert.Equal(-15m, after.CurrentBalance);

        var dashboard = await client.DashboardAsync();
        Assert.Contains(dashboard.NegativeAccounts, account => account.AccountId == cash.Id && account.Balance == -15m);
    }

    [Fact]
    public async Task Currency_and_opening_balance_are_editable_until_activity_exists()
    {
        using var client = await factory.NewUserClientAsync("acct");
        var cash = (await client.SetupAsync(openingBalance: 10m)).Accounts.Single();

        using var before = await client.PutAsJsonAsync($"{FinanceTestClient.Accounts}/{cash.Id}",
            new UpdateAccountCommand("Cash USD", FinancialAccountType.Cash, "usd", 42m, true, false));
        var updated = await before.Content.ReadFromJsonAsync<AccountResponse>();
        Assert.Equal(HttpStatusCode.OK, before.StatusCode);
        Assert.Equal("USD", updated!.CurrencyCode);
        Assert.Equal(42m, updated.OpeningBalance);
        Assert.Equal(42m, updated.CurrentBalance);

        var income = await client.CategoryAsync(FinanceCategoryKind.Income);
        await client.AddTransactionAsync(cash.Id, income.Id, FinancialTransactionType.Income, 1m);

        using var currencyChange = await client.PutAsJsonAsync($"{FinanceTestClient.Accounts}/{cash.Id}",
            new UpdateAccountCommand("Cash USD", FinancialAccountType.Cash, "EUR", 42m, true, false));
        Assert.Equal(HttpStatusCode.Conflict, currencyChange.StatusCode);

        using var openingChange = await client.PutAsJsonAsync($"{FinanceTestClient.Accounts}/{cash.Id}",
            new UpdateAccountCommand("Cash USD", FinancialAccountType.Cash, "USD", 43m, true, false));
        Assert.Equal(HttpStatusCode.Conflict, openingChange.StatusCode);

        // Renaming and toggling inclusion still works with activity.
        using var rename = await client.PutAsJsonAsync($"{FinanceTestClient.Accounts}/{cash.Id}",
            new UpdateAccountCommand("Renamed", FinancialAccountType.Savings, "USD", 42m, false, false));
        Assert.Equal(HttpStatusCode.OK, rename.StatusCode);
    }

    [Fact]
    public async Task Archived_accounts_reject_new_activity_and_can_be_restored()
    {
        using var client = await factory.NewUserClientAsync("acct");
        var cash = (await client.SetupAsync()).Accounts.Single();
        var card = await client.CreateAccountAsync("Kart");
        var expense = await client.CategoryAsync(FinanceCategoryKind.Expense);

        using var archive = await client.PutAsJsonAsync($"{FinanceTestClient.Accounts}/{card.Id}",
            new UpdateAccountCommand(card.Name, card.Type, card.CurrencyCode, card.OpeningBalance, true, true));
        Assert.Equal(HttpStatusCode.OK, archive.StatusCode);

        using var transaction = await client.PostAsJsonAsync(FinanceTestClient.Transactions,
            new CreateTransactionCommand(card.Id, expense.Id, FinancialTransactionType.Expense, 1m, DateTimeOffset.UtcNow, null, null));
        Assert.Equal(HttpStatusCode.Conflict, transaction.StatusCode);

        using var transfer = await client.PostAsJsonAsync(FinanceTestClient.Transfers,
            new CreateTransferCommand(cash.Id, card.Id, 1m, 1m, DateTimeOffset.UtcNow, null, null));
        Assert.Equal(HttpStatusCode.Conflict, transfer.StatusCode);

        var visible = (await client.GetFromJsonAsync<List<AccountResponse>>(FinanceTestClient.Accounts))!;
        Assert.DoesNotContain(visible, account => account.Id == card.Id);
        var all = (await client.GetFromJsonAsync<List<AccountResponse>>($"{FinanceTestClient.Accounts}?includeArchived=true"))!;
        Assert.Contains(all, account => account.Id == card.Id && account.IsArchived);

        using var restore = await client.PutAsJsonAsync($"{FinanceTestClient.Accounts}/{card.Id}",
            new UpdateAccountCommand(card.Name, card.Type, card.CurrencyCode, card.OpeningBalance, true, false));
        Assert.Equal(HttpStatusCode.OK, restore.StatusCode);
        await client.AddTransactionAsync(card.Id, expense.Id, FinancialTransactionType.Expense, 1m);
    }

    [Fact]
    public async Task Accounts_with_activity_cannot_be_deleted_but_empty_ones_can()
    {
        using var client = await factory.NewUserClientAsync("acct");
        var cash = (await client.SetupAsync()).Accounts.Single();
        var card = await client.CreateAccountAsync("Kart");
        var expense = await client.CategoryAsync(FinanceCategoryKind.Expense);
        await client.AddTransactionAsync(cash.Id, expense.Id, FinancialTransactionType.Expense, 1m);

        using var deleteActive = await client.DeleteAsync($"{FinanceTestClient.Accounts}/{cash.Id}");
        Assert.Equal(HttpStatusCode.Conflict, deleteActive.StatusCode);

        using var deleteEmpty = await client.DeleteAsync($"{FinanceTestClient.Accounts}/{card.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleteEmpty.StatusCode);

        using var gone = await client.GetAsync($"{FinanceTestClient.Accounts}/{card.Id}");
        Assert.Equal(HttpStatusCode.NotFound, gone.StatusCode);
    }

    [Fact]
    public async Task Account_creation_validates_name_currency_and_scale()
    {
        using var client = await factory.NewUserClientAsync("acct");

        using var badCurrency = await client.PostAsJsonAsync(FinanceTestClient.Accounts, new CreateAccountCommand("X", FinancialAccountType.Cash, "AZNN", 0m));
        using var badScale = await client.PostAsJsonAsync(FinanceTestClient.Accounts, new CreateAccountCommand("X", FinancialAccountType.Cash, "AZN", 1.005m));
        using var badName = await client.PostAsJsonAsync(FinanceTestClient.Accounts, new CreateAccountCommand(new string('n', 101), FinancialAccountType.Cash, "AZN", 0m));
        using var negativeOpening = await client.PostAsJsonAsync(FinanceTestClient.Accounts, new CreateAccountCommand("Overdraft", FinancialAccountType.BankAccount, "azn", -120.50m));

        Assert.Equal(HttpStatusCode.BadRequest, badCurrency.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, badScale.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, badName.StatusCode);
        Assert.Equal(HttpStatusCode.Created, negativeOpening.StatusCode);
        var created = await negativeOpening.Content.ReadFromJsonAsync<AccountResponse>();
        Assert.Equal("AZN", created!.CurrencyCode);
        Assert.Equal(-120.50m, created.CurrentBalance);
    }
}
