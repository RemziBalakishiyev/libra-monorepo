using System.Globalization;
using Libra.Application.Assistant;
using Libra.Application.Nutrition.FoodAnalysis;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
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

    /// <summary>Photo analyses one user may start per hour in the test host.</summary>
    public const int MaxAnalysesPerHour = 5;

    /// <summary>The scripted provider the test host uses in place of a network call.</summary>
    public FakeFoodAnalyzer Analyzer { get; } = new();

    /// <summary>Analysis photo bytes, in memory, so storage and deletion are observable.</summary>
    public InMemoryImageStore Images { get; } = new();

    /// <summary>The scripted assistant provider. Tests script the answer; nothing reaches a network.</summary>
    public FakeAssistantProvider Assistant { get; } = new();

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

        // Photo analysis: a low per-user ceiling makes the rate-limit path testable in a few calls, and the
        // background sweep is pushed out of the way so cleanup only happens when a test asks for it.
        builder.UseSetting("Ai:FoodAnalysis:MaxAnalysesPerHour", MaxAnalysesPerHour.ToString(CultureInfo.InvariantCulture));
        builder.UseSetting("Ai:FoodAnalysis:CleanupIntervalMinutes", "600");

        builder.ConfigureTestServices(services =>
        {
            // The real adapter is unit-tested against provider fixtures; the host uses a scripted one so no
            // test ever depends on credentials or the network.
            services.RemoveAll<IAiFoodAnalyzer>();
            services.AddSingleton<IAiFoodAnalyzer>(Analyzer);
            services.RemoveAll<IImageStore>();
            services.AddSingleton<IImageStore>(Images);
            services.RemoveAll<IAssistantProvider>();
            services.AddSingleton<IAssistantProvider>(Assistant);
        });
    }
}

[CollectionDefinition(Name)]
public sealed class LibraApiCollection : ICollectionFixture<LibraApiFactory>
{
    public const string Name = "LibraApi";
}
