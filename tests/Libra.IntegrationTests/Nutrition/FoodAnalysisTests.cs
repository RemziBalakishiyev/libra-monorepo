using System.Net;
using System.Net.Http.Json;
using Libra.Application.Nutrition;
using Libra.Application.Nutrition.FoodAnalysis;
using Libra.Domain.Nutrition;
using Libra.Infrastructure.Persistence;
using Libra.IntegrationTests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Libra.IntegrationTests.Nutrition;

/// <summary>
/// The draft → review → confirmation boundary. The invariant behind every test here: an analysis result is an
/// estimate, and only an explicit confirmation of reviewed items ever changes the diary.
/// </summary>
[Collection(LibraApiCollection.Name)]
public sealed class FoodAnalysisTests : IDisposable
{
    private readonly LibraApiFactory _factory;

    public FoodAnalysisTests(LibraApiFactory factory)
    {
        _factory = factory;
        _factory.Analyzer.Reset();
    }

    public void Dispose() => _factory.Analyzer.Reset();

    [Fact]
    public async Task A_photo_becomes_a_draft_and_leaves_the_diary_untouched()
    {
        using var client = await _factory.NewNutritionUserAsync("fa-draft");

        var draft = await client.AnalyzeAsync();

        Assert.Equal(FoodAnalysisStatus.PendingConfirmation, draft.Status);
        Assert.Equal(FoodAnalysisOutcome.Success, draft.Outcome);
        Assert.Equal(AiFoodAnalysisResult.CurrentSchemaVersion, draft.SchemaVersion);
        Assert.Equal("fixture/food-analysis", draft.Model);
        Assert.Equal(2, draft.Items.Count);
        Assert.Null(draft.ConfirmedEntryId);
        Assert.True(draft.HasImage);
        Assert.False(draft.IsExpired);

        // The estimate contributes nothing until someone confirms it.
        var day = await client.DayAsync();
        Assert.Equal(0, day.EntryCount);
        Assert.Equal(NutritionTotals.Zero, day.Totals);
    }

    [Fact]
    public async Task The_suggested_inputs_never_apply_the_weight_and_the_portion_as_two_multipliers()
    {
        using var client = await _factory.NewNutritionUserAsync("fa-suggest");

        var draft = await client.AnalyzeAsync();

        var plate = draft.Items[0];
        Assert.Equal(FoodAnalysisBasis.PicturedPortion, plate.Basis);
        Assert.Equal(FoodQuantityMode.PerPortion, plate.SuggestedQuantityMode);
        // The model also estimated 180 g for the omelette; as one pictured portion that weight multiplies nothing.
        Assert.Equal(180m, plate.EstimatedGrams);
        Assert.Equal(1m, plate.SuggestedQuantity);
        Assert.Equal(250m, plate.SuggestedEnergyKcalPerUnit);

        var perHundred = draft.Items[1];
        Assert.Equal(FoodAnalysisBasis.Per100Grams, perHundred.Basis);
        Assert.Equal(FoodQuantityMode.Per100Grams, perHundred.SuggestedQuantityMode);
        Assert.Equal(180m, perHundred.SuggestedQuantity);
        Assert.Equal(130m, perHundred.SuggestedEnergyKcalPerUnit);
        Assert.True(perHundred.IsComplete);
    }

    [Fact]
    public async Task A_nutrient_the_model_could_not_judge_stays_missing_instead_of_becoming_zero()
    {
        using var client = await _factory.NewNutritionUserAsync("fa-missing");
        _factory.Analyzer.Returns(FakeFoodAnalyzer.PartiallyKnownFood());

        var draft = await client.AnalyzeAsync();

        var item = Assert.Single(draft.Items);
        Assert.Equal(180m, item.SuggestedEnergyKcalPerUnit);
        Assert.Null(item.SuggestedProteinGramsPerUnit);
        Assert.Null(item.SuggestedCarbGramsPerUnit);
        Assert.Null(item.SuggestedFatGramsPerUnit);
        // The client must ask for the missing macros rather than confirm invented zeroes.
        Assert.False(item.IsComplete);
    }

    [Fact]
    public async Task Confirming_the_reviewed_items_creates_exactly_one_meal()
    {
        using var client = await _factory.NewNutritionUserAsync("fa-confirm");
        var draft = await client.AnalyzeAsync();

        var entry = await client.ConfirmSuccessfullyAsync(draft, MealType.Dinner);

        Assert.Equal(MealType.Dinner, entry.MealType);
        Assert.Equal(2, entry.Items.Count);
        // 250 kcal for the plate + 130 kcal × 1.8 for 180 g of rice.
        Assert.Equal(484m, entry.EnergyKcal);
        Assert.Equal(22.86m, entry.ProteinGrams);
        Assert.Equal(53.76m, entry.CarbGrams);
        Assert.Equal(19.54m, entry.FatGrams);

        var day = await client.DayAsync();
        Assert.Equal(1, day.EntryCount);
        Assert.Equal(484m, day.Totals.EnergyKcal);
    }

    [Fact]
    public async Task What_the_user_edited_during_review_is_what_gets_saved()
    {
        using var client = await _factory.NewNutritionUserAsync("fa-edit");
        var draft = await client.AnalyzeAsync();

        // The reviewer halves the rice and corrects the omelette's energy.
        var edited = new[]
        {
            FoodAnalysisTestClient.ReviewedAsSuggested(draft.Items[0]) with { EnergyKcalPerUnit = 300m },
            FoodAnalysisTestClient.ReviewedAsSuggested(draft.Items[1]) with { Quantity = 90m },
        };

        var entry = await client.ConfirmSuccessfullyAsync(draft, items: edited);

        Assert.Equal(300m + 117m, entry.EnergyKcal);
        Assert.Equal(90m, entry.Items[1].Quantity);

        // The draft still records what the model actually said, so the estimate and the meal never blur together.
        var stored = await client.GetDraftAsync(draft.Id);
        Assert.Equal(FoodAnalysisStatus.Confirmed, stored.Status);
        Assert.Equal(entry.Id, stored.ConfirmedEntryId);
        Assert.Equal(250m, stored.Items[0].EnergyKcal);
        Assert.Equal(180m, stored.Items[1].SuggestedQuantity);
    }

    [Fact]
    public async Task A_repeated_confirmation_returns_the_first_meal_even_with_a_new_retry_key()
    {
        using var client = await _factory.NewNutritionUserAsync("fa-replay");
        var draft = await client.AnalyzeAsync();

        var first = await client.ConfirmSuccessfullyAsync(draft, clientRequestId: Guid.NewGuid());

        // A different retry key must not become a licence to write the meal twice.
        using var second = await client.ConfirmAsync(draft, clientRequestId: Guid.NewGuid());
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        var replayed = (await second.Content.ReadFromJsonAsync<NutritionEntryResponse>())!;

        Assert.Equal(first.Id, replayed.Id);
        Assert.Equal(1, (await client.DayAsync()).EntryCount);
    }

    [Fact]
    public async Task Concurrent_confirmations_of_one_draft_create_one_meal()
    {
        using var client = await _factory.NewNutritionUserAsync("fa-race");
        var draft = await client.AnalyzeAsync();

        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => client.ConfirmAsync(draft, clientRequestId: Guid.NewGuid())));

        var ids = new List<Guid>();
        foreach (var response in responses)
        {
            Assert.True(
                response.StatusCode is HttpStatusCode.Created or HttpStatusCode.OK,
                $"A concurrent confirmation answered {(int)response.StatusCode}.");
            ids.Add((await response.Content.ReadFromJsonAsync<NutritionEntryResponse>())!.Id);
            response.Dispose();
        }

        Assert.Single(ids.Distinct());
        var day = await client.DayAsync();
        Assert.Equal(1, day.EntryCount);
        Assert.Equal(484m, day.Totals.EnergyKcal);
    }

    [Fact]
    public async Task Discarding_a_draft_writes_no_meal_and_drops_the_photo()
    {
        using var client = await _factory.NewNutritionUserAsync("fa-discard");
        var draft = await client.AnalyzeAsync();

        using (var discarded = await client.DiscardAsync(draft.Id))
        {
            Assert.Equal(HttpStatusCode.NoContent, discarded.StatusCode);
        }

        var stored = await client.GetDraftAsync(draft.Id);
        Assert.Equal(FoodAnalysisStatus.Discarded, stored.Status);
        Assert.False(stored.HasImage);
        Assert.Equal(0, (await client.DayAsync()).EntryCount);

        using var image = await client.GetAsync($"{FoodAnalysisTestClient.Analyses}/images/{draft.ImageId}");
        Assert.Equal(HttpStatusCode.NotFound, image.StatusCode);

        using var confirm = await client.ConfirmAsync(stored, items: [NutritionTestClient.Portion()]);
        Assert.Equal(HttpStatusCode.Conflict, confirm.StatusCode);
    }

    [Fact]
    public async Task The_photo_is_removed_once_the_meal_it_produced_exists()
    {
        using var client = await _factory.NewNutritionUserAsync("fa-photo");
        var draft = await client.AnalyzeAsync();

        using (var before = await client.GetAsync($"{FoodAnalysisTestClient.Analyses}/images/{draft.ImageId}"))
        {
            before.EnsureSuccessStatusCode();
            Assert.Equal("image/jpeg", before.Content.Headers.ContentType?.MediaType);
        }

        await client.ConfirmSuccessfullyAsync(draft);

        using var after = await client.GetAsync($"{FoodAnalysisTestClient.Analyses}/images/{draft.ImageId}");
        Assert.Equal(HttpStatusCode.NotFound, after.StatusCode);
        Assert.False((await client.GetDraftAsync(draft.Id)).HasImage);
    }

    [Fact]
    public async Task An_expired_draft_cannot_be_confirmed()
    {
        using var client = await _factory.NewNutritionUserAsync("fa-expired");
        var draft = await client.AnalyzeAsync();

        await AgeDraftAsync(draft.Id, TimeSpan.FromHours(3));

        var stored = await client.GetDraftAsync(draft.Id);
        Assert.True(stored.IsExpired);

        using var response = await client.ConfirmAsync(stored);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(0, (await client.DayAsync()).EntryCount);
    }

    [Fact]
    public async Task Cleanup_removes_expired_drafts_and_stale_photos_but_never_a_meal()
    {
        using var client = await _factory.NewNutritionUserAsync("fa-cleanup");

        var confirmed = await client.AnalyzeAsync();
        var entry = await client.ConfirmSuccessfullyAsync(confirmed);
        var abandoned = await client.AnalyzeAsync();
        await AgeDraftAsync(abandoned.Id, TimeSpan.FromHours(3));

        var (draftsRemoved, imagesRemoved) = await CleanupAsync();

        Assert.True(draftsRemoved >= 1, "The abandoned draft should have been swept.");
        Assert.True(imagesRemoved >= 1, "Its picture should have gone with it.");

        using var gone = await client.GetAsync($"{FoodAnalysisTestClient.Analyses}/{abandoned.Id}");
        Assert.Equal(HttpStatusCode.NotFound, gone.StatusCode);

        // The confirmed meal and its draft record survive the sweep untouched.
        var day = await client.DayAsync();
        Assert.Equal(1, day.EntryCount);
        Assert.Equal(484m, day.Totals.EnergyKcal);
        var stored = await client.GetDraftAsync(confirmed.Id);
        Assert.Equal(FoodAnalysisStatus.Confirmed, stored.Status);
        Assert.Equal(entry.Id, stored.ConfirmedEntryId);
    }

    [Fact]
    public async Task A_retried_upload_returns_the_first_draft_without_paying_for_a_second_analysis()
    {
        using var client = await _factory.NewNutritionUserAsync("fa-idempotent");
        var requestId = Guid.NewGuid();

        var first = await client.AnalyzeAsync(clientRequestId: requestId);
        using var repeat = await client.PostPhotoAsync(clientRequestId: requestId);

        Assert.Equal(HttpStatusCode.OK, repeat.StatusCode);
        var replayed = (await repeat.Content.ReadFromJsonAsync<FoodAnalysisDraftResponse>())!;
        Assert.Equal(first.Id, replayed.Id);
        Assert.Equal(1, _factory.Analyzer.Calls);
    }

    [Theory]
    [InlineData(FoodAnalysisOutcome.NoFoodDetected)]
    [InlineData(FoodAnalysisOutcome.InsufficientInformation)]
    public async Task A_picture_with_nothing_to_estimate_produces_a_named_outcome_and_no_items(FoodAnalysisOutcome outcome)
    {
        using var client = await _factory.NewNutritionUserAsync("fa-nothing");
        _factory.Analyzer.Returns(outcome == FoodAnalysisOutcome.NoFoodDetected ? FakeFoodAnalyzer.NoFood() : FakeFoodAnalyzer.TooUnclear());

        var draft = await client.AnalyzeAsync();

        Assert.Equal(outcome, draft.Outcome);
        Assert.Empty(draft.Items);
        Assert.NotNull(draft.Notes);

        // There is nothing to confirm, and the API says so rather than storing an empty meal.
        using var response = await client.ConfirmAsync(draft);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, (await client.DayAsync()).EntryCount);
    }

    [Theory]
    [InlineData(AiFoodAnalysisFailure.NotConfigured, HttpStatusCode.ServiceUnavailable)]
    [InlineData(AiFoodAnalysisFailure.ProviderUnavailable, HttpStatusCode.ServiceUnavailable)]
    [InlineData(AiFoodAnalysisFailure.Incomplete, HttpStatusCode.ServiceUnavailable)]
    [InlineData(AiFoodAnalysisFailure.InvalidOutput, HttpStatusCode.ServiceUnavailable)]
    [InlineData(AiFoodAnalysisFailure.Timeout, HttpStatusCode.GatewayTimeout)]
    [InlineData(AiFoodAnalysisFailure.Busy, HttpStatusCode.TooManyRequests)]
    [InlineData(AiFoodAnalysisFailure.Refused, HttpStatusCode.BadRequest)]
    public async Task Every_provider_failure_is_reported_honestly_and_stores_nothing(AiFoodAnalysisFailure failure, HttpStatusCode expected)
    {
        using var client = await _factory.NewNutritionUserAsync("fa-failure");
        var drafts = await CountDraftsAsync();
        var stored = _factory.Images.Count;
        _factory.Analyzer.Fails(failure);

        using var response = await client.PostPhotoAsync();

        Assert.Equal(expected, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        // A failed analysis leaves neither a draft nor a stored picture behind.
        Assert.Equal(drafts, await CountDraftsAsync());
        Assert.Equal(stored, _factory.Images.Count);
        Assert.Equal(0, (await client.DayAsync()).EntryCount);
    }

    [Fact]
    public async Task A_missing_api_key_is_a_plain_unavailable_answer_and_never_a_fabricated_estimate()
    {
        using var client = await _factory.NewNutritionUserAsync("fa-nokey");
        var drafts = await CountDraftsAsync();
        _factory.Analyzer.Configured = false;

        using var response = await client.PostPhotoAsync();

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        var problem = await response.Content.ReadAsStringAsync();
        Assert.Contains("not configured", problem, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(drafts, await CountDraftsAsync());
    }

    [Fact]
    public async Task A_file_that_is_not_a_picture_is_rejected_before_the_provider_is_called()
    {
        using var client = await _factory.NewNutritionUserAsync("fa-notimage");
        var drafts = await CountDraftsAsync();

        using var response = await client.PostPhotoAsync("This is a text file renamed to meal.jpg."u8.ToArray());

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, _factory.Analyzer.Calls);
        Assert.Equal(drafts, await CountDraftsAsync());
    }

    [Fact]
    public async Task An_oversized_upload_is_refused_with_the_status_that_says_so()
    {
        using var client = await _factory.NewNutritionUserAsync("fa-toobig");

        using var response = await client.PostPhotoAsync(new byte[9 * 1024 * 1024]);

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
        Assert.Equal(0, _factory.Analyzer.Calls);
    }

    [Fact]
    public async Task A_user_cannot_run_more_analyses_than_the_hourly_ceiling()
    {
        using var client = await _factory.NewNutritionUserAsync("fa-ratelimit");

        for (var attempt = 0; attempt < LibraApiFactory.MaxAnalysesPerHour; attempt++)
        {
            using var allowed = await client.PostPhotoAsync();
            allowed.EnsureSuccessStatusCode();
        }

        using var refused = await client.PostPhotoAsync();

        Assert.Equal(HttpStatusCode.TooManyRequests, refused.StatusCode);
        Assert.Equal(LibraApiFactory.MaxAnalysesPerHour, _factory.Analyzer.Calls);
    }

    [Fact]
    public async Task The_confirmed_meal_lands_on_the_users_own_local_day()
    {
        using var client = await _factory.NewNutritionUserAsync("fa-timezone");
        await client.SetTimeZoneAsync("Asia/Baku");
        var draft = await client.AnalyzeAsync();

        // 22:30 UTC is already the next day in Baku (UTC+4).
        var consumedAt = new DateTimeOffset(2026, 3, 14, 22, 30, 0, TimeSpan.Zero);
        await client.ConfirmSuccessfullyAsync(draft, consumedAt: consumedAt);

        Assert.Equal(0, (await client.DayAsync(new DateOnly(2026, 3, 14))).EntryCount);
        var next = await client.DayAsync(new DateOnly(2026, 3, 15));
        Assert.Equal(1, next.EntryCount);
        Assert.Equal(484m, next.Totals.EnergyKcal);
    }

    [Fact]
    public async Task The_picture_that_reaches_the_provider_is_the_normalized_one()
    {
        using var client = await _factory.NewNutritionUserAsync("fa-normalized");

        await client.AnalyzeAsync(FoodAnalysisTestClient.Photo(2400, 1600));

        var sent = _factory.Analyzer.LastImage!;
        Assert.Equal("image/jpeg", sent.ContentType);
        Assert.Equal(1024, sent.Width);
        Assert.Equal(683, sent.Height);
    }

    private async Task<int> CountDraftsAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LibraDbContext>();
        return await db.FoodAnalysisDrafts.CountAsync();
    }

    /// <summary>Moves one draft and its picture into the past, so expiry and cleanup can be observed at once.</summary>
    private async Task AgeDraftAsync(Guid draftId, TimeSpan age)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LibraDbContext>();
        var draft = await db.FoodAnalysisDrafts.SingleAsync(candidate => candidate.Id == draftId);

        await db.FoodAnalysisDrafts
            .Where(candidate => candidate.Id == draftId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(candidate => candidate.ExpiresAtUtc, DateTime.UtcNow - age));
        await db.FoodAnalysisImages
            .Where(image => image.Id == draft.ImageId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(image => image.RetainUntilUtc, DateTime.UtcNow - age));
    }

    private async Task<(int DraftsRemoved, int ImagesRemoved)> CleanupAsync()
    {
        using var scope = _factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<FoodAnalysisHandler>().CleanupAsync(CancellationToken.None);
    }
}
