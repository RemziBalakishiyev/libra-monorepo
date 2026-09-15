using System.Net;
using System.Net.Http.Json;
using Libra.Application.Common;
using Libra.Application.Finance;
using Libra.Application.Finance.Recurring;
using Libra.Domain.Finance;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Finance;

[Collection(LibraApiCollection.Name)]
public sealed class RecurringTests(LibraApiFactory factory)
{
    /// <summary>A month safely in the past for the plan, so due dates never fall on "today" and drift.</summary>
    private const int Year = 2026;
    private const int Month = 3;

    [Fact]
    public async Task A_pending_month_contributes_nothing_until_it_is_recorded_once()
    {
        using var client = await factory.NewUserClientAsync("rec");
        var setup = await client.SetupAsync(openingBalance: 1000m);
        var account = setup.Accounts.Single();
        var rent = await client.CategoryAsync(FinanceCategoryKind.Expense);
        var template = await client.AddTemplateAsync(account.Id, rent.Id, amount: 450m);
        await client.AddBudgetAsync(Year, Month, 1000m);

        // Reading the month, as often as you like, posts nothing.
        var pending = await client.MonthAsync(Year, Month);
        pending = await client.MonthAsync(Year, Month);
        var row = Assert.Single(pending.Occurrences);
        Assert.Equal(RecurringOccurrenceStatus.Pending, row.Status);
        Assert.Equal(450m, Assert.Single(pending.PendingTotals).Expense);
        Assert.Empty(pending.RecordedTotals);

        var before = await client.DashboardAsync(year: Year, month: Month);
        Assert.Equal(1000m, before.TotalBalance);
        Assert.Equal(0m, before.MonthlyExpense);
        Assert.Equal(0m, before.OverallBudget!.UsedAmount);
        Assert.Equal(0, (await client.GetFromJsonAsync<PagedResponse<TransactionResponse>>(FinanceTestClient.Transactions))!.TotalCount);

        // The explicit confirmation is the one thing that records money.
        using var first = await client.RecordAsync(template.Id, Year, Month);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var recorded = (await first.Content.ReadFromJsonAsync<RecordOccurrenceResponse>())!;
        Assert.Equal(RecurringOccurrenceStatus.Recorded, recorded.Occurrence.Status);
        Assert.Equal(450m, recorded.Transaction.Amount);
        Assert.Equal(FinancialTransactionType.Expense, recorded.Transaction.Type);
        Assert.Equal(new DateOnly(Year, Month, 1), recorded.Occurrence.DueDate);

        var after = await client.DashboardAsync(year: Year, month: Month);
        Assert.Equal(550m, after.TotalBalance);
        Assert.Equal(450m, after.MonthlyExpense);
        Assert.Equal(450m, after.OverallBudget!.UsedAmount);

        var month = await client.MonthAsync(Year, Month);
        Assert.Equal(RecurringOccurrenceStatus.Recorded, Assert.Single(month.Occurrences).Status);
        Assert.Empty(month.PendingTotals);
        Assert.Equal(450m, Assert.Single(month.RecordedTotals).Expense);
    }

    [Fact]
    public async Task A_month_due_later_is_recorded_today_so_the_balance_moves_now()
    {
        using var client = await factory.NewUserClientAsync("rec");
        var setup = await client.SetupAsync(openingBalance: 1000m);
        var account = setup.Accounts.Single();
        var rent = await client.CategoryAsync(FinanceCategoryKind.Expense);
        // Due on the last day of the current local month: today or later, never already past.
        var template = await client.AddTemplateAsync(account.Id, rent.Id, amount: 450m, dayOfMonth: 31);
        var todayLocal = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, TimeZoneInfo.FindSystemTimeZoneById("Asia/Baku")));

        using var response = await client.RecordAsync(template.Id, todayLocal.Year, todayLocal.Month);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var recorded = (await response.Content.ReadFromJsonAsync<RecordOccurrenceResponse>())!;

        // The plan keeps its due date; the money is dated the day it was confirmed, so future-dated activity
        // does not hide it from the balance.
        Assert.Equal(DateTime.DaysInMonth(todayLocal.Year, todayLocal.Month), recorded.Occurrence.DueDate.Day);
        Assert.Equal(todayLocal, DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(recorded.Transaction.OccurredAtUtc, TimeZoneInfo.FindSystemTimeZoneById("Asia/Baku"))));
        Assert.Equal(550m, (await client.DashboardAsync()).TotalBalance);
    }

    [Fact]
    public async Task Concurrent_and_retried_confirmations_resolve_to_the_one_recorded_transaction()
    {
        using var client = await factory.NewUserClientAsync("rec");
        var setup = await client.SetupAsync(openingBalance: 1000m);
        var account = setup.Accounts.Single();
        var rent = await client.CategoryAsync(FinanceCategoryKind.Expense);
        var template = await client.AddTemplateAsync(account.Id, rent.Id, amount: 450m);
        await client.AddBudgetAsync(Year, Month, 1000m);

        // Eight confirmations of the same month at once, each with its own client request id.
        var attempts = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ =>
            client.RecordAsync(template.Id, Year, Month, new RecordOccurrenceCommand(null, null, null, null, Guid.NewGuid()))));
        var outcomes = await Task.WhenAll(attempts.Select(async response =>
        {
            var body = await response.Content.ReadFromJsonAsync<RecordOccurrenceResponse>();
            return (response.StatusCode, TransactionId: body?.Transaction.Id);
        }));
        foreach (var response in attempts)
        {
            response.Dispose();
        }

        Assert.Equal(1, outcomes.Count(outcome => outcome.StatusCode == HttpStatusCode.Created));
        Assert.All(outcomes, outcome => Assert.True(outcome.StatusCode is HttpStatusCode.Created or HttpStatusCode.OK));
        Assert.Single(outcomes.Select(outcome => outcome.TransactionId).Distinct());

        // A later retry, again with a fresh key, is the same recording.
        using var retry = await client.RecordAsync(template.Id, Year, Month, new RecordOccurrenceCommand(null, 999m, null, null, Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        Assert.Equal(outcomes[0].TransactionId, (await retry.Content.ReadFromJsonAsync<RecordOccurrenceResponse>())!.Transaction.Id);

        var dashboard = await client.DashboardAsync(year: Year, month: Month);
        Assert.Equal(450m, dashboard.MonthlyExpense);
        Assert.Equal(450m, dashboard.OverallBudget!.UsedAmount);
        Assert.Equal(1, (await client.GetFromJsonAsync<PagedResponse<TransactionResponse>>(FinanceTestClient.Transactions))!.TotalCount);
    }

    [Fact]
    public async Task The_same_client_request_id_for_a_different_month_is_refused()
    {
        using var client = await factory.NewUserClientAsync("rec");
        var setup = await client.SetupAsync();
        var account = setup.Accounts.Single();
        var rent = await client.CategoryAsync(FinanceCategoryKind.Expense);
        var template = await client.AddTemplateAsync(account.Id, rent.Id);
        var key = Guid.NewGuid();

        using var first = await client.RecordAsync(template.Id, Year, Month, new RecordOccurrenceCommand(null, null, null, null, key));
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        using var reused = await client.RecordAsync(template.Id, Year, Month + 1, new RecordOccurrenceCommand(null, null, null, null, key));
        Assert.Equal(HttpStatusCode.Conflict, reused.StatusCode);
        Assert.Equal(1, (await client.GetFromJsonAsync<PagedResponse<TransactionResponse>>(FinanceTestClient.Transactions))!.TotalCount);
    }

    [Fact]
    public async Task Confirmation_validates_the_account_currency_archive_state_and_category()
    {
        using var client = await factory.NewUserClientAsync("rec");
        var setup = await client.SetupAsync();
        var account = setup.Accounts.Single();
        var usd = await client.CreateAccountAsync("USD kart", "USD");
        var rent = await client.CategoryAsync(FinanceCategoryKind.Expense);
        var template = await client.AddTemplateAsync(account.Id, rent.Id);

        using var wrongCurrency = await client.RecordAsync(template.Id, Year, Month, new RecordOccurrenceCommand(usd.Id, null, null, null, null));
        Assert.Equal(HttpStatusCode.Conflict, wrongCurrency.StatusCode);
        var problem = await wrongCurrency.Content.ReadFromJsonAsync<ProblemDetailsBody>();
        Assert.Contains("AZN", problem!.Detail);

        // Archive the category the template uses, then try to record.
        using var archive = await client.PutAsJsonAsync($"{FinanceTestClient.Categories}/{rent.Id}", new { name = rent.Name, isArchived = true });
        archive.EnsureSuccessStatusCode();
        using var archivedCategory = await client.RecordAsync(template.Id, Year, Month);
        Assert.Equal(HttpStatusCode.Conflict, archivedCategory.StatusCode);

        // Nothing was recorded by any of the refused attempts.
        Assert.Equal(0, (await client.GetFromJsonAsync<PagedResponse<TransactionResponse>>(FinanceTestClient.Transactions))!.TotalCount);
        Assert.Equal(RecurringOccurrenceStatus.Pending, Assert.Single((await client.MonthAsync(Year, Month)).Occurrences).Status);
    }

    [Fact]
    public async Task Review_may_change_the_amount_account_and_date_before_confirming()
    {
        using var client = await factory.NewUserClientAsync("rec");
        var setup = await client.SetupAsync();
        var cash = setup.Accounts.Single();
        var card = await client.CreateAccountAsync("Kart", "AZN");
        var rent = await client.CategoryAsync(FinanceCategoryKind.Expense);
        var template = await client.AddTemplateAsync(cash.Id, rent.Id, amount: 450m, dayOfMonth: 31);

        using var response = await client.RecordAsync(template.Id, 2026, 2, new RecordOccurrenceCommand(card.Id, 460m, new DateOnly(2026, 2, 27), "Gecikmə", null));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var recorded = (await response.Content.ReadFromJsonAsync<RecordOccurrenceResponse>())!;

        Assert.Equal(card.Id, recorded.Transaction.AccountId);
        Assert.Equal(460m, recorded.Transaction.Amount);
        Assert.Equal("Gecikmə", recorded.Transaction.Note);
        // The plan's due date for February is the clamped 28th; what was actually paid is on the 27th.
        Assert.Equal(new DateOnly(2026, 2, 28), recorded.Occurrence.DueDate);
        Assert.Equal(new DateOnly(2026, 2, 27), DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(recorded.Transaction.OccurredAtUtc, TimeZoneInfo.FindSystemTimeZoneById("Asia/Baku"))));
        Assert.Equal(460m, recorded.Occurrence.Amount);
    }

    [Fact]
    public async Task Editing_the_template_changes_unrecorded_months_and_leaves_recorded_ones_alone()
    {
        using var client = await factory.NewUserClientAsync("rec");
        var setup = await client.SetupAsync();
        var account = setup.Accounts.Single();
        var rent = await client.CategoryAsync(FinanceCategoryKind.Expense);
        var template = await client.AddTemplateAsync(account.Id, rent.Id, amount: 450m, dayOfMonth: 1);

        using var record = await client.RecordAsync(template.Id, Year, Month);
        record.EnsureSuccessStatusCode();

        using var update = await client.PutAsJsonAsync(
            $"{RecurringAndDebtTestClient.Templates}/{template.Id}",
            new UpdateRecurringTemplateCommand("Kirayə (yeni)", FinancialTransactionType.Expense, 500m, rent.Id, account.Id, 5, template.StartDate, null, null, true, template.UpdatedAtUtc));
        update.EnsureSuccessStatusCode();

        var recordedMonth = await client.MonthAsync(Year, Month);
        var recorded = Assert.Single(recordedMonth.Occurrences);
        Assert.Equal("Kirayə", recorded.Title);
        Assert.Equal(450m, recorded.Amount);
        Assert.Equal(new DateOnly(Year, Month, 1), recorded.DueDate);

        // An earlier month the user never got to is still just the plan, so it follows the edit.
        var missed = Assert.Single((await client.MonthAsync(Year, Month - 1)).Occurrences);
        Assert.Equal(RecurringOccurrenceStatus.Pending, missed.Status);
        Assert.Equal("Kirayə (yeni)", missed.Title);
        Assert.Equal(500m, missed.Amount);
        Assert.Equal(new DateOnly(Year, Month - 1, 5), missed.DueDate);

        // A stale edit is refused.
        using var stale = await client.PutAsJsonAsync(
            $"{RecurringAndDebtTestClient.Templates}/{template.Id}",
            new UpdateRecurringTemplateCommand("Köhnə", FinancialTransactionType.Expense, 1m, rent.Id, account.Id, 1, template.StartDate, null, null, true, template.UpdatedAtUtc));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
    }

    [Fact]
    public async Task Deactivation_hides_every_unrecorded_month_and_keeps_history()
    {
        using var client = await factory.NewUserClientAsync("rec");
        var setup = await client.SetupAsync();
        var account = setup.Accounts.Single();
        var rent = await client.CategoryAsync(FinanceCategoryKind.Expense);
        var template = await client.AddTemplateAsync(account.Id, rent.Id);
        using var record = await client.RecordAsync(template.Id, Year, Month);
        record.EnsureSuccessStatusCode();

        var current = (await client.GetFromJsonAsync<RecurringTemplateResponse>($"{RecurringAndDebtTestClient.Templates}/{template.Id}"))!;
        using var deactivate = await client.PutAsJsonAsync(
            $"{RecurringAndDebtTestClient.Templates}/{template.Id}",
            new UpdateRecurringTemplateCommand(current.Title, current.Type, current.Amount, current.CategoryId, current.AccountId, current.DayOfMonth, current.StartDate, current.EndDate, current.Note, false, current.UpdatedAtUtc));
        deactivate.EnsureSuccessStatusCode();

        // The month before (never recorded) is gone; the recorded month is still there, still recorded.
        Assert.Empty((await client.MonthAsync(Year, Month - 1)).Occurrences);
        Assert.Empty((await client.MonthAsync(Year, Month + 1)).Occurrences);
        var kept = Assert.Single((await client.MonthAsync(Year, Month)).Occurrences);
        Assert.Equal(RecurringOccurrenceStatus.Recorded, kept.Status);
        Assert.False(kept.TemplateIsActive);
        Assert.Equal(1, (await client.GetFromJsonAsync<PagedResponse<TransactionResponse>>(FinanceTestClient.Transactions))!.TotalCount);

        // With history, the template can only be deactivated, never deleted.
        using var delete = await client.DeleteAsync($"{RecurringAndDebtTestClient.Templates}/{template.Id}");
        Assert.Equal(HttpStatusCode.Conflict, delete.StatusCode);
    }

    [Fact]
    public async Task Undo_removes_the_transaction_keeps_the_month_as_skipped_and_is_safe_to_repeat()
    {
        using var client = await factory.NewUserClientAsync("rec");
        var setup = await client.SetupAsync(openingBalance: 1000m);
        var account = setup.Accounts.Single();
        var rent = await client.CategoryAsync(FinanceCategoryKind.Expense);
        var template = await client.AddTemplateAsync(account.Id, rent.Id, amount: 450m);
        using var record = await client.RecordAsync(template.Id, Year, Month);
        var recorded = (await record.Content.ReadFromJsonAsync<RecordOccurrenceResponse>())!;

        // The generic transaction delete refuses a linked transaction and points at the owning flow.
        using var genericDelete = await client.DeleteAsync($"{FinanceTestClient.Transactions}/{recorded.Transaction.Id}");
        Assert.Equal(HttpStatusCode.Conflict, genericDelete.StatusCode);

        using var undo = await client.PostAsync(RecurringAndDebtTestClient.Occurrence(template.Id, Year, Month, "undo"), null);
        undo.EnsureSuccessStatusCode();
        var undone = (await undo.Content.ReadFromJsonAsync<RecurringOccurrenceResponse>())!;
        Assert.Equal(RecurringOccurrenceStatus.Skipped, undone.Status);
        Assert.Null(undone.TransactionId);

        using var gone = await client.GetAsync($"{FinanceTestClient.Transactions}/{recorded.Transaction.Id}");
        Assert.Equal(HttpStatusCode.NotFound, gone.StatusCode);
        Assert.Equal(1000m, (await client.DashboardAsync(year: Year, month: Month)).TotalBalance);

        // Not proposed again on its own, and a second undo is harmless.
        Assert.Equal(RecurringOccurrenceStatus.Skipped, Assert.Single((await client.MonthAsync(Year, Month)).Occurrences).Status);
        using var again = await client.PostAsync(RecurringAndDebtTestClient.Occurrence(template.Id, Year, Month, "undo"), null);
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);

        // Recording it again is an explicit act and works.
        using var rerecord = await client.RecordAsync(template.Id, Year, Month);
        Assert.Equal(HttpStatusCode.Created, rerecord.StatusCode);
        Assert.Equal(550m, (await client.DashboardAsync(year: Year, month: Month)).TotalBalance);
    }

    [Fact]
    public async Task Short_months_and_the_schedule_window_are_applied_in_the_month_view()
    {
        using var client = await factory.NewUserClientAsync("rec");
        var setup = await client.SetupAsync();
        var account = setup.Accounts.Single();
        var rent = await client.CategoryAsync(FinanceCategoryKind.Expense);
        // Day 31 from 15 January 2026 until 30 April 2026.
        var template = await client.AddTemplateAsync(account.Id, rent.Id, dayOfMonth: 31, startDate: new DateOnly(2026, 1, 15), endDate: new DateOnly(2026, 4, 30));

        Assert.Equal(new DateOnly(2026, 1, 31), Assert.Single((await client.MonthAsync(2026, 1)).Occurrences).DueDate);
        Assert.Equal(new DateOnly(2026, 2, 28), Assert.Single((await client.MonthAsync(2026, 2)).Occurrences).DueDate);
        Assert.Equal(new DateOnly(2026, 3, 31), Assert.Single((await client.MonthAsync(2026, 3)).Occurrences).DueDate);
        Assert.Equal(new DateOnly(2026, 4, 30), Assert.Single((await client.MonthAsync(2026, 4)).Occurrences).DueDate);
        Assert.Empty((await client.MonthAsync(2026, 5)).Occurrences);
        Assert.Empty((await client.MonthAsync(2025, 12)).Occurrences);

        using var outside = await client.RecordAsync(template.Id, 2026, 5);
        Assert.Equal(HttpStatusCode.Conflict, outside.StatusCode);
    }

    [Fact]
    public async Task Templates_and_occurrences_are_invisible_to_other_users()
    {
        using var owner = await factory.NewUserClientAsync("rec");
        using var other = await factory.NewUserClientAsync("rec");
        var setup = await owner.SetupAsync();
        var account = setup.Accounts.Single();
        var rent = await owner.CategoryAsync(FinanceCategoryKind.Expense);
        var template = await owner.AddTemplateAsync(account.Id, rent.Id);

        using var get = await other.GetAsync($"{RecurringAndDebtTestClient.Templates}/{template.Id}");
        Assert.Equal(HttpStatusCode.NotFound, get.StatusCode);
        using var record = await other.RecordAsync(template.Id, Year, Month);
        Assert.Equal(HttpStatusCode.NotFound, record.StatusCode);
        Assert.Empty((await other.MonthAsync(Year, Month)).Occurrences);

        // The other user's own account cannot be used to create a template on the owner's category, or vice versa.
        var otherSetup = await other.SetupAsync();
        using var crossed = await other.PostAsJsonAsync(
            RecurringAndDebtTestClient.Templates,
            new CreateRecurringTemplateCommand("Yad", FinancialTransactionType.Expense, 1m, rent.Id, otherSetup.Accounts.Single().Id, 1, new DateOnly(2026, 1, 1), null, null, null));
        Assert.Equal(HttpStatusCode.NotFound, crossed.StatusCode);
    }

    private sealed record ProblemDetailsBody(string? Title, string? Detail, int? Status);
}
