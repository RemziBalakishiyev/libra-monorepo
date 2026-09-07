namespace Libra.Api.Cors;

internal static class CorsSetup
{
    /// <summary>
    /// Named policy for browser clients during local development (Expo Web on http://localhost:8081).
    /// Origins come from <c>Cors:AllowedOrigins</c>; the policy is only applied in the Development environment.
    /// Credentials are intentionally not allowed: authentication will use Authorization headers, not cookies.
    /// </summary>
    public const string DevelopmentPolicy = "Development";

    private const string AllowedOriginsKey = "Cors:AllowedOrigins";

    public static IServiceCollection AddDevelopmentCors(this IServiceCollection services, IConfiguration configuration)
    {
        var allowedOrigins = configuration
            .GetSection(AllowedOriginsKey)
            .Get<string[]>()?
            .Where(origin => !string.IsNullOrWhiteSpace(origin))
            .Select(origin => origin.Trim().TrimEnd('/'))
            .ToArray() ?? [];

        services.AddCors(options => options.AddPolicy(DevelopmentPolicy, policy => policy
            .WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()));

        return services;
    }
}
