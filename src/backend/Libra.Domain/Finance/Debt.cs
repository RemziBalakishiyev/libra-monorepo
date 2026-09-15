using System.Text.Json.Serialization;

namespace Libra.Domain.Finance;

[JsonConverter(typeof(JsonStringEnumConverter<DebtDirection>))]
public enum DebtDirection
{
    /// <summary>Someone owes the user ("Mənə borcludurlar").</summary>
    Receivable,

    /// <summary>The user owes someone ("Mən borcluyam").</summary>
    Payable,
}

[JsonConverter(typeof(JsonStringEnumConverter<DebtStatus>))]
public enum DebtStatus
{
    Open,
    PartiallyPaid,
    Settled,
}

/// <summary>
/// A principal obligation with a counterparty: what was lent or borrowed, and what is still outstanding.
///
/// The debt itself moves no money. Cash changes only through <see cref="DebtMovement"/> rows — an opening
/// movement when money changes hands at creation, and payments afterwards — and the remaining principal is
/// always <c>Principal − Σ valid payments</c>, never a stored number. Interest, schedules and currency conversion
/// are deliberately outside this model.
/// </summary>
public sealed class Debt
{
    public const int CounterpartyMaxLength = 120;
    public const int NoteMaxLength = 500;

    private Debt()
    {
    }

    public Guid Id { get; private set; }

    public Guid UserId { get; private set; }

    public DebtDirection Direction { get; private set; }

    public string CounterpartyName { get; private set; } = string.Empty;

    public decimal Principal { get; private set; }

    public string CurrencyCode { get; private set; } = string.Empty;

    /// <summary>Calendar date the obligation began, in the profile time zone.</summary>
    public DateOnly OpenedOn { get; private set; }

    /// <summary>Calendar date it is due, inclusive; overdue begins the day after. Null means no deadline.</summary>
    public DateOnly? DueOn { get; private set; }

    public string? Note { get; private set; }

    public Guid? ClientRequestId { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public static Debt Create(
        Guid userId,
        DebtDirection direction,
        string counterpartyName,
        decimal principal,
        string currencyCode,
        DateOnly openedOn,
        DateOnly? dueOn,
        string? note,
        Guid? clientRequestId,
        DateTime nowUtc)
    {
        if (!Money.IsPositiveAmount(principal))
        {
            throw new ArgumentException("Principal must be positive with at most two decimal places.", nameof(principal));
        }

        var debt = new Debt
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            Direction = direction,
            Principal = principal,
            CurrencyCode = Money.NormalizeCurrencyCode(currencyCode),
            OpenedOn = openedOn,
            ClientRequestId = clientRequestId,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
        };
        debt.Describe(counterpartyName, dueOn, note, nowUtc);
        return debt;
    }

    /// <summary>The fields that are always safe to change: who, when it is due, and the note.</summary>
    public void Describe(string counterpartyName, DateOnly? dueOn, string? note, DateTime nowUtc)
    {
        var name = counterpartyName?.Trim() ?? string.Empty;
        ArgumentException.ThrowIfNullOrWhiteSpace(name, nameof(counterpartyName));
        ArgumentOutOfRangeException.ThrowIfGreaterThan(name.Length, CounterpartyMaxLength, nameof(counterpartyName));

        if (dueOn is DateOnly due && due < OpenedOn)
        {
            throw new ArgumentException("Due date must not be before the opening date.", nameof(dueOn));
        }

        CounterpartyName = name;
        DueOn = dueOn;
        Note = FinancialTransaction.CleanNote(note);
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>
    /// The structural fields. Only allowed while nothing has moved: once cash or a payment exists, the amount
    /// and currency are what those rows were recorded against, and changing them here would leave the rows
    /// telling a different story.
    /// </summary>
    public void Restructure(decimal principal, DateOnly openedOn, DateOnly? dueOn, DateTime nowUtc)
    {
        if (!Money.IsPositiveAmount(principal))
        {
            throw new ArgumentException("Principal must be positive with at most two decimal places.", nameof(principal));
        }

        if (dueOn is DateOnly due && due < openedOn)
        {
            throw new ArgumentException("Due date must not be before the opening date.", nameof(dueOn));
        }

        Principal = principal;
        OpenedOn = openedOn;
        DueOn = dueOn;
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>
    /// Marks the debt as having changed alongside a payment. The row version moves with it, so two payments
    /// racing on the same debt cannot both commit: the second one's save fails on the version check inside its
    /// own transaction, before its payment row is visible to anyone.
    /// </summary>
    public void Touch(DateTime nowUtc) => UpdatedAtUtc = nowUtc;

    public static decimal RemainingOf(decimal principal, decimal paid) => principal - paid;

    public static DebtStatus StatusOf(decimal principal, decimal paid)
    {
        if (paid >= principal)
        {
            return DebtStatus.Settled;
        }

        return paid > 0 ? DebtStatus.PartiallyPaid : DebtStatus.Open;
    }

    /// <summary>Overdue once the due date is over in the profile time zone and something is still outstanding.</summary>
    public static bool IsOverdue(DateOnly? dueOn, DebtStatus status, DateOnly todayLocal) =>
        dueOn is DateOnly due && status != DebtStatus.Settled && todayLocal > due;
}
