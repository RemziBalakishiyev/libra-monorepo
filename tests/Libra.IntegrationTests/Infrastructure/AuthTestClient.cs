using System.Net.Http.Headers;
using System.Net.Http.Json;
using Libra.Application.Identity;
using Libra.Application.Identity.Login;
using Libra.Application.Identity.Register;

namespace Libra.IntegrationTests.Infrastructure;

internal static class AuthTestClient
{
    public const string DefaultPassword = "correct horse battery";

    public static string UniqueEmail(string prefix = "user") =>
        $"{prefix}-{Guid.NewGuid():N}@example.com";

    public static async Task<AuthSession> RegisterAsync(this HttpClient client, string email, string password = DefaultPassword, string? displayName = null)
    {
        using var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterCommand(email, password, displayName));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<AuthSession>())!;
    }

    public static async Task<AuthSession> LoginAsync(this HttpClient client, string email, string password = DefaultPassword)
    {
        using var response = await client.PostAsJsonAsync("/api/auth/login", new LoginCommand(email, password));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<AuthSession>())!;
    }

    public static HttpClient WithBearer(this HttpClient client, string accessToken)
    {
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return client;
    }
}
