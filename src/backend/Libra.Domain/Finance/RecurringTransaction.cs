namespace Libra.Domain.Finance;

/// <summary>
/// A monthly income or expense the user expects: rent, salary, a subscription. It is a plan, not money — nothing
/// here ever changes a balance. Each month it yields one <em>pending</em> occurrence, computed on read, which
/// becomes a real <see cref="FinancialTransaction"/> only when the user records it (<see cref="RecurringOccurrence"/>).
/// </summary>
public sealed class RecurringTransaction
{
    public const int TitleMaxLength = 120;
    public const int NoteMaxLength = 500;
    public const int MinDayOfMonth = 1;
    public const int MaxDayOfMonth = 31;

    private RecurringTransaction()
    {
    }

    public Guid Id { get; private set; }

    public Guid UserId { get; private set; }

    public string Title { get; private set; } = string.Empty;

    public FinancialTransactionType Type { get; private set; }

    public decimal Amount { get; private set; }

    /// <summary>Copied from the preferred account at creation; a recording must land on an account of this currency.</summary>
    public string CurrencyCode { get; private set; } = string.Empty;

    public Guid CategoryId { get; private set; }

    /// <summary>The account proposed when recording; the user may pick another of the same currency.</summary>
    public Guid AccountId { get; private set; }

    /// <summary>The requested day, 1–31. A day a month does not have resolves to that month's last day.</summary>
    public int DayOfMonth { get; private set; }

    /// <summary>First calendar date an occurrence may fall on, in the profile time zone.</summary>
    public DateOnly StartDate { get; private set; }

    /// <summary>Last calendar date an occurrence may fall on, inclusive. Null means open-ended.</summary>
    public DateOnly? EndDate { get; private set; }

    /// <summary>False stops every month that is not already recorded, past ones included. History is untouched.</summary>
    public bool IsActive { get; private set; }

    public string? Note { get; private set; }

    public Guid? ClientRequestId { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public static RecurringTransaction Create(
        Guid userId,
        string title,
        FinancialTransactionType type,
        decimal amount,
        FinancialAccount account,
        FinanceCategory category,
        int dayOfMonth,
        DateOnly startDate,
        DateOnly? endDate,
        string? note,
        Guid? clientRequestId,
        DateTime nowUtc)
    {
        var template = new RecurringTransaction
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            IsActive = true,
            ClientRequestId = clientRequestId,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
        };
        template.Apply(title, type, amount, account, category, dayOfMonth, startDate, endDate, note, nowUtc);
        return template;
    }

    /// <summary>
    /// Changes the plan for every month that is not yet recorded — including earlier months the user never got
    /// to. Months already recorded keep their own snapshot and their own transaction.
    /// </summary>
    public void Update(
        string title,
        FinancialTransactionType type,
        decimal amount,
        FinancialAccount account,
        FinanceCategory category,
        int dayOfMonth,
        DateOnly startDate,
        DateOnly? endDate,
        string? note,
        DateTime nowUtc) => Apply(title, type, amount, account, category, dayOfMonth, startDate, endDate, note, nowUtc);

    public void SetActive(bool isActive, DateTime nowUtc)
    {
        IsActive = isActive;
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>
    /// The calendar date this plan falls on in a given month, or null when that month is outside the plan.
    /// The requested day is clamped to the month's length and asked for again the next month, so a plan for the
    /// 31st lands on 28 February and back on 31 March. Start and end are inclusive on the resolved date.
    /// </summary>
    public DateOnly? DueDateIn(int year, int month)
    {
        var day = Math.Min(DayOfMonth, DateTime.DaysInMonth(year, month));
        var due = new DateOnly(year, month, day);
        if (due < StartDate)
        {
            return null;
        }

        if (EndDate is DateOnly end && due > end)
        {
            return null;
        }

        return due;
    }

    private void Apply(
        string title,
        FinancialTransactionType type,
        decimal amount,
        FinancialAccount account,
        FinanceCategory category,
        int dayOfMonth,
        DateOnly startDate,
        DateOnly? endDate,
        string? note,
        DateTime nowUtc)
    {
        ArgumentNullException.ThrowIfNull(account);
        ArgumentNullException.ThrowIfNull(category);

        if (account.UserId != UserId || category.UserId != UserId)
        {
            throw new InvalidOperationException("Account and category must belong to the template owner.");
        }

        if (!category.Matches(type))
        {
            throw new InvalidOperationException("Category kind does not match the template type.");
        }

        if (!Money.IsPositiveAmount(amount))
        {
            throw new ArgumentException("Amount must be positive with at most two decimal places.", nameof(amount));
        }

        ArgumentOutOfRangeException.ThrowIfLessThan(dayOfMonth, MinDayOfMonth, nameof(dayOfMonth));
        ArgumentOutOfRangeException.ThrowIfGreaterThan(dayOfMonth, MaxDayOfMonth, nameof(dayOfMonth));

        if (endDate is DateOnly end && end < startDate)
        {
            throw new ArgumentException("End date must not be before the start date.", nameof(endDate));
        }

        var cleanTitle = title?.Trim() ?? string.Empty;
        ArgumentException.ThrowIfNullOrWhiteSpace(cleanTitle, nameof(title));
        ArgumentOutOfRangeException.ThrowIfGreaterThan(cleanTitle.Length, TitleMaxLength, nameof(title));

        Title = cleanTitle;
        Type = type;
        Amount = amount;
        CurrencyCode = account.CurrencyCode;
        CategoryId = category.Id;
        AccountId = account.Id;
        DayOfMonth = dayOfMonth;
        StartDate = startDate;
        EndDate = endDate;
        Note = FinancialTransaction.CleanNote(note);
        UpdatedAtUtc = nowUtc;
    }
}
