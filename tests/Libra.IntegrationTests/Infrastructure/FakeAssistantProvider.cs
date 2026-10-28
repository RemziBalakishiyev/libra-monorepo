using Libra.Application.Assistant;

namespace Libra.IntegrationTests.Infrastructure;

/// <summary>
/// A scripted assistant provider, so no test depends on credentials or the network.
///
/// It records the request it was given, which is how the suite proves what *does* and does not travel to a
/// provider — including that record text reaches it as data rather than as instructions.
/// </summary>
public sealed class FakeAssistantProvider : IAssistantProvider
{
    private readonly object _gate = new();
    private Func<AssistantRequest, AssistantOutcomeResult>? _script;

    public bool IsConfigured { get; set; } = true;

    public bool IsFixture { get; set; }

    public string Model { get; set; } = "fake-assistant";

    /// <summary>Every request the host handed to a provider, newest last.</summary>
    public List<AssistantRequest> Requests { get; } = [];

    public AssistantRequest? LastRequest
    {
        get
        {
            lock (_gate)
            {
                return Requests.Count == 0 ? null : Requests[^1];
            }
        }
    }

    public void Reset()
    {
        lock (_gate)
        {
            Requests.Clear();
            _script = null;
            IsConfigured = true;
            IsFixture = false;
        }
    }

    /// <summary>Answers by citing exactly the fact ids given, whether or not they exist.</summary>
    public void AnswerCiting(params string[] factIds) => Script(_ => AssistantOutcomeResult.Success(new AssistantAnswer
    {
        Outcome = AssistantOutcome.Answer,
        Summary = "Qısa cavab.",
        Observations = [new AssistantObservation("Müşahidə", factIds)],
        Suggestions = [],
        FollowUps = [],
        Model = "fake-assistant",
        SchemaVersion = AssistantAnswer.CurrentSchemaVersion,
    }));

    /// <summary>Answers citing whatever the first available fact in the snapshot happens to be.</summary>
    public void AnswerFromSnapshot() => Script(request =>
    {
        var fact = request.Snapshot.Facts.FirstOrDefault(candidate => candidate.Availability == FactAvailability.Available);
        return AssistantOutcomeResult.Success(new AssistantAnswer
        {
            Outcome = AssistantOutcome.Answer,
            Summary = "Qısa cavab.",
            Observations = fact is null ? [] : [new AssistantObservation(fact.Label, [fact.Id])],
            Suggestions = [],
            FollowUps = [],
            Model = "fake-assistant",
            SchemaVersion = AssistantAnswer.CurrentSchemaVersion,
        });
    });

    public void Fail(AssistantFailure failure, string? detail = null) => Script(_ => AssistantOutcomeResult.Failed(failure, detail));

    public void Script(Func<AssistantRequest, AssistantOutcomeResult> script)
    {
        lock (_gate)
        {
            _script = script;
        }
    }

    public Task<AssistantOutcomeResult> AskAsync(AssistantRequest request, CancellationToken cancellationToken)
    {
        Func<AssistantRequest, AssistantOutcomeResult>? script;
        lock (_gate)
        {
            Requests.Add(request);
            script = _script;
        }

        return Task.FromResult(script?.Invoke(request) ?? AssistantOutcomeResult.Success(new AssistantAnswer
        {
            Outcome = AssistantOutcome.Answer,
            Summary = "Qısa cavab.",
            Observations = [],
            Suggestions = [],
            FollowUps = [],
            Model = Model,
            SchemaVersion = AssistantAnswer.CurrentSchemaVersion,
            IsFixture = IsFixture,
        }));
    }
}
