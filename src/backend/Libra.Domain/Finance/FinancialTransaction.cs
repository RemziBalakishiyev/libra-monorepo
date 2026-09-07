namespace Libra.Domain.Finance;

/// <summary>
/// Income or expense on one account. Currency comes from the account. Transfers are a separate entity.
/// </summary>
public sealed class FinancialTransaction
{
    public const int NoteMaxLength = 500;

    private FinancialTransaction()
    {
    }

    public Guid Id { get; private set; }

    public Guid UserId { get; private set; }

    public Guid AccountId { get; private set; }

    public Guid CategoryId { get; private set; }

    public FinancialTransactionType Type { get; private set; }

    public decimal Amount { get; private set; }

    public DateTime OccurredAtUtc { get; private set; }

    public string? Note { get; private set; }

    /// <summary>Client-generated id that makes retried creates idempotent per user.</summary>
    public Guid? ClientRequestId { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public static FinancialTransaction Create(
        Guid userId,
        FinancialAccount account,
        FinanceCategory category,
        FinancialTransactionType type,
        decimal amount,
        DateTime occurredAtUtc,
        string? note,
        Guid? clientRequestId,
        DateTime nowUtc)
    {
        var transaction = new FinancialTransaction
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            ClientRequestId = clientRequestId,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
        };
        transaction.Apply(account, category, type, amount, occurredAtUtc, note, nowUtc);
        return transaction;
    }

    public void Update(
        FinancialAccount account,
        FinanceCategory category,
        FinancialTransactionType type,
        decimal amount,
        DateTime occurredAtUtc,
        string? note,
        DateTime nowUtc) => Apply(account, category, type, amount, occurredAtUtc, note, nowUtc);

    private void Apply(
        FinancialAccount account,
        FinanceCategory category,
        FinancialTransactionType type,
        decimal amount,
        DateTime occurredAtUtc,
        string? note,
        DateTime nowUtc)
    {
        ArgumentNullException.ThrowIfNull(account);
        ArgumentNullException.ThrowIfNull(category);

        if (account.UserId != UserId || category.UserId != UserId)
        {
            throw new InvalidOperationException("Account and category must belong to the transaction owner.");
        }

        if (!category.Matches(type))
        {
            throw new InvalidOperationException("Category kind does not match the transaction type.");
        }

        if (!Money.IsPositiveAmount(amount))
        {
            throw new ArgumentException("Amount must be positive with at most two decimal places.", nameof(amount));
        }

        AccountId = account.Id;
        CategoryId = category.Id;
        Type = type;
        Amount = amount;
        OccurredAtUtc = occurredAtUtc;
        Note = CleanNote(note);
        UpdatedAtUtc = nowUtc;
    }

    internal static string? CleanNote(string? note)
    {
        var trimmed = note?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return null;
        }

        ArgumentOutOfRangeException.ThrowIfGreaterThan(trimmed.Length, NoteMaxLength, nameof(note));
        return trimmed;
    }
}
