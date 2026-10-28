namespace Libra.Domain.Assistant;

/// <summary>Who said it. The assistant's own turns carry the answer; the user's carry the question.</summary>
public enum AssistantRole
{
    User = 0,
    Assistant = 1,
}

/// <summary>
/// One conversation with the assistant, owned by one user.
///
/// A conversation remembers the modules and period it was scoped to. Changing that scope starts a new
/// conversation rather than reinterpreting the old one, so an earlier turn can never quietly reintroduce a
/// module the user has since excluded.
/// </summary>
public sealed class AssistantConversation
{
    public const int TitleMaxLength = 120;

    private AssistantConversation()
    {
    }

    public Guid Id { get; private set; }

    public Guid UserId { get; private set; }

    /// <summary>Taken from the first question, so the history list is readable without opening anything.</summary>
    public string Title { get; private set; } = string.Empty;

    /// <summary>The modules this conversation is scoped to, stored as their names, comma separated.</summary>
    public string Modules { get; private set; } = string.Empty;

    public string Period { get; private set; } = string.Empty;

    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>When the last turn landed, so history can be ordered by recency without a join.</summary>
    public DateTime UpdatedAtUtc { get; private set; }

    public static AssistantConversation Start(Guid userId, string firstQuestion, string modules, string period, DateTime nowUtc)
    {
        var title = (firstQuestion ?? string.Empty).Trim();
        if (title.Length > TitleMaxLength)
        {
            title = title[..TitleMaxLength];
        }

        return new AssistantConversation
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            Title = string.IsNullOrEmpty(title) ? "Söhbət" : title,
            Modules = modules,
            Period = period,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
        };
    }

    public void Touch(DateTime nowUtc) => UpdatedAtUtc = nowUtc;
}

/// <summary>
/// One turn. A user turn holds the question; an assistant turn holds the validated answer **and the snapshot
/// it was grounded in**, serialized as it was at the time.
///
/// Keeping the snapshot is what stops an old answer from appearing to describe today's figures: the interface
/// renders yesterday's metric cards from yesterday's numbers, with the moment they were collected.
/// </summary>
public sealed class AssistantMessage
{
    public const int QuestionMaxLength = 1000;

    private AssistantMessage()
    {
    }

    public Guid Id { get; private set; }

    public Guid UserId { get; private set; }

    public Guid ConversationId { get; private set; }

    public AssistantRole Role { get; private set; }

    /// <summary>The user's question, or the assistant's summary. Record text is data, never instruction.</summary>
    public string Text { get; private set; } = string.Empty;

    /// <summary>The validated answer as JSON, for an assistant turn.</summary>
    public string? AnswerJson { get; private set; }

    /// <summary>The snapshot this turn was answered from, as JSON. Never re-derived on read.</summary>
    public string? SnapshotJson { get; private set; }

    /// <summary>The client's id for the turn. Unique per user, which makes a retried send idempotent.</summary>
    public Guid? ClientRequestId { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public static AssistantMessage Question(Guid userId, Guid conversationId, string text, Guid? clientRequestId, DateTime nowUtc)
    {
        var trimmed = (text ?? string.Empty).Trim();
        if (trimmed.Length > QuestionMaxLength)
        {
            trimmed = trimmed[..QuestionMaxLength];
        }

        return new AssistantMessage
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            ConversationId = conversationId,
            Role = AssistantRole.User,
            Text = trimmed,
            ClientRequestId = clientRequestId,
            CreatedAtUtc = nowUtc,
        };
    }

    public static AssistantMessage Answer(Guid userId, Guid conversationId, string summary, string answerJson, string snapshotJson, DateTime nowUtc) => new()
    {
        Id = Guid.CreateVersion7(),
        UserId = userId,
        ConversationId = conversationId,
        Role = AssistantRole.Assistant,
        Text = summary,
        AnswerJson = answerJson,
        SnapshotJson = snapshotJson,
        CreatedAtUtc = nowUtc,
    };
}
