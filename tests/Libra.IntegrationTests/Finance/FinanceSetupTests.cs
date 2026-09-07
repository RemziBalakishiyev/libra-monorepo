using System.Net;
using System.Net.Http.Json;
using Libra.Application.Finance;
using Libra.Application.Finance.Accounts;
using Libra.Application.Finance.Categories;
using Libra.Application.Finance.Setup;
using Libra.Domain.Finance;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Finance;

[Collection(LibraApiCollection.Name)]
public sealed class FinanceSetupTests(LibraApiFactory factory)
{
    [Fact]
    public async Task Setup_without_an_account_creates_defaults_but_never_invents_an_account()
    {
        using var client = await factory.NewUserClientAsync("setup");

        using var response = await client.PostAsJsonAsync(FinanceTestClient.Setup, new FinanceSetupCommand(null));
        var setup = await response.Content.ReadFromJsonAsync<FinanceSetupResponse>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(setup);
        Assert.False(setup.IsComplete);
        Assert.False(setup.AccountCreated);
        Assert.Equal(DefaultCategories.All.Count, setup.CategoriesCreated);
        Assert.Empty(setup.Accounts);
        Assert.Equal(DefaultCategories.All.Count, setup.Categories.Count);
        Assert.All(setup.Categories, category => Assert.True(category.IsSystemDefault));
        Assert.Contains(setup.Categories, category => category.Name == "Maaş" && category.Kind == FinanceCategoryKind.Income);
        Assert.Contains(setup.Categories, category => category.Name == "Digər xərc" && category.Kind == FinanceCategoryKind.Expense);
    }

    [Fact]
    public async Task Setup_is_idempotent_for_categories_and_the_first_account()
    {
        using var client = await factory.NewUserClientAsync("setup");

        var first = await client.SetupAsync(openingBalance: 250m, name: "Cüzdan");
        var second = await client.SetupAsync(openingBalance: 999m, name: "Should not exist");

        Assert.True(first.IsComplete);
        Assert.True(first.AccountCreated);
        Assert.Equal(DefaultCategories.All.Count, first.CategoriesCreated);

        Assert.True(second.IsComplete);
        Assert.False(second.AccountCreated);
        Assert.Equal(0, second.CategoriesCreated);
        var account = Assert.Single(second.Accounts);
        Assert.Equal("Cüzdan", account.Name);
        Assert.Equal(250m, account.OpeningBalance);
        Assert.Equal(DefaultCategories.All.Count, second.Categories.Count);
    }

    [Fact]
    public async Task Concurrent_setup_calls_do_not_duplicate_defaults_or_accounts()
    {
        using var client = await factory.NewUserClientAsync("setup");
        var command = new FinanceSetupCommand(new CreateAccountCommand("Nağd", FinancialAccountType.Cash, "AZN", 10m));

        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => client.PostAsJsonAsync(FinanceTestClient.Setup, command)));
        foreach (var response in responses)
        {
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            response.Dispose();
        }

        var categories = (await client.GetFromJsonAsync<List<CategoryResponse>>(FinanceTestClient.Categories))!;
        var accounts = (await client.GetFromJsonAsync<List<AccountResponse>>(FinanceTestClient.Accounts))!;

        Assert.Equal(DefaultCategories.All.Count, categories.Count);
        Assert.True(accounts.Count <= 1, $"expected at most one account, got {accounts.Count}");
    }

    [Fact]
    public async Task Setup_validates_the_first_account()
    {
        using var client = await factory.NewUserClientAsync("setup");

        using var response = await client.PostAsJsonAsync(
            FinanceTestClient.Setup,
            new FinanceSetupCommand(new CreateAccountCommand("", FinancialAccountType.Cash, "AZERBAIJAN", 1.234m)));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
