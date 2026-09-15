using System.Net;
using System.Net.Http.Json;
using Libra.Application.Nutrition;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Nutrition;

[Collection(LibraApiCollection.Name)]
public sealed class NutritionGoalTests(LibraApiFactory factory)
{
    [Fact]
    public async Task Targets_are_unset_until_the_user_enters_them()
    {
        using var client = await factory.NewNutritionUserAsync("goal");

        var goals = await client.GoalsAsync();

        Assert.Null(goals.Current);
        Assert.Empty(goals.History);
        Assert.Null((await client.DayAsync()).Goal);
    }

    [Fact]
    public async Task Saving_targets_applies_them_from_the_effective_date_onwards()
    {
        using var client = await factory.NewNutritionUserAsync("goal");
        await client.SetTimeZoneAsync("Asia/Baku");

        using var response = await client.SaveGoalAsync(new DateOnly(2026, 9, 10), energyKcal: 2200m, proteinGrams: 130m);
        var saved = await response.Content.ReadFromJsonAsync<NutritionGoalResponse>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(2200m, saved!.EnergyKcal);
        Assert.Equal(130m, saved.ProteinGrams);
        Assert.Null(saved.CarbGrams);

        Assert.Null((await client.DayAsync(new DateOnly(2026, 9, 9))).Goal);
        Assert.Equal(2200m, (await client.DayAsync(new DateOnly(2026, 9, 10))).Goal!.EnergyKcal);
        Assert.Equal(2200m, (await client.DayAsync(new DateOnly(2026, 9, 30))).Goal!.EnergyKcal);
    }

    [Fact]
    public async Task Changing_todays_targets_leaves_earlier_days_on_the_targets_they_used()
    {
        using var client = await factory.NewNutritionUserAsync("goal");
        await client.SetTimeZoneAsync("Asia/Baku");

        using (var first = await client.SaveGoalAsync(new DateOnly(2026, 9, 1), energyKcal: 2000m))
        {
            first.EnsureSuccessStatusCode();
        }

        using (var second = await client.SaveGoalAsync(new DateOnly(2026, 9, 15), energyKcal: 2500m))
        {
            second.EnsureSuccessStatusCode();
        }

        Assert.Equal(2000m, (await client.DayAsync(new DateOnly(2026, 9, 14))).Goal!.EnergyKcal);
        Assert.Equal(2500m, (await client.DayAsync(new DateOnly(2026, 9, 15))).Goal!.EnergyKcal);
        Assert.Equal(2500m, (await client.DayAsync(new DateOnly(2026, 9, 16))).Goal!.EnergyKcal);

        var goals = await client.GoalsAsync(new DateOnly(2026, 9, 20));
        Assert.Equal(2500m, goals.Current!.EnergyKcal);
        Assert.Equal([new DateOnly(2026, 9, 15), new DateOnly(2026, 9, 1)], goals.History.Select(goal => goal.EffectiveFrom));
    }

    [Fact]
    public async Task Saving_the_same_effective_date_twice_updates_that_record()
    {
        using var client = await factory.NewNutritionUserAsync("goal");

        using (var first = await client.SaveGoalAsync(new DateOnly(2026, 9, 5), energyKcal: 1800m))
        {
            first.EnsureSuccessStatusCode();
        }

        using var second = await client.SaveGoalAsync(new DateOnly(2026, 9, 5), energyKcal: 1900m, fatGrams: 60m);
        var updated = await second.Content.ReadFromJsonAsync<NutritionGoalResponse>();

        Assert.Equal(1900m, updated!.EnergyKcal);
        Assert.Equal(60m, updated.FatGrams);
        Assert.Single((await client.GoalsAsync()).History);
    }

    [Fact]
    public async Task Clearing_every_target_removes_the_record_for_that_date()
    {
        using var client = await factory.NewNutritionUserAsync("goal");

        using (var saved = await client.SaveGoalAsync(new DateOnly(2026, 9, 6), energyKcal: 2100m))
        {
            saved.EnsureSuccessStatusCode();
        }

        using var cleared = await client.SaveGoalAsync(new DateOnly(2026, 9, 6));

        Assert.Equal(HttpStatusCode.NoContent, cleared.StatusCode);
        Assert.Null((await client.GoalsAsync(new DateOnly(2026, 9, 7))).Current);
        Assert.Empty((await client.GoalsAsync()).History);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-100)]
    [InlineData(1500.005)]
    public async Task Invalid_targets_are_rejected(decimal energy)
    {
        using var client = await factory.NewNutritionUserAsync("goal");

        using var response = await client.SaveGoalAsync(new DateOnly(2026, 9, 6), energyKcal: energy);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Goals_default_to_today_in_the_profile_time_zone()
    {
        using var client = await factory.NewNutritionUserAsync("goal");
        await client.SetTimeZoneAsync("Asia/Baku");

        using var response = await client.SaveGoalAsync(energyKcal: 2400m);
        var saved = await response.Content.ReadFromJsonAsync<NutritionGoalResponse>();
        var goals = await client.GoalsAsync();

        Assert.Equal(goals.Date, saved!.EffectiveFrom);
        Assert.Equal("Asia/Baku", goals.TimeZone);
        Assert.Equal(2400m, goals.Current!.EnergyKcal);
    }
}
