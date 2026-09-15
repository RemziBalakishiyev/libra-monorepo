using Libra.Application.Nutrition.FoodAnalysis;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Libra.Infrastructure.Ai;

/// <summary>
/// Periodic retention sweep: expired pending drafts go away, and every stored photo past its retention deadline
/// is deleted. Confirmed drafts keep their original estimates for provenance, and no nutrition entry is ever
/// touched — deleting a meal is a user action, never a side effect of cleanup.
/// </summary>
public sealed class FoodAnalysisCleanupService(IServiceScopeFactory scopeFactory, IOptions<FoodAnalysisOptions> options, ILogger<FoodAnalysisCleanupService> logger) : BackgroundService
{
    private readonly FoodAnalysisOptions _options = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(_options.CleanupInterval);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var handler = scope.ServiceProvider.GetRequiredService<FoodAnalysisHandler>();
                var (drafts, images) = await handler.CleanupAsync(stoppingToken);
                if (drafts > 0 || images > 0)
                {
                    logger.LogInformation("Food analysis cleanup removed {Drafts} expired drafts and {Images} stored images.", drafts, images);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                // A failed sweep must never take the host down; the next tick retries.
                logger.LogError(exception, "Food analysis cleanup failed.");
            }

            try
            {
                await timer.WaitForNextTickAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }
}
