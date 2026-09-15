using System.Text.Json.Serialization;

namespace Libra.Domain.Tasks;

/// <summary>How urgent the user said a task is. Never inferred from a date.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<TaskPriority>))]
public enum TaskPriority
{
    Low,
    Normal,
    High,
}

/// <summary>The only three schedules this phase supports.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<TaskRecurrenceKind>))]
public enum TaskRecurrenceKind
{
    None,
    Daily,
    Weekly,
}

/// <summary>
/// What happened to one occurrence. `Removed` is a tombstone: the row stays so a deleted occurrence of a series
/// can never be recreated by the next generation pass.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<TaskState>))]
public enum TaskState
{
    Pending,
    Completed,
    Removed,
}

/// <summary>One entry in a task's completion history. Reopening adds an event; it never erases one.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<TaskCompletionEventKind>))]
public enum TaskCompletionEventKind
{
    Completed,
    Reopened,
}
