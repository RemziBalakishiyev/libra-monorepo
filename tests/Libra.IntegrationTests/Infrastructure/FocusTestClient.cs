using System.Net.Http.Json;
using Libra.Application.Focus;
using Libra.Domain.Focus;

namespace Libra.IntegrationTests.Infrastructure;

/// <summary>Thin HTTP helpers for the focus suite. Every call goes through the public API.</summary>
internal static class FocusTestClient
{
    public const string Sessions = "/api/focus/sessions";
    public const string Summary = "/api/focus/summary";

    /// <summary>Registers a fresh user and returns a client carrying its bearer token.</summary>
    public static async Task<HttpClient> NewFocusUserAsync(this LibraApiFactory factory, string prefix = "focus")
    {
        var client = factory.CreateClient();
        var session = await client.RegisterAsync(AuthTestClient.UniqueEmail(prefix));
        return client.WithBearer(session.AccessToken);
    }

    /// <summary>One uninterrupted run ending at <paramref name="endedAt"/>.</summary>
    public static SaveFocusSessionCommand Run(
        Guid clientSessionId,
        DateTimeOffset endedAt,
        int minutes = 25,
        FocusOutcome outcome = FocusOutcome.Completed,
        Guid? taskId = null,
        string? taskTitle = null,
        int? activeMinutes = null) =>
        new(
            clientSessionId,
            taskId,
            taskTitle,
            minutes * 60,
            [new FocusIntervalInput(endedAt.AddMinutes(-(activeMinutes ?? minutes)), endedAt)],
            outcome);

    public static Task<HttpResponseMessage> PostSessionAsync(this HttpClient client, SaveFocusSessionCommand command) =>
        client.PostAsJsonAsync(Sessions, command);

    public static async Task<FocusSessionResponse> SaveAsync(this HttpClient client, SaveFocusSessionCommand command)
    {
        using var response = await client.PostSessionAsync(command);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<FocusSessionResponse>())!;
    }

    public static async Task<FocusSummaryResponse> FocusSummaryAsync(this HttpClient client, DateOnly? date = null)
    {
        var url = date is DateOnly value ? $"{Summary}?date={value:yyyy-MM-dd}" : Summary;
        return (await client.GetFromJsonAsync<FocusSummaryResponse>(url))!;
    }
}
