using System.Net;
using System.Net.Http.Json;
using Libra.Application.Nutrition;
using Libra.Domain.Nutrition;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Nutrition;

[Collection(LibraApiCollection.Name)]
public sealed class NutritionAuthorizationTests(LibraApiFactory factory)
{
    [Fact]
    public async Task Every_nutrition_endpoint_requires_a_token()
    {
        using var anonymous = factory.CreateClient();

        foreach (var request in new[]
                 {
                     new HttpRequestMessage(HttpMethod.Get, NutritionTestClient.Day),
                     new HttpRequestMessage(HttpMethod.Get, NutritionTestClient.Entries),
                     new HttpRequestMessage(HttpMethod.Post, NutritionTestClient.Entries),
                     new HttpRequestMessage(HttpMethod.Get, $"{NutritionTestClient.Entries}/{Guid.NewGuid()}"),
                     new HttpRequestMessage(HttpMethod.Put, $"{NutritionTestClient.Entries}/{Guid.NewGuid()}"),
                     new HttpRequestMessage(HttpMethod.Delete, $"{NutritionTestClient.Entries}/{Guid.NewGuid()}"),
                     new HttpRequestMessage(HttpMethod.Get, NutritionTestClient.Goals),
                     new HttpRequestMessage(HttpMethod.Put, NutritionTestClient.Goals),
                 })
        {
            using (request)
            using (var response = await anonymous.SendAsync(request))
            {
                Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            }
        }
    }

    [Fact]
    public async Task Another_users_entry_cannot_be_read_edited_or_deleted()
    {
        using var alice = await factory.NewNutritionUserAsync("alice");
        using var bob = await factory.NewNutritionUserAsync("bob");
        var aliceEntry = await alice.AddEntryAsync(MealType.Lunch);

        using var read = await bob.GetAsync($"{NutritionTestClient.Entries}/{aliceEntry.Id}");
        Assert.Equal(HttpStatusCode.NotFound, read.StatusCode);

        using var edit = await bob.PutAsJsonAsync(
            $"{NutritionTestClient.Entries}/{aliceEntry.Id}",
            new UpdateNutritionEntryCommand(MealType.Dinner, DateTimeOffset.UtcNow, "oğurluq", [NutritionTestClient.Portion()]));
        Assert.Equal(HttpStatusCode.NotFound, edit.StatusCode);

        using var delete = await bob.DeleteAsync($"{NutritionTestClient.Entries}/{aliceEntry.Id}");
        Assert.Equal(HttpStatusCode.NotFound, delete.StatusCode);

        // Alice's meal is untouched, and Bob's day stays empty.
        var reloaded = (await alice.GetFromJsonAsync<NutritionEntryResponse>($"{NutritionTestClient.Entries}/{aliceEntry.Id}"))!;
        Assert.Equal(MealType.Lunch, reloaded.MealType);
        Assert.Null(reloaded.Note);
        Assert.Equal(0, (await bob.DayAsync()).EntryCount);
    }

    [Fact]
    public async Task Item_ids_from_another_user_are_ignored_rather_than_adopted()
    {
        using var alice = await factory.NewNutritionUserAsync("alice");
        using var bob = await factory.NewNutritionUserAsync("bob");
        var aliceEntry = await alice.AddEntryAsync(MealType.Breakfast);
        var aliceItemId = aliceEntry.Items[0].Id;
        var bobEntry = await bob.AddEntryAsync(MealType.Breakfast);

        // Bob replays Alice's item id inside his own update; the API rebuilds his snapshot rows instead.
        using var response = await bob.PutAsJsonAsync(
            $"{NutritionTestClient.Entries}/{bobEntry.Id}",
            new UpdateNutritionEntryCommand(MealType.Breakfast, DateTimeOffset.UtcNow, null, [NutritionTestClient.Portion("Yeni", quantity: 2m)]));
        var updated = await response.Content.ReadFromJsonAsync<NutritionEntryResponse>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain(aliceItemId, updated!.Items.Select(item => item.Id));

        var aliceReloaded = (await alice.GetFromJsonAsync<NutritionEntryResponse>($"{NutritionTestClient.Entries}/{aliceEntry.Id}"))!;
        Assert.Equal(aliceItemId, aliceReloaded.Items[0].Id);
        Assert.Equal(250m, aliceReloaded.EnergyKcal);
    }

    [Fact]
    public async Task Goals_and_days_are_scoped_to_the_owner()
    {
        using var alice = await factory.NewNutritionUserAsync("alice");
        using var bob = await factory.NewNutritionUserAsync("bob");

        using (var saved = await alice.SaveGoalAsync(new DateOnly(2026, 9, 1), energyKcal: 2000m))
        {
            saved.EnsureSuccessStatusCode();
        }

        await alice.AddEntryAsync(MealType.Dinner);

        Assert.Null((await bob.GoalsAsync()).Current);
        Assert.Empty((await bob.GoalsAsync()).History);
        Assert.Equal(0m, (await bob.DayAsync()).Totals.EnergyKcal);
        Assert.Null((await bob.DayAsync()).Goal);
    }

    [Fact]
    public async Task Another_users_goal_cannot_be_deleted()
    {
        using var alice = await factory.NewNutritionUserAsync("alice");
        using var bob = await factory.NewNutritionUserAsync("bob");

        using (var saved = await alice.SaveGoalAsync(new DateOnly(2026, 9, 2), energyKcal: 2000m))
        {
            saved.EnsureSuccessStatusCode();
        }

        var goal = (await alice.GoalsAsync()).History.Single();
        using var response = await bob.DeleteAsync($"{NutritionTestClient.Goals}/{goal.Id}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Single((await alice.GoalsAsync()).History);
    }
}
