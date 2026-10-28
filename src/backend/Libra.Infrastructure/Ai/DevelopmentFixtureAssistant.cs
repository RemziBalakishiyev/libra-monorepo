using System.Globalization;
using System.Text;
using Libra.Application.Assistant;

namespace Libra.Infrastructure.Ai;

/// <summary>
/// A deterministic assistant for development and tests (AI-SAFETY, rule 10).
///
/// It performs no reasoning at all: it reads the snapshot it was handed and describes the facts that have
/// values, citing each one by id. That is deliberate — it exercises the grounding, validation and rendering
/// path end to end without a paid call, and it cannot invent a figure because it has no way to produce one.
///
/// Every answer it returns is marked <see cref="AssistantAnswer.IsFixture"/>, and the interface labels it, so
/// a fixture answer can never be mistaken for a real one.
/// </summary>
public sealed class DevelopmentFixtureAssistant : IAssistantProvider
{
    public const string FixtureModel = "development-fixture";

    public bool IsConfigured => true;

    public bool IsFixture => true;

    public string Model => FixtureModel;

    public Task<AssistantOutcomeResult> AskAsync(AssistantRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        cancellationToken.ThrowIfCancellationRequested();

        var snapshot = request.Snapshot;
        var usable = snapshot.Facts
            .Where(fact => fact.Availability is FactAvailability.Available or FactAvailability.Partial && fact.Value is not null)
            .Take(3)
            .ToArray();

        // Nothing with a value means nothing to say about it. The fixture reports that rather than filling in.
        if (usable.Length == 0)
        {
            return Task.FromResult(AssistantOutcomeResult.Success(new AssistantAnswer
            {
                Outcome = AssistantOutcome.InsufficientData,
                Summary = "Seçilmiş dövr üçün kifayət qədər qeyd yoxdur.",
                Observations = [],
                Suggestions = [],
                FollowUps = ["Başqa dövr seçim?"],
                Model = FixtureModel,
                SchemaVersion = AssistantAnswer.CurrentSchemaVersion,
                IsFixture = true,
            }));
        }

        var summary = new StringBuilder("Qeydlərinizə əsasən qısa mənzərə: ");
        var observations = new List<AssistantObservation>();
        foreach (var fact in usable)
        {
            var value = fact.Value!.Value.ToString("0.##", CultureInfo.InvariantCulture);
            observations.Add(new AssistantObservation($"{fact.Label}: {value} {fact.Unit}".Trim(), [fact.Id]));
        }

        summary.Append(string.Join("; ", observations.Select(observation => observation.Text))).Append('.');

        return Task.FromResult(AssistantOutcomeResult.Success(new AssistantAnswer
        {
            Outcome = AssistantOutcome.Answer,
            Summary = summary.ToString(),
            Observations = observations,
            // Proposals only; the application never acts on them.
            Suggestions = ["Bu dövrü keçən həftə ilə müqayisə edin."],
            FollowUps = ["Bu rəqəmlər keçən həftə ilə necə müqayisə olunur?"],
            Model = FixtureModel,
            SchemaVersion = AssistantAnswer.CurrentSchemaVersion,
            IsFixture = true,
        }));
    }
}
