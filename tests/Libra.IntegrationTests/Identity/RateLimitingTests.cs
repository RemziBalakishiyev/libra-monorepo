using System.Net;
using System.Net.Http.Json;
using Libra.Application.Identity.Login;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Identity;

[Collection(LibraApiCollection.Name)]
public sealed class RateLimitingTests(LibraApiFactory factory)
{
    [Fact]
    public async Task Login_is_rate_limited_per_client_with_problem_details()
    {
        // A derived host gets its own limiter state, so the low limit cannot affect the other tests.
        using var limitedFactory = factory.WithWebHostBuilder(builder =>
            builder.UseSetting("RateLimiting:Login:PermitLimit", "3"));
        using var client = limitedFactory.CreateClient();
        var command = new LoginCommand(AuthTestClient.UniqueEmail("limited"), AuthTestClient.DefaultPassword);

        for (var attempt = 0; attempt < 3; attempt++)
        {
            using var allowed = await client.PostAsJsonAsync("/api/auth/login", command);
            Assert.Equal(HttpStatusCode.Unauthorized, allowed.StatusCode);
        }

        using var rejected = await client.PostAsJsonAsync("/api/auth/login", command);

        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
        Assert.Equal("application/problem+json", rejected.Content.Headers.ContentType?.MediaType);
        Assert.True(rejected.Headers.Contains("Retry-After"));
    }
}
