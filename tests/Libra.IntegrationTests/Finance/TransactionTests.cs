using System.Net;
using System.Net.Http.Json;
using Libra.Application.Common;
using Libra.Application.Finance;
using Libra.Application.Finance.Categories;
using Libra.Application.Finance.Transactions;
using Libra.Domain.Finance;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Finance;

[Collection(LibraApiCollection.Name)]
public sealed class TransactionTests(LibraApiFactory factory)
{
    [Fact]
    public async Task Type_must_match_category_kind_and_archived_categories_are_rejected()
    {
        using var client = await factory.NewUserClientAsync("tx");
        var cash = (await client.SetupAsync()).Accounts.Single();
        var income = await client.CategoryAsync(FinanceCategoryKind.Income);
        var expense = await client.CategoryAsync(FinanceCategoryKind.Expense, "Market");

        using var mismatch = await client.PostAsJsonAsync(FinanceTestClient.Transactions,
            new CreateTransactionCommand(cash.Id, income.Id, FinancialTransactionType.Expense, 5m, DateTimeOffset.UtcNow, null, null));
        Assert.Equal(HttpStatusCode.Conflict, mismatch.StatusCode);

        using var archive = await client.PutAsJsonAsync($"{FinanceTestClient.Categories}/{expense.Id}", new UpdateCategoryCommand(expense.Name, true));
        Assert.Equal(HttpStatusCode.OK, archive.StatusCode);
        using var archived = await client.PostAsJsonAsync(FinanceTestClient.Transactions,
            new CreateTransactionCommand(cash.Id, expense.Id, FinancialTransactionType.Expense, 5m, DateTimeOffset.UtcNow, null, null));
        Assert.Equal(HttpStatusCode.Conflict, archived.StatusCode);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    [InlineData(1.005)]
    [InlineData(10_000_000_000_000_000)]
    public async Task Invalid_amounts_are_rejected(decimal amount)
    {
        using var client = await factory.NewUserClientAsync("tx");
        var cash = (await client.SetupAsync()).Accounts.Single();
        var expense = await client.CategoryAsync(FinanceCategoryKind.Expense);

        using var response = await client.PostAsJsonAsync(FinanceTestClient.Transactions,
            new CreateTransactionCommand(cash.Id, expense.Id, FinancialTransactionType.Expense, amount, DateTimeOffset.UtcNow, null, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Repeating_a_client_request_id_returns_the_same_transaction_without_duplicating()
    {
        using var client = await factory.NewUserClientAsync("tx");
        var cash = (await client.SetupAsync(openingBalance: 100m)).Accounts.Single();
        var expense = await client.CategoryAsync(FinanceCategoryKind.Expense);
        var requestId = Guid.NewGuid();
        var command = new CreateTransactionCommand(cash.Id, expense.Id, FinancialTransactionType.Expense, 12.5m, DateTimeOffset.UtcNow, "retry", requestId);

        using var first = await client.PostAsJsonAsync(FinanceTestClient.Transactions, command);
        using var second = await client.PostAsJsonAsync(FinanceTestClient.Transactions, command);
        var created = await first.Content.ReadFromJsonAsync<TransactionResponse>();
        var replayed = await second.Content.ReadFromJsonAsync<TransactionResponse>();

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal(created!.Id, replayed!.Id);

        var list = (await client.GetFromJsonAsync<PagedResponse<TransactionResponse>>(FinanceTestClient.Transactions))!;
        Assert.Single(list.Items);
        Assert.Equal(87.5m, (await client.GetAccountAsync(cash.Id)).CurrentBalance);
    }

    [Fact]
    public async Task Concurrent_creates_with_the_same_client_request_id_produce_one_transaction()
    {
        using var client = await factory.NewUserClientAsync("tx");
        var cash = (await client.SetupAsync()).Accounts.Single();
        var expense = await client.CategoryAsync(FinanceCategoryKind.Expense);
        var command = new CreateTransactionCommand(cash.Id, expense.Id, FinancialTransactionType.Expense, 3m, DateTimeOffset.UtcNow, null, Guid.NewGuid());

        var responses = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => client.PostAsJsonAsync(FinanceTestClient.Transactions, command)));
        var ids = new HashSet<Guid>();
        foreach (var response in responses)
        {
            Assert.True(response.StatusCode is HttpStatusCode.Created or HttpStatusCode.OK, response.StatusCode.ToString());
            ids.Add((await response.Content.ReadFromJsonAsync<TransactionResponse>())!.Id);
            response.Dispose();
        }

        Assert.Single(ids);
        var list = (await client.GetFromJsonAsync<PagedResponse<TransactionResponse>>(FinanceTestClient.Transactions))!;
        Assert.Equal(1, list.TotalCount);
        Assert.Equal(-3m, (await client.GetAccountAsync(cash.Id)).CurrentBalance);
    }

    [Fact]
    public async Task List_is_paginated_filtered_and_stably_ordered()
    {
        using var client = await factory.NewUserClientAsync("tx");
        var cash = (await client.SetupAsync()).Accounts.Single();
        var usd = await client.CreateAccountAsync("USD", currency: "USD");
        var income = await client.CategoryAsync(FinanceCategoryKind.Income);
        var expense = await client.CategoryAsync(FinanceCategoryKind.Expense, "Market");
        var other = await client.CategoryAsync(FinanceCategoryKind.Expense, "Ev");
        var baseTime = new DateTimeOffset(2026, 3, 10, 12, 0, 0, TimeSpan.Zero);

        // Two transactions share the same instant so the id tie-breaker is exercised.
        var a = await client.AddTransactionAsync(cash.Id, expense.Id, FinancialTransactionType.Expense, 1m, baseTime);
        var b = await client.AddTransactionAsync(cash.Id, expense.Id, FinancialTransactionType.Expense, 2m, baseTime);
        var c = await client.AddTransactionAsync(cash.Id, income.Id, FinancialTransactionType.Income, 3m, baseTime.AddDays(1));
        var d = await client.AddTransactionAsync(usd.Id, other.Id, FinancialTransactionType.Expense, 4m, baseTime.AddDays(2));
        var e = await client.AddTransactionAsync(cash.Id, other.Id, FinancialTransactionType.Expense, 5m, baseTime.AddDays(3));

        var page1 = (await client.GetFromJsonAsync<PagedResponse<TransactionResponse>>($"{FinanceTestClient.Transactions}?pageNumber=1&pageSize=2"))!;
        var page2 = (await client.GetFromJsonAsync<PagedResponse<TransactionResponse>>($"{FinanceTestClient.Transactions}?pageNumber=2&pageSize=2"))!;
        var page3 = (await client.GetFromJsonAsync<PagedResponse<TransactionResponse>>($"{FinanceTestClient.Transactions}?pageNumber=3&pageSize=2"))!;

        Assert.Equal(5, page1.TotalCount);
        Assert.Equal([e.Id, d.Id], page1.Items.Select(item => item.Id));
        Assert.Equal([c.Id], page2.Items.Select(item => item.Id).Take(1));
        var tied = page2.Items.Skip(1).Concat(page3.Items).Select(item => item.Id).ToList();
        Assert.Equal(tied.OrderByDescending(id => id, Comparer<Guid>.Create((x, y) => string.CompareOrdinal(x.ToString(), y.ToString()))), tied);
        Assert.Equal(new HashSet<Guid> { a.Id, b.Id }, tied.ToHashSet());

        var onlyIncome = (await client.GetFromJsonAsync<PagedResponse<TransactionResponse>>($"{FinanceTestClient.Transactions}?type=Income"))!;
        Assert.Equal([c.Id], onlyIncome.Items.Select(item => item.Id));

        var onlyUsd = (await client.GetFromJsonAsync<PagedResponse<TransactionResponse>>($"{FinanceTestClient.Transactions}?currencyCode=usd"))!;
        Assert.Equal([d.Id], onlyUsd.Items.Select(item => item.Id));

        var byCategory = (await client.GetFromJsonAsync<PagedResponse<TransactionResponse>>($"{FinanceTestClient.Transactions}?categoryId={other.Id}&accountId={cash.Id}"))!;
        Assert.Equal([e.Id], byCategory.Items.Select(item => item.Id));

        var range = (await client.GetFromJsonAsync<PagedResponse<TransactionResponse>>(
            $"{FinanceTestClient.Transactions}?from={Uri.EscapeDataString(baseTime.AddDays(1).ToString("O"))}&to={Uri.EscapeDataString(baseTime.AddDays(2).ToString("O"))}"))!;
        Assert.Equal([d.Id, c.Id], range.Items.Select(item => item.Id));

        using var tooBig = await client.GetAsync($"{FinanceTestClient.Transactions}?pageSize=101");
        Assert.Equal(HttpStatusCode.BadRequest, tooBig.StatusCode);
    }

    [Fact]
    public async Task Updating_and_deleting_recalculates_balances_and_dashboard()
    {
        using var client = await factory.NewUserClientAsync("tx");
        var cash = (await client.SetupAsync(openingBalance: 100m)).Accounts.Single();
        var card = await client.CreateAccountAsync("Kart", openingBalance: 0m);
        var expense = await client.CategoryAsync(FinanceCategoryKind.Expense);
        var transaction = await client.AddTransactionAsync(cash.Id, expense.Id, FinancialTransactionType.Expense, 40m);

        using var update = await client.PutAsJsonAsync($"{FinanceTestClient.Transactions}/{transaction.Id}",
            new UpdateTransactionCommand(card.Id, expense.Id, FinancialTransactionType.Expense, 15m, DateTimeOffset.UtcNow, "moved"));
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);

        Assert.Equal(100m, (await client.GetAccountAsync(cash.Id)).CurrentBalance);
        Assert.Equal(-15m, (await client.GetAccountAsync(card.Id)).CurrentBalance);
        Assert.Equal(15m, (await client.DashboardAsync()).MonthlyExpense);

        using var delete = await client.DeleteAsync($"{FinanceTestClient.Transactions}/{transaction.Id}");
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);
        Assert.Equal(0m, (await client.GetAccountAsync(card.Id)).CurrentBalance);
        Assert.Equal(0m, (await client.DashboardAsync()).MonthlyExpense);

        using var gone = await client.GetAsync($"{FinanceTestClient.Transactions}/{transaction.Id}");
        Assert.Equal(HttpStatusCode.NotFound, gone.StatusCode);
    }
}
