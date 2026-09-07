using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Testcontainers.PostgreSql;

namespace Libra.IntegrationTests.Infrastructure;

/// <summary>
/// Boots the real API against a throw-away PostgreSQL container with migrations applied.
/// One container per test collection keeps the suite fast while still exercising real infrastructure.
/// </summary>
public sealed class LibraApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    /// <summary>Test-only signing key; long enough for HS256 and never used outside the test host.</summary>
    public const string TestSigningKey = "libra-integration-tests-signing-key-0123456789abcdef";

    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:18-alpine")
        .WithDatabase("libra_test")
        .WithUsername("libra")
        .WithPassword("libra_test")
        .Build();

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();
    }

    public new async Task DisposeAsync()
    {
        await base.DisposeAsync();
        await _postgres.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Libra", _postgres.GetConnectionString());
        builder.UseSetting("Database:MigrateOnStartup", "true");
        builder.UseSetting("Jwt:SigningKey", TestSigningKey);

        // Generous limits so the functional suite never trips the limiter; the rate-limit test overrides them.
        builder.UseSetting("RateLimiting:Register:PermitLimit", "100000");
        builder.UseSetting("RateLimiting:Login:PermitLimit", "100000");
        builder.UseSetting("RateLimiting:Refresh:PermitLimit", "100000");
    }
}

[CollectionDefinition(Name)]
public sealed class LibraApiCollection : ICollectionFixture<LibraApiFactory>
{
    public const string Name = "LibraApi";
}
