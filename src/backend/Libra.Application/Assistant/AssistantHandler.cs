using System.Text.Json;
using Libra.Application.Common;
using Libra.Domain.Assistant;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Libra.Application.Assistant;

/// <summary>
/// The assistant's use cases: asking a question, and the conversations that result.
///
/// Three things happen on every question, in this order and never any other: the snapshot is built from the
/// caller's own records; the provider is given that snapshot and nothing else; and the answer is validated
/// against it before anything is stored. An observation citing a fact the snapshot does not contain
/// invalidates the whole answer — a model that invents a figure gets no partial credit.
///
/// Everything is owner-scoped. The conversation id in a route is only ever resolved together with the
/// caller's user id, so another account's conversation is answered exactly like one that does not exist.
/// </summary>
public sealed class AssistantHandler(
    ILibraDbContext db,
    AssistantContextBuilder context,
    IAssistantProvider provider,
    IOptions<AssistantOptions> options,
    TimeProvider clock)
{
    private readonly AssistantOptions _options = options.Value;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>In-flight questions across the process, so a burst cannot exhaust the provider or the host.</summary>
    private static readonly SemaphoreSlim Concurrency = new(8, 8);

    public AssistantStatusResponse GetStatus() =>
        new(provider.IsConfigured, provider.IsFixture, provider.IsConfigured ? provider.Model : null, _options.DefaultModules);

    public async Task<Result<AssistantConversationResponse>> AskAsync(Guid userId, AskAssistantCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        if (!provider.IsConfigured)
        {
            // Said plainly. Nothing canned is ever presented as an answer.
            return Result.Unavailable<AssistantConversationResponse>(AssistantErrors.NotConfigured, "AI köməkçi hələ aktiv deyil.");
        }

        var nowUtc = clock.GetUtcNow().UtcDateTime;

        // A retried send carries the same client id: the turn that already exists is returned untouched.
        if (command.ClientRequestId is Guid requestId)
        {
            var existing = await db.AssistantMessages
                .AsNoTracking()
                .SingleOrDefaultAsync(message => message.UserId == userId && message.ClientRequestId == requestId, cancellationToken);
            if (existing is not null)
            {
                return await LoadAsync(userId, existing.ConversationId, cancellationToken);
            }
        }

        var question = (command.Question ?? string.Empty).Trim();
        if (question.Length == 0)
        {
            return Result.Validation<AssistantConversationResponse>("Question is required", "Sual boş ola bilməz.");
        }

        if (await RecentQuestionCountAsync(userId, nowUtc, cancellationToken) >= _options.MaxQuestionsPerHour)
        {
            return Result.RateLimited<AssistantConversationResponse>(AssistantErrors.Busy, "Saatlıq sual limitinə çatdınız.");
        }

        AssistantConversation? conversation = null;
        if (command.ConversationId is Guid conversationId)
        {
            conversation = await db.AssistantConversations
                .SingleOrDefaultAsync(row => row.UserId == userId && row.Id == conversationId, cancellationToken);
            if (conversation is null)
            {
                return Result.NotFound<AssistantConversationResponse>(AssistantErrors.ConversationNotFound);
            }
        }

        // A conversation keeps the scope it was started with. Asking with a different scope starts a new one,
        // so an earlier turn can never reintroduce a module the user has since excluded.
        var modules = Normalize(command.Modules ?? _options.DefaultModules);
        var period = command.Period ?? AssistantPeriod.Today;
        if (conversation is not null && (conversation.Modules != Encode(modules) || conversation.Period != period.ToString()))
        {
            conversation = null;
        }

        var snapshot = await context.BuildAsync(userId, modules, period, cancellationToken);
        if (snapshot.IsEmpty)
        {
            return Result.Validation<AssistantConversationResponse>("No context", "Seçilmiş modullardan məlumat oxunmadı.");
        }

        var history = conversation is null ? [] : await HistoryAsync(userId, conversation.Id, cancellationToken);

        AssistantOutcomeResult outcome;
        if (!await Concurrency.WaitAsync(TimeSpan.FromSeconds(_options.QueueSeconds), cancellationToken))
        {
            return Result.RateLimited<AssistantConversationResponse>(AssistantErrors.Busy, "Köməkçi hazırda məşğuldur.");
        }

        try
        {
            outcome = await provider.AskAsync(new AssistantRequest(snapshot, question, history), cancellationToken);
        }
        finally
        {
            Concurrency.Release();
        }

        if (!outcome.IsSuccess || outcome.Answer is null)
        {
            return Failure(outcome.Failure ?? AssistantFailure.ProviderUnavailable, outcome.Detail);
        }

        // Every citation must name a fact in *this* snapshot. One that does not makes the answer unusable.
        if (!IsGrounded(outcome.Answer, snapshot))
        {
            return Result.Unavailable<AssistantConversationResponse>(AssistantErrors.InvalidAnswer, "Cavab mənbələrlə uyğun gəlmədi.");
        }

        var isNew = conversation is null;
        conversation ??= AssistantConversation.Start(userId, question, Encode(modules), period.ToString(), nowUtc);
        if (isNew)
        {
            db.AssistantConversations.Add(conversation);
        }

        conversation.Touch(nowUtc);
        db.AssistantMessages.Add(AssistantMessage.Question(userId, conversation.Id, question, command.ClientRequestId, nowUtc));
        db.AssistantMessages.Add(AssistantMessage.Answer(
            userId,
            conversation.Id,
            outcome.Answer.Summary,
            JsonSerializer.Serialize(outcome.Answer, Json),
            JsonSerializer.Serialize(snapshot, Json),
            nowUtc.AddMilliseconds(1)));

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Two sends of the same turn raced; the unique client index decided, and both get that result.
            if (command.ClientRequestId is Guid raced)
            {
                var winner = await db.AssistantMessages
                    .AsNoTracking()
                    .SingleOrDefaultAsync(message => message.UserId == userId && message.ClientRequestId == raced, cancellationToken);
                if (winner is not null)
                {
                    return await LoadAsync(userId, winner.ConversationId, cancellationToken);
                }
            }

            throw;
        }

        return await LoadAsync(userId, conversation.Id, cancellationToken);
    }

    public async Task<PagedResponse<AssistantConversationSummary>> ListAsync(Guid userId, AssistantHistoryQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var source = db.AssistantConversations.AsNoTracking().Where(conversation => conversation.UserId == userId);
        var total = await source.CountAsync(cancellationToken);
        var items = await source
            .OrderByDescending(conversation => conversation.UpdatedAtUtc)
            .ThenByDescending(conversation => conversation.Id)
            .Skip((query.PageNumber - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(conversation => new AssistantConversationSummary(
                conversation.Id,
                conversation.Title,
                Decode(conversation.Modules),
                Parse(conversation.Period),
                conversation.UpdatedAtUtc))
            .ToListAsync(cancellationToken);

        return new PagedResponse<AssistantConversationSummary>(items, query.PageNumber, query.PageSize, total);
    }

    public async Task<Result<AssistantConversationResponse>> LoadAsync(Guid userId, Guid conversationId, CancellationToken cancellationToken)
    {
        var conversation = await db.AssistantConversations
            .AsNoTracking()
            .SingleOrDefaultAsync(row => row.UserId == userId && row.Id == conversationId, cancellationToken);
        if (conversation is null)
        {
            return Result.NotFound<AssistantConversationResponse>(AssistantErrors.ConversationNotFound);
        }

        var messages = await db.AssistantMessages
            .AsNoTracking()
            .Where(message => message.UserId == userId && message.ConversationId == conversationId)
            .OrderBy(message => message.CreatedAtUtc)
            .ThenBy(message => message.Id)
            .ToListAsync(cancellationToken);

        return Result.Success(new AssistantConversationResponse(
            conversation.Id,
            conversation.Title,
            Decode(conversation.Modules),
            Parse(conversation.Period),
            conversation.CreatedAtUtc,
            conversation.UpdatedAtUtc,
            [.. messages.Select(Project)]));
    }

    public async Task<Result<bool>> DeleteAsync(Guid userId, Guid conversationId, CancellationToken cancellationToken)
    {
        var conversation = await db.AssistantConversations
            .SingleOrDefaultAsync(row => row.UserId == userId && row.Id == conversationId, cancellationToken);
        if (conversation is null)
        {
            return Result.NotFound<bool>(AssistantErrors.ConversationNotFound);
        }

        db.AssistantConversations.Remove(conversation);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success(true);
    }

    /// <summary>True only when every observation cites facts that exist in the snapshot it was built from.</summary>
    private static bool IsGrounded(AssistantAnswer answer, AssistantContextSnapshot snapshot)
    {
        foreach (var observation in answer.Observations)
        {
            foreach (var id in observation.FactIds)
            {
                if (snapshot.Find(id) is null)
                {
                    return false;
                }
            }
        }

        return true;
    }

    private async Task<int> RecentQuestionCountAsync(Guid userId, DateTime nowUtc, CancellationToken cancellationToken)
    {
        var since = nowUtc.AddHours(-1);
        return await db.AssistantMessages
            .AsNoTracking()
            .CountAsync(message => message.UserId == userId && message.Role == AssistantRole.User && message.CreatedAtUtc >= since, cancellationToken);
    }

    /// <summary>The bounded tail of the conversation handed to the provider — questions and summaries only.</summary>
    private async Task<IReadOnlyList<AssistantTurn>> HistoryAsync(Guid userId, Guid conversationId, CancellationToken cancellationToken)
    {
        var recent = await db.AssistantMessages
            .AsNoTracking()
            .Where(message => message.UserId == userId && message.ConversationId == conversationId)
            .OrderByDescending(message => message.CreatedAtUtc)
            .Take(_options.MaxHistoryTurns * 2)
            .ToListAsync(cancellationToken);

        recent.Reverse();
        var turns = new List<AssistantTurn>();
        for (var index = 0; index + 1 < recent.Count; index += 1)
        {
            if (recent[index].Role == AssistantRole.User && recent[index + 1].Role == AssistantRole.Assistant)
            {
                turns.Add(new AssistantTurn(recent[index].Text, recent[index + 1].Text));
            }
        }

        return turns.Count <= _options.MaxHistoryTurns ? turns : turns[^_options.MaxHistoryTurns..];
    }

    private static AssistantMessageResponse Project(AssistantMessage message)
    {
        AssistantAnswerResponse? answer = null;
        if (message.Role == AssistantRole.Assistant && message.AnswerJson is not null && message.SnapshotJson is not null)
        {
            var stored = JsonSerializer.Deserialize<AssistantAnswer>(message.AnswerJson, Json);
            var snapshot = JsonSerializer.Deserialize<AssistantContextSnapshot>(message.SnapshotJson, Json);
            if (stored is not null && snapshot is not null)
            {
                answer = new AssistantAnswerResponse(
                    stored.Outcome,
                    stored.Summary,
                    [.. stored.Observations.Select(observation => new AssistantObservationResponse(observation.Text, observation.FactIds))],
                    stored.Suggestions,
                    stored.FollowUps,
                    stored.Clarification,
                    stored.Model,
                    stored.IsFixture,
                    new AssistantSnapshotResponse(
                        snapshot.TimeZone,
                        snapshot.RangeFrom,
                        snapshot.RangeTo,
                        snapshot.CollectedAtUtc,
                        snapshot.Modules,
                        [.. snapshot.Facts.Select(fact => new AssistantFactResponse(
                            fact.Id, fact.Module, fact.Label, fact.Availability, fact.Value, fact.Unit, fact.Text, fact.Period, fact.Caveat, fact.SourceRoute))]));
            }
        }

        return new AssistantMessageResponse(
            message.Id,
            message.Role == AssistantRole.User ? "user" : "assistant",
            message.Text,
            message.CreatedAtUtc,
            answer);
    }

    private static Result<AssistantConversationResponse> Failure(AssistantFailure failure, string? detail) => failure switch
    {
        AssistantFailure.NotConfigured => Result.Unavailable<AssistantConversationResponse>(AssistantErrors.NotConfigured, "AI köməkçi hələ aktiv deyil."),
        AssistantFailure.Timeout => Result.Unavailable<AssistantConversationResponse>(AssistantErrors.ProviderUnavailable, "Cavab vaxtında gəlmədi."),
        AssistantFailure.Refused => Result.Unavailable<AssistantConversationResponse>(AssistantErrors.ProviderUnavailable, "Köməkçi bu suala cavab vermədi."),
        AssistantFailure.Incomplete => Result.Unavailable<AssistantConversationResponse>(AssistantErrors.InvalidAnswer, "Cavab yarımçıq qaldı."),
        AssistantFailure.InvalidOutput => Result.Unavailable<AssistantConversationResponse>(AssistantErrors.InvalidAnswer, detail ?? "Cavab oxunmadı."),
        AssistantFailure.Busy => Result.RateLimited<AssistantConversationResponse>(AssistantErrors.Busy, "Köməkçi hazırda məşğuldur."),
        _ => Result.Unavailable<AssistantConversationResponse>(AssistantErrors.ProviderUnavailable, detail ?? "Köməkçi əlçatan deyil."),
    };

    private static IReadOnlyList<AssistantModule> Normalize(IReadOnlyList<AssistantModule> modules) =>
        modules.Count == 0 ? [AssistantModule.Finance] : [.. modules.Distinct().OrderBy(module => module)];

    private static string Encode(IReadOnlyList<AssistantModule> modules) => string.Join(',', modules);

    private static AssistantModule[] Decode(string modules) =>
        modules.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(name => Enum.TryParse<AssistantModule>(name, out var module) ? module : (AssistantModule?)null)
            .Where(module => module is not null)
            .Select(module => module!.Value)
            .ToArray();

    private static AssistantPeriod Parse(string period) =>
        Enum.TryParse<AssistantPeriod>(period, out var value) ? value : AssistantPeriod.Today;

}
