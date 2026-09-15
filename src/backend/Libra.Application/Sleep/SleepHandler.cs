using Libra.Application.Common;
using Libra.Domain.Sleep;
using Microsoft.EntityFrameworkCore;

namespace Libra.Application.Sleep;

/// <summary>
/// Sleep tracking. Every query filters on the owner, so another user's session simply does not exist (404).
///
/// Two rules the database enforces rather than trusting this class with: a user has at most one open session
/// (a partial unique index), and completed sessions of one user never overlap (a `btree_gist` exclusion
/// constraint over half-open ranges, so two nights may meet at an endpoint but not cross). Both are also
/// checked here so the ordinary answer is a clear Problem Details rather than a constraint violation — the
/// database is the backstop for the concurrent case the check cannot see.
/// </summary>
public sealed class SleepHandler(ILibraDbContext db, TimeProvider clock)
{
    /// <summary>How many local days the summary covers, ending today.</summary>
    public const int SummaryDays = 7;

    /// <summary>The session that is still running, or null. This is what the app restores on launch.</summary>
    public async Task<SleepSessionResponse?> GetActiveAsync(Guid userId, CancellationToken cancellationToken)
    {
        var timeZone = await UserTimeZone.LoadAsync(db, userId, cancellationToken);
        var session = await db.SleepSessions
            .AsNoTracking()
            .SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.EndedAtUtc == null, cancellationToken);
        return session is null ? null : ToResponse(session, timeZone);
    }

    public async Task<Result<SleepSessionResponse>> GetAsync(Guid userId, Guid sessionId, CancellationToken cancellationToken)
    {
        var timeZone = await UserTimeZone.LoadAsync(db, userId, cancellationToken);
        var session = await FindAsync(userId, sessionId, tracked: false, cancellationToken);
        return session is null
            ? Result.NotFound<SleepSessionResponse>(SleepErrors.SessionNotFound)
            : Result.Success(ToResponse(session, timeZone));
    }

    public async Task<PagedResponse<SleepSessionResponse>> ListAsync(Guid userId, SleepListQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var timeZone = await UserTimeZone.LoadAsync(db, userId, cancellationToken);
        var owned = db.SleepSessions.AsNoTracking().Where(session => session.UserId == userId);

        var totalCount = await owned.CountAsync(cancellationToken);
        var items = await owned
            // Newest night first; an open session sorts with the moment it began, which is where it belongs.
            .OrderByDescending(session => session.StartedAtUtc)
            .ThenByDescending(session => session.Id)
            .Skip((query.PageNumber - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken);

        return new PagedResponse<SleepSessionResponse>(items.Select(session => ToResponse(session, timeZone)).ToList(), query.PageNumber, query.PageSize, totalCount);
    }

    /// <summary>
    /// Begins a session. A retried request carrying the same <c>clientRequestId</c> returns the session the first
    /// attempt created, so an answer that never arrived cannot become a second night.
    /// </summary>
    public async Task<Result<CreateOutcome<SleepSessionResponse>>> StartAsync(Guid userId, StartSleepCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var timeZone = await UserTimeZone.LoadAsync(db, userId, cancellationToken);
        var nowUtc = clock.GetUtcNow().UtcDateTime;

        if (command.ClientRequestId is Guid requestId)
        {
            var existing = await FindByClientRequestIdAsync(userId, requestId, cancellationToken);
            if (existing is not null)
            {
                return Result.Success(new CreateOutcome<SleepSessionResponse>(ToResponse(existing, timeZone), Created: false));
            }
        }

        var open = await db.SleepSessions.AsNoTracking().SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.EndedAtUtc == null, cancellationToken);
        if (open is not null)
        {
            return Result.Conflict<CreateOutcome<SleepSessionResponse>>(SleepErrors.AlreadyOpen, "Close the running session before starting another one.");
        }

        var startedAt = command.StartedAtUtc?.UtcDateTime ?? nowUtc;
        SleepSession session;
        try
        {
            session = SleepSession.Start(userId, startedAt, command.ClientRequestId, nowUtc);
        }
        catch (ArgumentException exception)
        {
            return Result.Validation<CreateOutcome<SleepSessionResponse>>(SleepErrors.InvalidInterval, exception.Message);
        }

        if (await OverlapsAsync(userId, session.Id, startedAt, null, cancellationToken))
        {
            return Result.Conflict<CreateOutcome<SleepSessionResponse>>(SleepErrors.Overlaps, "Another recorded session already covers that time.");
        }

        db.SleepSessions.Add(session);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (Exception exception) when (IsWriteConflict(exception))
        {
            // Two starts raced. Whichever the database accepted is the session that exists.
            db.SleepSessions.Remove(session);
            if (command.ClientRequestId is Guid raced)
            {
                var winner = await FindByClientRequestIdAsync(userId, raced, cancellationToken);
                if (winner is not null)
                {
                    return Result.Success(new CreateOutcome<SleepSessionResponse>(ToResponse(winner, timeZone), Created: false));
                }
            }

            var running = await db.SleepSessions.AsNoTracking().SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.EndedAtUtc == null, cancellationToken);
            return running is not null
                ? Result.Success(new CreateOutcome<SleepSessionResponse>(ToResponse(running, timeZone), Created: false))
                : Result.Conflict<CreateOutcome<SleepSessionResponse>>(SleepErrors.AlreadyOpen, "Another request changed the running session. Reload and try again.");
        }

        return Result.Success(new CreateOutcome<SleepSessionResponse>(ToResponse(session, timeZone), Created: true));
    }

    /// <summary>
    /// Closes the session the caller named. Repeating the request returns that same completed session without
    /// moving its end time, and it can never close a newer session that started in the meantime.
    /// </summary>
    public async Task<Result<SleepSessionResponse>> StopAsync(Guid userId, Guid sessionId, StopSleepCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var timeZone = await UserTimeZone.LoadAsync(db, userId, cancellationToken);
        var session = await FindAsync(userId, sessionId, tracked: true, cancellationToken);
        if (session is null)
        {
            return Result.NotFound<SleepSessionResponse>(SleepErrors.SessionNotFound);
        }

        if (!session.IsOpen)
        {
            // A repeated stop is not an error: the answer is the night that was already recorded.
            return Result.Success(ToResponse(session, timeZone));
        }

        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var endedAt = command.EndedAtUtc?.UtcDateTime ?? nowUtc;
        try
        {
            session.Stop(endedAt, nowUtc);
        }
        catch (ArgumentException exception)
        {
            return Result.Validation<SleepSessionResponse>(SleepErrors.InvalidInterval, exception.Message);
        }

        if (await OverlapsAsync(userId, session.Id, session.StartedAtUtc, session.EndedAtUtc, cancellationToken))
        {
            return Result.Conflict<SleepSessionResponse>(SleepErrors.Overlaps, "Another recorded session already covers that time.");
        }

        var conflict = await TrySaveAsync(cancellationToken);
        return conflict is not null ? Result.Failure<SleepSessionResponse>(conflict) : Result.Success(ToResponse(session, timeZone));
    }

    /// <summary>Records a night the user did not track live. It is complete from the moment it is created.</summary>
    public async Task<Result<CreateOutcome<SleepSessionResponse>>> RecordAsync(Guid userId, RecordSleepCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var timeZone = await UserTimeZone.LoadAsync(db, userId, cancellationToken);
        var nowUtc = clock.GetUtcNow().UtcDateTime;

        if (command.ClientRequestId is Guid requestId)
        {
            var existing = await FindByClientRequestIdAsync(userId, requestId, cancellationToken);
            if (existing is not null)
            {
                return Result.Success(new CreateOutcome<SleepSessionResponse>(ToResponse(existing, timeZone), Created: false));
            }
        }

        SleepSession session;
        try
        {
            session = SleepSession.Record(userId, command.StartedAtUtc.UtcDateTime, command.EndedAtUtc.UtcDateTime, command.Quality, command.Note, command.ClientRequestId, nowUtc);
        }
        catch (ArgumentException exception)
        {
            return Result.Validation<CreateOutcome<SleepSessionResponse>>(SleepErrors.InvalidInterval, exception.Message);
        }

        if (await OverlapsAsync(userId, session.Id, session.StartedAtUtc, session.EndedAtUtc, cancellationToken))
        {
            return Result.Conflict<CreateOutcome<SleepSessionResponse>>(SleepErrors.Overlaps, "Another recorded session already covers that time.");
        }

        db.SleepSessions.Add(session);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (Exception exception) when (IsWriteConflict(exception))
        {
            db.SleepSessions.Remove(session);
            if (command.ClientRequestId is Guid raced)
            {
                var winner = await FindByClientRequestIdAsync(userId, raced, cancellationToken);
                if (winner is not null)
                {
                    return Result.Success(new CreateOutcome<SleepSessionResponse>(ToResponse(winner, timeZone), Created: false));
                }
            }

            return Result.Conflict<CreateOutcome<SleepSessionResponse>>(SleepErrors.Overlaps, "Another recorded session already covers that time.");
        }

        return Result.Success(new CreateOutcome<SleepSessionResponse>(ToResponse(session, timeZone), Created: true));
    }

    /// <summary>
    /// Corrects one session's interval and rating. Leaving the end null keeps the session open, which is how a
    /// forgotten night is fixed rather than clipped.
    /// </summary>
    public async Task<Result<SleepSessionResponse>> CorrectAsync(Guid userId, Guid sessionId, CorrectSleepCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var timeZone = await UserTimeZone.LoadAsync(db, userId, cancellationToken);
        var session = await FindAsync(userId, sessionId, tracked: true, cancellationToken);
        if (session is null)
        {
            return Result.NotFound<SleepSessionResponse>(SleepErrors.SessionNotFound);
        }

        if (IsStale(command.ExpectedUpdatedAtUtc, session.UpdatedAtUtc))
        {
            return Result.Conflict<SleepSessionResponse>(SleepErrors.StaleEdit, "Reload the session and apply the change again.");
        }

        var nowUtc = clock.GetUtcNow().UtcDateTime;
        try
        {
            session.Correct(command.StartedAtUtc.UtcDateTime, command.EndedAtUtc?.UtcDateTime, command.Quality, command.Note, nowUtc);
        }
        catch (ArgumentException exception)
        {
            return Result.Validation<SleepSessionResponse>(SleepErrors.InvalidInterval, exception.Message);
        }

        if (await OverlapsAsync(userId, session.Id, session.StartedAtUtc, session.EndedAtUtc, cancellationToken))
        {
            return Result.Conflict<SleepSessionResponse>(SleepErrors.Overlaps, "Another recorded session already covers that time.");
        }

        var conflict = await TrySaveAsync(cancellationToken);
        return conflict is not null ? Result.Failure<SleepSessionResponse>(conflict) : Result.Success(ToResponse(session, timeZone));
    }

    /// <summary>Discards a session outright — the escape hatch for a night that should never have been recorded.</summary>
    public async Task<Result<bool>> DeleteAsync(Guid userId, Guid sessionId, CancellationToken cancellationToken)
    {
        var session = await FindAsync(userId, sessionId, tracked: true, cancellationToken);
        if (session is null)
        {
            return Result.NotFound<bool>(SleepErrors.SessionNotFound);
        }

        db.SleepSessions.Remove(session);
        var conflict = await TrySaveAsync(cancellationToken);
        return conflict is not null ? Result.Failure<bool>(conflict) : Result.Success(true);
    }

    /// <summary>
    /// The last seven local dates. Each completed session counts once, on the date the user woke up in their own
    /// time zone, so a night across midnight belongs to the morning it ended. Open sessions are excluded, and a
    /// date with nothing recorded reports null rather than zero.
    ///
    /// The window is aggregated by its own query over every matching session, so it never depends on which page
    /// of the history the client happens to be reading.
    /// </summary>
    public async Task<SleepSummaryResponse> GetSummaryAsync(Guid userId, DateOnly? endDate, CancellationToken cancellationToken)
    {
        var timeZone = await UserTimeZone.LoadAsync(db, userId, cancellationToken);
        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var to = endDate ?? LocalCalendar.ToLocalDate(timeZone, nowUtc);
        var from = to.AddDays(-(SummaryDays - 1));

        // One UTC window covering the seven local days, whatever their real length is across a DST change.
        var windowStart = LocalCalendar.Day(timeZone, from).StartUtc;
        var windowEnd = LocalCalendar.Day(timeZone, to).EndUtc;

        var completed = await db.SleepSessions
            .AsNoTracking()
            .Where(session => session.UserId == userId && session.EndedAtUtc != null)
            .Where(session => session.EndedAtUtc >= windowStart && session.EndedAtUtc < windowEnd)
            .Select(session => new { session.StartedAtUtc, session.EndedAtUtc })
            .ToListAsync(cancellationToken);

        var totals = new Dictionary<DateOnly, (int Minutes, int Count)>();
        foreach (var session in completed)
        {
            // Attribution is by wake-up date; the elapsed time still comes from the two UTC instants, so a
            // daylight-saving jump inside the night neither adds nor removes minutes.
            var wakeDate = LocalCalendar.ToLocalDate(timeZone, session.EndedAtUtc!.Value);
            var minutes = (int)Math.Round((session.EndedAtUtc!.Value - session.StartedAtUtc).TotalMinutes, MidpointRounding.AwayFromZero);
            var current = totals.GetValueOrDefault(wakeDate);
            totals[wakeDate] = (current.Minutes + minutes, current.Count + 1);
        }

        var days = new List<SleepDayResponse>(SummaryDays);
        for (var date = from; date <= to; date = date.AddDays(1))
        {
            days.Add(totals.TryGetValue(date, out var entry)
                ? new SleepDayResponse(date, entry.Minutes, entry.Count)
                : new SleepDayResponse(date, null, 0));
        }

        var recordedDays = days.Count(day => day.TotalMinutes is not null);
        var totalMinutes = days.Sum(day => day.TotalMinutes ?? 0);

        var active = await db.SleepSessions
            .AsNoTracking()
            .SingleOrDefaultAsync(session => session.UserId == userId && session.EndedAtUtc == null, cancellationToken);
        var latest = await db.SleepSessions
            .AsNoTracking()
            .Where(session => session.UserId == userId && session.EndedAtUtc != null)
            .OrderByDescending(session => session.EndedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        return new SleepSummaryResponse(
            timeZone,
            from,
            to,
            days,
            recordedDays == 0 ? null : (int)Math.Round((double)totalMinutes / recordedDays, MidpointRounding.AwayFromZero),
            recordedDays,
            totalMinutes,
            days.Sum(day => day.SessionCount),
            active is null ? null : ToResponse(active, timeZone),
            latest is null ? null : ToResponse(latest, timeZone));
    }

    /// <summary>A client that echoes an older timestamp than the stored one is working from a stale read.</summary>
    internal static bool IsStale(DateTime? expected, DateTime actual) =>
        expected is DateTime seen && Math.Abs((actual - seen).TotalMilliseconds) > 1;

    internal static SleepSessionResponse ToResponse(SleepSession session, string timeZone)
    {
        ArgumentNullException.ThrowIfNull(session);
        return new SleepSessionResponse
        {
            Id = session.Id,
            StartedAtUtc = session.StartedAtUtc,
            EndedAtUtc = session.EndedAtUtc,
            IsOpen = session.IsOpen,
            DurationMinutes = session.Duration is TimeSpan duration ? (int)Math.Round(duration.TotalMinutes, MidpointRounding.AwayFromZero) : null,
            WakeDate = session.EndedAtUtc is DateTime ended ? LocalCalendar.ToLocalDate(timeZone, ended) : null,
            Quality = session.Quality,
            Note = session.Note,
            ClientRequestId = session.ClientRequestId,
            CreatedAtUtc = session.CreatedAtUtc,
            UpdatedAtUtc = session.UpdatedAtUtc,
        };
    }

    /// <summary>
    /// True when the interval would cross another of this user's sessions. Half-open on purpose: two nights that
    /// meet exactly at one instant are adjacent, not overlapping.
    /// </summary>
    private async Task<bool> OverlapsAsync(Guid userId, Guid sessionId, DateTime startedAtUtc, DateTime? endedAtUtc, CancellationToken cancellationToken)
    {
        var query = db.SleepSessions
            .AsNoTracking()
            .Where(other => other.UserId == userId && other.Id != sessionId && other.EndedAtUtc != null);

        return endedAtUtc is DateTime ended
            ? await query.AnyAsync(other => other.StartedAtUtc < ended && other.EndedAtUtc > startedAtUtc, cancellationToken)
            // An open session has no end yet; it only conflicts with something that runs past its start.
            : await query.AnyAsync(other => other.EndedAtUtc > startedAtUtc, cancellationToken);
    }

    private Task<SleepSession?> FindAsync(Guid userId, Guid sessionId, bool tracked, CancellationToken cancellationToken)
    {
        var query = tracked ? db.SleepSessions : db.SleepSessions.AsNoTracking();
        return query.SingleOrDefaultAsync(session => session.UserId == userId && session.Id == sessionId, cancellationToken);
    }

    private Task<SleepSession?> FindByClientRequestIdAsync(Guid userId, Guid clientRequestId, CancellationToken cancellationToken) =>
        db.SleepSessions.AsNoTracking().SingleOrDefaultAsync(session => session.UserId == userId && session.ClientRequestId == clientRequestId, cancellationToken);

    private async Task<AppError?> TrySaveAsync(CancellationToken cancellationToken)
    {
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            return null;
        }
        catch (Exception exception) when (IsWriteConflict(exception))
        {
            return new AppError(AppErrorType.Conflict, SleepErrors.Overlaps, "Another recorded session already covers that time.");
        }
        catch (DbUpdateConcurrencyException)
        {
            return new AppError(AppErrorType.Conflict, SleepErrors.StaleEdit, "Reload the session and apply the change again.");
        }
    }

    /// <summary>
    /// Write conflicts the caller should see as a 409 rather than a server error: a violated EXCLUDE constraint
    /// (23P01), a duplicate key (23505), and the two states PostgreSQL raises when concurrent writers contend
    /// for the same ranges — a detected deadlock (40P01) and a serialization failure (40001).
    ///
    /// The whole chain is walked rather than just the direct inner exception: EF Core treats a deadlock as a
    /// transient failure, so without `EnableRetryOnFailure` it rethrows the `DbUpdateException` inside an
    /// `InvalidOperationException` suggesting retries be enabled, and the PostgreSQL error sits two levels down.
    /// </summary>
    private static bool IsWriteConflict(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is Npgsql.PostgresException { SqlState: "23P01" or "23505" or "40P01" or "40001" })
            {
                return true;
            }
        }

        return false;
    }
}
