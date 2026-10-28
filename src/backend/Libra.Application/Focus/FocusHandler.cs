using Libra.Application.Common;
using Libra.Domain.Focus;
using Libra.Domain.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Libra.Application.Focus;

/// <summary>
/// Focus history: saving a finished run, and reading what today holds.
///
/// Everything is owner-scoped. A run is identified by the client id the device generated, and the unique index
/// on (user, client id) is what makes a retry from the outbox idempotent — the handler returns the stored run
/// instead of writing a second one, so a flaky connection can never inflate a total.
///
/// Only focus runs are stored. Breaks are a local matter and are never uploaded, so nothing here can count one.
/// </summary>
public sealed class FocusHandler(ILibraDbContext db, TimeProvider clock)
{
    /// <summary>
    /// Records one finished run, or returns the one already recorded under the same client id.
    ///
    /// The linked task is validated against the caller: an id that belongs to someone else is treated exactly
    /// like one that does not exist, and the run is stored unlinked rather than refused — the history of the
    /// time actually spent is worth more than the association.
    /// </summary>
    public async Task<Result<CreateOutcome<FocusSessionResponse>>> SaveAsync(Guid userId, SaveFocusSessionCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var existing = await db.FocusSessions
            .AsNoTracking()
            .SingleOrDefaultAsync(session => session.UserId == userId && session.ClientSessionId == command.ClientSessionId, cancellationToken);
        if (existing is not null)
        {
            return Result.Success(new CreateOutcome<FocusSessionResponse>(Project(existing), Created: false));
        }

        Guid? taskId = null;
        var taskTitle = command.TaskTitle;
        if (command.TaskId is Guid linked)
        {
            var task = await db.Tasks
                .AsNoTracking()
                .Where(row => row.UserId == userId && row.Id == linked && row.State != TaskState.Removed)
                .Select(row => new { row.Id, row.Title })
                .SingleOrDefaultAsync(cancellationToken);
            if (task is not null)
            {
                taskId = task.Id;
                // The device's snapshot is trusted only as a fallback; the stored title is the truthful one.
                taskTitle = task.Title;
            }
        }

        var nowUtc = clock.GetUtcNow().UtcDateTime;
        FocusSession session;
        try
        {
            session = FocusSession.Record(
                userId,
                command.ClientSessionId,
                taskId,
                taskTitle,
                TimeSpan.FromSeconds(command.ConfiguredSeconds),
                [.. command.Intervals.Select(interval => new FocusInterval
                {
                    StartedAtUtc = interval.StartedAtUtc.UtcDateTime,
                    EndedAtUtc = interval.EndedAtUtc.UtcDateTime,
                })],
                command.Outcome,
                nowUtc);
        }
        catch (ArgumentException error)
        {
            // A payload the domain refuses is an explicit error, never a row quietly reshaped to fit.
            return Result.Validation<CreateOutcome<FocusSessionResponse>>(FocusErrors.InvalidRun, error.Message);
        }

        db.FocusSessions.Add(session);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Two uploads of the same run raced: the unique index decided, and both callers get that one row.
            var winner = await FindByClientIdAsync(userId, command.ClientSessionId, cancellationToken);
            if (winner is null)
            {
                throw;
            }

            return Result.Success(new CreateOutcome<FocusSessionResponse>(winner, Created: false));
        }

        return Result.Success(new CreateOutcome<FocusSessionResponse>(Project(session), Created: true));
    }

    /// <summary>
    /// Today's focus, in the user's own time zone.
    ///
    /// Active time is split across local midnight by interval, so a run that started before midnight counts on
    /// both days in the proportion it was actually spent. A completed run is counted on the local date it
    /// finished; a run the user ended early contributes its time but is never a completed session.
    /// </summary>
    public async Task<FocusSummaryResponse> GetSummaryAsync(Guid userId, DateOnly? date, CancellationToken cancellationToken)
    {
        var timeZone = await UserTimeZone.LoadAsync(db, userId, cancellationToken);
        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var today = date ?? LocalCalendar.ToLocalDate(timeZone, nowUtc);
        var day = LocalCalendar.Day(timeZone, today);

        // Any run whose interval overlaps the local day, including one that started the evening before.
        var sessions = await db.FocusSessions
            .AsNoTracking()
            .Where(session => session.UserId == userId && session.EndedAtUtc > day.StartUtc && session.StartedAtUtc < day.EndUtc)
            .ToListAsync(cancellationToken);

        var activeSeconds = 0d;
        var completed = 0;
        var stopped = 0;
        foreach (var session in sessions)
        {
            activeSeconds += session.ActiveDurationWithin(day.StartUtc, day.EndUtc).TotalSeconds;

            // A session belongs to the date it finished, which is not always the date it started.
            if (session.EndedAtUtc >= day.StartUtc && session.EndedAtUtc < day.EndUtc)
            {
                if (session.IsCompleted)
                {
                    completed += 1;
                }
                else
                {
                    stopped += 1;
                }
            }
        }

        return new FocusSummaryResponse(timeZone, new FocusDayResponse(today, (int)Math.Round(activeSeconds), completed, stopped));
    }

    private async Task<FocusSessionResponse?> FindByClientIdAsync(Guid userId, Guid clientSessionId, CancellationToken cancellationToken)
    {
        var session = await db.FocusSessions
            .AsNoTracking()
            .SingleOrDefaultAsync(row => row.UserId == userId && row.ClientSessionId == clientSessionId, cancellationToken);
        return session is null ? null : Project(session);
    }

    private static FocusSessionResponse Project(FocusSession session) => new()
    {
        Id = session.Id,
        ClientSessionId = session.ClientSessionId,
        TaskId = session.TaskId,
        TaskTitle = session.TaskTitle,
        ConfiguredSeconds = (int)Math.Round(session.ConfiguredDuration.TotalSeconds),
        StartedAtUtc = session.StartedAtUtc,
        EndedAtUtc = session.EndedAtUtc,
        ActiveSeconds = (int)Math.Round(session.ActiveDuration.TotalSeconds),
        Outcome = session.Outcome,
        CreatedAtUtc = session.CreatedAtUtc,
    };
}
