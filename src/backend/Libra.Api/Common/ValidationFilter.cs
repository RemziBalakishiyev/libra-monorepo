using FluentValidation;

namespace Libra.Api.Common;

/// <summary>
/// Runs the FluentValidation validator registered for <typeparamref name="TRequest"/> against the bound argument
/// and short-circuits with an RFC 9457 validation problem (400) when it fails.
/// </summary>
internal sealed class ValidationFilter<TRequest> : IEndpointFilter
    where TRequest : class
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var request = context.Arguments.OfType<TRequest>().FirstOrDefault();
        var validator = context.HttpContext.RequestServices.GetService<IValidator<TRequest>>();

        if (request is not null && validator is not null)
        {
            var result = await validator.ValidateAsync(request, context.HttpContext.RequestAborted);
            if (!result.IsValid)
            {
                return TypedResults.ValidationProblem(result.ToDictionary());
            }
        }

        return await next(context);
    }
}
