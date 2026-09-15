using System.Net;
using System.Net.Http.Json;
using Libra.Application.Common;
using Libra.Application.Sleep;

namespace Libra.IntegrationTests.Infrastructure;

/// <summary>Thin HTTP helpers for the sleep suite. Every call goes through the public API.</summary>
internal static class SleepTestClient
{
    public const string Sleep = "/api/sleep";
    public const string Active = "/api/sleep/active";
    public const string Summary = "/api/sleep/summary";
    public const string Sessions = "/api/sleep/sessions";

    /// <summary>Registers a fresh user and returns a client carrying its bearer token.</summary>
    public static async Task<HttpClient> NewSleepUserAsync(this LibraApiFactory factory, string prefix = "sleep")
    {
        var client = factory.CreateClient();
        var session = await client.RegisterAsync(AuthTestClient.UniqueEmail(prefix));
        return client.WithBearer(session.AccessToken);
    }

    public static Task<HttpResponseMessage> PostStartAsync(this HttpClient client, DateTimeOffset? startedAt = null, Guid? clientRequestId = null) =>
        client.PostAsJsonAsync($"{Sleep}/start", new StartSleepCommand(startedAt, clientRequestId));

    public static async Task<SleepSessionResponse> StartAsync(this HttpClient client, DateTimeOffset? startedAt = null, Guid? clientRequestId = null)
    {
        using var response = await client.PostStartAsync(startedAt, clientRequestId);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<SleepSessionResponse>())!;
    }

    /// <summary>The running session, or null when the API answers 204.</summary>
    public static async Task<SleepSessionResponse?> ActiveAsync(this HttpClient client)
    {
        using var response = await client.GetAsync(Active);
        response.EnsureSuccessStatusCode();
        return response.StatusCode == HttpStatusCode.NoContent ? null : await response.Content.ReadFromJsonAsync<SleepSessionResponse>();
    }

    public static Task<HttpResponseMessage> PostStopAsync(this HttpClient client, Guid id, DateTimeOffset? endedAt = null) =>
        client.PostAsJsonAsync($"{Sessions}/{id}/stop", new StopSleepCommand(endedAt));

    public static async Task<SleepSessionResponse> StopAsync(this HttpClient client, Guid id, DateTimeOffset? endedAt = null)
    {
        using var response = await client.PostStopAsync(id, endedAt);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<SleepSessionResponse>())!;
    }

    public static Task<HttpResponseMessage> PostSessionAsync(this HttpClient client, DateTimeOffset startedAt, DateTimeOffset endedAt, int? quality = null, string? note = null, Guid? clientRequestId = null) =>
        client.PostAsJsonAsync(Sessions, new RecordSleepCommand(startedAt, endedAt, quality, note, clientRequestId));

    public static async Task<SleepSessionResponse> RecordAsync(this HttpClient client, DateTimeOffset startedAt, DateTimeOffset endedAt, int? quality = null, string? note = null, Guid? clientRequestId = null)
    {
        using var response = await client.PostSessionAsync(startedAt, endedAt, quality, note, clientRequestId);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<SleepSessionResponse>())!;
    }

    public static Task<HttpResponseMessage> PutSessionAsync(
        this HttpClient client,
        SleepSessionResponse session,
        DateTimeOffset? startedAt = null,
        DateTimeOffset? endedAt = null,
        bool clearEnd = false,
        int? quality = null,
        string? note = null,
        DateTime? expectedUpdatedAtUtc = null)
    {
        ArgumentNullException.ThrowIfNull(session);
        var command = new CorrectSleepCommand(
            startedAt ?? new DateTimeOffset(session.StartedAtUtc, TimeSpan.Zero),
            clearEnd ? null : endedAt ?? (session.EndedAtUtc is DateTime ended ? new DateTimeOffset(ended, TimeSpan.Zero) : null),
            quality ?? session.Quality,
            note ?? session.Note,
            expectedUpdatedAtUtc ?? session.UpdatedAtUtc);
        return client.PutAsJsonAsync($"{Sessions}/{session.Id}", command);
    }

    public static Task<HttpResponseMessage> DeleteSessionAsync(this HttpClient client, Guid id) => client.DeleteAsync($"{Sessions}/{id}");

    public static async Task<PagedResponse<SleepSessionResponse>> HistoryAsync(this HttpClient client, int pageNumber = 1, int pageSize = 20) =>
        (await client.GetFromJsonAsync<PagedResponse<SleepSessionResponse>>($"{Sessions}?pageNumber={pageNumber}&pageSize={pageSize}"))!;

    public static async Task<SleepSummaryResponse> SummaryAsync(this HttpClient client, DateOnly? date = null) =>
        (await client.GetFromJsonAsync<SleepSummaryResponse>(date is null ? Summary : $"{Summary}?date={date:yyyy-MM-dd}"))!;
}
