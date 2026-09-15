using System.Security.Claims;
using Libra.Api.Common;
using Libra.Api.Identity;
using Libra.Application.Common;
using Libra.Application.Tasks;
using Libra.Domain.Tasks;

namespace Libra.Api.Tasks;

/// <summary>
/// Task endpoints. Everything is owner-scoped: the id in the route is only ever resolved together with the
/// caller's user id, so another user's task is answered exactly like one that does not exist.
///
/// Completion is a state, not a toggle: <c>POST /{id}/completion</c> takes the desired value, so a retried
/// request is harmless. Editing one occurrence and editing the whole schedule are separate routes on purpose.
/// </summary>
internal static class TaskEndpoints
{
    public static IEndpointRouteBuilder MapTaskEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/tasks")
            .WithTags("Tasks")
            .RequireAuthorization();

        MapTasks(group);
        MapSeries(group);

        return endpoints;
    }

    private static void MapTasks(RouteGroupBuilder group)
    {
        group.MapGet("/today", async (ClaimsPrincipal principal, TasksHandler handler, CancellationToken cancellationToken, DateOnly? date = null) =>
                Results.Ok(await handler.GetDayAsync(principal.GetUserId(), date, cancellationToken)))
            .Produces<TaskDayResponse>();

        group.MapGet("/", async (ClaimsPrincipal principal, TasksHandler handler, CancellationToken cancellationToken,
                TaskView view = TaskView.Today, DateOnly? from = null, DateOnly? to = null, TaskPriority? priority = null,
                int pageNumber = 1, int pageSize = Paging.DefaultPageSize) =>
            {
                var query = new TaskListQuery(view, from, to, priority, pageNumber, pageSize);
                var validation = new TaskListQueryValidator().Validate(query);
                return validation.IsValid
                    ? Results.Ok(await handler.ListAsync(principal.GetUserId(), query, cancellationToken))
                    : TypedResults.ValidationProblem(validation.ToDictionary());
            })
            .Produces<PagedResponse<TaskResponse>>()
            .ProducesValidationProblem();

        group.MapPost("/", async (ClaimsPrincipal principal, CreateTaskCommand command, TasksHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.CreateAsync(principal.GetUserId(), command, cancellationToken);
                return result.ToCreatedOrReplayed(task => $"/api/tasks/{task.Id}");
            })
            .AddEndpointFilter<ValidationFilter<CreateTaskCommand>>()
            .Produces<TaskResponse>(StatusCodes.Status201Created)
            .Produces<TaskResponse>()
            .ProducesValidationProblem();

        group.MapGet("/{id:guid}", async (ClaimsPrincipal principal, Guid id, TasksHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.GetAsync(principal.GetUserId(), id, cancellationToken);
                return result.ToOk();
            })
            .Produces<TaskDetailResponse>()
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPut("/{id:guid}", async (ClaimsPrincipal principal, Guid id, UpdateTaskCommand command, TasksHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.UpdateAsync(principal.GetUserId(), id, command, cancellationToken);
                return result.ToOk();
            })
            .AddEndpointFilter<ValidationFilter<UpdateTaskCommand>>()
            .Produces<TaskResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        // The desired state, not a flip: repeating the same request changes nothing and records nothing twice.
        group.MapPost("/{id:guid}/completion", async (ClaimsPrincipal principal, Guid id, SetTaskCompletionCommand command, TasksHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.SetCompletionAsync(principal.GetUserId(), id, command, cancellationToken);
                return result.ToOk();
            })
            .Produces<TaskResponse>()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapDelete("/{id:guid}", async (ClaimsPrincipal principal, Guid id, TasksHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.DeleteAsync(principal.GetUserId(), id, cancellationToken);
                return result.ToNoContent();
            })
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status404NotFound);
    }

    private static void MapSeries(RouteGroupBuilder group)
    {
        var series = group.MapGroup("/series");

        series.MapGet("/{id:guid}", async (ClaimsPrincipal principal, Guid id, TaskSeriesHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.GetAsync(principal.GetUserId(), id, cancellationToken);
                return result.ToOk();
            })
            .Produces<TaskSeriesResponse>()
            .ProducesProblem(StatusCodes.Status404NotFound);

        // Edits the schedule from today onwards. Past and completed occurrences are never rewritten.
        series.MapPut("/{id:guid}", async (ClaimsPrincipal principal, Guid id, UpdateTaskSeriesCommand command, TaskSeriesHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.UpdateAsync(principal.GetUserId(), id, command, cancellationToken);
                return result.ToOk();
            })
            .AddEndpointFilter<ValidationFilter<UpdateTaskSeriesCommand>>()
            .Produces<TaskSeriesResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        series.MapPost("/{id:guid}/stop", async (ClaimsPrincipal principal, Guid id, TaskSeriesHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.StopAsync(principal.GetUserId(), id, cancellationToken);
                return result.ToOk();
            })
            .Produces<TaskSeriesResponse>()
            .ProducesProblem(StatusCodes.Status404NotFound);
    }
}
