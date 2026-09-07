using System.Net;
using System.Net.Http.Json;
using Libra.Application.Identity;
using Libra.Application.Identity.RefreshSession;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Identity;

[Collection(LibraApiCollection.Name)]
public sealed class RefreshConcurrencyTests(LibraApiFactory factory)
{
    /// <summary>
    /// Two callers present the same refresh token at once. Whether the requests interleave (concurrency token
    /// conflict) or run back to back (reuse detection), the outcome must be the same: at most one succeeds and
    /// the family is revoked, so even the winner's new token is unusable.
    /// </summary>
    [Fact]
    public async Task Concurrent_refreshes_with_the_same_token_leave_no_usable_session()
    {
        using var client = factory.CreateClient();
        var session = await client.RegisterAsync(AuthTestClient.UniqueEmail("race"));
        var command = new RefreshSessionCommand(session.RefreshToken);

        var responses = await Task.WhenAll(
            Enumerable.Range(0, 4).Select(_ => client.PostAsJsonAsync("/api/auth/refresh", command)));

        var successes = new List<AuthSession>();
        foreach (var response in responses)
        {
            if (response.StatusCode == HttpStatusCode.OK)
            {
                successes.Add((await response.Content.ReadFromJsonAsync<AuthSession>())!);
            }
            else
            {
                Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            }

            response.Dispose();
        }

        Assert.True(successes.Count <= 1, $"expected at most one successful rotation, got {successes.Count}");

        foreach (var winner in successes)
        {
            using var followUp = await client.PostAsJsonAsync("/api/auth/refresh", new RefreshSessionCommand(winner.RefreshToken));
            Assert.Equal(HttpStatusCode.Unauthorized, followUp.StatusCode);
        }

        using var original = await client.PostAsJsonAsync("/api/auth/refresh", command);
        Assert.Equal(HttpStatusCode.Unauthorized, original.StatusCode);
    }

    [Fact]
    public async Task Sequential_rotation_chain_keeps_exactly_one_live_token()
    {
        using var client = factory.CreateClient();
        var current = await client.RegisterAsync(AuthTestClient.UniqueEmail("chain"));
        var seen = new List<string> { current.RefreshToken };

        for (var round = 0; round < 3; round++)
        {
            using var response = await client.PostAsJsonAsync("/api/auth/refresh", new RefreshSessionCommand(current.RefreshToken));
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            current = (await response.Content.ReadFromJsonAsync<AuthSession>())!;
            seen.Add(current.RefreshToken);
        }

        Assert.Equal(seen.Count, seen.Distinct(StringComparer.Ordinal).Count());

        // The newest token still works; profile access proves the access token is valid too.
        using var profile = await client.WithBearer(current.AccessToken).GetAsync("/api/profile");
        Assert.Equal(HttpStatusCode.OK, profile.StatusCode);
    }
}
