using FluentValidation;
using Libra.Application.Common;
using Libra.Domain.Tasks;

namespace Libra.Application.Tasks;

/// <summary>The repeating schedule a create or series edit asks for. Absent means a one-off task.</summary>
public sealed record TaskRecurrenceCommand(
    TaskRecurrenceKind Kind,
    IReadOnlyList<int>? Weekdays,
    DateOnly? StartDate,
    DateOnly? EndDate);

public sealed record CreateTaskCommand(
    string Title,
    string? Note,
    DateOnly PlannedDate,
    TimeOnly? PlannedTime,
    TaskPriority Priority,
    TaskRecurrenceCommand? Recurrence,
    Guid? ClientRequestId);

/// <summary>
/// Edits one task. <paramref name="ExpectedUpdatedAtUtc"/> is the value the client last read: when the stored
/// row is newer the edit is refused instead of quietly overwriting whatever changed in between.
/// </summary>
public sealed record UpdateTaskCommand(
    string Title,
    string? Note,
    DateOnly PlannedDate,
    TimeOnly? PlannedTime,
    TaskPriority Priority,
    DateTime? ExpectedUpdatedAtUtc);

/// <summary>
/// The desired completion state, stated outright. There is no toggle endpoint: a retried request that says
/// "completed" twice leaves the task completed and adds no second history event.
/// </summary>
public sealed record SetTaskCompletionCommand(bool Completed);

public sealed record UpdateTaskSeriesCommand(
    string Title,
    string? Note,
    TimeOnly? PlannedTime,
    TaskPriority Priority,
    TaskRecurrenceCommand Recurrence,
    DateTime? ExpectedUpdatedAtUtc);

public sealed record TaskListQuery(
    TaskView View = TaskView.Today,
    DateOnly? From = null,
    DateOnly? To = null,
    TaskPriority? Priority = null,
    int PageNumber = 1,
    int PageSize = Paging.DefaultPageSize);

internal static class TaskValidation
{
    /// <summary>Widest window a list request may ask for, so one query can never scan a whole history.</summary>
    public const int MaxRangeDays = 366;

    public static IRuleBuilderOptions<T, string> TaskTitle<T>(this IRuleBuilder<T, string> rule) =>
        rule
            .Must(title => !string.IsNullOrWhiteSpace(title))
            .WithMessage("'{PropertyName}' must not be empty.")
            .MaximumLength(TaskItem.TitleMaxLength);

    public static IRuleBuilderOptions<T, string?> TaskNote<T>(this IRuleBuilder<T, string?> rule) =>
        rule.MaximumLength(TaskItem.NoteMaxLength);

    /// <summary>Planned days stay inside the same bounds a recurring series may use.</summary>
    public static IRuleBuilderOptions<T, DateOnly> PlannedDay<T>(this IRuleBuilder<T, DateOnly> rule) =>
        rule
            .Must(IsPlannedDay)
            .WithMessage("'{PropertyName}' must be between the years 2000 and 2100.");

    public static IRuleBuilderOptions<T, DateOnly?> PlannedDay<T>(this IRuleBuilder<T, DateOnly?> rule) =>
        rule
            .Must(date => date is null || IsPlannedDay(date.Value))
            .WithMessage("'{PropertyName}' must be between the years 2000 and 2100.");

    private static bool IsPlannedDay(DateOnly date) => date.Year is >= 2000 and <= 2100;
}

public sealed class TaskRecurrenceCommandValidator : AbstractValidator<TaskRecurrenceCommand>
{
    public TaskRecurrenceCommandValidator()
    {
        RuleFor(command => command.Kind).IsInEnum();

        RuleFor(command => command.Weekdays)
            .NotEmpty()
            .When(command => command.Kind == TaskRecurrenceKind.Weekly)
            .WithMessage("A weekly schedule needs at least one weekday.");

        RuleFor(command => command.Weekdays)
            .Must(weekdays => weekdays is null || weekdays.All(day => day is >= 1 and <= 7))
            .WithMessage("Weekdays are 1 (Monday) to 7 (Sunday).");

        RuleFor(command => command.Weekdays)
            .Must(weekdays => weekdays is null || weekdays.Distinct().Count() == weekdays.Count)
            .WithMessage("A weekday may be selected only once.");

        RuleFor(command => command.StartDate).PlannedDay();
        RuleFor(command => command.EndDate).PlannedDay();

        RuleFor(command => command)
            .Must(command => command.EndDate is null || command.StartDate is null || command.EndDate >= command.StartDate)
            .WithMessage("The end date must not be before the start date.")
            .OverridePropertyName(nameof(TaskRecurrenceCommand.EndDate));
    }
}

public sealed class CreateTaskCommandValidator : AbstractValidator<CreateTaskCommand>
{
    public CreateTaskCommandValidator()
    {
        RuleFor(command => command.Title).TaskTitle();
        RuleFor(command => command.Note).TaskNote();
        RuleFor(command => command.PlannedDate).PlannedDay();
        RuleFor(command => command.Priority).IsInEnum();
        RuleFor(command => command.Recurrence!).SetValidator(new TaskRecurrenceCommandValidator()).When(command => command.Recurrence is not null);
    }
}

public sealed class UpdateTaskCommandValidator : AbstractValidator<UpdateTaskCommand>
{
    public UpdateTaskCommandValidator()
    {
        RuleFor(command => command.Title).TaskTitle();
        RuleFor(command => command.Note).TaskNote();
        RuleFor(command => command.PlannedDate).PlannedDay();
        RuleFor(command => command.Priority).IsInEnum();
    }
}

public sealed class UpdateTaskSeriesCommandValidator : AbstractValidator<UpdateTaskSeriesCommand>
{
    public UpdateTaskSeriesCommandValidator()
    {
        RuleFor(command => command.Title).TaskTitle();
        RuleFor(command => command.Note).TaskNote();
        RuleFor(command => command.Priority).IsInEnum();
        RuleFor(command => command.Recurrence).NotNull();
        RuleFor(command => command.Recurrence)
            .SetValidator(new TaskRecurrenceCommandValidator())
            .When(command => command.Recurrence is not null);
        RuleFor(command => command.Recurrence)
            .Must(recurrence => recurrence is null || recurrence.Kind != TaskRecurrenceKind.None)
            .WithMessage("A series needs a repeating schedule.");
    }
}

public sealed class TaskListQueryValidator : AbstractValidator<TaskListQuery>
{
    public TaskListQueryValidator()
    {
        RuleFor(query => query.View).IsInEnum();
        RuleFor(query => query.Priority).IsInEnum().When(query => query.Priority is not null);
        RuleFor(query => query.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(query => query.PageSize).InclusiveBetween(1, Paging.MaxPageSize);
        RuleFor(query => query.From).PlannedDay();
        RuleFor(query => query.To).PlannedDay();
        RuleFor(query => query)
            .Must(query => query.From is null || query.To is null || query.To >= query.From)
            .WithMessage("'To' must not be before 'From'.")
            .OverridePropertyName(nameof(TaskListQuery.To));
        RuleFor(query => query)
            .Must(query => query.From is null || query.To is null || query.To.Value.DayNumber - query.From.Value.DayNumber <= TaskValidation.MaxRangeDays)
            .WithMessage($"The range must be at most {TaskValidation.MaxRangeDays} days.")
            .OverridePropertyName(nameof(TaskListQuery.To));
    }
}
