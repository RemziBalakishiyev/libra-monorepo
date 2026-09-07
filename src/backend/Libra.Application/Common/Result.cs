namespace Libra.Application.Common;

public enum AppErrorType
{
    Validation,
    Unauthorized,
    NotFound,
    Conflict,
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
}
