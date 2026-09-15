using System.Net;
using System.Net.Http.Json;
using Libra.Application.Common;
using Libra.Application.Finance.Debts;
using Libra.Domain.Finance;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Finance;

[Collection(LibraApiCollection.Name)]
public sealed class DebtTests(LibraApiFactory factory)
{
    [Fact]
    public async Task An_existing_receivable_changes_no_balance_and_a_repayment_moves_cash_without_touching_income()
    {
        using var client = await factory.NewUserClientAsync("debt");
        var setup = await client.SetupAsync(openingBalance: 1000m);
        var cash = setup.Accounts.Single();
        var (year, month) = FinanceTestClient.CurrentBakuMonth();
        await client.AddBudgetAsync(year, month, 500m);

        // Cash 1,000; record an existing receivable of 300 → cash still 1,000, receivable 300.
        var debt = await client.AddDebtAsync(DebtDirection.Receivable, 300m);
        Assert.Equal(300m, debt.Debt.RemainingAmount);
        Assert.Equal(DebtStatus.Open, debt.Debt.Status);
        Assert.False(debt.Debt.MovedCashAtOpening);
        Assert.Empty(debt.History);
        Assert.Equal(1000m, (await client.GetAccountAsync(cash.Id)).CurrentBalance);

        // Receive 100 → cash 1,100, receivable 200; income and budgets unchanged.
        var key = Guid.NewGuid();
        using var pay = await client.PayAsync(debt.Debt.Id, cash.Id, 100m, DateOnly.FromDateTime(DateTime.UtcNow), key);
        Assert.Equal(HttpStatusCode.Created, pay.StatusCode);
        var paid = (await pay.Content.ReadFromJsonAsync<DebtDetailResponse>())!;
        Assert.Equal(200m, paid.Debt.RemainingAmount);
        Assert.Equal(DebtStatus.PartiallyPaid, paid.Debt.Status);
        Assert.Equal(1100m, (await client.GetAccountAsync(cash.Id)).CurrentBalance);

        var dashboard = await client.DashboardAsync();
        Assert.Equal(0m, dashboard.MonthlyIncome);
        Assert.Equal(0m, dashboard.MonthlyExpense);
        Assert.Equal(0m, dashboard.MonthlyNet);
        Assert.Equal(0m, dashboard.OverallBudget!.UsedAmount);
        // The principal movement is reported on its own, and the total change in cash includes it.
        Assert.Equal(100m, dashboard.Debts.MonthlyPrincipalNet);
        Assert.Equal(100m, dashboard.Debts.MonthlyCashChange);
        Assert.Equal(200m, dashboard.Debts.ReceivablesOutstanding);
        Assert.Equal(1100m + 200m, dashboard.Debts.NetPosition);

        // Retry with the same key → exactly the same result, nothing moved twice.
        using var retry = await client.PayAsync(debt.Debt.Id, cash.Id, 100m, DateOnly.FromDateTime(DateTime.UtcNow), key);
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        Assert.Equal(200m, (await retry.Content.ReadFromJsonAsync<DebtDetailResponse>())!.Debt.RemainingAmount);
        Assert.Equal(1100m, (await client.GetAccountAsync(cash.Id)).CurrentBalance);

        // Undo → cash 1,000 and receivable 300, history kept and readable.
        var payment = Assert.Single(paid.History);
        using var undo = await client.PostAsync($"{RecurringAndDebtTestClient.Debts}/{debt.Debt.Id}/payments/{payment.Id}/undo", null);
        undo.EnsureSuccessStatusCode();
        var undone = (await undo.Content.ReadFromJsonAsync<DebtDetailResponse>())!;
        Assert.Equal(300m, undone.Debt.RemainingAmount);
        Assert.Equal(DebtStatus.Open, undone.Debt.Status);
        Assert.True(Assert.Single(undone.History).IsReversed);
        Assert.Equal(0m, Assert.Single(undone.History).CashEffect);
        Assert.Equal(1000m, (await client.GetAccountAsync(cash.Id)).CurrentBalance);

        // Undoing again is a no-op that still succeeds.
        using var undoAgain = await client.PostAsync($"{RecurringAndDebtTestClient.Debts}/{debt.Debt.Id}/payments/{payment.Id}/undo", null);
        Assert.Equal(HttpStatusCode.OK, undoAgain.StatusCode);
        Assert.Equal(1000m, (await client.GetAccountAsync(cash.Id)).CurrentBalance);
    }

    [Fact]
    public async Task Repaying_a_payable_reduces_cash_and_the_obligation_without_touching_spending_or_budgets()
    {
        using var client = await factory.NewUserClientAsync("debt");
        var setup = await client.SetupAsync(openingBalance: 1000m);
        var cash = setup.Accounts.Single();
        var (year, month) = FinanceTestClient.CurrentBakuMonth();
        await client.AddBudgetAsync(year, month, 500m);

        var debt = await client.AddDebtAsync(DebtDirection.Payable, 500m, counterparty: "Bank");
        Assert.Equal(1000m, (await client.GetAccountAsync(cash.Id)).CurrentBalance);

        using var pay = await client.PayAsync(debt.Debt.Id, cash.Id, 100m, DateOnly.FromDateTime(DateTime.UtcNow));
        pay.EnsureSuccessStatusCode();
        var paid = (await pay.Content.ReadFromJsonAsync<DebtDetailResponse>())!;

        Assert.Equal(400m, paid.Debt.RemainingAmount);
        Assert.Equal(900m, (await client.GetAccountAsync(cash.Id)).CurrentBalance);
        var dashboard = await client.DashboardAsync();
        Assert.Equal(0m, dashboard.MonthlyExpense);
        Assert.Equal(0m, dashboard.OverallBudget!.UsedAmount);
        Assert.Equal(-100m, dashboard.Debts.MonthlyPrincipalNet);
        Assert.Equal(400m, dashboard.Debts.PayablesOutstanding);
        Assert.Equal(900m - 400m, dashboard.Debts.NetPosition);
    }

    [Fact]
    public async Task Lending_now_moves_cash_at_creation_and_is_all_or_nothing()
    {
        using var client = await factory.NewUserClientAsync("debt");
        var setup = await client.SetupAsync(openingBalance: 1000m);
        var cash = setup.Accounts.Single();
        var usd = await client.CreateAccountAsync("USD kart", "USD");

        var lent = await client.AddDebtAsync(DebtDirection.Receivable, 300m, accountId: cash.Id);
        Assert.True(lent.Debt.MovedCashAtOpening);
        Assert.Equal(DebtMovementKind.Opening, Assert.Single(lent.History).Kind);
        Assert.Equal(-300m, Assert.Single(lent.History).CashEffect);
        Assert.Equal(700m, (await client.GetAccountAsync(cash.Id)).CurrentBalance);

        var borrowed = await client.AddDebtAsync(DebtDirection.Payable, 200m, accountId: cash.Id, counterparty: "Leyla");
        Assert.Equal(900m, (await client.GetAccountAsync(cash.Id)).CurrentBalance);

        // A currency mismatch refuses the whole creation: no debt, no movement.
        using var mismatch = await client.PostAsJsonAsync(
            RecurringAndDebtTestClient.Debts,
            new CreateDebtCommand(DebtDirection.Receivable, "Rəşad", 50m, "AZN", new DateOnly(2026, 9, 1), null, null, usd.Id, null));
        Assert.Equal(HttpStatusCode.Conflict, mismatch.StatusCode);
        Assert.Equal(2, (await client.GetFromJsonAsync<PagedResponse<DebtResponse>>(RecurringAndDebtTestClient.Debts))!.TotalCount);
        Assert.Equal(900m, (await client.GetAccountAsync(cash.Id)).CurrentBalance);

        // Once money has moved the structure is locked, and the debt cannot be deleted.
        using var restructure = await client.PutAsJsonAsync(
            $"{RecurringAndDebtTestClient.Debts}/{lent.Debt.Id}",
            new UpdateDebtCommand("Rəşad", 350m, lent.Debt.OpenedOn, null, null, lent.Debt.UpdatedAtUtc));
        Assert.Equal(HttpStatusCode.Conflict, restructure.StatusCode);
        using var rename = await client.PutAsJsonAsync(
            $"{RecurringAndDebtTestClient.Debts}/{lent.Debt.Id}",
            new UpdateDebtCommand("Rəşad Əliyev", 300m, lent.Debt.OpenedOn, new DateOnly(2026, 12, 31), "Yay tətili", lent.Debt.UpdatedAtUtc));
        rename.EnsureSuccessStatusCode();
        Assert.Equal("Rəşad Əliyev", (await rename.Content.ReadFromJsonAsync<DebtDetailResponse>())!.Debt.CounterpartyName);
        using var delete = await client.DeleteAsync($"{RecurringAndDebtTestClient.Debts}/{lent.Debt.Id}");
        Assert.Equal(HttpStatusCode.Conflict, delete.StatusCode);
    }

    [Fact]
    public async Task Payments_are_bounded_and_two_concurrent_payments_cannot_overpay()
    {
        using var client = await factory.NewUserClientAsync("debt");
        var setup = await client.SetupAsync(openingBalance: 1000m);
        var cash = setup.Accounts.Single();
        var usd = await client.CreateAccountAsync("USD kart", "USD");
        var debt = await client.AddDebtAsync(DebtDirection.Receivable, 300m);

        using var zero = await client.PayAsync(debt.Debt.Id, cash.Id, 0m);
        Assert.Equal(HttpStatusCode.BadRequest, zero.StatusCode);
        using var negative = await client.PayAsync(debt.Debt.Id, cash.Id, -5m);
        Assert.Equal(HttpStatusCode.BadRequest, negative.StatusCode);
        using var excessive = await client.PayAsync(debt.Debt.Id, cash.Id, 300.01m);
        Assert.Equal(HttpStatusCode.BadRequest, excessive.StatusCode);
        using var wrongCurrency = await client.PayAsync(debt.Debt.Id, usd.Id, 10m);
        Assert.Equal(HttpStatusCode.Conflict, wrongCurrency.StatusCode);

        // Two payments of 200 at once against 300 outstanding: at most one may commit.
        var attempts = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ => client.PayAsync(debt.Debt.Id, cash.Id, 200m, null, Guid.NewGuid())));
        var statuses = attempts.Select(response => response.StatusCode).ToList();
        foreach (var response in attempts)
        {
            response.Dispose();
        }

        Assert.Contains(HttpStatusCode.Created, statuses);
        Assert.DoesNotContain(statuses, status => status == HttpStatusCode.Created && statuses.Count(s => s == HttpStatusCode.Created) > 1);
        var after = await client.DebtAsync(debt.Debt.Id);
        Assert.Equal(100m, after.Debt.RemainingAmount);
        Assert.Equal(1200m, (await client.GetAccountAsync(cash.Id)).CurrentBalance);

        // The remaining 100 settles it; then nothing more is accepted.
        using var settle = await client.PayAsync(debt.Debt.Id, cash.Id, 100m);
        settle.EnsureSuccessStatusCode();
        Assert.Equal(DebtStatus.Settled, (await settle.Content.ReadFromJsonAsync<DebtDetailResponse>())!.Debt.Status);
        using var overpaid = await client.PayAsync(debt.Debt.Id, cash.Id, 1m);
        Assert.Equal(HttpStatusCode.Conflict, overpaid.StatusCode);
    }

    [Fact]
    public async Task Reusing_a_payment_key_with_different_input_is_refused()
    {
        using var client = await factory.NewUserClientAsync("debt");
        var setup = await client.SetupAsync(openingBalance: 1000m);
        var cash = setup.Accounts.Single();
        var debt = await client.AddDebtAsync(DebtDirection.Receivable, 300m);
        var key = Guid.NewGuid();

        using var first = await client.PayAsync(debt.Debt.Id, cash.Id, 100m, null, key);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        using var different = await client.PayAsync(debt.Debt.Id, cash.Id, 150m, null, key);
        Assert.Equal(HttpStatusCode.Conflict, different.StatusCode);

        Assert.Equal(200m, (await client.DebtAsync(debt.Debt.Id)).Debt.RemainingAmount);
    }

    [Fact]
    public async Task Overdue_follows_the_profile_time_zone_and_a_settled_debt_is_never_overdue()
    {
        using var client = await factory.NewUserClientAsync("debt");
        var setup = await client.SetupAsync(openingBalance: 1000m);
        var cash = setup.Accounts.Single();

        // Due "today" in Asia/Baku is not overdue; due yesterday is; a far-off due date is not.
        var bakuToday = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, TimeZoneInfo.FindSystemTimeZoneById("Asia/Baku")));
        var dueToday = await client.AddDebtAsync(DebtDirection.Receivable, 100m, openedOn: bakuToday.AddDays(-10), dueOn: bakuToday, counterparty: "Bu gün");
        var late = await client.AddDebtAsync(DebtDirection.Payable, 100m, openedOn: bakuToday.AddDays(-10), dueOn: bakuToday.AddDays(-1), counterparty: "Dünən");
        var settledLate = await client.AddDebtAsync(DebtDirection.Payable, 50m, openedOn: bakuToday.AddDays(-10), dueOn: bakuToday.AddDays(-1), counterparty: "Ödənilib");
        using var settle = await client.PayAsync(settledLate.Debt.Id, cash.Id, 50m, bakuToday);
        settle.EnsureSuccessStatusCode();

        Assert.False((await client.DebtAsync(dueToday.Debt.Id)).Debt.IsOverdue);
        Assert.True((await client.DebtAsync(late.Debt.Id)).Debt.IsOverdue);
        Assert.False((await client.DebtAsync(settledLate.Debt.Id)).Debt.IsOverdue);

        // Move the profile far west: "today" there is still yesterday for a while after Baku midnight, so the
        // late debt can flip. The rule is judged against the profile zone, not the server's.
        await client.SetTimeZoneAsync("Pacific/Honolulu");
        var honoluluToday = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, TimeZoneInfo.FindSystemTimeZoneById("Pacific/Honolulu")));
        Assert.Equal(honoluluToday > bakuToday.AddDays(-1), (await client.DebtAsync(late.Debt.Id)).Debt.IsOverdue);

        var summary = await client.DebtSummaryAsync();
        Assert.Equal(honoluluToday, summary.Today);
    }

    [Fact]
    public async Task Summary_aggregates_every_debt_per_currency_independently_of_the_page()
    {
        using var client = await factory.NewUserClientAsync("debt");
        await client.SetupAsync(openingBalance: 1000m);
        var yesterday = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-3);

        for (var i = 0; i < 5; i++)
        {
            await client.AddDebtAsync(DebtDirection.Receivable, 100m, openedOn: yesterday.AddDays(-5), dueOn: yesterday, counterparty: $"R{i}");
        }

        await client.AddDebtAsync(DebtDirection.Payable, 400m, counterparty: "Bank");
        await client.AddDebtAsync(DebtDirection.Receivable, 70m, currency: "USD", counterparty: "USD");

        var page = (await client.GetFromJsonAsync<PagedResponse<DebtResponse>>($"{RecurringAndDebtTestClient.Debts}?direction=Receivable&pageSize=2"))!;
        Assert.Equal(2, page.Items.Count);
        Assert.Equal(6, page.TotalCount);

        var summary = await client.DebtSummaryAsync();
        var azn = summary.Currencies.Single(currency => currency.CurrencyCode == "AZN");
        Assert.Equal(500m, azn.ReceivableOutstanding);
        Assert.Equal(400m, azn.PayableOutstanding);
        Assert.Equal(500m, azn.OverdueReceivable);
        Assert.Equal(5, azn.OverdueCount);
        Assert.Equal(5, azn.OpenReceivables);
        var usd = summary.Currencies.Single(currency => currency.CurrencyCode == "USD");
        Assert.Equal(70m, usd.ReceivableOutstanding);
    }

    [Fact]
    public async Task Debts_and_their_payments_are_invisible_to_other_users()
    {
        using var owner = await factory.NewUserClientAsync("debt");
        using var other = await factory.NewUserClientAsync("debt");
        var setup = await owner.SetupAsync(openingBalance: 1000m);
        var otherSetup = await other.SetupAsync(openingBalance: 1000m);
        var debt = await owner.AddDebtAsync(DebtDirection.Receivable, 300m);

        using var get = await other.GetAsync($"{RecurringAndDebtTestClient.Debts}/{debt.Debt.Id}");
        Assert.Equal(HttpStatusCode.NotFound, get.StatusCode);
        // Paying the owner's debt from the other user's own account is refused at the debt, not the account.
        using var pay = await other.PayAsync(debt.Debt.Id, otherSetup.Accounts.Single().Id, 10m);
        Assert.Equal(HttpStatusCode.NotFound, pay.StatusCode);
        // Paying the owner's own debt from the *other user's* account (a foreign account id) looks absent too.
        using var foreignAccount = await owner.PayAsync(debt.Debt.Id, otherSetup.Accounts.Single().Id, 10m);
        Assert.Equal(HttpStatusCode.NotFound, foreignAccount.StatusCode);

        Assert.Empty((await other.GetFromJsonAsync<PagedResponse<DebtResponse>>(RecurringAndDebtTestClient.Debts))!.Items);
        Assert.Equal(1000m, (await owner.GetAccountAsync(setup.Accounts.Single().Id)).CurrentBalance);
    }
}
