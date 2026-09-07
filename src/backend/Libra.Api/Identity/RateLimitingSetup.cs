using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace Libra.Api.Identity;

public sealed class RateLimitPolicyOptions
{
    [Range(1, int.MaxValue)]
    public int PermitLimit { get; set; }

    [Range(1, 3600)]
    public int WindowSeconds { get; set; } = 60;
}

/// <summary>Bound from the <c>RateLimiting</c> section. Fixed windows per client IP for the sensitive auth endpoints.</summary>
public sealed class RateLimitingOptions
{
    public const string SectionName = "RateLimiting";

    public RateLimitPolicyOptions Register { get; set; } = new() { PermitLimit = 5 };

    public RateLimitPolicyOptions Login { get; set; } = new() { PermitLimit = 10 };

    public RateLimitPolicyOptions Refresh { get; set; } = new() { PermitLimit = 30 };
}

internal static class RateLimitPolicies
{
    public const string Register = "auth-register";
    public const string Login = "auth-login";
    public const string Refresh = "auth-refresh";
}

internal static class RateLimitingSetup
{
    public static IServiceCollection AddAuthRateLimiting(this IServiceCollection services, IConfiguration configuration)
    {
        var options = configuration.GetSection(RateLimitingOptions.SectionName).Get<RateLimitingOptions>() ?? new RateLimitingOptions();

        services.AddRateLimiter(limiter =>
        {
            limiter.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            limiter.OnRejected = WriteRejectionAsync;

            limiter.AddPolicy(RateLimitPolicies.Register, context => Partition(context, options.Register));
            limiter.AddPolicy(RateLimitPolicies.Login, context => Partition(context, options.Login));
            limiter.AddPolicy(RateLimitPolicies.Refresh, context => Partition(context, options.Refresh));
        });

        return services;
    }

    private static RateLimitPartition<string> Partition(HttpContext context, RateLimitPolicyOptions policy) =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = policy.PermitLimit,
                Window = TimeSpan.FromSeconds(policy.WindowSeconds),
                QueueLimit = 0,
            });

    private static async ValueTask WriteRejectionAsync(OnRejectedContext context, CancellationToken cancellationToken)
    {
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
        {
            context.HttpContext.Response.Headers.RetryAfter =
                ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString(CultureInfo.InvariantCulture);
        }

        var problemDetails = context.HttpContext.RequestServices.GetRequiredService<IProblemDetailsService>();
        await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = context.HttpContext,
            ProblemDetails = new()
            {
                Status = StatusCodes.Status429TooManyRequests,
                Title = "Too many requests",
                Detail = "Try again later.",
            },
        });
    }
}
