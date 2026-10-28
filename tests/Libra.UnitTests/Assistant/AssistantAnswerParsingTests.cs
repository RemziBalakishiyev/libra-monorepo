using System.Text.Json;
using Libra.Application.Assistant;
using Libra.Infrastructure.Ai;

namespace Libra.UnitTests.Assistant;

/// <summary>
/// What the adapter accepts from a provider and what it refuses. Nothing here makes a network call; these are
/// the envelopes and payloads a provider can return, including the malformed ones.
/// </summary>
public sealed class AssistantAnswerParsingTests
{
    private static JsonElement Envelope(string payload) => JsonDocument.Parse(
        $$"""
        { "status": "completed", "output": [ { "content": [ { "type": "output_text", "text": {{JsonSerializer.Serialize(payload)}} } ] } ] }
        """).RootElement;

    private const string Valid = """
        {
          "outcome": "answer",
          "summary": "Bu gün 42 AZN xərclədiniz.",
          "observations": [ { "text": "Xərc 42 AZN", "fact_ids": ["finance.expense.month"] } ],
          "suggestions": ["Sabah üçün limit qoyun."],
          "follow_ups": ["Keçən həftə ilə müqayisə et"],
          "clarification": null
        }
        """;

    [Fact]
    public void A_well_formed_answer_is_parsed_with_its_citations()
    {
        var outcome = OpenAiAssistant.Parse(Valid, "test-model");

        Assert.True(outcome.IsSuccess);
        var answer = outcome.Answer!;
        Assert.Equal(AssistantOutcome.Answer, answer.Outcome);
        Assert.Equal("Bu gün 42 AZN xərclədiniz.", answer.Summary);
        Assert.Equal(["finance.expense.month"], answer.Observations[0].FactIds);
        Assert.Single(answer.Suggestions);
        Assert.False(answer.IsFixture);
        Assert.Equal("test-model", answer.Model);
    }

    [Fact]
    public void Each_outcome_keeps_its_own_meaning()
    {
        foreach (var (value, expected) in new[]
        {
            ("insufficient_data", AssistantOutcome.InsufficientData),
            ("clarification_needed", AssistantOutcome.ClarificationNeeded),
            ("refusal", AssistantOutcome.Refusal),
        })
        {
            var payload = $$"""
                { "outcome": "{{value}}", "summary": "Mətn", "observations": [], "suggestions": [], "follow_ups": [], "clarification": "Hansı dövr?" }
                """;
            var outcome = OpenAiAssistant.Parse(payload, "m");
            Assert.True(outcome.IsSuccess);
            Assert.Equal(expected, outcome.Answer!.Outcome);
        }
    }

    [Theory]
    [InlineData("not json at all")]
    [InlineData("""{ "outcome": "something_else", "summary": "x", "observations": [], "suggestions": [], "follow_ups": [], "clarification": null }""")]
    [InlineData("""{ "outcome": "answer", "summary": "   ", "observations": [], "suggestions": [], "follow_ups": [], "clarification": null }""")]
    public void An_unusable_answer_is_refused_rather_than_coerced(string payload)
    {
        var outcome = OpenAiAssistant.Parse(payload, "m");

        Assert.False(outcome.IsSuccess);
        Assert.Equal(AssistantFailure.InvalidOutput, outcome.Failure);
    }

    [Fact]
    public void A_refusal_in_the_envelope_is_its_own_failure()
    {
        var root = JsonDocument.Parse("""
            { "status": "completed", "output": [ { "content": [ { "type": "refusal", "refusal": "I cannot help with that." } ] } ] }
            """).RootElement;

        var outcome = OpenAiAssistant.Interpret(root, "m");

        Assert.Equal(AssistantFailure.Refused, outcome.Failure);
    }

    [Fact]
    public void A_truncated_answer_is_incomplete_not_invalid()
    {
        var root = JsonDocument.Parse("""
            { "status": "incomplete", "incomplete_details": { "reason": "max_output_tokens" } }
            """).RootElement;

        var outcome = OpenAiAssistant.Interpret(root, "m");

        Assert.Equal(AssistantFailure.Incomplete, outcome.Failure);
        Assert.Equal("max_output_tokens", outcome.Detail);
    }

    [Fact]
    public void An_envelope_with_no_structured_answer_is_invalid()
    {
        var root = JsonDocument.Parse("""{ "status": "completed", "output": [] }""").RootElement;

        Assert.Equal(AssistantFailure.InvalidOutput, OpenAiAssistant.Interpret(root, "m").Failure);
    }

    [Fact]
    public void A_well_formed_answer_survives_the_envelope()
    {
        var outcome = OpenAiAssistant.Interpret(Envelope(Valid), "m");

        Assert.True(outcome.IsSuccess);
    }

    [Fact]
    public void The_snapshot_handed_to_the_provider_carries_values_units_and_caveats_but_no_records()
    {
        var snapshot = new AssistantContextSnapshot
        {
            SchemaVersion = AssistantContextSnapshot.CurrentSchemaVersion,
            TimeZone = "Asia/Baku",
            Today = new DateOnly(2026, 10, 3),
            RangeFrom = new DateOnly(2026, 9, 27),
            RangeTo = new DateOnly(2026, 10, 3),
            CollectedAtUtc = new DateTime(2026, 10, 3, 9, 0, 0, DateTimeKind.Utc),
            Modules = [AssistantModule.Finance],
            Facts =
            [
                new AssistantFact
                {
                    Id = "finance.expense.month",
                    Module = AssistantModule.Finance,
                    Label = "Bu ayın xərci",
                    Availability = FactAvailability.Available,
                    Value = 42.5m,
                    Unit = "AZN",
                    Period = "2026-10",
                    Caveat = "Köçürmələr xərc deyil.",
                },
            ],
        };

        var described = OpenAiAssistant.Describe(snapshot);

        Assert.Contains("id=finance.expense.month", described, StringComparison.Ordinal);
        Assert.Contains("value=42.5 unit=AZN", described, StringComparison.Ordinal);
        Assert.Contains("availability=Available", described, StringComparison.Ordinal);
        Assert.Contains("Köçürmələr xərc deyil.", described, StringComparison.Ordinal);
        Assert.Contains("timezone=Asia/Baku", described, StringComparison.Ordinal);
    }
}
