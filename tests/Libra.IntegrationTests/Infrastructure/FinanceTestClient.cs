using System.Net.Http.Json;
using Libra.Application.Finance;
using Libra.Application.Finance.Accounts;
using Libra.Application.Finance.Budgets;
using Libra.Application.Finance.Setup;
using Libra.Application.Finance.Transactions;
using Libra.Application.Finance.Transfers;
using Libra.Domain.Finance;

namespace Libra.IntegrationTests.Infrastructure;

/// <summary>Thin HTTP helpers for the finance suite. Every call goes through the public API.</summary>
internal static class FinanceTestClient
{
    public const string Setup = "/api/finance/setup";
    public const string Accounts = "/api/finance/accounts";
    public const string Categories = "/api/finance/categories";
    public const string Transactions = "/api/finance/transactions";
    public const string Transfers = "/api/finance/transfers";
    public const string Budgets = "/api/finance/budgets";
    public const string Dashboard = "/api/finance/dashboard";

    /// <summary>Registers a fresh user and returns a client carrying its bearer token.</summary>
    public static async Task<HttpClient> NewUserClientAsync(this LibraApiFactory factory, string prefix = "fin")
    {
        var client = factory.CreateClient();
        var session = await client.RegisterAsync(AuthTestClient.UniqueEmail(prefix));
        return client.WithBearer(session.AccessToken);
    }

    public static async Task<FinanceSetupResponse> SetupAsync(this HttpClient client, string currency = "AZN", decimal openingBalance = 0m, string name = "Nağd")
    {
        using var response = await client.PostAsJsonAsync(Setup, new FinanceSetupCommand(new CreateAccountCommand(name, FinancialAccountType.Cash, currency, openingBalance)));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<FinanceSetupResponse>())!;
    }

    public static async Task<AccountResponse> CreateAccountAsync(this HttpClient client, string name, string currency = "AZN", decimal openingBalance = 0m, FinancialAccountType type = FinancialAccountType.BankCard, bool includedInTotal = true)
    {
        using var response = await client.PostAsJsonAsync(Accounts, new CreateAccountCommand(name, type, currency, openingBalance, includedInTotal));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<AccountResponse>())!;
    }

    public static async Task<AccountResponse> GetAccountAsync(this HttpClient client, Guid id) =>
        (await client.GetFromJsonAsync<AccountResponse>($"{Accounts}/{id}"))!;

    public static async Task<CategoryResponse> CategoryAsync(this HttpClient client, FinanceCategoryKind kind, string? name = null)
    {
        var categories = (await client.GetFromJsonAsync<List<CategoryResponse>>($"{Categories}?kind={kind}"))!;
        return name is null ? categories.First() : categories.Single(category => category.Name == name);
    }

    public static async Task<TransactionResponse> AddTransactionAsync(
        this HttpClient client,
        Guid accountId,
        Guid categoryId,
        FinancialTransactionType type,
        decimal amount,
        DateTimeOffset? occurredAt = null,
        Guid? clientRequestId = null,
        string? note = null)
    {
        using var response = await client.PostAsJsonAsync(
            Transactions,
            new CreateTransactionCommand(accountId, categoryId, type, amount, occurredAt ?? DateTimeOffset.UtcNow, note, clientRequestId));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<TransactionResponse>())!;
    }

    public static async Task<TransferResponse> AddTransferAsync(
        this HttpClient client,
        Guid sourceId,
        Guid destinationId,
        decimal sourceAmount,
        decimal? destinationAmount = null,
        DateTimeOffset? occurredAt = null,
        Guid? clientRequestId = null)
    {
        using var response = await client.PostAsJsonAsync(
            Transfers,
            new CreateTransferCommand(sourceId, destinationId, sourceAmount, destinationAmount ?? sourceAmount, occurredAt ?? DateTimeOffset.UtcNow, null, clientRequestId));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<TransferResponse>())!;
    }

    public static async Task<BudgetResponse> AddBudgetAsync(this HttpClient client, int year, int month, decimal amount, string currency = "AZN", Guid? categoryId = null)
    {
        using var response = await client.PostAsJsonAsync(Budgets, new CreateBudgetCommand(year, month, currency, categoryId, amount));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<BudgetResponse>())!;
    }

    public static async Task<DashboardResponse> DashboardAsync(this HttpClient client, string? currency = null, int? year = null, int? month = null)
    {
        var query = new List<string>();
        if (currency is not null)
        {
            query.Add($"currencyCode={currency}");
        }

        if (year is not null && month is not null)
        {
            query.Add($"year={year}&month={month}");
        }

        var url = query.Count == 0 ? Dashboard : $"{Dashboard}?{string.Join('&', query)}";
        return (await client.GetFromJsonAsync<DashboardResponse>(url))!;
    }

    /// <summary>Current local month in Asia/Baku, the default preference for new users.</summary>
    public static (int Year, int Month) CurrentBakuMonth()
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById("Asia/Baku");
        var local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, zone);
        return (local.Year, local.Month);
    }
}
