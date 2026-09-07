using System.Security.Claims;
using Libra.Api.Common;
using Libra.Application.Identity;
using Libra.Application.Identity.Profile;

namespace Libra.Api.Identity;

internal static class ProfileEndpoints
{
    public static IEndpointRouteBuilder MapProfileEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/profile")
            .WithTags("Profile")
            .RequireAuthorization();

        group.MapGet("/", async (ClaimsPrincipal principal, GetProfileHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.HandleAsync(principal.GetUserId(), cancellationToken);
                return result.ToOk();
            })
            .Produces<ProfileResponse>()
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPut("/", async (ClaimsPrincipal principal, UpdateProfileCommand command, UpdateProfileHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.HandleAsync(principal.GetUserId(), command, cancellationToken);
                return result.ToOk();
            })
            .AddEndpointFilter<ValidationFilter<UpdateProfileCommand>>()
            .Produces<ProfileResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status404NotFound);

        return endpoints;
    }
}
