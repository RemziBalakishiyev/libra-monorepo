namespace Libra.Domain.Finance;

/// <summary>Income or expense category. Kind is immutable because transactions depend on it.</summary>
public sealed class FinanceCategory
{
    public const int NameMaxLength = 100;

    private FinanceCategory()
    {
    }

    public Guid Id { get; private set; }

    public Guid UserId { get; private set; }

    public string Name { get; private set; } = string.Empty;

    public FinanceCategoryKind Kind { get; private set; }

    public bool IsSystemDefault { get; private set; }

    public bool IsArchived { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public static FinanceCategory Create(Guid userId, string name, FinanceCategoryKind kind, bool isSystemDefault, DateTime nowUtc)
    {
        EnsureValidName(name);

        return new FinanceCategory
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            Name = name.Trim(),
            Kind = kind,
            IsSystemDefault = isSystemDefault,
            IsArchived = false,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
        };
    }

    public bool Matches(FinancialTransactionType type) =>
        (Kind == FinanceCategoryKind.Income && type == FinancialTransactionType.Income)
        || (Kind == FinanceCategoryKind.Expense && type == FinancialTransactionType.Expense);

    public void Rename(string name, DateTime nowUtc)
    {
        EnsureValidName(name);
        Name = name.Trim();
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
}
