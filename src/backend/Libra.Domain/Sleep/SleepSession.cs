namespace Libra.Domain.Sleep;

/// <summary>
/// One night's sleep: when it started, when the user woke up, and optionally how it felt.
///
/// Both ends are UTC instants, and the duration is always the difference between them — never a number the app
/// counted while the screen was open. A session with no <see cref="EndedAtUtc"/> is still running; it is the one
/// open session a user may have, and it contributes to no total until it is closed.
/// </summary>
public sealed class SleepSession
{
    public const int NoteMaxLength = 500;
    public const int MinQuality = 1;
    public const int MaxQuality = 5;

    /// <summary>
    /// Longest a *completed* session may be. An open session is deliberately not bounded: a forgotten one is
    /// left exactly as long as it really is, so the user can correct or discard it rather than find a number
    /// the server invented.
    /// </summary>
    public static readonly TimeSpan MaxDuration = TimeSpan.FromHours(24);

    /// <summary>How far ahead of the server clock a timestamp may sit, to absorb ordinary clock skew.</summary>
    public static readonly TimeSpan FutureTolerance = TimeSpan.FromMinutes(5);

    /// <summary>
    /// PostgreSQL's `timestamptz` keeps microseconds while .NET keeps 100-nanosecond ticks. Every instant is
    /// rounded to what will actually be stored, so a session reports the same moment whether the caller just
    /// created it or read it back — and a retried stop compares equal to the one already on disk.
    /// </summary>
    private static DateTime ToStoredPrecision(DateTime value) =>
        new(value.Ticks - (value.Ticks % 10), DateTimeKind.Utc);

    private SleepSession()
    {
    }

    public Guid Id { get; private set; }

    public Guid UserId { get; private set; }

    public DateTime StartedAtUtc { get; private set; }

    /// <summary>Null while the session is open. Set once, from the instant the user said they woke up.</summary>
    public DateTime? EndedAtUtc { get; private set; }

    /// <summary>The user's own 1–5 rating. Optional: waking up never depends on filling in a form.</summary>
    public int? Quality { get; private set; }

    public string? Note { get; private set; }

    /// <summary>Client-generated id that makes a retried start idempotent per user.</summary>
    public Guid? ClientRequestId { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public bool IsOpen => EndedAtUtc is null;

    /// <summary>How long the session lasted, from the stored instants. Null while it is still running.</summary>
    public TimeSpan? Duration => EndedAtUtc is DateTime ended ? ended - StartedAtUtc : null;

    /// <summary>How long an open session has been running at <paramref name="nowUtc"/>.</summary>
    public TimeSpan Elapsed(DateTime nowUtc) => (EndedAtUtc ?? nowUtc) - StartedAtUtc;

    public static SleepSession Start(Guid userId, DateTime startedAtUtc, Guid? clientRequestId, DateTime nowUtc)
    {
        var session = new SleepSession
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            ClientRequestId = clientRequestId,
            CreatedAtUtc = ToStoredPrecision(nowUtc),
        };
        session.SetInterval(startedAtUtc, null, nowUtc);
        return session;
    }

    /// <summary>A session the user recorded after the fact. It is complete from the moment it exists.</summary>
    public static SleepSession Record(Guid userId, DateTime startedAtUtc, DateTime endedAtUtc, int? quality, string? note, Guid? clientRequestId, DateTime nowUtc)
    {
        var session = new SleepSession
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            ClientRequestId = clientRequestId,
            CreatedAtUtc = ToStoredPrecision(nowUtc),
        };
        session.SetInterval(startedAtUtc, endedAtUtc, nowUtc);
        session.SetRating(quality, note);
        return session;
    }

    /// <summary>
    /// Closes the session at the moment the user said they woke up. Returns false when it is already closed, so
    /// a retried stop answers with the session it already has instead of moving its end time.
    /// </summary>
    public bool Stop(DateTime endedAtUtc, DateTime nowUtc)
    {
        if (!IsOpen)
        {
            return false;
        }

        SetInterval(StartedAtUtc, endedAtUtc, nowUtc);
        return true;
    }

    /// <summary>Corrects the recorded interval and rating. Used for both a running and a finished session.</summary>
    public void Correct(DateTime startedAtUtc, DateTime? endedAtUtc, int? quality, string? note, DateTime nowUtc)
    {
        SetInterval(startedAtUtc, endedAtUtc, nowUtc);
        SetRating(quality, note);
    }

    /// <summary>Adds or changes the optional rating without touching the interval.</summary>
    public void Rate(int? quality, string? note, DateTime nowUtc)
    {
        SetRating(quality, note);
        UpdatedAtUtc = ToStoredPrecision(nowUtc);
    }

    private void SetInterval(DateTime startedAtUtc, DateTime? endedAtUtc, DateTime nowUtc)
    {
        var start = ToStoredPrecision(DateTime.SpecifyKind(startedAtUtc, DateTimeKind.Utc));
        var end = endedAtUtc is DateTime value ? ToStoredPrecision(DateTime.SpecifyKind(value, DateTimeKind.Utc)) : (DateTime?)null;

        if (start > nowUtc + FutureTolerance)
        {
            throw new ArgumentException("A sleep session cannot start in the future.", nameof(startedAtUtc));
        }

        if (end is DateTime finish)
        {
            if (finish <= start)
            {
                throw new ArgumentException("A sleep session must end after it started.", nameof(endedAtUtc));
            }

            if (finish > nowUtc + FutureTolerance)
            {
                throw new ArgumentException("A sleep session cannot end in the future.", nameof(endedAtUtc));
            }

            // Only a completed interval is bounded; an open one may run as long as the user forgot it for.
            if (finish - start > MaxDuration)
            {
                throw new ArgumentException($"A sleep session can be at most {MaxDuration.TotalHours:F0} hours long.", nameof(endedAtUtc));
            }
        }

        StartedAtUtc = start;
        EndedAtUtc = end;
        UpdatedAtUtc = ToStoredPrecision(nowUtc);
    }

    private void SetRating(int? quality, string? note)
    {
        if (quality is int value && value is < MinQuality or > MaxQuality)
        {
            throw new ArgumentOutOfRangeException(nameof(quality), value, $"Quality is {MinQuality}–{MaxQuality}.");
        }

        var trimmed = note?.Trim();
        if (trimmed?.Length > NoteMaxLength)
        {
            throw new ArgumentOutOfRangeException(nameof(note), "The note is too long.");
        }

        Quality = quality;
        Note = string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }
}
