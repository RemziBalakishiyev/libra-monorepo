using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Libra.Application.Identity;
using Libra.Application.Identity.Login;
using Libra.Application.Identity.Logout;
using Libra.Application.Identity.RefreshSession;
using Libra.Application.Identity.Register;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Identity;

[Collection(LibraApiCollection.Name)]
public sealed class AuthenticationTests(LibraApiFactory factory)
{
    private static readonly JsonSerializerOptions WebJson = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task Register_returns_session_with_no_store_and_profile_is_reachable()
    {
        using var client = factory.CreateClient();
        var email = AuthTestClient.UniqueEmail();

        using var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterCommand($"  {email.ToUpperInvariant()} ", AuthTestClient.DefaultPassword, "  Remzi "));
        var session = await response.Content.ReadFromJsonAsync<AuthSession>();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
        Assert.NotNull(session);
        Assert.False(string.IsNullOrWhiteSpace(session.AccessToken));
        Assert.False(string.IsNullOrWhiteSpace(session.RefreshToken));
        Assert.True(session.AccessTokenExpiresAtUtc > DateTime.UtcNow);
        Assert.True(session.RefreshTokenExpiresAtUtc > session.AccessTokenExpiresAtUtc);

        var profile = await client.WithBearer(session.AccessToken).GetFromJsonAsync<ProfileResponse>("/api/profile");

        Assert.NotNull(profile);
        Assert.Equal(email.ToUpperInvariant(), profile.Email);
        Assert.Equal("Remzi", profile.DisplayName);
        Assert.Equal(new PreferencesDto("Asia/Baku", "az-AZ", "AZN"), profile.Preferences);
    }

    [Fact]
    public async Task Register_with_same_email_in_different_case_returns_409()
    {
        using var client = factory.CreateClient();
        var email = AuthTestClient.UniqueEmail();
        await client.RegisterAsync(email);

        using var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterCommand($" {email.ToUpperInvariant()} ", AuthTestClient.DefaultPassword, null));
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("Email is already registered", problem.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Register_with_invalid_payload_returns_validation_problem()
    {
        using var client = factory.CreateClient();

        using var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterCommand("not-an-email", "short", null));
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var errors = problem.GetProperty("errors");
        Assert.True(errors.TryGetProperty("Email", out _));
        Assert.True(errors.TryGetProperty("Password", out _));
    }

    [Fact]
    public async Task Login_with_correct_password_returns_session()
    {
        using var client = factory.CreateClient();
        var email = AuthTestClient.UniqueEmail();
        await client.RegisterAsync(email);

        using var response = await client.PostAsJsonAsync("/api/auth/login", new LoginCommand(email.ToUpperInvariant(), AuthTestClient.DefaultPassword));
        var session = await response.Content.ReadFromJsonAsync<AuthSession>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(session);
        Assert.False(string.IsNullOrWhiteSpace(session.AccessToken));
    }

    [Fact]
    public async Task Login_with_wrong_password_or_unknown_email_returns_identical_401()
    {
        using var client = factory.CreateClient();
        var email = AuthTestClient.UniqueEmail();
        await client.RegisterAsync(email);

        using var wrongPassword = await client.PostAsJsonAsync("/api/auth/login", new LoginCommand(email, "definitely-wrong"));
        using var unknownEmail = await client.PostAsJsonAsync("/api/auth/login", new LoginCommand(AuthTestClient.UniqueEmail("ghost"), AuthTestClient.DefaultPassword));

        Assert.Equal(HttpStatusCode.Unauthorized, wrongPassword.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, unknownEmail.StatusCode);

        var wrongPasswordBody = await wrongPassword.Content.ReadFromJsonAsync<JsonElement>();
        var unknownEmailBody = await unknownEmail.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Invalid credentials", wrongPasswordBody.GetProperty("title").GetString());
        Assert.Equal(wrongPasswordBody.GetProperty("title").GetString(), unknownEmailBody.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Refresh_rotates_tokens_and_rejects_the_previous_one()
    {
        using var client = factory.CreateClient();
        var first = await client.RegisterAsync(AuthTestClient.UniqueEmail());

        using var refreshResponse = await client.PostAsJsonAsync("/api/auth/refresh", new RefreshSessionCommand(first.RefreshToken));
        var second = await refreshResponse.Content.ReadFromJsonAsync<AuthSession>();

        Assert.Equal(HttpStatusCode.OK, refreshResponse.StatusCode);
        Assert.NotNull(second);
        Assert.NotEqual(first.RefreshToken, second.RefreshToken);
        Assert.NotEqual(first.AccessToken, second.AccessToken);

        using var replay = await client.PostAsJsonAsync("/api/auth/refresh", new RefreshSessionCommand(first.RefreshToken));
        Assert.Equal(HttpStatusCode.Unauthorized, replay.StatusCode);
    }

    [Fact]
    public async Task Reusing_a_rotated_refresh_token_revokes_the_whole_family()
    {
        using var client = factory.CreateClient();
        var first = await client.RegisterAsync(AuthTestClient.UniqueEmail());

        using var rotate = await client.PostAsJsonAsync("/api/auth/refresh", new RefreshSessionCommand(first.RefreshToken));
        var second = (await rotate.Content.ReadFromJsonAsync<AuthSession>())!;

        // Attacker (or stale client) replays the first token.
        using var replay = await client.PostAsJsonAsync("/api/auth/refresh", new RefreshSessionCommand(first.RefreshToken));
        Assert.Equal(HttpStatusCode.Unauthorized, replay.StatusCode);

        // The legitimate successor is now revoked too.
        using var successor = await client.PostAsJsonAsync("/api/auth/refresh", new RefreshSessionCommand(second.RefreshToken));
        Assert.Equal(HttpStatusCode.Unauthorized, successor.StatusCode);
    }

    [Fact]
    public async Task Logout_revokes_the_session_so_refresh_fails()
    {
        using var client = factory.CreateClient();
        var session = await client.RegisterAsync(AuthTestClient.UniqueEmail());

        using var logout = await client.WithBearer(session.AccessToken).PostAsJsonAsync("/api/auth/logout", new LogoutCommand(session.RefreshToken));
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);

        using var refresh = await client.PostAsJsonAsync("/api/auth/refresh", new RefreshSessionCommand(session.RefreshToken));
        Assert.Equal(HttpStatusCode.Unauthorized, refresh.StatusCode);
    }

    [Fact]
    public async Task Logout_without_bearer_token_returns_401()
    {
        using var client = factory.CreateClient();

        using var response = await client.PostAsJsonAsync("/api/auth/logout", new LogoutCommand("anything"));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Logout_with_another_users_refresh_token_does_not_revoke_it()
    {
        using var alice = factory.CreateClient();
        using var bob = factory.CreateClient();
        var aliceSession = await alice.RegisterAsync(AuthTestClient.UniqueEmail("alice"));
        var bobSession = await bob.RegisterAsync(AuthTestClient.UniqueEmail("bob"));

        using var logout = await alice.WithBearer(aliceSession.AccessToken).PostAsJsonAsync("/api/auth/logout", new LogoutCommand(bobSession.RefreshToken));
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);

        using var bobRefresh = await bob.PostAsJsonAsync("/api/auth/refresh", new RefreshSessionCommand(bobSession.RefreshToken));
        Assert.Equal(HttpStatusCode.OK, bobRefresh.StatusCode);
    }

    [Fact]
    public async Task Auth_responses_never_expose_password_hashes()
    {
        using var client = factory.CreateClient();
        var email = AuthTestClient.UniqueEmail();

        using var register = await client.PostAsJsonAsync("/api/auth/register", new RegisterCommand(email, AuthTestClient.DefaultPassword, null));
        var registerBody = await register.Content.ReadAsStringAsync();
        var session = JsonSerializer.Deserialize<AuthSession>(registerBody, WebJson)!;
        var profileBody = await client.WithBearer(session.AccessToken).GetStringAsync("/api/profile");

        foreach (var body in new[] { registerBody, profileBody })
        {
            Assert.DoesNotContain("passwordHash", body, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(AuthTestClient.DefaultPassword, body, StringComparison.Ordinal);
            Assert.DoesNotContain("AQAAAA", body, StringComparison.Ordinal); // PasswordHasher v3 prefix
        }
    }
}
