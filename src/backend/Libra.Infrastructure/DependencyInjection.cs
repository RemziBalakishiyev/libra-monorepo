using Libra.Application.Common;
using Libra.Application.Nutrition.FoodAnalysis;
using Libra.Infrastructure.Ai;
using Libra.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Libra.Infrastructure;

public static class DependencyInjection
{
    public const string ConnectionStringName = "Libra";

    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentNullException.ThrowIfNull(environment);

        var connectionString = configuration.GetConnectionString(ConnectionStringName);
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                $"Connection string '{ConnectionStringName}' is not configured. " +
                $"Set the environment variable ConnectionStrings__{ConnectionStringName}.");
        }

        services.AddDbContext<LibraDbContext>(options => options
            .UseNpgsql(connectionString)
            .UseSnakeCaseNamingConvention());
        services.AddScoped<ILibraDbContext>(provider => provider.GetRequiredService<LibraDbContext>());

        services
            .AddHealthChecks()
            .AddDbContextCheck<LibraDbContext>("postgresql", tags: ["ready"]);

        // Photo analysis: the real provider adapter is always registered. Without credentials it reports
        // NotConfigured, which surfaces as an honest 503 — it never invents a result.
        services.AddSingleton<IFoodImageProcessor, FoodImageProcessor>();
        services.AddSingleton<IImageStore, FileSystemImageStore>();

        // The fixture analyzer needs two independent yeses: the Development host and an explicit opt-in. Anywhere
        // else — including a production host that happens to carry the setting — the real adapter is what runs.
        var useFixture = environment.IsDevelopment() && configuration.GetValue<bool>("Ai:FoodAnalysis:UseDevelopmentFixture");
        if (useFixture)
        {
            services.AddSingleton<IAiFoodAnalyzer, DevelopmentFixtureFoodAnalyzer>();
        }
        else
        {
            services.AddHttpClient<IAiFoodAnalyzer, OpenAiFoodAnalyzer>();
        }

        services.AddHostedService<FoodAnalysisCleanupService>();

        return services;
    }

    /// <summary>
    /// Applies pending migrations. Only call this when <c>Database:MigrateOnStartup</c> is enabled
    /// (Development and tests); other environments apply migrations as an explicit deployment step.
    /// </summary>
    public static async Task MigrateDatabaseAsync(this IServiceProvider services, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(services);

        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LibraDbContext>();
        await db.Database.MigrateAsync(cancellationToken);
    }
}
