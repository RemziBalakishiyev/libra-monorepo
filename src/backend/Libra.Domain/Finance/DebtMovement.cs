using System.Text.Json.Serialization;

namespace Libra.Domain.Finance;

[JsonConverter(typeof(JsonStringEnumConverter<DebtMovementKind>))]
public enum DebtMovementKind
{
    /// <summary>Money changed hands when the debt was created: lent out (receivable) or borrowed (payable).</summary>
    Opening,

    /// <summary>Principal repaid: received back (receivable) or paid off (payable).</summary>
    Payment,
}

/// <summary>
/// One movement of principal through an account. This is what changes cash — never the debt row itself —
/// and it is not a <see cref="FinancialTransaction"/>: lending, borrowing and repaying are neither income nor
/// spending, so they never reach the monthly totals or a budget. The balance calculator adds them in with the
/// sign <see cref="CashEffect"/> gives.
///
/// A movement is never deleted. Undoing one marks it reversed, which removes it from every sum while keeping the
/// history readable and making a retried undo a no-op.
/// </summary>
public sealed class DebtMovement
{
    public const int NoteMaxLength = 500;

    private DebtMovement()
    {
    }

    public Guid Id { get; private set; }

    public Guid UserId { get; private set; }

    public Guid DebtId { get; private set; }

    public DebtMovementKind Kind { get; private set; }

    public Guid AccountId { get; private set; }

    public decimal Amount { get; private set; }

    public DateTime OccurredAtUtc { get; private set; }

    public string? Note { get; private set; }

    public Guid? ClientRequestId { get; private set; }

    /// <summary>Set when undone. A reversed movement stays in history and counts for nothing.</summary>
    public DateTime? ReversedAtUtc { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public bool IsReversed => ReversedAtUtc is not null;

    public static DebtMovement Create(
        Debt debt,
        DebtMovementKind kind,
        FinancialAccount account,
        decimal amount,
        DateTime occurredAtUtc,
        string? note,
        Guid? clientRequestId,
        DateTime nowUtc)
    {
        ArgumentNullException.ThrowIfNull(debt);
        ArgumentNullException.ThrowIfNull(account);

        if (account.UserId != debt.UserId)
        {
            throw new InvalidOperationException("Account must belong to the debt owner.");
        }

        if (account.CurrencyCode != debt.CurrencyCode)
        {
            throw new InvalidOperationException("Account currency must match the debt currency.");
        }

        if (!Money.IsPositiveAmount(amount))
        {
            throw new ArgumentException("Amount must be positive with at most two decimal places.", nameof(amount));
        }

        return new DebtMovement
        {
            Id = Guid.CreateVersion7(),
            UserId = debt.UserId,
            DebtId = debt.Id,
            Kind = kind,
            AccountId = account.Id,
            Amount = amount,
            OccurredAtUtc = occurredAtUtc,
            Note = FinancialTransaction.CleanNote(note),
            ClientRequestId = clientRequestId,
            CreatedAtUtc = nowUtc,
        };
    }

    /// <summary>Returns false when already reversed, so a retried undo changes nothing and still succeeds.</summary>
    public bool Reverse(DateTime nowUtc)
    {
        if (IsReversed)
        {
            return false;
        }

        ReversedAtUtc = nowUtc;
        return true;
    }

    /// <summary>
    /// How much the account balance moves, signed. Lending out and repaying a loan take cash away; borrowing and
    /// being repaid bring it in.
    /// </summary>
    public static decimal CashEffect(DebtDirection direction, DebtMovementKind kind, decimal amount) =>
        (direction, kind) switch
        {
            (DebtDirection.Receivable, DebtMovementKind.Opening) => -amount,
            (DebtDirection.Receivable, DebtMovementKind.Payment) => amount,
            (DebtDirection.Payable, DebtMovementKind.Opening) => amount,
            (DebtDirection.Payable, DebtMovementKind.Payment) => -amount,
            _ => throw new ArgumentOutOfRangeException(nameof(kind)),
        };
}
