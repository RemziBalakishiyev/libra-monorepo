using System.Security.Claims;
using Libra.Api.Common;
using Libra.Api.Identity;
using Libra.Application.Assistant;
using Libra.Application.Common;

namespace Libra.Api.Assistant;

/// <summary>
/// Assistant endpoints. Everything is owner-scoped: a conversation id in a route is only ever resolved
/// together with the caller's user id, so another account's conversation is answered exactly like one that
/// does not exist.
///
/// Asking is idempotent on the client's request id, so a retry after an uncertain answer returns the turn
/// that was already stored instead of asking — and paying — twice.
/// </summary>
internal static class AssistantEndpoints
{
    public static IEndpointRouteBuilder MapAssistantEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/assistant")
            .WithTags("Assistant")
            .RequireAuthorization();

        group.MapGet("/status", (AssistantHandler handler) => Results.Ok(handler.GetStatus()))
            .Produces<AssistantStatusResponse>();

        group.MapPost("/ask", async (ClaimsPrincipal principal, AskAssistantCommand command, AssistantHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.AskAsync(principal.GetUserId(), command, cancellationToken);
                return result.ToOk();
            })
            .AddEndpointFilter<ValidationFilter<AskAssistantCommand>>()
            .Produces<AssistantConversationResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status429TooManyRequests)
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable);

        var conversations = group.MapGroup("/conversations");

        conversations.MapGet("/", async (ClaimsPrincipal principal, AssistantHandler handler, CancellationToken cancellationToken,
                int pageNumber = 1, int pageSize = Paging.DefaultPageSize) =>
            {
                var query = new AssistantHistoryQuery(pageNumber, pageSize);
                var validation = new AssistantHistoryQueryValidator().Validate(query);
                return validation.IsValid
                    ? Results.Ok(await handler.ListAsync(principal.GetUserId(), query, cancellationToken))
                    : TypedResults.ValidationProblem(validation.ToDictionary());
            })
            .Produces<PagedResponse<AssistantConversationSummary>>()
            .ProducesValidationProblem();

        conversations.MapGet("/{id:guid}", async (ClaimsPrincipal principal, Guid id, AssistantHandler handler, CancellationToken cancellationToken) =>
                (await handler.LoadAsync(principal.GetUserId(), id, cancellationToken)).ToOk())
            .Produces<AssistantConversationResponse>()
            .ProducesProblem(StatusCodes.Status404NotFound);

        conversations.MapDelete("/{id:guid}", async (ClaimsPrincipal principal, Guid id, AssistantHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.DeleteAsync(principal.GetUserId(), id, cancellationToken);
                return result.IsSuccess ? Results.NoContent() : result.ToOk();
            })
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status404NotFound);

        return endpoints;
    }
}
