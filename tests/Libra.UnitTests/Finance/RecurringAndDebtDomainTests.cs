using Libra.Domain.Finance;

namespace Libra.UnitTests.Finance;

public sealed class RecurringAndDebtDomainTests
{
    private static readonly DateTime Now = new(2026, 9, 15, 12, 0, 0, DateTimeKind.Utc);
    private static readonly Guid Owner = Guid.NewGuid();

    private static (FinancialAccount Account, FinanceCategory Category) References(string currency = "AZN", FinanceCategoryKind kind = FinanceCategoryKind.Expense)
    {
        var account = FinancialAccount.Create(Owner, "Nağd", FinancialAccountType.Cash, currency, 0m, true, Now);
        var category = FinanceCategory.Create(Owner, kind == FinanceCategoryKind.Expense ? "Kirayə" : "Maaş", kind, false, Now);
        return (account, category);
    }

    private static RecurringTransaction Template(int day, DateOnly start, DateOnly? end = null)
    {
        var (account, category) = References();
        return RecurringTransaction.Create(Owner, "Kirayə", FinancialTransactionType.Expense, 450m, account, category, day, start, end, null, null, Now);
    }

    [Theory]
    [InlineData(31, 2026, 2, 28)]  // February in a common year
    [InlineData(31, 2028, 2, 29)]  // February in a leap year
    [InlineData(30, 2026, 2, 28)]
    [InlineData(31, 2026, 4, 30)]  // thirty-day month
    [InlineData(29, 2027, 2, 28)]  // day 29 in a common-year February
    [InlineData(29, 2028, 2, 29)]  // and in a leap-year February
    [InlineData(31, 2026, 3, 31)]  // the requested day comes back the next month
    [InlineData(15, 2026, 2, 15)]  // a day every month has is never moved
    public void Requested_day_is_clamped_to_the_month_and_asked_for_again_next_month(int day, int year, int month, int expectedDay)
    {
        var template = Template(day, new DateOnly(2025, 1, 1));

        Assert.Equal(new DateOnly(year, month, expectedDay), template.DueDateIn(year, month));
    }

    [Fact]
    public void Start_and_end_are_inclusive_on_the_resolved_date()
    {
        // Plan for the 31st starting 28 February 2026 — the February due date *is* the 28th, so it counts.
        var template = Template(31, new DateOnly(2026, 2, 28), new DateOnly(2026, 4, 30));

        Assert.Equal(new DateOnly(2026, 2, 28), template.DueDateIn(2026, 2));
        Assert.Equal(new DateOnly(2026, 4, 30), template.DueDateIn(2026, 4));
        Assert.Null(template.DueDateIn(2026, 1));
        Assert.Null(template.DueDateIn(2026, 5));
    }

    [Fact]
    public void A_month_whose_resolved_date_falls_before_the_start_is_not_scheduled()
    {
        // Starting on the 20th: this month's 15th is before the start, next month's is not.
        var template = Template(15, new DateOnly(2026, 9, 20));

        Assert.Null(template.DueDateIn(2026, 9));
        Assert.Equal(new DateOnly(2026, 10, 15), template.DueDateIn(2026, 10));
    }

    [Fact]
    public void Template_takes_its_currency_from_the_account_and_refuses_a_mismatched_category()
    {
        var (account, _) = References("USD");
        var (_, incomeCategory) = References(kind: FinanceCategoryKind.Income);

        var template = RecurringTransaction.Create(Owner, "Abunə", FinancialTransactionType.Expense, 9.99m, account, References("USD").Category, 1, new DateOnly(2026, 1, 1), null, null, null, Now);
        Assert.Equal("USD", template.CurrencyCode);

        Assert.Throws<InvalidOperationException>(() =>
            RecurringTransaction.Create(Owner, "Abunə", FinancialTransactionType.Expense, 9.99m, account, incomeCategory, 1, new DateOnly(2026, 1, 1), null, null, null, Now));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            RecurringTransaction.Create(Owner, "Abunə", FinancialTransactionType.Expense, 9.99m, account, References("USD").Category, 32, new DateOnly(2026, 1, 1), null, null, null, Now));
        Assert.Throws<ArgumentException>(() =>
            RecurringTransaction.Create(Owner, "Abunə", FinancialTransactionType.Expense, 9.99m, account, References("USD").Category, 1, new DateOnly(2026, 2, 1), new DateOnly(2026, 1, 1), null, null, Now));
    }

    [Fact]
    public void Recorded_occurrence_snapshots_the_template_and_undo_keeps_the_month_as_skipped()
    {
        var template = Template(1, new DateOnly(2026, 1, 1));
        var (account, category) = References();
        var transaction = FinancialTransaction.Create(Owner, account, category, FinancialTransactionType.Expense, 450m, Now, null, null, Now);

        var occurrence = RecurringOccurrence.Recorded(Owner, template, 2026, 9, new DateOnly(2026, 9, 1), transaction, null, Now);
        Assert.Equal(RecurringOccurrenceStatus.Recorded, occurrence.Status);
        Assert.Equal(transaction.Id, occurrence.TransactionId);

        // The template moves on; the recorded month keeps what it recorded.
        template.Update("Kirayə (yeni)", FinancialTransactionType.Expense, 500m, account, category, 5, new DateOnly(2026, 1, 1), null, null, Now);
        Assert.Equal("Kirayə", occurrence.Title);
        Assert.Equal(450m, occurrence.Amount);

        Assert.True(occurrence.Undo(Now));
        Assert.Equal(RecurringOccurrenceStatus.Skipped, occurrence.Status);
        Assert.Null(occurrence.TransactionId);
        // Undoing again changes nothing and reports so.
        Assert.False(occurrence.Undo(Now));
    }

    [Theory]
    [InlineData(DebtDirection.Receivable, DebtMovementKind.Opening, -300)]
    [InlineData(DebtDirection.Receivable, DebtMovementKind.Payment, 100)]
    [InlineData(DebtDirection.Payable, DebtMovementKind.Opening, 500)]
    [InlineData(DebtDirection.Payable, DebtMovementKind.Payment, -100)]
    public void Principal_movements_change_cash_with_the_sign_of_their_direction(DebtDirection direction, DebtMovementKind kind, decimal expected)
    {
        Assert.Equal(expected, DebtMovement.CashEffect(direction, kind, Math.Abs(expected)));
    }

    [Theory]
    [InlineData(300, 0, DebtStatus.Open, 300)]
    [InlineData(300, 100, DebtStatus.PartiallyPaid, 200)]
    [InlineData(300, 300, DebtStatus.Settled, 0)]
    public void Remaining_and_status_derive_from_principal_and_paid(decimal principal, decimal paid, DebtStatus status, decimal remaining)
    {
        Assert.Equal(remaining, Debt.RemainingOf(principal, paid));
        Assert.Equal(status, Debt.StatusOf(principal, paid));
    }

    [Fact]
    public void Overdue_begins_the_day_after_the_due_date_and_never_applies_once_settled()
    {
        var due = new DateOnly(2026, 9, 15);

        Assert.False(Debt.IsOverdue(due, DebtStatus.Open, new DateOnly(2026, 9, 15)));
        Assert.True(Debt.IsOverdue(due, DebtStatus.Open, new DateOnly(2026, 9, 16)));
        // Partially paid and late is still late.
        Assert.True(Debt.IsOverdue(due, DebtStatus.PartiallyPaid, new DateOnly(2026, 9, 16)));
        Assert.False(Debt.IsOverdue(due, DebtStatus.Settled, new DateOnly(2027, 1, 1)));
        Assert.False(Debt.IsOverdue(null, DebtStatus.Open, new DateOnly(2027, 1, 1)));
    }

    [Fact]
    public void A_movement_requires_the_owner_account_in_the_debt_currency_and_a_positive_amount()
    {
        var debt = Debt.Create(Owner, DebtDirection.Receivable, "Rəşad", 300m, "azn", new DateOnly(2026, 9, 1), null, null, null, Now);
        Assert.Equal("AZN", debt.CurrencyCode);

        var (usdAccount, _) = References("USD");
        var (aznAccount, _) = References();
        var foreign = FinancialAccount.Create(Guid.NewGuid(), "Başqası", FinancialAccountType.Cash, "AZN", 0m, true, Now);

        Assert.Throws<InvalidOperationException>(() => DebtMovement.Create(debt, DebtMovementKind.Payment, usdAccount, 100m, Now, null, null, Now));
        Assert.Throws<InvalidOperationException>(() => DebtMovement.Create(debt, DebtMovementKind.Payment, foreign, 100m, Now, null, null, Now));
        Assert.Throws<ArgumentException>(() => DebtMovement.Create(debt, DebtMovementKind.Payment, aznAccount, 0m, Now, null, null, Now));
        Assert.Throws<ArgumentException>(() => DebtMovement.Create(debt, DebtMovementKind.Payment, aznAccount, 10.005m, Now, null, null, Now));

        var payment = DebtMovement.Create(debt, DebtMovementKind.Payment, aznAccount, 100m, Now, null, null, Now);
        Assert.True(payment.Reverse(Now));
        Assert.True(payment.IsReversed);
        Assert.False(payment.Reverse(Now));
    }

    [Fact]
    public void Due_date_may_not_precede_the_opening_date()
    {
        Assert.Throws<ArgumentException>(() => Debt.Create(Owner, DebtDirection.Payable, "Bank", 500m, "AZN", new DateOnly(2026, 9, 10), new DateOnly(2026, 9, 1), null, null, Now));
    }
}
