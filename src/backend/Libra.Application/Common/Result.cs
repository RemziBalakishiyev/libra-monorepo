namespace Libra.Application.Common;

public enum AppErrorType
{
    Validation,
    Unauthorized,
    NotFound,
    Conflict,

    /// <summary>The caller exceeded a per-user limit (429).</summary>
    RateLimited,

    /// <summary>A dependency the request needs is not configured or not answering (503).</summary>
    Unavailable,

    /// <summary>A dependency did not answer in time (504).</summary>
    Timeout,
}

/// <summary>
/// A failure a use case can report to the caller. The API maps it to an RFC 9457 Problem Details response.
/// </summary>
public sealed record AppError(AppErrorType Type, string Title, string? Detail = null);

/// <summary>
/// Minimal success/failure outcome so handlers do not use exceptions for expected failures.
/// Create instances through <see cref="Result"/>.
/// </summary>
public sealed class Result<TValue>
{
    internal Result(TValue? value, AppError? error)
    {
        Value = value;
        Error = error;
    }

    public TValue? Value { get; }

    public AppError? Error { get; }

    public bool IsSuccess => Error is null;
}

/// <summary>Outcome of an idempotent create: the record plus whether this call created it.</summary>
public sealed record CreateOutcome<TResponse>(TResponse Response, bool Created);

public static class Result
{
    public static Result<TValue> Success<TValue>(TValue value) => new(value, null);

    public static Result<TValue> Failure<TValue>(AppError error)
    {
        ArgumentNullException.ThrowIfNull(error);
        return new Result<TValue>(default, error);
    }

    public static Result<TValue> Validation<TValue>(string title, string? detail = null) =>
        Failure<TValue>(new AppError(AppErrorType.Validation, title, detail));

    public static Result<TValue> Unauthorized<TValue>(string title, string? detail = null) =>
        Failure<TValue>(new AppError(AppErrorType.Unauthorized, title, detail));

    public static Result<TValue> Conflict<TValue>(string title, string? detail = null) =>
        Failure<TValue>(new AppError(AppErrorType.Conflict, title, detail));

    public static Result<TValue> NotFound<TValue>(string title, string? detail = null) =>
        Failure<TValue>(new AppError(AppErrorType.NotFound, title, detail));

    public static Result<TValue> RateLimited<TValue>(string title, string? detail = null) =>
        Failure<TValue>(new AppError(AppErrorType.RateLimited, title, detail));

    public static Result<TValue> Unavailable<TValue>(string title, string? detail = null) =>
        Failure<TValue>(new AppError(AppErrorType.Unavailable, title, detail));
}
