using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Libra.Application.Identity;
using Libra.Application.Identity.Profile;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Identity;

[Collection(LibraApiCollection.Name)]
public sealed class ProfileTests(LibraApiFactory factory)
{
    [Fact]
    public async Task Profile_without_token_returns_401_problem_details()
    {
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/api/profile");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Profile_with_tampered_token_returns_401()
    {
        using var client = factory.CreateClient();
        var session = await client.RegisterAsync(AuthTestClient.UniqueEmail());
        var tampered = session.AccessToken[..^4] + "AAAA";

        using var response = await client.WithBearer(tampered).GetAsync("/api/profile");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Users_only_see_and_update_their_own_profile()
    {
        using var alice = factory.CreateClient();
        using var bob = factory.CreateClient();
        var aliceEmail = AuthTestClient.UniqueEmail("alice");
        var bobEmail = AuthTestClient.UniqueEmail("bob");
        var aliceSession = await alice.RegisterAsync(aliceEmail, displayName: "Alice");
        var bobSession = await bob.RegisterAsync(bobEmail, displayName: "Bob");
        alice.WithBearer(aliceSession.AccessToken);
        bob.WithBearer(bobSession.AccessToken);

        using var update = await alice.PutAsJsonAsync("/api/profile", new UpdateProfileCommand("Alice Updated", new PreferencesDto("Europe/Istanbul", "tr-TR", "TRY")));
        var updated = await update.Content.ReadFromJsonAsync<ProfileResponse>();

        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.NotNull(updated);
        Assert.Equal(aliceEmail, updated.Email);
        Assert.Equal("Alice Updated", updated.DisplayName);
        Assert.Equal(new PreferencesDto("Europe/Istanbul", "tr-TR", "TRY"), updated.Preferences);

        var aliceProfile = await alice.GetFromJsonAsync<ProfileResponse>("/api/profile");
        var bobProfile = await bob.GetFromJsonAsync<ProfileResponse>("/api/profile");

        Assert.Equal("Alice Updated", aliceProfile!.DisplayName);
        Assert.Equal(bobEmail, bobProfile!.Email);
        Assert.Equal("Bob", bobProfile.DisplayName);
        Assert.Equal(new PreferencesDto("Asia/Baku", "az-AZ", "AZN"), bobProfile.Preferences);
    }

    [Fact]
    public async Task Update_profile_rejects_unknown_time_zone_locale_and_currency()
    {
        using var client = factory.CreateClient();
        var session = await client.RegisterAsync(AuthTestClient.UniqueEmail());

        using var response = await client.WithBearer(session.AccessToken)
            .PutAsJsonAsync("/api/profile", new UpdateProfileCommand(null, new PreferencesDto("Mars/Olympus", "xx-NOPE", "azn")));
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var errors = problem.GetProperty("errors");
        Assert.True(errors.TryGetProperty("Preferences.TimeZone", out _));
        Assert.True(errors.TryGetProperty("Preferences.Locale", out _));
        Assert.True(errors.TryGetProperty("Preferences.Currency", out _));
    }
}
