using Libra.Application.Common;
using Libra.Domain.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Libra.Application.Tasks;

/// <summary>
/// Turns recurrence rules into real rows.
///
/// The policy, in one place because everything else depends on it:
/// <list type="bullet">
/// <item>Every scheduled local date between the series start and <see cref="TaskSeries.HorizonDays"/> days from
/// today gets its own <see cref="TaskItem"/>. Missed past dates are materialized too, so a day the user skipped
/// still appears — and still counts — as overdue instead of vanishing.</item>
/// <item>Generation is idempotent. A unique index on (series, planned date) is the authority, so two requests
/// generating at the same moment produce one row, not two; the loser's insert is caught and dropped.</item>
/// <item>A date that already has a row is never touched, whatever its state. That is what keeps a completed
/// occurrence completed, an edited one edited, and a deleted one deleted: its tombstone occupies the date.</item>
/// </list>
/// </summary>
public sealed class TaskOccurrenceGenerator(ILibraDbContext db, TimeProvider clock)
{
    /// <summary>Materializes every missing occurrence of one series. Returns how many rows it added.</summary>
    public async Task<int> GenerateAsync(TaskSeries series, DateOnly today, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(series);

        var wanted = series.DatesToMaterialize(today);
        if (wanted.Count == 0)
        {
            return 0;
        }

        var added = await AddMissingAsync(series, wanted, cancellationToken);
        if (added is not null)
        {
            return added.Value;
        }

        // A concurrent pass inserted some of the same dates. Re-read what exists now and add only the rest;
        // if that races too, the winner's rows are already there and there is nothing left to do.
        return await AddMissingAsync(series, wanted, cancellationToken) ?? 0;
    }

    /// <summary>Returns the number of rows added, or null when a unique violation means someone else won.</summary>
    private async Task<int?> AddMissingAsync(TaskSeries series, IReadOnlyList<DateOnly> wanted, CancellationToken cancellationToken)
    {
        var first = wanted[0];
        var last = wanted[^1];
        var existing = await db.Tasks
            .AsNoTracking()
            .Where(task => task.SeriesId == series.Id && task.PlannedDate >= first && task.PlannedDate <= last)
            .Select(task => task.PlannedDate)
            .ToListAsync(cancellationToken);

        var missing = wanted.Except(existing).ToList();
        if (missing.Count == 0)
        {
            return 0;
        }

        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var created = missing
            .Select(date => TaskItem.Create(series.UserId, series.Title, series.Note, date, series.PlannedTime, series.Priority, clientRequestId: null, nowUtc, series.Id))
            .ToList();
        db.Tasks.AddRange(created);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
            return created.Count;
        }
        catch (DbUpdateException exception) when (exception.IsUniqueViolation())
        {
            // Removing an entity that is still Added detaches it, which leaves the context usable afterwards.
            db.Tasks.RemoveRange(created);
            return null;
        }
    }

    /// <summary>
    /// Brings every active series of one user up to date. Called before any read that reports counts, so a
    /// number the user sees never depends on which screen happened to generate first.
    /// </summary>
    public async Task EnsureAsync(Guid userId, DateOnly today, CancellationToken cancellationToken)
    {
        var series = await db.TaskSeries
            .Where(candidate => candidate.UserId == userId && candidate.StoppedAtUtc == null)
            .Where(candidate => candidate.EndDate == null || candidate.EndDate >= candidate.StartDate)
            .ToListAsync(cancellationToken);

        foreach (var rule in series)
        {
            await GenerateAsync(rule, today, cancellationToken);
        }
    }
}
