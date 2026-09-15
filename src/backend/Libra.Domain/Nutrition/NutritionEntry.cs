namespace Libra.Domain.Nutrition;

/// <summary>
/// One meal: when it was eaten, which meal of the day it was, and the foods it contained. Totals are derived
/// from the items and stored on them, so a day's figures are a sum over stored rows rather than a recomputation
/// of what the user once entered.
/// </summary>
public sealed class NutritionEntry
{
    public const int NoteMaxLength = 500;
    public const int MinItems = 1;
    public const int MaxItems = 20;

    private readonly List<NutritionEntryItem> _items = [];

    private NutritionEntry()
    {
    }

    public Guid Id { get; private set; }

    public Guid UserId { get; private set; }

    public MealType MealType { get; private set; }

    public DateTime ConsumedAtUtc { get; private set; }

    public string? Note { get; private set; }

    /// <summary>Client-generated id that makes retried creates idempotent per user.</summary>
    public Guid? ClientRequestId { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public IReadOnlyList<NutritionEntryItem> Items => _items;

    public decimal EnergyKcal => _items.Sum(item => item.EnergyKcal);

    public static NutritionEntry Create(
        Guid userId,
        MealType mealType,
        DateTime consumedAtUtc,
        string? note,
        IEnumerable<NutritionItemDraft> items,
        Guid? clientRequestId,
        DateTime nowUtc)
    {
        var entry = new NutritionEntry
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            ClientRequestId = clientRequestId,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
        };
        entry.Apply(mealType, consumedAtUtc, note, items, nowUtc);
        return entry;
    }

    /// <summary>
    /// Replaces the whole item list with fresh snapshots. Item ids sent by a client are never reused, so an
    /// edit can neither adopt another user's item nor mutate the row another entry stored.
    /// </summary>
    public void Update(MealType mealType, DateTime consumedAtUtc, string? note, IEnumerable<NutritionItemDraft> items, DateTime nowUtc) =>
        Apply(mealType, consumedAtUtc, note, items, nowUtc);

    private void Apply(MealType mealType, DateTime consumedAtUtc, string? note, IEnumerable<NutritionItemDraft> items, DateTime nowUtc)
    {
        ArgumentNullException.ThrowIfNull(items);

        if (!Enum.IsDefined(mealType))
        {
            throw new ArgumentException("Unknown meal type.", nameof(mealType));
        }

        var drafts = items.ToList();
        if (drafts.Count < MinItems)
        {
            throw new ArgumentException("A meal needs at least one food item.", nameof(items));
        }

        if (drafts.Count > MaxItems)
        {
            throw new ArgumentException($"A meal can hold at most {MaxItems} food items.", nameof(items));
        }

        var replacements = drafts.Select((draft, index) => NutritionEntryItem.Create(UserId, Id, draft, index)).ToList();

        MealType = mealType;
        ConsumedAtUtc = consumedAtUtc;
        Note = CleanNote(note);
        _items.Clear();
        _items.AddRange(replacements);
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
