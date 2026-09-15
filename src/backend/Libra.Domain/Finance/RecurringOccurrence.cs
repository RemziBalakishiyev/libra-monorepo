using System.Text.Json.Serialization;

namespace Libra.Domain.Finance;

[JsonConverter(typeof(JsonStringEnumConverter<RecurringOccurrenceStatus>))]
public enum RecurringOccurrenceStatus
{
    /// <summary>Computed, never stored: the month is scheduled and nothing has happened yet.</summary>
    Pending,

    /// <summary>The user confirmed it; exactly one ordinary transaction exists for it.</summary>
    Recorded,

    /// <summary>The user decided this month will not be recorded, or undid a recording. Nothing regenerates it.</summary>
    Skipped,
}

/// <summary>
/// What happened to one template in one month. A row exists only once the user acted — recorded or skipped — so
/// the table is a history, and <c>(template, year, month)</c> being unique is what makes a double confirmation
/// impossible whatever the network did.
/// </summary>
public sealed class RecurringOccurrence
{
    public const int TitleMaxLength = RecurringTransaction.TitleMaxLength;

    private RecurringOccurrence()
    {
    }

    public Guid Id { get; private set; }

    public Guid UserId { get; private set; }

    public Guid TemplateId { get; private set; }

    public int Year { get; private set; }

    public int Month { get; private set; }

    /// <summary>The date the plan resolved to when the user acted, kept even if the template changes later.</summary>
    public DateOnly DueDate { get; private set; }

    public RecurringOccurrenceStatus Status { get; private set; }

    /// <summary>The ordinary transaction this recording created. Null once undone or when skipped.</summary>
    public Guid? TransactionId { get; private set; }

    /// <summary>Snapshot of what was recorded, so the list stays truthful after the template moves on.</summary>
    public string Title { get; private set; } = string.Empty;

    public decimal Amount { get; private set; }

    public string CurrencyCode { get; private set; } = string.Empty;

    public Guid? ClientRequestId { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public static RecurringOccurrence Recorded(
        Guid userId,
        RecurringTransaction template,
        int year,
        int month,
        DateOnly dueDate,
        FinancialTransaction transaction,
        Guid? clientRequestId,
        DateTime nowUtc)
    {
        ArgumentNullException.ThrowIfNull(template);
        ArgumentNullException.ThrowIfNull(transaction);
        if (template.UserId != userId || transaction.UserId != userId)
        {
            throw new InvalidOperationException("Template and transaction must belong to the occurrence owner.");
        }

        return new RecurringOccurrence
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            TemplateId = template.Id,
            Year = year,
            Month = month,
            DueDate = dueDate,
            Status = RecurringOccurrenceStatus.Recorded,
            TransactionId = transaction.Id,
            Title = template.Title,
            Amount = transaction.Amount,
            CurrencyCode = template.CurrencyCode,
            ClientRequestId = clientRequestId,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
        };
    }

    public static RecurringOccurrence Skipped(Guid userId, RecurringTransaction template, int year, int month, DateOnly dueDate, DateTime nowUtc)
    {
        ArgumentNullException.ThrowIfNull(template);
        if (template.UserId != userId)
        {
            throw new InvalidOperationException("Template must belong to the occurrence owner.");
        }

        return new RecurringOccurrence
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            TemplateId = template.Id,
            Year = year,
            Month = month,
            DueDate = dueDate,
            Status = RecurringOccurrenceStatus.Skipped,
            Title = template.Title,
            Amount = template.Amount,
            CurrencyCode = template.CurrencyCode,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
        };
    }

    /// <summary>A skipped month the user records after all. The recording is what it would have been the first time.</summary>
    public void Record(RecurringTransaction template, FinancialTransaction transaction, Guid? clientRequestId, DateTime nowUtc)
    {
        ArgumentNullException.ThrowIfNull(template);
        ArgumentNullException.ThrowIfNull(transaction);
        if (Status == RecurringOccurrenceStatus.Recorded)
        {
            throw new InvalidOperationException("This month is already recorded.");
        }

        Status = RecurringOccurrenceStatus.Recorded;
        TransactionId = transaction.Id;
        Title = template.Title;
        Amount = transaction.Amount;
        ClientRequestId = clientRequestId;
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>
    /// Undoes a recording: the link is dropped and the month becomes skipped, so it stays in history and is never
    /// proposed again on its own. Deleting the transaction itself is the caller's job, in the same save.
    /// Returns false when there was nothing to undo, which keeps a retried undo harmless.
    /// </summary>
    public bool Undo(DateTime nowUtc)
    {
        if (Status != RecurringOccurrenceStatus.Recorded)
        {
            return false;
        }

        Status = RecurringOccurrenceStatus.Skipped;
        TransactionId = null;
        ClientRequestId = null;
        UpdatedAtUtc = nowUtc;
        return true;
    }
}
