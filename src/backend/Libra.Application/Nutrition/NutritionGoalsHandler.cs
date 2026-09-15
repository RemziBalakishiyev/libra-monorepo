using Libra.Application.Common;
using Libra.Domain.Nutrition;
using Microsoft.EntityFrameworkCore;

namespace Libra.Application.Nutrition;

internal static class NutritionGoals
{
    /// <summary>
    /// The goal a date resolves to: the newest record effective on or before it. Nothing is invented — a date
    /// before the first saved goal simply has no targets.
    /// </summary>
    public static Task<NutritionGoal?> ApplicableAsync(ILibraDbContext db, Guid userId, DateOnly date, CancellationToken cancellationToken) =>
        db.NutritionGoals
            .AsNoTracking()
            .Where(goal => goal.UserId == userId && goal.EffectiveFrom <= date)
            .OrderByDescending(goal => goal.EffectiveFrom)
            .FirstOrDefaultAsync(cancellationToken);
}

/// <summary>
/// Personal targets. Saving writes the record for one effective date, which leaves every earlier day resolving
/// to the targets it already used; clearing all four targets removes that record instead of storing zeros.
/// </summary>
public sealed class NutritionGoalsHandler(ILibraDbContext db, TimeProvider clock)
{
    public async Task<NutritionGoalsResponse> ListAsync(Guid userId, DateOnly? date, CancellationToken cancellationToken)
    {
        var timeZone = await UserTimeZone.LoadAsync(db, userId, cancellationToken);
        var today = date ?? LocalCalendar.ToLocalDate(timeZone, clock.GetUtcNow().UtcDateTime);

        var history = await db.NutritionGoals
            .AsNoTracking()
            .Where(goal => goal.UserId == userId)
            .OrderByDescending(goal => goal.EffectiveFrom)
            .ToListAsync(cancellationToken);

        var current = history.FirstOrDefault(goal => goal.EffectiveFrom <= today);
        return new NutritionGoalsResponse(today, timeZone, current?.ToResponse(), history.Select(goal => goal.ToResponse()).ToList());
    }

    /// <summary>Returns the saved goal, or null when the call cleared the targets for that date.</summary>
    public async Task<Result<NutritionGoalResponse?>> SaveAsync(Guid userId, SaveNutritionGoalCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var timeZone = await UserTimeZone.LoadAsync(db, userId, cancellationToken);
        var effectiveFrom = command.EffectiveFrom ?? LocalCalendar.ToLocalDate(timeZone, clock.GetUtcNow().UtcDateTime);
        var nowUtc = clock.GetUtcNow().UtcDateTime;

        var existing = await db.NutritionGoals
            .SingleOrDefaultAsync(goal => goal.UserId == userId && goal.EffectiveFrom == effectiveFrom, cancellationToken);
        var cleared = command.EnergyKcal is null && command.ProteinGrams is null && command.CarbGrams is null && command.FatGrams is null;

        if (cleared)
        {
            if (existing is not null)
            {
                db.NutritionGoals.Remove(existing);
                await db.SaveChangesAsync(cancellationToken);
            }

            return Result.Success<NutritionGoalResponse?>(null);
        }

        if (existing is null)
        {
            existing = NutritionGoal.Create(userId, effectiveFrom, command.EnergyKcal, command.ProteinGrams, command.CarbGrams, command.FatGrams, nowUtc);
            db.NutritionGoals.Add(existing);
        }
        else
        {
            existing.ChangeTargets(command.EnergyKcal, command.ProteinGrams, command.CarbGrams, command.FatGrams, nowUtc);
        }

        await db.SaveChangesAsync(cancellationToken);
        return Result.Success<NutritionGoalResponse?>(existing.ToResponse());
    }

    public async Task<Result<bool>> DeleteAsync(Guid userId, Guid goalId, CancellationToken cancellationToken)
    {
        var goal = await db.NutritionGoals.SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == goalId, cancellationToken);
        if (goal is null)
        {
            return Result.NotFound<bool>(NutritionErrors.GoalNotFound);
        }

        db.NutritionGoals.Remove(goal);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success(true);
    }
}
