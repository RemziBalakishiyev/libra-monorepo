using System.Net;
using System.Net.Http.Json;
using Libra.Application.Common;
using Libra.Application.Nutrition;
using Libra.Domain.Nutrition;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Nutrition;

[Collection(LibraApiCollection.Name)]
public sealed class NutritionEntryTests(LibraApiFactory factory)
{
    [Fact]
    public async Task Creating_an_entry_stores_the_inputs_and_the_computed_totals()
    {
        using var client = await factory.NewNutritionUserAsync();

        var entry = await client.AddEntryAsync(
            MealType.Lunch,
            items: [NutritionTestClient.Portion(quantity: 2m), NutritionTestClient.PerHundred(grams: 150m)],
            note: "  iş yerində  ");

        Assert.Equal(MealType.Lunch, entry.MealType);
        Assert.Equal("iş yerində", entry.Note);
        // 2 × 250 kcal + 150 g of 130 kcal/100 g.
        Assert.Equal(695m, entry.EnergyKcal);
        Assert.Equal(40.05m, entry.ProteinGrams);
        Assert.Equal(48.30m, entry.CarbGrams);
        Assert.Equal(38.45m, entry.FatGrams);

        var portion = entry.Items[0];
        Assert.Equal(FoodQuantityMode.PerPortion, portion.QuantityMode);
        Assert.Equal(2m, portion.Quantity);
        Assert.Equal(250m, portion.EnergyKcalPerUnit);
        Assert.Equal(500m, portion.EnergyKcal);
        Assert.Equal([0, 1], entry.Items.Select(item => item.Position));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(10_001)]
    public async Task Invalid_quantities_are_rejected(decimal quantity)
    {
        using var client = await factory.NewNutritionUserAsync();

        using var response = await client.PostAsJsonAsync(
            NutritionTestClient.Entries,
            new CreateNutritionEntryCommand(MealType.Snack, DateTimeOffset.UtcNow, null, [NutritionTestClient.Portion(quantity: quantity)], null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Negative_nutrients_are_rejected_but_an_explicit_zero_is_stored()
    {
        using var client = await factory.NewNutritionUserAsync();

        using var negative = await client.PostAsJsonAsync(
            NutritionTestClient.Entries,
            new CreateNutritionEntryCommand(MealType.Snack, DateTimeOffset.UtcNow, null, [NutritionTestClient.Portion(fat: -1m)], null));
        Assert.Equal(HttpStatusCode.BadRequest, negative.StatusCode);

        var zero = await client.AddEntryAsync(MealType.Snack, items: [NutritionTestClient.Portion("Qara qəhvə", kcal: 2m, protein: 0m, carbs: 0m, fat: 0m)]);
        Assert.Equal(0m, zero.FatGrams);
        Assert.Equal(2m, zero.EnergyKcal);
    }

    [Fact]
    public async Task An_entry_without_items_is_rejected()
    {
        using var client = await factory.NewNutritionUserAsync();

        using var response = await client.PostAsJsonAsync(
            NutritionTestClient.Entries,
            new CreateNutritionEntryCommand(MealType.Dinner, DateTimeOffset.UtcNow, null, [], null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Repeating_a_client_request_id_returns_the_same_entry_without_duplicating()
    {
        using var client = await factory.NewNutritionUserAsync();
        var requestId = Guid.NewGuid();
        var command = new CreateNutritionEntryCommand(MealType.Breakfast, DateTimeOffset.UtcNow, null, [NutritionTestClient.Portion()], requestId);

        using var first = await client.PostAsJsonAsync(NutritionTestClient.Entries, command);
        using var second = await client.PostAsJsonAsync(NutritionTestClient.Entries, command);
        var created = await first.Content.ReadFromJsonAsync<NutritionEntryResponse>();
        var replayed = await second.Content.ReadFromJsonAsync<NutritionEntryResponse>();

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal(created!.Id, replayed!.Id);

        var list = (await client.GetFromJsonAsync<PagedResponse<NutritionEntryResponse>>(NutritionTestClient.Entries))!;
        Assert.Single(list.Items);
    }

    [Fact]
    public async Task Concurrent_creates_with_the_same_client_request_id_produce_one_entry()
    {
        using var client = await factory.NewNutritionUserAsync();
        var command = new CreateNutritionEntryCommand(MealType.Snack, DateTimeOffset.UtcNow, null, [NutritionTestClient.Portion()], Guid.NewGuid());

        var responses = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => client.PostAsJsonAsync(NutritionTestClient.Entries, command)));
        var ids = new HashSet<Guid>();
        foreach (var response in responses)
        {
            Assert.True(response.StatusCode is HttpStatusCode.Created or HttpStatusCode.OK, response.StatusCode.ToString());
            ids.Add((await response.Content.ReadFromJsonAsync<NutritionEntryResponse>())!.Id);
            response.Dispose();
        }

        Assert.Single(ids);
        var list = (await client.GetFromJsonAsync<PagedResponse<NutritionEntryResponse>>(NutritionTestClient.Entries))!;
        Assert.Equal(1, list.TotalCount);
    }

    [Fact]
    public async Task Editing_a_quantity_recomputes_the_totals_and_leaves_no_orphan_items()
    {
        using var client = await factory.NewNutritionUserAsync();
        var entry = await client.AddEntryAsync(MealType.Lunch, items: [NutritionTestClient.Portion(quantity: 1m)]);

        using var response = await client.PutAsJsonAsync(
            $"{NutritionTestClient.Entries}/{entry.Id}",
            new UpdateNutritionEntryCommand(MealType.Dinner, DateTimeOffset.UtcNow, "düzəliş", [NutritionTestClient.Portion(quantity: 2.5m)]));
        var updated = await response.Content.ReadFromJsonAsync<NutritionEntryResponse>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(625m, updated!.EnergyKcal);
        Assert.Equal(MealType.Dinner, updated.MealType);
        Assert.Equal("düzəliş", updated.Note);
        Assert.Single(updated.Items);
        // The old snapshot row is gone: the day sums to the new figure only.
        var day = await client.DayAsync();
        Assert.Equal(625m, day.Totals.EnergyKcal);
    }

    [Fact]
    public async Task Copying_an_entry_into_another_day_never_touches_the_source()
    {
        using var client = await factory.NewNutritionUserAsync();
        await client.SetTimeZoneAsync("Asia/Baku");
        var today = new DateOnly(2026, 9, 7);
        var source = await client.AddEntryAsync(MealType.Dinner, new DateTimeOffset(2026, 9, 7, 15, 0, 0, TimeSpan.Zero), [NutritionTestClient.Portion(), NutritionTestClient.PerHundred()], "orijinal");

        // A copy is an ordinary create built from the source's inputs.
        var copy = await client.AddEntryAsync(
            MealType.Lunch,
            new DateTimeOffset(2026, 9, 8, 9, 0, 0, TimeSpan.Zero),
            source.Items.Select(item => new NutritionItemCommand(item.Name, item.QuantityMode, item.Quantity, item.EnergyKcalPerUnit, item.ProteinGramsPerUnit, item.CarbGramsPerUnit, item.FatGramsPerUnit)));

        Assert.NotEqual(source.Id, copy.Id);
        Assert.Empty(source.Items.Select(item => item.Id).Intersect(copy.Items.Select(item => item.Id)));

        using var edit = await client.PutAsJsonAsync(
            $"{NutritionTestClient.Entries}/{copy.Id}",
            new UpdateNutritionEntryCommand(MealType.Lunch, new DateTimeOffset(2026, 9, 8, 9, 0, 0, TimeSpan.Zero), null, [NutritionTestClient.Portion(quantity: 3m)]));
        edit.EnsureSuccessStatusCode();

        var reloaded = (await client.GetFromJsonAsync<NutritionEntryResponse>($"{NutritionTestClient.Entries}/{source.Id}"))!;
        Assert.Equal(380m, reloaded.EnergyKcal);
        Assert.Equal("orijinal", reloaded.Note);
        Assert.Equal(2, reloaded.Items.Count);

        var sourceDay = await client.DayAsync(today);
        var copyDay = await client.DayAsync(today.AddDays(1));
        Assert.Equal(380m, sourceDay.Totals.EnergyKcal);
        Assert.Equal(750m, copyDay.Totals.EnergyKcal);
    }

    [Fact]
    public async Task Moving_an_entry_to_another_date_updates_both_days()
    {
        using var client = await factory.NewNutritionUserAsync();
        await client.SetTimeZoneAsync("Asia/Baku");
        var from = new DateOnly(2026, 9, 10);
        var to = new DateOnly(2026, 9, 11);
        var entry = await client.AddEntryAsync(MealType.Dinner, new DateTimeOffset(2026, 9, 10, 15, 0, 0, TimeSpan.Zero));

        Assert.Equal(250m, (await client.DayAsync(from)).Totals.EnergyKcal);

        using var response = await client.PutAsJsonAsync(
            $"{NutritionTestClient.Entries}/{entry.Id}",
            new UpdateNutritionEntryCommand(MealType.Dinner, new DateTimeOffset(2026, 9, 11, 15, 0, 0, TimeSpan.Zero), null, [NutritionTestClient.Portion()]));
        response.EnsureSuccessStatusCode();

        Assert.Equal(0m, (await client.DayAsync(from)).Totals.EnergyKcal);
        Assert.Equal(0, (await client.DayAsync(from)).EntryCount);
        Assert.Equal(250m, (await client.DayAsync(to)).Totals.EnergyKcal);
    }

    [Fact]
    public async Task Deleting_an_entry_removes_it_from_the_day()
    {
        using var client = await factory.NewNutritionUserAsync();
        await client.SetTimeZoneAsync("Asia/Baku");
        var date = new DateOnly(2026, 9, 12);
        var entry = await client.AddEntryAsync(MealType.Lunch, new DateTimeOffset(2026, 9, 12, 9, 0, 0, TimeSpan.Zero));

        using var response = await client.DeleteAsync($"{NutritionTestClient.Entries}/{entry.Id}");
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        var day = await client.DayAsync(date);
        Assert.Equal(0m, day.Totals.EnergyKcal);
        Assert.Equal(0, day.EntryCount);

        using var again = await client.DeleteAsync($"{NutritionTestClient.Entries}/{entry.Id}");
        Assert.Equal(HttpStatusCode.NotFound, again.StatusCode);
    }

    [Fact]
    public async Task Nutrition_works_without_any_finance_setup()
    {
        using var client = await factory.NewNutritionUserAsync("nofin");

        var entry = await client.AddEntryAsync();
        var day = await client.DayAsync();

        Assert.Equal(250m, entry.EnergyKcal);
        Assert.Equal(1, day.EntryCount);

        // No account was ever created for this user.
        var accounts = (await client.GetFromJsonAsync<List<Libra.Application.Finance.AccountResponse>>("/api/finance/accounts"))!;
        Assert.Empty(accounts);
    }
}
