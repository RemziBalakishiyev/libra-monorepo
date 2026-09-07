namespace Libra.Domain.Finance;

/// <summary>
/// Money moved between two of the user's own accounts. Never income, never expense, never budget usage.
/// Cross-currency transfers carry both amounts as entered by the user.
/// </summary>
public sealed class AccountTransfer
{
    private AccountTransfer()
    {
    }

    public Guid Id { get; private set; }

    public Guid UserId { get; private set; }

    public Guid SourceAccountId { get; private set; }

    public Guid DestinationAccountId { get; private set; }

    public decimal SourceAmount { get; private set; }

    public decimal DestinationAmount { get; private set; }

    public DateTime OccurredAtUtc { get; private set; }

    public string? Note { get; private set; }

    public Guid? ClientRequestId { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public static AccountTransfer Create(
        Guid userId,
        FinancialAccount source,
        FinancialAccount destination,
        decimal sourceAmount,
        decimal destinationAmount,
        DateTime occurredAtUtc,
        string? note,
        Guid? clientRequestId,
        DateTime nowUtc)
    {
        var transfer = new AccountTransfer
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            ClientRequestId = clientRequestId,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
        };
        transfer.Apply(source, destination, sourceAmount, destinationAmount, occurredAtUtc, note, nowUtc);
        return transfer;
    }

    public void Update(
        FinancialAccount source,
        FinancialAccount destination,
        decimal sourceAmount,
        decimal destinationAmount,
        DateTime occurredAtUtc,
        string? note,
        DateTime nowUtc) => Apply(source, destination, sourceAmount, destinationAmount, occurredAtUtc, note, nowUtc);

    /// <summary>Informational destination-per-source rate for cross-currency transfers; null for same currency.</summary>
    public static decimal? EffectiveRate(string sourceCurrency, string destinationCurrency, decimal sourceAmount, decimal destinationAmount) =>
        string.Equals(sourceCurrency, destinationCurrency, StringComparison.Ordinal) || sourceAmount == 0
            ? null
            : decimal.Round(destinationAmount / sourceAmount, 6);

    private void Apply(
        FinancialAccount source,
        FinancialAccount destination,
        decimal sourceAmount,
        decimal destinationAmount,
        DateTime occurredAtUtc,
        string? note,
        DateTime nowUtc)
    {
        ArgumentNullException.ThrowIfNull(source);
        ArgumentNullException.ThrowIfNull(destination);

        if (source.UserId != UserId || destination.UserId != UserId)
        {
            throw new InvalidOperationException("Both accounts must belong to the transfer owner.");
        }

        if (source.Id == destination.Id)
        {
            throw new ArgumentException("Source and destination accounts must differ.", nameof(destination));
        }

        if (!Money.IsPositiveAmount(sourceAmount) || !Money.IsPositiveAmount(destinationAmount))
        {
            throw new ArgumentException("Transfer amounts must be positive with at most two decimal places.");
        }

        if (string.Equals(source.CurrencyCode, destination.CurrencyCode, StringComparison.Ordinal) && sourceAmount != destinationAmount)
        {
            throw new ArgumentException("Same-currency transfers must have equal source and destination amounts.");
        }

        SourceAccountId = source.Id;
        DestinationAccountId = destination.Id;
        SourceAmount = sourceAmount;
        DestinationAmount = destinationAmount;
        OccurredAtUtc = occurredAtUtc;
        Note = FinancialTransaction.CleanNote(note);
        UpdatedAtUtc = nowUtc;
    }
}
