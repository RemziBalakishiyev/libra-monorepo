using System.Net.Http.Json;
using Libra.Application.Common;
using Libra.Application.Nutrition;
using Libra.Domain.Nutrition;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Nutrition;

[Collection(LibraApiCollection.Name)]
public sealed class NutritionDayTests(LibraApiFactory factory)
{
    [Fact]
    public async Task A_day_groups_entries_by_meal_and_sums_each_group()
    {
        using var client = await factory.NewNutritionUserAsync("day");
        await client.SetTimeZoneAsync("Asia/Baku");
        var date = new DateOnly(2026, 9, 14);

        await client.AddEntryAsync(MealType.Breakfast, new DateTimeOffset(2026, 9, 14, 4, 30, 0, TimeSpan.Zero));
        await client.AddEntryAsync(MealType.Lunch, new DateTimeOffset(2026, 9, 14, 9, 0, 0, TimeSpan.Zero), [NutritionTestClient.PerHundred(grams: 200m)]);
        await client.AddEntryAsync(MealType.Lunch, new DateTimeOffset(2026, 9, 14, 10, 0, 0, TimeSpan.Zero), [NutritionTestClient.Portion(quantity: 0.5m)]);

        var day = await client.DayAsync(date);

        Assert.Equal(date, day.Date);
        Assert.Equal("Asia/Baku", day.TimeZone);
        Assert.Equal(3, day.EntryCount);
        Assert.Equal(4, day.Meals.Count);
        Assert.Equal(635m, day.Totals.EnergyKcal); // 250 + 260 + 125
        Assert.Equal(250m, day.Meals.Single(meal => meal.MealType == MealType.Breakfast).Totals.EnergyKcal);
        Assert.Equal(385m, day.Meals.Single(meal => meal.MealType == MealType.Lunch).Totals.EnergyKcal);
        Assert.Equal(0m, day.Meals.Single(meal => meal.MealType == MealType.Dinner).Totals.EnergyKcal);
        Assert.Empty(day.Meals.Single(meal => meal.MealType == MealType.Snack).Entries);
    }

    [Fact]
    public async Task Day_boundaries_follow_the_profile_time_zone()
    {
        using var client = await factory.NewNutritionUserAsync("tz");
        await client.SetTimeZoneAsync("Asia/Baku");

        // 20:15 UTC on 15 September is 00:15 on 16 September in Baku (UTC+4).
        await client.AddEntryAsync(MealType.Snack, new DateTimeOffset(2026, 9, 15, 20, 15, 0, TimeSpan.Zero));
        // 19:30 UTC is 23:30 on the 15th, still the previous local day.
        await client.AddEntryAsync(MealType.Dinner, new DateTimeOffset(2026, 9, 15, 19, 30, 0, TimeSpan.Zero));

        var fifteenth = await client.DayAsync(new DateOnly(2026, 9, 15));
        var sixteenth = await client.DayAsync(new DateOnly(2026, 9, 16));

        Assert.Equal(1, fifteenth.EntryCount);
        Assert.Equal(MealType.Dinner, fifteenth.Meals.Single(meal => meal.Entries.Count > 0).MealType);
        Assert.Equal(1, sixteenth.EntryCount);
        Assert.Equal(MealType.Snack, sixteenth.Meals.Single(meal => meal.Entries.Count > 0).MealType);
        Assert.Equal(new DateTime(2026, 9, 14, 20, 0, 0, DateTimeKind.Utc), fifteenth.StartUtc);
        Assert.Equal(new DateTime(2026, 9, 15, 20, 0, 0, DateTimeKind.Utc), fifteenth.EndUtc);
    }

    [Fact]
    public async Task Changing_the_time_zone_moves_an_entry_to_the_day_it_was_eaten_in()
    {
        using var client = await factory.NewNutritionUserAsync("tzmove");
        await client.SetTimeZoneAsync("Asia/Baku");
        await client.AddEntryAsync(MealType.Snack, new DateTimeOffset(2026, 9, 17, 21, 0, 0, TimeSpan.Zero)); // 01:00 on the 18th in Baku

        Assert.Equal(1, (await client.DayAsync(new DateOnly(2026, 9, 18))).EntryCount);

        await client.SetTimeZoneAsync("UTC");

        Assert.Equal(0, (await client.DayAsync(new DateOnly(2026, 9, 18))).EntryCount);
        Assert.Equal(1, (await client.DayAsync(new DateOnly(2026, 9, 17))).EntryCount);
    }

    [Fact]
    public async Task Daily_totals_cover_every_entry_even_beyond_one_page_of_the_list()
    {
        using var client = await factory.NewNutritionUserAsync("paged");
        await client.SetTimeZoneAsync("Asia/Baku");
        var date = new DateOnly(2026, 9, 20);

        // 25 snacks of 10 kcal, more than the default page size of 20.
        for (var index = 0; index < 25; index += 1)
        {
            await client.AddEntryAsync(
                MealType.Snack,
                new DateTimeOffset(2026, 9, 20, 6, 0, 0, TimeSpan.Zero).AddMinutes(index),
                [NutritionTestClient.Portion($"Qəlyanaltı {index}", kcal: 10m, protein: 1m, carbs: 1m, fat: 0m)]);
        }

        var firstPage = (await client.GetFromJsonAsync<PagedResponse<NutritionEntryResponse>>($"{NutritionTestClient.Entries}?date={date:yyyy-MM-dd}"))!;
        var day = await client.DayAsync(date);

        Assert.Equal(20, firstPage.Items.Count);
        Assert.Equal(25, firstPage.TotalCount);
        Assert.True(firstPage.HasNextPage);
        Assert.Equal(250m, day.Totals.EnergyKcal);
        Assert.Equal(25m, day.Totals.ProteinGrams);
        Assert.Equal(25, day.EntryCount);
    }

    [Fact]
    public async Task An_empty_day_reports_zero_totals_and_no_goal()
    {
        using var client = await factory.NewNutritionUserAsync("empty");

        var day = await client.DayAsync(new DateOnly(2026, 9, 21));

        Assert.Equal(0m, day.Totals.EnergyKcal);
        Assert.Equal(0, day.EntryCount);
        Assert.Null(day.Goal);
        Assert.All(day.Meals, meal => Assert.Empty(meal.Entries));
    }

    [Fact]
    public async Task The_day_list_can_be_filtered_by_meal_type()
    {
        using var client = await factory.NewNutritionUserAsync("filter");
        await client.SetTimeZoneAsync("Asia/Baku");
        var date = new DateOnly(2026, 9, 22);
        await client.AddEntryAsync(MealType.Breakfast, new DateTimeOffset(2026, 9, 22, 4, 0, 0, TimeSpan.Zero));
        await client.AddEntryAsync(MealType.Dinner, new DateTimeOffset(2026, 9, 22, 15, 0, 0, TimeSpan.Zero));

        var dinners = (await client.GetFromJsonAsync<PagedResponse<NutritionEntryResponse>>($"{NutritionTestClient.Entries}?date={date:yyyy-MM-dd}&mealType=Dinner"))!;

        Assert.Single(dinners.Items);
        Assert.Equal(MealType.Dinner, dinners.Items[0].MealType);
    }
}
