using System.Security.Claims;
using Libra.Api.Common;
using Libra.Api.Identity;
using Libra.Application.Focus;

namespace Libra.Api.Focus;

/// <summary>
/// Focus history. Both endpoints are owner-scoped: the caller's id is the only user id that ever reaches a
/// query, so another account's runs are invisible rather than forbidden.
///
/// Saving is idempotent on the client id the device generated, so the mobile outbox can retry an uncertain
/// upload as often as it needs to without ever creating a second record of the same run.
/// </summary>
internal static class FocusEndpoints
{
    public static IEndpointRouteBuilder MapFocusEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/focus")
            .WithTags("Focus")
            .RequireAuthorization();

        group.MapPost("/sessions", async (ClaimsPrincipal principal, SaveFocusSessionCommand command, FocusHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.SaveAsync(principal.GetUserId(), command, cancellationToken);
                return result.ToCreatedOrReplayed(session => $"/api/focus/sessions/{session.Id}");
            })
            .AddEndpointFilter<ValidationFilter<SaveFocusSessionCommand>>()
            .Produces<FocusSessionResponse>(StatusCodes.Status201Created)
            .Produces<FocusSessionResponse>()
            .ProducesValidationProblem();

        group.MapGet("/summary", async (ClaimsPrincipal principal, FocusHandler handler, CancellationToken cancellationToken, DateOnly? date = null) =>
                Results.Ok(await handler.GetSummaryAsync(principal.GetUserId(), date, cancellationToken)))
            .Produces<FocusSummaryResponse>();

        return endpoints;
    }
}
