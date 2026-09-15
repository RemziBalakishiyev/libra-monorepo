using System.Net.Http.Json;
using Libra.Application.Finance.Debts;
using Libra.Application.Finance.Recurring;
using Libra.Domain.Finance;

namespace Libra.IntegrationTests.Infrastructure;

/// <summary>HTTP helpers for recurring templates and debts. Every call goes through the public API.</summary>
internal static class RecurringAndDebtTestClient
{
    public const string Recurring = "/api/finance/recurring";
    public const string Templates = "/api/finance/recurring/templates";
    public const string Debts = "/api/finance/debts";

    public static string Occurrence(Guid templateId, int year, int month, string action) =>
        $"{Templates}/{templateId}/occurrences/{year}/{month}/{action}";

    public static async Task<RecurringTemplateResponse> AddTemplateAsync(
        this HttpClient client,
        Guid accountId,
        Guid categoryId,
        FinancialTransactionType type = FinancialTransactionType.Expense,
        decimal amount = 450m,
        int dayOfMonth = 1,
        DateOnly? startDate = null,
        DateOnly? endDate = null,
        string title = "Kirayə",
        Guid? clientRequestId = null)
    {
        using var response = await client.PostAsJsonAsync(
            Templates,
            new CreateRecurringTemplateCommand(title, type, amount, categoryId, accountId, dayOfMonth, startDate ?? new DateOnly(2025, 1, 1), endDate, null, clientRequestId));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<RecurringTemplateResponse>())!;
    }

    public static async Task<RecurringMonthResponse> MonthAsync(this HttpClient client, int year, int month) =>
        (await client.GetFromJsonAsync<RecurringMonthResponse>($"{Recurring}?year={year}&month={month}"))!;

    public static Task<HttpResponseMessage> RecordAsync(this HttpClient client, Guid templateId, int year, int month, RecordOccurrenceCommand? command = null) =>
        client.PostAsJsonAsync(Occurrence(templateId, year, month, "record"), command ?? new RecordOccurrenceCommand(null, null, null, null, null));

    public static async Task<DebtDetailResponse> AddDebtAsync(
        this HttpClient client,
        DebtDirection direction,
        decimal principal,
        string currency = "AZN",
        Guid? accountId = null,
        DateOnly? openedOn = null,
        DateOnly? dueOn = null,
        string counterparty = "Rəşad",
        Guid? clientRequestId = null)
    {
        using var response = await client.PostAsJsonAsync(
            Debts,
            new CreateDebtCommand(direction, counterparty, principal, currency, openedOn ?? new DateOnly(2026, 9, 1), dueOn, null, accountId, clientRequestId));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<DebtDetailResponse>())!;
    }

    public static Task<HttpResponseMessage> PayAsync(this HttpClient client, Guid debtId, Guid accountId, decimal amount, DateOnly? paidOn = null, Guid? clientRequestId = null) =>
        client.PostAsJsonAsync($"{Debts}/{debtId}/payments", new RecordDebtPaymentCommand(accountId, amount, paidOn ?? new DateOnly(2026, 9, 10), null, clientRequestId));

    public static async Task<DebtDetailResponse> DebtAsync(this HttpClient client, Guid debtId) =>
        (await client.GetFromJsonAsync<DebtDetailResponse>($"{Debts}/{debtId}"))!;

    public static async Task<DebtSummaryResponse> DebtSummaryAsync(this HttpClient client) =>
        (await client.GetFromJsonAsync<DebtSummaryResponse>($"{Debts}/summary"))!;
}
