using Libra.Application.Common;
using Libra.Domain.Nutrition;
using Microsoft.EntityFrameworkCore;

namespace Libra.Application.Nutrition;

/// <summary>
/// One local calendar day of the diary: every entry of that day grouped by meal, the day's totals, and the
/// goal that applies to that date. Totals are summed over the stored rows of the whole day, so they never
/// depend on how many entries a client happened to page in.
/// </summary>
public sealed class NutritionDayHandler(ILibraDbContext db, NutritionEntriesHandler entries, TimeProvider clock)
{
    private static readonly MealType[] MealOrder = [MealType.Breakfast, MealType.Lunch, MealType.Dinner, MealType.Snack];

    public async Task<NutritionDayResponse> GetAsync(Guid userId, DateOnly? date, CancellationToken cancellationToken)
    {
        var timeZone = await UserTimeZone.LoadAsync(db, userId, cancellationToken);
        var day = LocalCalendar.Day(timeZone, date ?? LocalCalendar.ToLocalDate(timeZone, clock.GetUtcNow().UtcDateTime));

        // Summed in the database over every item of every entry in the day, grouped by meal.
        var mealTotals = await db.NutritionEntryItems
            .Where(item => item.UserId == userId)
            .Join(
                db.NutritionEntries.Where(entry => entry.UserId == userId && entry.ConsumedAtUtc >= day.StartUtc && entry.ConsumedAtUtc < day.EndUtc),
                item => item.EntryId,
                entry => entry.Id,
                (item, entry) => new { entry.MealType, Item = item })
            .GroupBy(row => row.MealType)
            .Select(group => new
            {
                MealType = group.Key,
                EnergyKcal = group.Sum(row => row.Item.EnergyKcal),
                ProteinGrams = group.Sum(row => row.Item.ProteinGrams),
                CarbGrams = group.Sum(row => row.Item.CarbGrams),
                FatGrams = group.Sum(row => row.Item.FatGrams),
            })
            .ToListAsync(cancellationToken);

        var dayEntries = await entries.Projection(userId)
            .Where(entry => entry.ConsumedAtUtc >= day.StartUtc && entry.ConsumedAtUtc < day.EndUtc)
            .OrderBy(entry => entry.ConsumedAtUtc)
            .ThenBy(entry => entry.Id)
            .ToListAsync(cancellationToken);

        var goal = await NutritionGoals.ApplicableAsync(db, userId, day.Date, cancellationToken);

        var meals = MealOrder
            .Select(meal =>
            {
                var totals = mealTotals.SingleOrDefault(row => row.MealType == meal);
                return new NutritionMealGroup(
                    meal,
                    totals is null ? NutritionTotals.Zero : new NutritionTotals(totals.EnergyKcal, totals.ProteinGrams, totals.CarbGrams, totals.FatGrams),
                    dayEntries.Where(entry => entry.MealType == meal).ToList());
            })
            .ToList();

        return new NutritionDayResponse(
            day.Date,
            timeZone,
            day.StartUtc,
            day.EndUtc,
            meals.Select(meal => meal.Totals).Sum(),
            dayEntries.Count,
            goal?.ToResponse(),
            meals);
    }
}
