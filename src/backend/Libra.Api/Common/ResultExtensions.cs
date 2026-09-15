using Libra.Application.Common;

namespace Libra.Api.Common;

internal static class ResultExtensions
{
    public static IResult ToProblem(this AppError error)
    {
        ArgumentNullException.ThrowIfNull(error);

        var status = error.Type switch
        {
            AppErrorType.Validation => StatusCodes.Status400BadRequest,
            AppErrorType.Unauthorized => StatusCodes.Status401Unauthorized,
            AppErrorType.NotFound => StatusCodes.Status404NotFound,
            AppErrorType.Conflict => StatusCodes.Status409Conflict,
            AppErrorType.RateLimited => StatusCodes.Status429TooManyRequests,
            AppErrorType.Unavailable => StatusCodes.Status503ServiceUnavailable,
            AppErrorType.Timeout => StatusCodes.Status504GatewayTimeout,
            _ => StatusCodes.Status500InternalServerError,
        };

        return Results.Problem(title: error.Title, detail: error.Detail, statusCode: status);
    }

    public static IResult ToOk<TValue>(this Result<TValue> result) =>
        result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToProblem();

    public static IResult ToCreated<TValue>(this Result<TValue> result) =>
        result.IsSuccess ? Results.Created((string?)null, result.Value) : result.Error!.ToProblem();

    public static IResult ToCreated<TValue>(this Result<TValue> result, Func<TValue, string> location) =>
        result.IsSuccess ? Results.Created(location(result.Value!), result.Value) : result.Error!.ToProblem();

    /// <summary>201 when the call created the record, 200 when an idempotent replay returned the existing one.</summary>
    public static IResult ToCreatedOrReplayed<TValue>(this Result<CreateOutcome<TValue>> result, Func<TValue, string> location)
    {
        if (!result.IsSuccess)
        {
            return result.Error!.ToProblem();
        }

        var outcome = result.Value!;
        return outcome.Created
            ? Results.Created(location(outcome.Response), outcome.Response)
            : Results.Ok(outcome.Response);
    }

    public static IResult ToNoContent(this Result<bool> result) =>
        result.IsSuccess ? Results.NoContent() : result.Error!.ToProblem();
}
