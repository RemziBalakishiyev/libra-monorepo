namespace Libra.Domain.Finance;

/// <summary>
/// Expense budget for one local calendar month and currency. CategoryId null means the overall budget.
/// </summary>
public sealed class MonthlyBudget
{
    public const int MinYear = 2000;
    public const int MaxYear = 2100;

    private MonthlyBudget()
    {
    }

    public Guid Id { get; private set; }

    public Guid UserId { get; private set; }

    public int Year { get; private set; }

    public int Month { get; private set; }

    public string CurrencyCode { get; private set; } = string.Empty;

    public Guid? CategoryId { get; private set; }

    public decimal Amount { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public bool IsOverall => CategoryId is null;

    public static MonthlyBudget Create(Guid userId, int year, int month, string currencyCode, Guid? categoryId, decimal amount, DateTime nowUtc)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(year, MinYear);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(year, MaxYear);
        ArgumentOutOfRangeException.ThrowIfLessThan(month, 1);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(month, 12);

        var budget = new MonthlyBudget
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            Year = year,
            Month = month,
            CurrencyCode = Money.NormalizeCurrencyCode(currencyCode),
            CategoryId = categoryId,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
        };
        budget.ChangeAmount(amount, nowUtc);
        return budget;
    }

    public void ChangeAmount(decimal amount, DateTime nowUtc)
    {
        if (!Money.IsPositiveAmount(amount))
        {
            throw new ArgumentException("Budget amount must be positive with at most two decimal places.", nameof(amount));
        }

        Amount = amount;
        UpdatedAtUtc = nowUtc;
    }
}
