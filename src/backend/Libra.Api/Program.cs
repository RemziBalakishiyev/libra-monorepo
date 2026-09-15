using System.Globalization;
using System.Text.Json.Serialization;
using Libra.Api.Cors;
using Libra.Api.Finance;
using Libra.Api.Health;
using Libra.Api.Identity;
using Libra.Api.Nutrition;
using Libra.Api.Sleep;
using Libra.Api.Tasks;
using Libra.Application;
using Libra.Infrastructure;
using Serilog;

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console(formatProvider: CultureInfo.InvariantCulture)
    .CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    builder.Host.UseSerilog((context, services, configuration) => configuration
        .ReadFrom.Configuration(context.Configuration)
        .ReadFrom.Services(services)
        .Enrich.FromLogContext());

    builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
    builder.Services.AddProblemDetails();
    builder.Services.AddOpenApi();
    builder.Services.AddDevelopmentCors(builder.Configuration);
    builder.Services.AddApplication(builder.Configuration);
    builder.Services.AddInfrastructure(builder.Configuration, builder.Environment);
    builder.Services.AddJwtAuthentication(builder.Configuration, builder.Environment);
    builder.Services.AddAuthRateLimiting(builder.Configuration);

    var app = builder.Build();

    app.UseExceptionHandler();
    app.UseStatusCodePages();
    app.UseSerilogRequestLogging();

    if (app.Environment.IsDevelopment())
    {
        // CORS must run before authentication/authorization and before endpoints.
        app.UseCors(CorsSetup.DevelopmentPolicy);
        app.MapOpenApi();
    }

    app.UseRateLimiter();
    app.UseAuthentication();
    app.UseAuthorization();

    app.MapHealthEndpoints();
    app.MapAuthEndpoints();
    app.MapProfileEndpoints();
    app.MapFinanceEndpoints();
    app.MapNutritionEndpoints();
    app.MapFoodAnalysisEndpoints();
    app.MapTaskEndpoints();
    app.MapSleepEndpoints();

    if (app.Services.GetRequiredService<JwtSigningMaterial>().IsEphemeral)
    {
        app.Logger.LogWarning("Jwt:SigningKey is not configured; using an ephemeral development key. Access tokens will not survive a restart.");
    }

    if (app.Configuration.GetValue<bool>("Database:MigrateOnStartup"))
    {
        await app.Services.MigrateDatabaseAsync(app.Lifetime.ApplicationStopping);
    }

    await app.RunAsync();
}
catch (Exception exception) when (exception is not HostAbortedException)
{
    Log.Fatal(exception, "Libra API terminated unexpectedly");
    throw;
}
finally
{
    await Log.CloseAndFlushAsync();
}

/// <summary>
/// Exposed so integration tests can bootstrap the host with WebApplicationFactory.
/// </summary>
public partial class Program
{
}
