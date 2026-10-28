using FluentValidation;
using Libra.Domain.Focus;

namespace Libra.Application.Focus;

/// <summary>One stretch the timer was running, as the device recorded it.</summary>
public sealed record FocusIntervalInput(DateTimeOffset StartedAtUtc, DateTimeOffset EndedAtUtc);

/// <summary>
/// A finished focus run, uploaded from the device that ran it.
///
/// <paramref name="ClientSessionId"/> is generated before the run starts and is what makes the upload safe to
/// retry: the database holds one row per (user, client id), so an outbox that retries after a lost response
/// gets the record it already created rather than a second one.
/// </summary>
public sealed record SaveFocusSessionCommand(
    Guid ClientSessionId,
    Guid? TaskId,
    string? TaskTitle,
    int ConfiguredSeconds,
    IReadOnlyList<FocusIntervalInput> Intervals,
    FocusOutcome Outcome);

public sealed class SaveFocusSessionCommandValidator : AbstractValidator<SaveFocusSessionCommand>
{
    public SaveFocusSessionCommandValidator()
    {
        RuleFor(command => command.ClientSessionId).NotEmpty();

        RuleFor(command => command.ConfiguredSeconds)
            .InclusiveBetween((int)FocusSession.MinConfiguredDuration.TotalSeconds, (int)FocusSession.MaxConfiguredDuration.TotalSeconds);

        RuleFor(command => command.TaskTitle).MaximumLength(FocusSession.TaskTitleMaxLength);

        RuleFor(command => command.Outcome).IsInEnum();

        // A run with no interval never ran. The upper bound is a sanity limit on a payload, not on a person:
        // pausing more than two hundred times in one run is a malformed body, not a work pattern.
        RuleFor(command => command.Intervals).NotEmpty().Must(intervals => intervals.Count <= 200)
            .WithMessage("'{PropertyName}' holds too many intervals.");

        RuleForEach(command => command.Intervals).ChildRules(interval =>
        {
            interval.RuleFor(value => value.StartedAtUtc).Must(BeAPlausibleInstant).WithMessage("'{PropertyName}' must be between the years 2000 and 2100.");
            interval.RuleFor(value => value.EndedAtUtc).Must(BeAPlausibleInstant).WithMessage("'{PropertyName}' must be between the years 2000 and 2100.");
            interval.RuleFor(value => value).Must(value => value.EndedAtUtc > value.StartedAtUtc).WithMessage("A focus interval must end after it started.");
        });
    }

    private static bool BeAPlausibleInstant(DateTimeOffset instant) =>
        instant != default && instant.UtcDateTime.Year is >= 2000 and <= 2100;
}
