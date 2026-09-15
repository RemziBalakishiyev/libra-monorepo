using Libra.Application.Nutrition.FoodAnalysis;
using Libra.Infrastructure;
using Libra.Infrastructure.Ai;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Libra.UnitTests.Nutrition;

/// <summary>
/// Which analyzer the host actually gets. The rule under test: a fixture needs the Development host *and* an
/// explicit opt-in, so no deployment can serve invented estimates because a setting travelled with it.
/// </summary>
public sealed class FoodAnalysisRegistrationTests
{
    private static IAiFoodAnalyzer Resolve(string environmentName, bool? useFixture)
    {
        var settings = new Dictionary<string, string?>
        {
            ["ConnectionStrings:Libra"] = "Host=localhost;Database=libra;Username=libra;Password=libra",
        };
        if (useFixture is bool value)
        {
            settings["Ai:FoodAnalysis:UseDevelopmentFixture"] = value ? "true" : "false";
        }

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddInfrastructure(configuration, new TestEnvironment(environmentName));

        return services.BuildServiceProvider().GetRequiredService<IAiFoodAnalyzer>();
    }

    [Fact]
    public void Development_with_an_explicit_opt_in_gets_the_fixture()
    {
        Assert.IsType<DevelopmentFixtureFoodAnalyzer>(Resolve(Environments.Development, useFixture: true));
    }

    [Theory]
    [InlineData("Development", null)]
    [InlineData("Development", false)]
    // The setting alone is not enough: a production host keeps the real adapter, which answers honestly.
    [InlineData("Production", true)]
    [InlineData("Staging", true)]
    [InlineData("Testing", true)]
    public void Everything_else_gets_the_real_provider_adapter(string environmentName, bool? useFixture)
    {
        Assert.IsType<OpenAiFoodAnalyzer>(Resolve(environmentName, useFixture));
    }

    [Fact]
    public void The_real_adapter_without_a_key_reports_that_it_is_not_configured()
    {
        var analyzer = (OpenAiFoodAnalyzer)Resolve(Environments.Production, useFixture: null);

        Assert.False(analyzer.IsConfigured);
    }

    [Fact]
    public async Task An_unconfigured_analyzer_fails_instead_of_inventing_an_estimate()
    {
        var analyzer = (OpenAiFoodAnalyzer)Resolve(Environments.Production, useFixture: null);

        var outcome = await analyzer.AnalyzeAsync(new AiFoodImage([1, 2, 3], "image/jpeg", 64, 64), CancellationToken.None);

        Assert.False(outcome.IsSuccess);
        Assert.Equal(AiFoodAnalysisFailure.NotConfigured, outcome.Failure);
        Assert.Null(outcome.Result);
    }

    /// <summary>Everything <see cref="DependencyInjection.AddInfrastructure"/> reads is the environment name.</summary>
    private sealed class TestEnvironment(string environmentName) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;
        public string ApplicationName { get; set; } = "Libra.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } =
            new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
}
