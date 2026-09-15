using FluentValidation;
using Libra.Application.Common;
using Libra.Domain.Sleep;

namespace Libra.Application.Sleep;

/// <summary>
/// Begins a session. <paramref name="StartedAtUtc"/> is optional so the ordinary "Yatmağa başla" is a bare
/// request; the retry key makes an uncertain answer safe to repeat.
/// </summary>
public sealed record StartSleepCommand(DateTimeOffset? StartedAtUtc, Guid? ClientRequestId);

/// <summary>
/// Closes one identified session. The wake instant is captured on the device the moment the user pressed
/// "Oyandım", so a retry after a failure records the same moment rather than the moment the network recovered.
/// </summary>
public sealed record StopSleepCommand(DateTimeOffset? EndedAtUtc);

public sealed record RecordSleepCommand(
    DateTimeOffset StartedAtUtc,
    DateTimeOffset EndedAtUtc,
    int? Quality,
    string? Note,
    Guid? ClientRequestId);

/// <summary>
/// Corrects one session. <paramref name="ExpectedUpdatedAtUtc"/> is the value the client last read: a stored row
/// that has moved on is reported instead of being overwritten. `EndedAtUtc` may stay null to leave a session
/// open — a forgotten night is corrected, never silently closed.
/// </summary>
public sealed record CorrectSleepCommand(
    DateTimeOffset StartedAtUtc,
    DateTimeOffset? EndedAtUtc,
    int? Quality,
    string? Note,
    DateTime? ExpectedUpdatedAtUtc);

public sealed record SleepListQuery(int PageNumber = 1, int PageSize = Paging.DefaultPageSize);

internal static class SleepValidation
{
    public static IRuleBuilderOptions<T, DateTimeOffset> SleepInstant<T>(this IRuleBuilder<T, DateTimeOffset> rule) =>
        rule
            .NotEqual(default(DateTimeOffset))
            .Must(instant => instant.UtcDateTime.Year is >= 2000 and <= 2100)
            .WithMessage("'{PropertyName}' must be between the years 2000 and 2100.");

    public static IRuleBuilderOptions<T, DateTimeOffset?> SleepInstant<T>(this IRuleBuilder<T, DateTimeOffset?> rule) =>
        rule
            .Must(instant => instant is null || (instant != default(DateTimeOffset) && instant.Value.UtcDateTime.Year is >= 2000 and <= 2100))
            .WithMessage("'{PropertyName}' must be between the years 2000 and 2100.");

    public static IRuleBuilderOptions<T, int?> SleepQuality<T>(this IRuleBuilder<T, int?> rule) =>
        rule
            .Must(quality => quality is null || quality is >= SleepSession.MinQuality and <= SleepSession.MaxQuality)
            .WithMessage($"'{{PropertyName}}' must be between {SleepSession.MinQuality} and {SleepSession.MaxQuality}.");

    public static IRuleBuilderOptions<T, string?> SleepNote<T>(this IRuleBuilder<T, string?> rule) =>
        rule.MaximumLength(SleepSession.NoteMaxLength);
}

public sealed class StartSleepCommandValidator : AbstractValidator<StartSleepCommand>
{
    public StartSleepCommandValidator()
    {
        RuleFor(command => command.StartedAtUtc).SleepInstant();
    }
}

public sealed class StopSleepCommandValidator : AbstractValidator<StopSleepCommand>
{
    public StopSleepCommandValidator()
    {
        RuleFor(command => command.EndedAtUtc).SleepInstant();
    }
}

public sealed class RecordSleepCommandValidator : AbstractValidator<RecordSleepCommand>
{
    public RecordSleepCommandValidator()
    {
        RuleFor(command => command.StartedAtUtc).SleepInstant();
        RuleFor(command => command.EndedAtUtc).SleepInstant();
        RuleFor(command => command.Quality).SleepQuality();
        RuleFor(command => command.Note).SleepNote();
        RuleFor(command => command)
            .Must(command => command.EndedAtUtc > command.StartedAtUtc)
            .WithMessage("The wake-up time must be after the moment sleep started.")
            .OverridePropertyName(nameof(RecordSleepCommand.EndedAtUtc));
        RuleFor(command => command)
            .Must(command => command.EndedAtUtc - command.StartedAtUtc <= SleepSession.MaxDuration)
            .WithMessage($"A sleep session can be at most {SleepSession.MaxDuration.TotalHours:F0} hours long.")
            .OverridePropertyName(nameof(RecordSleepCommand.EndedAtUtc));
    }
}

public sealed class CorrectSleepCommandValidator : AbstractValidator<CorrectSleepCommand>
{
    public CorrectSleepCommandValidator()
    {
        RuleFor(command => command.StartedAtUtc).SleepInstant();
        RuleFor(command => command.EndedAtUtc).SleepInstant();
        RuleFor(command => command.Quality).SleepQuality();
        RuleFor(command => command.Note).SleepNote();
        RuleFor(command => command)
            .Must(command => command.EndedAtUtc is null || command.EndedAtUtc > command.StartedAtUtc)
            .WithMessage("The wake-up time must be after the moment sleep started.")
            .OverridePropertyName(nameof(CorrectSleepCommand.EndedAtUtc));
        RuleFor(command => command)
            .Must(command => command.EndedAtUtc is null || command.EndedAtUtc - command.StartedAtUtc <= SleepSession.MaxDuration)
            .WithMessage($"A sleep session can be at most {SleepSession.MaxDuration.TotalHours:F0} hours long.")
            .OverridePropertyName(nameof(CorrectSleepCommand.EndedAtUtc));
    }
}

public sealed class SleepListQueryValidator : AbstractValidator<SleepListQuery>
{
    public SleepListQueryValidator()
    {
        RuleFor(query => query.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(query => query.PageSize).InclusiveBetween(1, Paging.MaxPageSize);
    }
}
