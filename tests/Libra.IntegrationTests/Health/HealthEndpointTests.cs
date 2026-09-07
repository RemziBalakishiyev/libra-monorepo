using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Health;

[Collection(LibraApiCollection.Name)]
public sealed class HealthEndpointTests(LibraApiFactory factory)
{
    [Fact]
    public async Task Live_returns_healthy_without_touching_dependencies()
    {
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/health/live");
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", body.GetProperty("status").GetString());
        Assert.Empty(body.GetProperty("checks").EnumerateArray());
    }

    [Fact]
    public async Task Ready_returns_healthy_when_postgres_is_reachable()
    {
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/health/ready");
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", body.GetProperty("status").GetString());

        var checks = body.GetProperty("checks").EnumerateArray().ToArray();
        var postgres = Assert.Single(checks);
        Assert.Equal("postgresql", postgres.GetProperty("name").GetString());
        Assert.Equal("Healthy", postgres.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Unknown_route_returns_problem_details()
    {
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/does-not-exist");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }
}
