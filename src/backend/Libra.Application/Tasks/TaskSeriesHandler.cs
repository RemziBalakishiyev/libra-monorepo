using Libra.Application.Common;
using Libra.Domain.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Libra.Application.Tasks;

/// <summary>
/// The two operations that act on a whole schedule rather than one day: editing the rule, and stopping it.
/// Both are deliberately separate endpoints from the per-task ones, so "change this one" and "change every day
/// from now on" can never be confused for each other.
///
/// Neither rewrites history. An edit reaches only the pending occurrences from today onwards; a completed or
/// past occurrence keeps the title, time and priority it was completed under.
/// </summary>
public sealed class TaskSeriesHandler(ILibraDbContext db, TaskOccurrenceGenerator generator, TimeProvider clock)
{
    public async Task<Result<TaskSeriesResponse>> GetAsync(Guid userId, Guid seriesId, CancellationToken cancellationToken)
    {
        var series = await db.TaskSeries.AsNoTracking().SingleOrDefaultAsync(row => row.UserId == userId && row.Id == seriesId, cancellationToken);
        return series is null
            ? Result.NotFound<TaskSeriesResponse>(TaskErrors.SeriesNotFound)
            : Result.Success(TasksHandler.ToResponse(series)!);
    }

    /// <summary>
    /// Changes the rule and the text of the series. Pending occurrences from today onwards are rebuilt to match
    /// it: dates the new rule no longer includes are dropped, dates it adds are generated, and the ones it keeps
    /// take the new title, time and priority. Everything before today, and everything already completed, stays.
    /// </summary>
    public async Task<Result<TaskSeriesResponse>> UpdateAsync(Guid userId, Guid seriesId, UpdateTaskSeriesCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var series = await db.TaskSeries.SingleOrDefaultAsync(row => row.UserId == userId && row.Id == seriesId, cancellationToken);
        if (series is null)
        {
            return Result.NotFound<TaskSeriesResponse>(TaskErrors.SeriesNotFound);
        }

        if (series.IsStopped)
        {
            return Result.Conflict<TaskSeriesResponse>(TaskErrors.SeriesStopped, "Create a new repeating task instead.");
        }

        if (TasksHandler.IsStale(command.ExpectedUpdatedAtUtc, series.UpdatedAtUtc))
        {
            return Result.Conflict<TaskSeriesResponse>(TaskErrors.StaleEdit, "Reload the series and apply the change again.");
        }

        var today = await TodayAsync(userId, cancellationToken);
        var recurrence = TasksHandler.Build(command.Recurrence, series.StartDate);
        if (!recurrence.IsValid(today))
        {
            return Result.Validation<TaskSeriesResponse>(
                "Recurrence is not usable",
                $"A schedule starts at most {TaskRecurrence.MaxPastStartDays} days in the past and ends at most {TaskRecurrence.MaxFutureEndDays} days ahead.");
        }

        var nowUtc = clock.GetUtcNow().UtcDateTime;
        series.Update(command.Title, command.Note, command.PlannedTime, command.Priority, recurrence, nowUtc);

        var future = await db.Tasks
            .Where(task => task.UserId == userId && task.SeriesId == seriesId && task.PlannedDate >= today && task.State == TaskState.Pending)
            .ToListAsync(cancellationToken);

        foreach (var occurrence in future)
        {
            if (recurrence.Includes(occurrence.PlannedDate))
            {
                occurrence.ApplySeriesDefaults(series.Title, series.Note, series.PlannedTime, series.Priority, nowUtc);
            }
            else
            {
                // The new rule does not want this date. It leaves as a tombstone, so regeneration cannot undo it.
                occurrence.Remove(nowUtc);
            }
        }

        await db.SaveChangesAsync(cancellationToken);
        await generator.GenerateAsync(series, today, cancellationToken);

        return Result.Success(TasksHandler.ToResponse(series)!);
    }

    /// <summary>
    /// Stops the schedule from today. Pending occurrences after today are dropped; today's and every past one —
    /// completed or not — stay exactly where they are, so the record of what was done survives.
    /// </summary>
    public async Task<Result<TaskSeriesResponse>> StopAsync(Guid userId, Guid seriesId, CancellationToken cancellationToken)
    {
        var series = await db.TaskSeries.SingleOrDefaultAsync(row => row.UserId == userId && row.Id == seriesId, cancellationToken);
        if (series is null)
        {
            return Result.NotFound<TaskSeriesResponse>(TaskErrors.SeriesNotFound);
        }

        var today = await TodayAsync(userId, cancellationToken);
        var nowUtc = clock.GetUtcNow().UtcDateTime;

        if (!series.IsStopped)
        {
            series.Stop(today, nowUtc);
        }

        var future = await db.Tasks
            .Where(task => task.UserId == userId && task.SeriesId == seriesId && task.PlannedDate > today && task.State == TaskState.Pending)
            .ToListAsync(cancellationToken);
        foreach (var occurrence in future)
        {
            occurrence.Remove(nowUtc);
        }

        await db.SaveChangesAsync(cancellationToken);
        return Result.Success(TasksHandler.ToResponse(series)!);
    }

    private async Task<DateOnly> TodayAsync(Guid userId, CancellationToken cancellationToken)
    {
        var timeZone = await UserTimeZone.LoadAsync(db, userId, cancellationToken);
        return LocalCalendar.ToLocalDate(timeZone, clock.GetUtcNow().UtcDateTime);
    }
}
