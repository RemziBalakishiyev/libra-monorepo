using System.Net;
using System.Net.Http.Json;
using Libra.Application.Nutrition;
using Libra.Domain.Nutrition;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Nutrition;

/// <summary>
/// Ownership comes from the bearer token alone. Another user's draft, and the photo behind it, are simply not
/// there — a foreign id is answered the same way a made-up one is.
/// </summary>
[Collection(LibraApiCollection.Name)]
public sealed class FoodAnalysisAuthorizationTests : IDisposable
{
    private readonly LibraApiFactory _factory;

    public FoodAnalysisAuthorizationTests(LibraApiFactory factory)
    {
        _factory = factory;
        _factory.Analyzer.Reset();
    }

    public void Dispose() => _factory.Analyzer.Reset();

    [Fact]
    public async Task Every_photo_analysis_endpoint_requires_a_token()
    {
        using var anonymous = _factory.CreateClient();
        var id = Guid.CreateVersion7();

        using var upload = await anonymous.PostPhotoAsync();
        using var read = await anonymous.GetAsync($"{FoodAnalysisTestClient.Analyses}/{id}");
        using var image = await anonymous.GetAsync($"{FoodAnalysisTestClient.Analyses}/images/{id}");
        using var discard = await anonymous.DiscardAsync(id);

        Assert.Equal(HttpStatusCode.Unauthorized, upload.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, read.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, image.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, discard.StatusCode);
    }

    [Fact]
    public async Task Another_users_draft_is_indistinguishable_from_one_that_does_not_exist()
    {
        using var owner = await _factory.NewNutritionUserAsync("fa-owner");
        using var stranger = await _factory.NewNutritionUserAsync("fa-stranger");
        var draft = await owner.AnalyzeAsync();

        using var read = await stranger.GetAsync($"{FoodAnalysisTestClient.Analyses}/{draft.Id}");
        using var image = await stranger.GetAsync($"{FoodAnalysisTestClient.Analyses}/images/{draft.ImageId}");
        using var confirm = await stranger.ConfirmAsync(draft, items: [NutritionTestClient.Portion()]);
        using var discard = await stranger.DiscardAsync(draft.Id);

        Assert.Equal(HttpStatusCode.NotFound, read.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, image.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, confirm.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, discard.StatusCode);

        // Nothing the stranger did reached the owner's draft or either diary.
        var stored = await owner.GetDraftAsync(draft.Id);
        Assert.Equal(FoodAnalysisStatus.PendingConfirmation, stored.Status);
        Assert.True(stored.HasImage);
        Assert.Equal(0, (await owner.DayAsync()).EntryCount);
        Assert.Equal(0, (await stranger.DayAsync()).EntryCount);
    }

    [Fact]
    public async Task A_confirmed_meal_belongs_only_to_the_user_who_confirmed_it()
    {
        using var owner = await _factory.NewNutritionUserAsync("fa-owner2");
        using var stranger = await _factory.NewNutritionUserAsync("fa-stranger2");
        var draft = await owner.AnalyzeAsync();

        var entry = await owner.ConfirmSuccessfullyAsync(draft, MealType.Breakfast);

        using var foreignRead = await stranger.GetAsync($"{NutritionTestClient.Entries}/{entry.Id}");
        Assert.Equal(HttpStatusCode.NotFound, foreignRead.StatusCode);
        Assert.Equal(0, (await stranger.DayAsync()).EntryCount);

        var mine = await owner.GetFromJsonAsync<NutritionEntryResponse>($"{NutritionTestClient.Entries}/{entry.Id}");
        Assert.Equal(entry.Id, mine!.Id);
    }

    [Fact]
    public async Task A_retry_key_is_scoped_to_its_own_user()
    {
        using var first = await _factory.NewNutritionUserAsync("fa-key1");
        using var second = await _factory.NewNutritionUserAsync("fa-key2");
        var shared = Guid.NewGuid();

        var mine = await first.AnalyzeAsync(clientRequestId: shared);
        var theirs = await second.AnalyzeAsync(clientRequestId: shared);

        // The same key from another user is a different draft, never a replay of someone else's analysis.
        Assert.NotEqual(mine.Id, theirs.Id);
        Assert.Equal(2, _factory.Analyzer.Calls);
    }
}
