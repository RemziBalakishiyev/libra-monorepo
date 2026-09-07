using Libra.Application.Common;
using Libra.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Libra.Infrastructure;

public static class DependencyInjection
{
    public const string ConnectionStringName = "Libra";

    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);

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
