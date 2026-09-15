using System.Net.Http.Json;
using Libra.Application.Identity;
using Libra.Application.Identity.Profile;
using Libra.Application.Nutrition;
using Libra.Domain.Nutrition;

namespace Libra.IntegrationTests.Infrastructure;

/// <summary>Thin HTTP helpers for the nutrition suite. Every call goes through the public API.</summary>
internal static class NutritionTestClient
{
    public const string Day = "/api/nutrition/day";
    public const string Entries = "/api/nutrition/entries";
    public const string Goals = "/api/nutrition/goals";

    /// <summary>Registers a fresh user and returns a client carrying its bearer token.</summary>
    public static async Task<HttpClient> NewNutritionUserAsync(this LibraApiFactory factory, string prefix = "nut")
    {
        var client = factory.CreateClient();
        var session = await client.RegisterAsync(AuthTestClient.UniqueEmail(prefix));
        return client.WithBearer(session.AccessToken);
    }

    public static async Task SetTimeZoneAsync(this HttpClient client, string timeZone)
    {
        var profile = (await client.GetFromJsonAsync<ProfileResponse>("/api/profile"))!;
        using var response = await client.PutAsJsonAsync(
            "/api/profile",
            new UpdateProfileCommand(profile.DisplayName, new PreferencesDto(timeZone, profile.Preferences.Locale, profile.Preferences.Currency)));
        response.EnsureSuccessStatusCode();
    }

    public static NutritionItemCommand Portion(string name = "Omlet", decimal quantity = 1m, decimal kcal = 250m, decimal protein = 18m, decimal carbs = 3m, decimal fat = 19m) =>
        new(name, FoodQuantityMode.PerPortion, quantity, kcal, protein, carbs, fat);

    public static NutritionItemCommand PerHundred(string name = "Düyü", decimal grams = 100m, decimal kcal = 130m, decimal protein = 2.7m, decimal carbs = 28.2m, decimal fat = 0.3m) =>
        new(name, FoodQuantityMode.Per100Grams, grams, kcal, protein, carbs, fat);

    public static async Task<NutritionEntryResponse> AddEntryAsync(
        this HttpClient client,
        MealType mealType = MealType.Breakfast,
        DateTimeOffset? consumedAt = null,
        IEnumerable<NutritionItemCommand>? items = null,
        string? note = null,
        Guid? clientRequestId = null)
    {
        using var response = await client.PostAsJsonAsync(
            Entries,
            new CreateNutritionEntryCommand(mealType, consumedAt ?? DateTimeOffset.UtcNow, note, (items ?? [Portion()]).ToList(), clientRequestId));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<NutritionEntryResponse>())!;
    }

    public static async Task<NutritionDayResponse> DayAsync(this HttpClient client, DateOnly? date = null) =>
        (await client.GetFromJsonAsync<NutritionDayResponse>(date is null ? Day : $"{Day}?date={date:yyyy-MM-dd}"))!;

    public static async Task<NutritionGoalsResponse> GoalsAsync(this HttpClient client, DateOnly? date = null) =>
        (await client.GetFromJsonAsync<NutritionGoalsResponse>(date is null ? Goals : $"{Goals}?date={date:yyyy-MM-dd}"))!;

    public static async Task<HttpResponseMessage> SaveGoalAsync(
        this HttpClient client,
        DateOnly? effectiveFrom = null,
        decimal? energyKcal = null,
        decimal? proteinGrams = null,
        decimal? carbGrams = null,
        decimal? fatGrams = null) =>
        await client.PutAsJsonAsync(Goals, new SaveNutritionGoalCommand(effectiveFrom, energyKcal, proteinGrams, carbGrams, fatGrams));
}
