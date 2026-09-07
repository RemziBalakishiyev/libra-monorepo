namespace Libra.Domain.Finance;

/// <summary>
/// A place money lives (cash, card, bank account...). Its currency is immutable once activity exists,
/// so every transaction and transfer inherits the account currency instead of storing its own.
/// </summary>
public sealed class FinancialAccount
{
    public const int NameMaxLength = 100;

    private FinancialAccount()
    {
    }

    public Guid Id { get; private set; }

    public Guid UserId { get; private set; }

    public string Name { get; private set; } = string.Empty;

    public FinancialAccountType Type { get; private set; }

    public string CurrencyCode { get; private set; } = string.Empty;

    public decimal OpeningBalance { get; private set; }

    public bool IsIncludedInTotal { get; private set; }

    public bool IsArchived { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public static FinancialAccount Create(
        Guid userId,
        string name,
        FinancialAccountType type,
        string currencyCode,
        decimal openingBalance,
        bool isIncludedInTotal,
        DateTime nowUtc)
    {
        EnsureValidName(name);
        EnsureValidOpeningBalance(openingBalance);

        return new FinancialAccount
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            Name = name.Trim(),
            Type = type,
            CurrencyCode = Money.NormalizeCurrencyCode(currencyCode),
            OpeningBalance = openingBalance,
            IsIncludedInTotal = isIncludedInTotal,
            IsArchived = false,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
        };
    }

    public void UpdateDetails(string name, FinancialAccountType type, bool isIncludedInTotal, DateTime nowUtc)
    {
        EnsureValidName(name);
        Name = name.Trim();
        Type = type;
        IsIncludedInTotal = isIncludedInTotal;
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>Only allowed while the account has no transactions or transfers; the caller checks activity.</summary>
    public void ChangeCurrency(string currencyCode, DateTime nowUtc)
    {
        CurrencyCode = Money.NormalizeCurrencyCode(currencyCode);
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>Only allowed while the account has no transactions or transfers; the caller checks activity.</summary>
    public void ChangeOpeningBalance(decimal openingBalance, DateTime nowUtc)
    {
        EnsureValidOpeningBalance(openingBalance);
        OpeningBalance = openingBalance;
        UpdatedAtUtc = nowUtc;
    }

    public void Archive(DateTime nowUtc)
    {
        IsArchived = true;
        UpdatedAtUtc = nowUtc;
    }

    public void Restore(DateTime nowUtc)
    {
        IsArchived = false;
        UpdatedAtUtc = nowUtc;
    }

    private static void EnsureValidName(string name)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(name.Trim().Length, NameMaxLength, nameof(name));
    }

    private static void EnsureValidOpeningBalance(decimal openingBalance)
    {
        if (!Money.HasValidScale(openingBalance))
        {
            throw new ArgumentException("Opening balance must have at most two decimal places.", nameof(openingBalance));
        }
    }
}
