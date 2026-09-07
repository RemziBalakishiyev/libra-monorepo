using System.Net;
using System.Net.Http.Json;
using Libra.Application.Common;
using Libra.Application.Finance;
using Libra.Application.Finance.Accounts;
using Libra.Application.Finance.Budgets;
using Libra.Application.Finance.Categories;
using Libra.Application.Finance.Transactions;
using Libra.Application.Finance.Transfers;
using Libra.Domain.Finance;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Finance;

[Collection(LibraApiCollection.Name)]
public sealed class FinanceAuthorizationTests(LibraApiFactory factory)
{
    public static TheoryData<string, string> Endpoints => new()
    {
        { "POST", FinanceTestClient.Setup },
        { "GET", FinanceTestClient.Accounts },
        { "POST", FinanceTestClient.Accounts },
        { "GET", $"{FinanceTestClient.Accounts}/{Guid.NewGuid()}" },
        { "PUT", $"{FinanceTestClient.Accounts}/{Guid.NewGuid()}" },
        { "DELETE", $"{FinanceTestClient.Accounts}/{Guid.NewGuid()}" },
        { "GET", FinanceTestClient.Categories },
        { "POST", FinanceTestClient.Categories },
        { "GET", $"{FinanceTestClient.Categories}/{Guid.NewGuid()}" },
        { "PUT", $"{FinanceTestClient.Categories}/{Guid.NewGuid()}" },
        { "DELETE", $"{FinanceTestClient.Categories}/{Guid.NewGuid()}" },
        { "GET", FinanceTestClient.Transactions },
        { "POST", FinanceTestClient.Transactions },
        { "GET", $"{FinanceTestClient.Transactions}/{Guid.NewGuid()}" },
        { "PUT", $"{FinanceTestClient.Transactions}/{Guid.NewGuid()}" },
        { "DELETE", $"{FinanceTestClient.Transactions}/{Guid.NewGuid()}" },
        { "GET", FinanceTestClient.Transfers },
        { "POST", FinanceTestClient.Transfers },
        { "GET", $"{FinanceTestClient.Transfers}/{Guid.NewGuid()}" },
        { "PUT", $"{FinanceTestClient.Transfers}/{Guid.NewGuid()}" },
        { "DELETE", $"{FinanceTestClient.Transfers}/{Guid.NewGuid()}" },
        { "GET", FinanceTestClient.Budgets },
        { "POST", FinanceTestClient.Budgets },
        { "GET", $"{FinanceTestClient.Budgets}/{Guid.NewGuid()}" },
        { "PUT", $"{FinanceTestClient.Budgets}/{Guid.NewGuid()}" },
        { "DELETE", $"{FinanceTestClient.Budgets}/{Guid.NewGuid()}" },
        { "GET", FinanceTestClient.Dashboard },
    };

    [Theory]
    [MemberData(nameof(Endpoints))]
    public async Task Every_finance_endpoint_requires_authentication(string method, string path)
    {
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(new HttpMethod(method), path);
        if (method is "POST" or "PUT")
        {
            request.Content = JsonContent.Create(new { });
        }

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Users_cannot_read_update_delete_or_reference_each_others_finance_data()
    {
        using var alice = await factory.NewUserClientAsync("alice");
        using var bob = await factory.NewUserClientAsync("bob");
        await alice.SetupAsync(openingBalance: 100m);
        await bob.SetupAsync();

        var aliceAccount = (await alice.GetFromJsonAsync<List<AccountResponse>>(FinanceTestClient.Accounts))!.Single();
        var aliceSecond = await alice.CreateAccountAsync("Kart");
        var aliceExpense = await alice.CategoryAsync(FinanceCategoryKind.Expense);
        var aliceTransaction = await alice.AddTransactionAsync(aliceAccount.Id, aliceExpense.Id, FinancialTransactionType.Expense, 10m);
        var aliceTransfer = await alice.AddTransferAsync(aliceAccount.Id, aliceSecond.Id, 5m);
        var (year, month) = FinanceTestClient.CurrentBakuMonth();
        var aliceBudget = await alice.AddBudgetAsync(year, month, 500m);

        // Bob sees none of it in lists.
        var bobAccounts = (await bob.GetFromJsonAsync<List<AccountResponse>>(FinanceTestClient.Accounts))!;
        Assert.DoesNotContain(bobAccounts, account => account.Id == aliceAccount.Id);
        var bobTransactions = (await bob.GetFromJsonAsync<PagedResponse<TransactionResponse>>(FinanceTestClient.Transactions))!;
        Assert.Empty(bobTransactions.Items);

        // Reads and mutations of Alice's records look absent to Bob.
        await AssertNotFound(bob, HttpMethod.Get, $"{FinanceTestClient.Accounts}/{aliceAccount.Id}");
        await AssertNotFound(bob, HttpMethod.Put, $"{FinanceTestClient.Accounts}/{aliceAccount.Id}", new UpdateAccountCommand("x", FinancialAccountType.Cash, "AZN", 0m, true, false));
        await AssertNotFound(bob, HttpMethod.Delete, $"{FinanceTestClient.Accounts}/{aliceAccount.Id}");
        await AssertNotFound(bob, HttpMethod.Get, $"{FinanceTestClient.Categories}/{aliceExpense.Id}");
        await AssertNotFound(bob, HttpMethod.Put, $"{FinanceTestClient.Categories}/{aliceExpense.Id}", new UpdateCategoryCommand("x", false));
        await AssertNotFound(bob, HttpMethod.Delete, $"{FinanceTestClient.Categories}/{aliceExpense.Id}");
        await AssertNotFound(bob, HttpMethod.Get, $"{FinanceTestClient.Transactions}/{aliceTransaction.Id}");
        await AssertNotFound(bob, HttpMethod.Delete, $"{FinanceTestClient.Transactions}/{aliceTransaction.Id}");
        await AssertNotFound(bob, HttpMethod.Get, $"{FinanceTestClient.Transfers}/{aliceTransfer.Id}");
        await AssertNotFound(bob, HttpMethod.Delete, $"{FinanceTestClient.Transfers}/{aliceTransfer.Id}");
        await AssertNotFound(bob, HttpMethod.Get, $"{FinanceTestClient.Budgets}/{aliceBudget.Id}");
        await AssertNotFound(bob, HttpMethod.Put, $"{FinanceTestClient.Budgets}/{aliceBudget.Id}", new UpdateBudgetCommand(1m));
        await AssertNotFound(bob, HttpMethod.Delete, $"{FinanceTestClient.Budgets}/{aliceBudget.Id}");

        // Bob cannot reference Alice's account or category in his own records.
        var bobExpense = await bob.CategoryAsync(FinanceCategoryKind.Expense);
        var bobAccount = bobAccounts.Single();
        await AssertNotFound(bob, HttpMethod.Post, FinanceTestClient.Transactions,
            new CreateTransactionCommand(aliceAccount.Id, bobExpense.Id, FinancialTransactionType.Expense, 1m, DateTimeOffset.UtcNow, null, null));
        await AssertNotFound(bob, HttpMethod.Post, FinanceTestClient.Transactions,
            new CreateTransactionCommand(bobAccount.Id, aliceExpense.Id, FinancialTransactionType.Expense, 1m, DateTimeOffset.UtcNow, null, null));
        await AssertNotFound(bob, HttpMethod.Post, FinanceTestClient.Transfers,
            new CreateTransferCommand(bobAccount.Id, aliceAccount.Id, 1m, 1m, DateTimeOffset.UtcNow, null, null));
        await AssertNotFound(bob, HttpMethod.Post, FinanceTestClient.Budgets,
            new CreateBudgetCommand(year, month, "AZN", aliceExpense.Id, 10m));
        await AssertNotFound(bob, HttpMethod.Put, $"{FinanceTestClient.Transactions}/{aliceTransaction.Id}",
            new UpdateTransactionCommand(bobAccount.Id, bobExpense.Id, FinancialTransactionType.Expense, 1m, DateTimeOffset.UtcNow, null));

        // Alice's data is untouched.
        var aliceAfter = await alice.GetAccountAsync(aliceAccount.Id);
        Assert.Equal(85m, aliceAfter.CurrentBalance);
    }

    private static async Task AssertNotFound(HttpClient client, HttpMethod method, string path, object? body = null)
    {
        using var request = new HttpRequestMessage(method, path);
        if (body is not null)
        {
            request.Content = JsonContent.Create(body);
        }

        using var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }
}
