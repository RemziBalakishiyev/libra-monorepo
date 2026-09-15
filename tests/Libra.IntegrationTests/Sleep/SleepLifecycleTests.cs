using System.Net;
using System.Net.Http.Json;
using Libra.Application.Sleep;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Sleep;

/// <summary>
/// Starting and stopping a night. The invariants: one running session at a time even under concurrent requests,
/// a retried start that produces no second night, and a stop that names the session it closes.
/// </summary>
[Collection(LibraApiCollection.Name)]
public sealed class SleepLifecycleTests(LibraApiFactory factory)
{
    [Fact]
    public async Task A_started_session_is_open_and_is_what_the_app_restores()
    {
        using var client = await factory.NewSleepUserAsync("s-start");

        var started = await client.StartAsync();

        Assert.True(started.IsOpen);
        Assert.Null(started.EndedAtUtc);
        Assert.Null(started.DurationMinutes);
        Assert.Null(started.WakeDate);

        // A fresh client — as after an app restart — finds the same running session.
        var restored = await client.ActiveAsync();
        Assert.NotNull(restored);
        Assert.Equal(started.Id, restored!.Id);
        Assert.Equal(started.StartedAtUtc, restored.StartedAtUtc);
    }

    [Fact]
    public async Task With_nothing_running_the_active_endpoint_says_so_without_an_error()
    {
        using var client = await factory.NewSleepUserAsync("s-none");

        using var response = await client.GetAsync(SleepTestClient.Active);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Null(await client.ActiveAsync());
    }

    [Fact]
    public async Task A_second_start_while_one_is_running_is_refused()
    {
        using var client = await factory.NewSleepUserAsync("s-second");
        await client.StartAsync();

        using var response = await client.PostStartAsync();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Concurrent_starts_leave_exactly_one_running_session()
    {
        using var client = await factory.NewSleepUserAsync("s-race");

        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => client.PostStartAsync()));

        var created = 0;
        foreach (var response in responses)
        {
            Assert.True(
                response.StatusCode is HttpStatusCode.Created or HttpStatusCode.OK or HttpStatusCode.Conflict,
                $"A concurrent start answered {(int)response.StatusCode}.");
            if (response.StatusCode == HttpStatusCode.Created)
            {
                created += 1;
            }

            response.Dispose();
        }

        // The database's partial unique index is the referee: exactly one night began.
        Assert.Equal(1, created);
        Assert.NotNull(await client.ActiveAsync());
        Assert.Equal(1, (await client.HistoryAsync()).TotalCount);
    }

    [Fact]
    public async Task A_retried_start_returns_the_first_session_instead_of_a_second_one()
    {
        using var client = await factory.NewSleepUserAsync("s-idempotent");
        var requestId = Guid.NewGuid();

        var first = await client.StartAsync(clientRequestId: requestId);
        using var repeat = await client.PostStartAsync(clientRequestId: requestId);

        Assert.Equal(HttpStatusCode.OK, repeat.StatusCode);
        var replayed = (await repeat.Content.ReadFromJsonAsync<SleepSessionResponse>())!;
        Assert.Equal(first.Id, replayed.Id);
        Assert.Equal(first.StartedAtUtc, replayed.StartedAtUtc);
        Assert.Equal(1, (await client.HistoryAsync()).TotalCount);
    }

    [Fact]
    public async Task Concurrent_retries_of_one_start_produce_one_session()
    {
        using var client = await factory.NewSleepUserAsync("s-idem-race");
        var requestId = Guid.NewGuid();

        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => client.PostStartAsync(clientRequestId: requestId)));

        var ids = new List<Guid>();
        foreach (var response in responses)
        {
            Assert.True(response.StatusCode is HttpStatusCode.Created or HttpStatusCode.OK, $"A concurrent retry answered {(int)response.StatusCode}.");
            ids.Add((await response.Content.ReadFromJsonAsync<SleepSessionResponse>())!.Id);
            response.Dispose();
        }

        Assert.Single(ids.Distinct());
        Assert.Equal(1, (await client.HistoryAsync()).TotalCount);
    }

    [Fact]
    public async Task Stopping_records_the_wake_moment_the_client_captured()
    {
        using var client = await factory.NewSleepUserAsync("s-stop");
        var startedAt = DateTimeOffset.UtcNow.AddHours(-8);
        var wokeAt = DateTimeOffset.UtcNow.AddMinutes(-30);
        var session = await client.StartAsync(startedAt);

        var stopped = await client.StopAsync(session.Id, wokeAt);

        Assert.False(stopped.IsOpen);
        Assert.Equal(session.Id, stopped.Id);
        // The duration is the distance between the two instants, not the time the request took to arrive.
        Assert.Equal(450, stopped.DurationMinutes);
        Assert.NotNull(stopped.WakeDate);
        Assert.Null(await client.ActiveAsync());
    }

    [Fact]
    public async Task A_repeated_stop_returns_the_same_night_without_moving_its_end()
    {
        using var client = await factory.NewSleepUserAsync("s-stop-retry");
        var wokeAt = DateTimeOffset.UtcNow.AddMinutes(-20);
        var session = await client.StartAsync(DateTimeOffset.UtcNow.AddHours(-7));

        var first = await client.StopAsync(session.Id, wokeAt);
        // A retry after a lost answer carries the same captured instant.
        var second = await client.StopAsync(session.Id, wokeAt);
        // Even a much later retry cannot stretch the night.
        var third = await client.StopAsync(session.Id, DateTimeOffset.UtcNow);

        Assert.Equal(first.EndedAtUtc, second.EndedAtUtc);
        Assert.Equal(first.EndedAtUtc, third.EndedAtUtc);
        Assert.Equal(first.DurationMinutes, third.DurationMinutes);
    }

    [Fact]
    public async Task Concurrent_stops_of_one_session_agree_on_the_same_end()
    {
        using var client = await factory.NewSleepUserAsync("s-stop-race");
        var wokeAt = DateTimeOffset.UtcNow.AddMinutes(-10);
        var session = await client.StartAsync(DateTimeOffset.UtcNow.AddHours(-6));

        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => client.PostStopAsync(session.Id, wokeAt)));

        var ends = new List<DateTime?>();
        foreach (var response in responses)
        {
            Assert.True(response.StatusCode is HttpStatusCode.OK or HttpStatusCode.Conflict, $"A concurrent stop answered {(int)response.StatusCode}.");
            if (response.StatusCode == HttpStatusCode.OK)
            {
                ends.Add((await response.Content.ReadFromJsonAsync<SleepSessionResponse>())!.EndedAtUtc);
            }

            response.Dispose();
        }

        Assert.Single(ends.Distinct());
        Assert.Null(await client.ActiveAsync());
    }

    [Fact]
    public async Task A_late_stop_cannot_close_a_newer_session()
    {
        using var client = await factory.NewSleepUserAsync("s-stop-target");
        var first = await client.StartAsync(DateTimeOffset.UtcNow.AddHours(-9));
        await client.StopAsync(first.Id, DateTimeOffset.UtcNow.AddHours(-2));
        var second = await client.StartAsync(DateTimeOffset.UtcNow.AddMinutes(-30));

        // A retry of the *first* stop arrives now; it names the night it belongs to.
        var replayed = await client.StopAsync(first.Id, DateTimeOffset.UtcNow);

        Assert.Equal(first.Id, replayed.Id);
        var running = await client.ActiveAsync();
        Assert.NotNull(running);
        Assert.Equal(second.Id, running!.Id);
        Assert.True(running.IsOpen);
    }

    [Fact]
    public async Task Stopping_before_the_session_started_is_refused()
    {
        using var client = await factory.NewSleepUserAsync("s-stop-invalid");
        var session = await client.StartAsync(DateTimeOffset.UtcNow.AddHours(-2));

        using var response = await client.PostStopAsync(session.Id, DateTimeOffset.UtcNow.AddHours(-3));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.NotNull(await client.ActiveAsync());
    }

    [Fact]
    public async Task A_forgotten_session_stays_open_and_is_fixed_by_correcting_it()
    {
        using var client = await factory.NewSleepUserAsync("s-forgotten");
        var session = await client.StartAsync(DateTimeOffset.UtcNow.AddDays(-3));

        // Closing it now would be a 3-day night: refused rather than clipped to something invented.
        using (var refused = await client.PostStopAsync(session.Id, DateTimeOffset.UtcNow))
        {
            Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        }

        var stillOpen = await client.ActiveAsync();
        Assert.NotNull(stillOpen);
        Assert.True(stillOpen!.IsOpen);

        // The way out is a correction the user chose.
        using var corrected = await client.PutSessionAsync(stillOpen, startedAt: DateTimeOffset.UtcNow.AddHours(-8), endedAt: DateTimeOffset.UtcNow);
        corrected.EnsureSuccessStatusCode();
        var fixedSession = (await corrected.Content.ReadFromJsonAsync<SleepSessionResponse>())!;
        Assert.False(fixedSession.IsOpen);
        Assert.Equal(480, fixedSession.DurationMinutes);
    }

    [Fact]
    public async Task A_forgotten_session_can_also_simply_be_discarded()
    {
        using var client = await factory.NewSleepUserAsync("s-discard");
        var session = await client.StartAsync(DateTimeOffset.UtcNow.AddDays(-2));

        using (var deleted = await client.DeleteSessionAsync(session.Id))
        {
            Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        }

        Assert.Null(await client.ActiveAsync());
        Assert.Equal(0, (await client.HistoryAsync()).TotalCount);
    }
}
