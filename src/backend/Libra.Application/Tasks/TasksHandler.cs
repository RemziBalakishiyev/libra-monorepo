using System.Linq.Expressions;
using Libra.Application.Common;
using Libra.Domain.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Libra.Application.Tasks;

/// <summary>
/// Create, read, edit, complete and delete tasks. Every query filters on the owner, so an id belonging to
/// another user simply does not exist (404) and can never be read, completed or deleted.
///
/// "Today" and "overdue" are resolved once per request from the profile time zone and the injected clock, and
/// counts are aggregated in the database over the whole matching set — never over the page that happens to be
/// on screen.
/// </summary>
public sealed class TasksHandler(ILibraDbContext db, TaskOccurrenceGenerator generator, TimeProvider clock)
{
    /// <summary>Today's plan: what is scheduled for the local day, and what is still owed from before it.</summary>
    public async Task<TaskDayResponse> GetDayAsync(Guid userId, DateOnly? date, CancellationToken cancellationToken)
    {
        var now = await ResolveNowAsync(userId, cancellationToken);
        await generator.EnsureAsync(userId, now.Today, cancellationToken);

        var day = date ?? now.Today;
        var live = Live(userId);
        var scheduled = live.Where(task => task.PlannedDate == day);
        var overdue = OverdueBefore(live, day, now);

        var counts = new TaskCounts(
            await scheduled.CountAsync(cancellationToken),
            await scheduled.CountAsync(task => task.State == TaskState.Completed, cancellationToken),
            await overdue.CountAsync(cancellationToken));

        return new TaskDayResponse(
            day,
            now.TimeZone,
            counts,
            await Ordered(scheduled).Select(Projection(now)).ToListAsync(cancellationToken),
            await Ordered(overdue).Select(Projection(now)).ToListAsync(cancellationToken));
    }

    public async Task<PagedResponse<TaskResponse>> ListAsync(Guid userId, TaskListQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var now = await ResolveNowAsync(userId, cancellationToken);
        await generator.EnsureAsync(userId, now.Today, cancellationToken);

        var filtered = Live(userId)
            .Where(task => query.Priority == null || task.Priority == query.Priority)
            .Where(task => query.From == null || task.PlannedDate >= query.From)
            .Where(task => query.To == null || task.PlannedDate <= query.To);

        // The three views are disjoint slices, so one task appears in exactly one of them.
        filtered = query.View switch
        {
            TaskView.Today => filtered.Where(task => task.State == TaskState.Pending && task.PlannedDate <= now.Today),
            TaskView.Upcoming => filtered.Where(task => task.State == TaskState.Pending && task.PlannedDate > now.Today),
            _ => filtered.Where(task => task.State == TaskState.Completed),
        };

        var totalCount = await filtered.CountAsync(cancellationToken);
        var page = query.View == TaskView.Completed
            ? filtered.OrderByDescending(task => task.CompletedAtUtc).ThenByDescending(task => task.Id)
            : Ordered(filtered);

        var items = await page
            .Skip((query.PageNumber - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(Projection(now))
            .ToListAsync(cancellationToken);

        return new PagedResponse<TaskResponse>(items, query.PageNumber, query.PageSize, totalCount);
    }

    public async Task<Result<TaskDetailResponse>> GetAsync(Guid userId, Guid taskId, CancellationToken cancellationToken)
    {
        var now = await ResolveNowAsync(userId, cancellationToken);
        var task = await Live(userId).Select(Projection(now)).SingleOrDefaultAsync(row => row.Id == taskId, cancellationToken);
        if (task is null)
        {
            return Result.NotFound<TaskDetailResponse>(TaskErrors.TaskNotFound);
        }

        var series = task.SeriesId is Guid seriesId
            ? await db.TaskSeries.AsNoTracking().SingleOrDefaultAsync(row => row.UserId == userId && row.Id == seriesId, cancellationToken)
            : null;

        var history = await db.TaskCompletionEvents
            .AsNoTracking()
            .Where(entry => entry.UserId == userId && entry.TaskId == taskId)
            .OrderByDescending(entry => entry.OccurredAtUtc)
            .ThenByDescending(entry => entry.Id)
            .Select(entry => new TaskHistoryEntry(entry.Kind, entry.OccurredAtUtc))
            .ToListAsync(cancellationToken);

        return Result.Success(new TaskDetailResponse(task, ToResponse(series), history));
    }

    /// <summary>
    /// Creates a one-off task, or a series and the occurrences it owes. A retried request carrying the same
    /// <c>clientRequestId</c> returns what the first one produced instead of a second task or a second series.
    /// </summary>
    public async Task<Result<CreateOutcome<TaskResponse>>> CreateAsync(Guid userId, CreateTaskCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var now = await ResolveNowAsync(userId, cancellationToken);

        if (command.ClientRequestId is Guid requestId)
        {
            var existing = await FindByClientRequestIdAsync(userId, requestId, now, cancellationToken);
            if (existing is not null)
            {
                return Result.Success(new CreateOutcome<TaskResponse>(existing, Created: false));
            }
        }

        return command.Recurrence is { Kind: not TaskRecurrenceKind.None }
            ? await CreateSeriesAsync(userId, command, now, cancellationToken)
            : await CreateSingleAsync(userId, command, now, cancellationToken);
    }

    /// <summary>Edits one task — one occurrence when it belongs to a series. The series rule is untouched.</summary>
    public async Task<Result<TaskResponse>> UpdateAsync(Guid userId, Guid taskId, UpdateTaskCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var task = await FindAsync(userId, taskId, cancellationToken);
        if (task is null)
        {
            return Result.NotFound<TaskResponse>(TaskErrors.TaskNotFound);
        }

        if (IsStale(command.ExpectedUpdatedAtUtc, task.UpdatedAtUtc))
        {
            return Result.Conflict<TaskResponse>(TaskErrors.StaleEdit, "Reload the task and apply the change again.");
        }

        var now = await ResolveNowAsync(userId, cancellationToken);
        task.Update(command.Title, command.Note, command.PlannedDate, command.PlannedTime, command.Priority, clock.GetUtcNow().UtcDateTime);

        var conflict = await TrySaveAsync(cancellationToken);
        return conflict is not null
            ? Result.Failure<TaskResponse>(conflict)
            : Result.Success(await Live(userId).Select(Projection(now)).SingleAsync(row => row.Id == taskId, cancellationToken));
    }

    /// <summary>
    /// Moves one task to the state the caller asked for. Nothing else moves with it: a completed occurrence of a
    /// series says nothing about tomorrow's, and completing a task that was already overdue leaves its planned
    /// date exactly where it was.
    /// </summary>
    public async Task<Result<TaskResponse>> SetCompletionAsync(Guid userId, Guid taskId, SetTaskCompletionCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var task = await FindAsync(userId, taskId, cancellationToken);
        if (task is null)
        {
            return Result.NotFound<TaskResponse>(TaskErrors.TaskNotFound);
        }

        var now = await ResolveNowAsync(userId, cancellationToken);
        var nowUtc = clock.GetUtcNow().UtcDateTime;

        // Already in the requested state: the answer is the task itself, with no second history event.
        if (task.SetCompleted(command.Completed, nowUtc))
        {
            db.TaskCompletionEvents.Add(TaskCompletionEvent.Record(task, command.Completed ? TaskCompletionEventKind.Completed : TaskCompletionEventKind.Reopened, nowUtc));
            var conflict = await TrySaveAsync(cancellationToken);
            if (conflict is not null)
            {
                return Result.Failure<TaskResponse>(conflict);
            }
        }

        return Result.Success(await Live(userId).Select(Projection(now)).SingleAsync(row => row.Id == taskId, cancellationToken));
    }

    /// <summary>
    /// Deletes one task. A standalone task is removed outright; an occurrence of a series keeps a tombstone row
    /// so the next generation pass cannot bring that date back.
    /// </summary>
    public async Task<Result<bool>> DeleteAsync(Guid userId, Guid taskId, CancellationToken cancellationToken)
    {
        var task = await FindAsync(userId, taskId, cancellationToken);
        if (task is null)
        {
            return Result.NotFound<bool>(TaskErrors.TaskNotFound);
        }

        if (task.SeriesId is null)
        {
            var events = await db.TaskCompletionEvents.Where(entry => entry.UserId == userId && entry.TaskId == taskId).ToListAsync(cancellationToken);
            db.TaskCompletionEvents.RemoveRange(events);
            db.Tasks.Remove(task);
        }
        else
        {
            task.Remove(clock.GetUtcNow().UtcDateTime);
        }

        var conflict = await TrySaveAsync(cancellationToken);
        return conflict is not null ? Result.Failure<bool>(conflict) : Result.Success(true);
    }

    /// <summary>Today's one-line figure for Home: how much of today is done, and what is still overdue.</summary>
    public async Task<TaskCounts> GetTodayCountsAsync(Guid userId, CancellationToken cancellationToken)
    {
        var now = await ResolveNowAsync(userId, cancellationToken);
        await generator.EnsureAsync(userId, now.Today, cancellationToken);

        var live = Live(userId);
        var scheduled = live.Where(task => task.PlannedDate == now.Today);
        return new TaskCounts(
            await scheduled.CountAsync(cancellationToken),
            await scheduled.CountAsync(task => task.State == TaskState.Completed, cancellationToken),
            await OverdueBefore(live, now.Today, now).CountAsync(cancellationToken));
    }

    internal static TaskRecurrence Build(TaskRecurrenceCommand command, DateOnly fallbackStart)
    {
        ArgumentNullException.ThrowIfNull(command);
        var start = command.StartDate ?? fallbackStart;
        return command.Kind == TaskRecurrenceKind.Weekly
            ? TaskRecurrence.Weekly(command.Weekdays ?? [], start, command.EndDate)
            : TaskRecurrence.Daily(start, command.EndDate);
    }

    /// <summary>A client that echoes an older timestamp than the stored one is working from a stale read.</summary>
    internal static bool IsStale(DateTime? expected, DateTime actual) =>
        expected is DateTime seen && Math.Abs((actual - seen).TotalMilliseconds) > 1;

    internal static TaskSeriesResponse? ToResponse(TaskSeries? series) =>
        series is null
            ? null
            : new TaskSeriesResponse(
                series.Id,
                series.Title,
                series.Note,
                series.PlannedTime,
                series.Priority,
                series.Kind,
                series.Recurrence.Weekdays,
                series.StartDate,
                series.EndDate,
                series.IsStopped,
                series.CreatedAtUtc,
                series.UpdatedAtUtc);

    private async Task<Result<CreateOutcome<TaskResponse>>> CreateSingleAsync(Guid userId, CreateTaskCommand command, LocalNow now, CancellationToken cancellationToken)
    {
        var task = TaskItem.Create(userId, command.Title, command.Note, command.PlannedDate, command.PlannedTime, command.Priority, command.ClientRequestId, clock.GetUtcNow().UtcDateTime);
        db.Tasks.Add(task);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (exception.IsUniqueViolation() && command.ClientRequestId is Guid raced)
        {
            // Concurrent retry with the same key: the first insert won; return it.
            db.Tasks.Remove(task);
            var winner = await FindByClientRequestIdAsync(userId, raced, now, cancellationToken);
            if (winner is not null)
            {
                return Result.Success(new CreateOutcome<TaskResponse>(winner, Created: false));
            }

            throw;
        }

        var response = await Live(userId).Select(Projection(now)).SingleAsync(row => row.Id == task.Id, cancellationToken);
        return Result.Success(new CreateOutcome<TaskResponse>(response, Created: true));
    }

    private async Task<Result<CreateOutcome<TaskResponse>>> CreateSeriesAsync(Guid userId, CreateTaskCommand command, LocalNow now, CancellationToken cancellationToken)
    {
        var recurrence = Build(command.Recurrence!, command.PlannedDate);
        if (!recurrence.IsValid(now.Today))
        {
            return Result.Validation<CreateOutcome<TaskResponse>>(
                "Recurrence is not usable",
                $"A schedule starts at most {TaskRecurrence.MaxPastStartDays} days in the past and ends at most {TaskRecurrence.MaxFutureEndDays} days ahead.");
        }

        var series = TaskSeries.Create(userId, command.Title, command.Note, command.PlannedTime, command.Priority, recurrence, command.ClientRequestId, clock.GetUtcNow().UtcDateTime);
        db.TaskSeries.Add(series);

        try
        {
            // The series row carries the retry key, so two concurrent retries cannot become two schedules.
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (exception.IsUniqueViolation() && command.ClientRequestId is Guid raced)
        {
            db.TaskSeries.Remove(series);
            var winner = await FindByClientRequestIdAsync(userId, raced, now, cancellationToken);
            if (winner is not null)
            {
                return Result.Success(new CreateOutcome<TaskResponse>(winner, Created: false));
            }

            throw;
        }

        await generator.GenerateAsync(series, now.Today, cancellationToken);

        var first = await FirstOccurrenceAsync(userId, series.Id, now, cancellationToken);
        return first is null
            ? Result.Validation<CreateOutcome<TaskResponse>>("Recurrence produced no dates", "Choose a schedule that includes at least one day.")
            : Result.Success(new CreateOutcome<TaskResponse>(first, Created: true));
    }

    /// <summary>Every task the user still has: tombstoned occurrences are gone from every read.</summary>
    private IQueryable<TaskItem> Live(Guid userId) =>
        db.Tasks.AsNoTracking().Where(task => task.UserId == userId && task.State != TaskState.Removed);

    /// <summary>Pending tasks from before <paramref name="day"/> that are past their local due moment.</summary>
    private static IQueryable<TaskItem> OverdueBefore(IQueryable<TaskItem> source, DateOnly day, LocalNow now) =>
        source.Where(task =>
            task.State == TaskState.Pending
            && task.PlannedDate < day
            && (task.PlannedDate < now.Today || task.PlannedTime == null || task.PlannedTime <= now.LocalTime));

    /// <summary>
    /// One stable order for every pending view: earliest day first, then the timed tasks of that day in clock
    /// order ahead of the untimed ones, then the more urgent first, then the title, then the id.
    ///
    /// Priority is stored as its name, so it is ranked explicitly here — ordering by the column itself would
    /// sort the words ("Normal" before "Low" before "High") instead of the urgency they stand for.
    /// </summary>
    private static IQueryable<TaskItem> Ordered(IQueryable<TaskItem> source) =>
        source
            .OrderBy(task => task.PlannedDate)
            .ThenBy(task => task.PlannedTime == null)
            .ThenBy(task => task.PlannedTime)
            .ThenByDescending(task => task.Priority == TaskPriority.High ? 2 : task.Priority == TaskPriority.Normal ? 1 : 0)
            .ThenBy(task => task.Title)
            .ThenBy(task => task.Id);

    private Expression<Func<TaskItem, TaskResponse>> Projection(LocalNow now)
    {
        var today = now.Today;
        var localTime = now.LocalTime;
        return task => new TaskResponse
        {
            Id = task.Id,
            Title = task.Title,
            Note = task.Note,
            PlannedDate = task.PlannedDate,
            PlannedTime = task.PlannedTime,
            Priority = task.Priority,
            State = task.State,
            IsCompleted = task.State == TaskState.Completed,
            CompletedAtUtc = task.CompletedAtUtc,
            IsOverdue = task.State == TaskState.Pending
                && (task.PlannedDate < today || (task.PlannedDate == today && task.PlannedTime != null && task.PlannedTime <= localTime)),
            SeriesId = task.SeriesId,
            SeriesKind = db.TaskSeries.Where(series => series.Id == task.SeriesId).Select(series => (TaskRecurrenceKind?)series.Kind).FirstOrDefault(),
            ClientRequestId = task.ClientRequestId,
            CreatedAtUtc = task.CreatedAtUtc,
            UpdatedAtUtc = task.UpdatedAtUtc,
        };
    }

    private Task<TaskItem?> FindAsync(Guid userId, Guid taskId, CancellationToken cancellationToken) =>
        db.Tasks.SingleOrDefaultAsync(task => task.UserId == userId && task.Id == taskId && task.State != TaskState.Removed, cancellationToken);

    private Task<TaskResponse?> FirstOccurrenceAsync(Guid userId, Guid seriesId, LocalNow now, CancellationToken cancellationToken) =>
        Live(userId)
            .Where(task => task.SeriesId == seriesId)
            .OrderBy(task => task.PlannedDate)
            .Select(Projection(now))
            .FirstOrDefaultAsync(cancellationToken)!;

    /// <summary>
    /// The record a retry should get back: the standalone task that carried the key, or the first occurrence of
    /// the series it created.
    /// </summary>
    private async Task<TaskResponse?> FindByClientRequestIdAsync(Guid userId, Guid clientRequestId, LocalNow now, CancellationToken cancellationToken)
    {
        var task = await Live(userId).Where(row => row.ClientRequestId == clientRequestId).Select(Projection(now)).SingleOrDefaultAsync(cancellationToken);
        if (task is not null)
        {
            return task;
        }

        var seriesId = await db.TaskSeries
            .AsNoTracking()
            .Where(series => series.UserId == userId && series.ClientRequestId == clientRequestId)
            .Select(series => (Guid?)series.Id)
            .SingleOrDefaultAsync(cancellationToken);

        return seriesId is Guid id ? await FirstOccurrenceAsync(userId, id, now, cancellationToken) : null;
    }

    /// <summary>Saves, reporting a lost row-version race as the same conflict a stale client edit gets.</summary>
    private async Task<AppError?> TrySaveAsync(CancellationToken cancellationToken)
    {
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            return null;
        }
        catch (DbUpdateConcurrencyException)
        {
            return new AppError(AppErrorType.Conflict, TaskErrors.StaleEdit, "Reload the task and apply the change again.");
        }
    }

    private async Task<LocalNow> ResolveNowAsync(Guid userId, CancellationToken cancellationToken)
    {
        var timeZone = await UserTimeZone.LoadAsync(db, userId, cancellationToken);
        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(nowUtc, DateTimeKind.Utc), LocalCalendar.Resolve(timeZone));
        return new LocalNow(timeZone, DateOnly.FromDateTime(local), TimeOnly.FromDateTime(local));
    }

    /// <summary>The user's current local moment, resolved once per request.</summary>
    private readonly record struct LocalNow(string TimeZone, DateOnly Today, TimeOnly LocalTime);
}
