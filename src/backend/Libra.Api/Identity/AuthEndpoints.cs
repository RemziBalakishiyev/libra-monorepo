using System.Security.Claims;
using Libra.Api.Common;
using Libra.Application.Identity;
using Libra.Application.Identity.Login;
using Libra.Application.Identity.Logout;
using Libra.Application.Identity.RefreshSession;
using Libra.Application.Identity.Register;

namespace Libra.Api.Identity;

internal static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/auth")
            .WithTags("Auth")
            .AddEndpointFilter(NoStoreAsync);

        group.MapPost("/register", async (RegisterCommand command, RegisterHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.HandleAsync(command, cancellationToken);
                return result.ToCreated();
            })
            .AddEndpointFilter<ValidationFilter<RegisterCommand>>()
            .RequireRateLimiting(RateLimitPolicies.Register)
            .Produces<AuthSession>(StatusCodes.Status201Created)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesProblem(StatusCodes.Status429TooManyRequests);

        group.MapPost("/login", async (LoginCommand command, LoginHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.HandleAsync(command, cancellationToken);
                return result.ToOk();
            })
            .AddEndpointFilter<ValidationFilter<LoginCommand>>()
            .RequireRateLimiting(RateLimitPolicies.Login)
            .Produces<AuthSession>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status429TooManyRequests);

        group.MapPost("/refresh", async (RefreshSessionCommand command, RefreshSessionHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.HandleAsync(command, cancellationToken);
                return result.ToOk();
            })
            .AddEndpointFilter<ValidationFilter<RefreshSessionCommand>>()
            .RequireRateLimiting(RateLimitPolicies.Refresh)
            .Produces<AuthSession>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status429TooManyRequests);

        group.MapPost("/logout", async (ClaimsPrincipal principal, LogoutCommand command, LogoutHandler handler, CancellationToken cancellationToken) =>
            {
                await handler.HandleAsync(principal.GetUserId(), command, cancellationToken);
                return Results.NoContent();
            })
            .RequireAuthorization()
            .AddEndpointFilter<ValidationFilter<LogoutCommand>>()
            .Produces(StatusCodes.Status204NoContent)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status401Unauthorized);

        return endpoints;
    }

    /// <summary>Token responses must never be cached by intermediaries or the client.</summary>
    private static async ValueTask<object?> NoStoreAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        context.HttpContext.Response.Headers.CacheControl = "no-store";
        return await next(context);
    }
}
