using System.Net.Http.Headers;
using System.Net.Http.Json;
using Libra.Application.Nutrition;
using Libra.Application.Nutrition.FoodAnalysis;
using Libra.Domain.Nutrition;
using SkiaSharp;

namespace Libra.IntegrationTests.Infrastructure;

/// <summary>Thin HTTP helpers for the photo-analysis suite. Every call goes through the public API.</summary>
internal static class FoodAnalysisTestClient
{
    public const string Analyses = "/api/nutrition/food-analysis";

    /// <summary>A real, decodable JPEG. The backend validates bytes, so a placeholder string would be rejected.</summary>
    public static byte[] Photo(int width = 640, int height = 480)
    {
        using var bitmap = new SKBitmap(width, height);
        using (var canvas = new SKCanvas(bitmap))
        {
            canvas.Clear(SKColors.Wheat);
            using var paint = new SKPaint { Color = SKColors.SaddleBrown };
            canvas.DrawOval(new SKRect(width * 0.2f, height * 0.2f, width * 0.8f, height * 0.8f), paint);
        }

        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Jpeg, 85);
        return data.ToArray();
    }

    public static async Task<HttpResponseMessage> PostPhotoAsync(
        this HttpClient client,
        byte[]? bytes = null,
        Guid? clientRequestId = null,
        string fileName = "meal.jpg",
        string contentType = "image/jpeg")
    {
        using var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes ?? Photo());
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        content.Add(file, "photo", fileName);

        var url = clientRequestId is Guid id ? $"{Analyses}?clientRequestId={id}" : Analyses;
        return await client.PostAsync(url, content);
    }

    public static async Task<FoodAnalysisDraftResponse> AnalyzeAsync(
        this HttpClient client,
        byte[]? bytes = null,
        Guid? clientRequestId = null)
    {
        using var response = await client.PostPhotoAsync(bytes, clientRequestId);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<FoodAnalysisDraftResponse>())!;
    }

    public static async Task<FoodAnalysisDraftResponse> GetDraftAsync(this HttpClient client, Guid id) =>
        (await client.GetFromJsonAsync<FoodAnalysisDraftResponse>($"{Analyses}/{id}"))!;

    /// <summary>Confirms exactly what the review screen would send: the suggested inputs, unless overridden.</summary>
    public static Task<HttpResponseMessage> ConfirmAsync(
        this HttpClient client,
        FoodAnalysisDraftResponse draft,
        MealType mealType = MealType.Lunch,
        DateTimeOffset? consumedAt = null,
        IEnumerable<NutritionItemCommand>? items = null,
        string? note = null,
        Guid? clientRequestId = null)
    {
        ArgumentNullException.ThrowIfNull(draft);
        var command = new ConfirmFoodAnalysisCommand(
            mealType,
            consumedAt ?? DateTimeOffset.UtcNow,
            note,
            (items ?? draft.Items.Select(ReviewedAsSuggested)).ToList(),
            clientRequestId);
        return client.PostAsJsonAsync($"{Analyses}/{draft.Id}/confirm", command);
    }

    public static async Task<NutritionEntryResponse> ConfirmSuccessfullyAsync(
        this HttpClient client,
        FoodAnalysisDraftResponse draft,
        MealType mealType = MealType.Lunch,
        DateTimeOffset? consumedAt = null,
        IEnumerable<NutritionItemCommand>? items = null,
        Guid? clientRequestId = null)
    {
        using var response = await client.ConfirmAsync(draft, mealType, consumedAt, items, clientRequestId: clientRequestId);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<NutritionEntryResponse>())!;
    }

    public static Task<HttpResponseMessage> DiscardAsync(this HttpClient client, Guid id) =>
        client.DeleteAsync($"{Analyses}/{id}");

    /// <summary>The item the user would confirm if they changed nothing the model suggested.</summary>
    public static NutritionItemCommand ReviewedAsSuggested(FoodAnalysisItemResponse item)
    {
        ArgumentNullException.ThrowIfNull(item);
        return new NutritionItemCommand(
            item.Name,
            item.SuggestedQuantityMode,
            item.SuggestedQuantity,
            item.SuggestedEnergyKcalPerUnit ?? 0m,
            item.SuggestedProteinGramsPerUnit ?? 0m,
            item.SuggestedCarbGramsPerUnit ?? 0m,
            item.SuggestedFatGramsPerUnit ?? 0m);
    }
}
