using System.Security.Claims;
using Libra.Api.Common;
using Libra.Api.Identity;
using Libra.Application.Common;
using Libra.Application.Sleep;

namespace Libra.Api.Sleep;

/// <summary>
/// Sleep endpoints. Everything is owner-scoped: the id in the route is only ever resolved together with the
/// caller's user id, so another user's session is answered exactly like one that does not exist.
///
/// Stopping names the session it closes, so a request that arrives late can never end a night that started
/// after it, and repeating it returns the same completed session rather than moving its end time.
/// </summary>
internal static class SleepEndpoints
{
    public static IEndpointRouteBuilder MapSleepEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/sleep")
            .WithTags("Sleep")
            .RequireAuthorization();

        group.MapGet("/active", async (ClaimsPrincipal principal, SleepHandler handler, CancellationToken cancellationToken) =>
            {
                var session = await handler.GetActiveAsync(principal.GetUserId(), cancellationToken);
                // No running session is a fact, not a failure: an empty body says so without an error shape.
                return session is null ? Results.NoContent() : Results.Ok(session);
            })
            .Produces<SleepSessionResponse>()
            .Produces(StatusCodes.Status204NoContent);

        group.MapGet("/summary", async (ClaimsPrincipal principal, SleepHandler handler, CancellationToken cancellationToken, DateOnly? date = null) =>
                Results.Ok(await handler.GetSummaryAsync(principal.GetUserId(), date, cancellationToken)))
            .Produces<SleepSummaryResponse>();

        group.MapPost("/start", async (ClaimsPrincipal principal, StartSleepCommand command, SleepHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.StartAsync(principal.GetUserId(), command, cancellationToken);
                return result.ToCreatedOrReplayed(session => $"/api/sleep/sessions/{session.Id}");
            })
            .AddEndpointFilter<ValidationFilter<StartSleepCommand>>()
            .Produces<SleepSessionResponse>(StatusCodes.Status201Created)
            .Produces<SleepSessionResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status409Conflict);

        var sessions = group.MapGroup("/sessions");

        sessions.MapGet("/", async (ClaimsPrincipal principal, SleepHandler handler, CancellationToken cancellationToken,
                int pageNumber = 1, int pageSize = Paging.DefaultPageSize) =>
            {
                var query = new SleepListQuery(pageNumber, pageSize);
                var validation = new SleepListQueryValidator().Validate(query);
                return validation.IsValid
                    ? Results.Ok(await handler.ListAsync(principal.GetUserId(), query, cancellationToken))
                    : TypedResults.ValidationProblem(validation.ToDictionary());
            })
            .Produces<PagedResponse<SleepSessionResponse>>()
            .ProducesValidationProblem();

        // A night the user did not track live.
        sessions.MapPost("/", async (ClaimsPrincipal principal, RecordSleepCommand command, SleepHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.RecordAsync(principal.GetUserId(), command, cancellationToken);
                return result.ToCreatedOrReplayed(session => $"/api/sleep/sessions/{session.Id}");
            })
            .AddEndpointFilter<ValidationFilter<RecordSleepCommand>>()
            .Produces<SleepSessionResponse>(StatusCodes.Status201Created)
            .Produces<SleepSessionResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status409Conflict);

        sessions.MapGet("/{id:guid}", async (ClaimsPrincipal principal, Guid id, SleepHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.GetAsync(principal.GetUserId(), id, cancellationToken);
                return result.ToOk();
            })
            .Produces<SleepSessionResponse>()
            .ProducesProblem(StatusCodes.Status404NotFound);

        sessions.MapPost("/{id:guid}/stop", async (ClaimsPrincipal principal, Guid id, StopSleepCommand command, SleepHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.StopAsync(principal.GetUserId(), id, command, cancellationToken);
                return result.ToOk();
            })
            .AddEndpointFilter<ValidationFilter<StopSleepCommand>>()
            .Produces<SleepSessionResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        sessions.MapPut("/{id:guid}", async (ClaimsPrincipal principal, Guid id, CorrectSleepCommand command, SleepHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.CorrectAsync(principal.GetUserId(), id, command, cancellationToken);
                return result.ToOk();
            })
            .AddEndpointFilter<ValidationFilter<CorrectSleepCommand>>()
            .Produces<SleepSessionResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        sessions.MapDelete("/{id:guid}", async (ClaimsPrincipal principal, Guid id, SleepHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.DeleteAsync(principal.GetUserId(), id, cancellationToken);
                return result.ToNoContent();
            })
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status404NotFound);

        return endpoints;
    }
}
