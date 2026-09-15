using System.Net;
using System.Net.Http.Json;
using Libra.Application.Sleep;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Sleep;

/// <summary>
/// Recording a night after the fact, correcting one, and the rules that keep the history coherent: no
/// overlapping intervals, adjacent ones allowed, and a stale correction refused rather than applied.
/// </summary>
[Collection(LibraApiCollection.Name)]
public sealed class SleepHistoryTests(LibraApiFactory factory)
{
    private static DateTimeOffset Ago(double hours) => DateTimeOffset.UtcNow.AddHours(-hours);

    [Fact]
    public async Task A_manually_recorded_night_is_complete_from_the_start()
    {
        using var client = await factory.NewSleepUserAsync("h-manual");

        var session = await client.RecordAsync(Ago(9), Ago(1), quality: 4, note: "  yaxşı yatdım  ");

        Assert.False(session.IsOpen);
        Assert.Equal(480, session.DurationMinutes);
        Assert.Equal(4, session.Quality);
        Assert.Equal("yaxşı yatdım", session.Note);
        Assert.NotNull(session.WakeDate);
        // It is history, not a running session.
        Assert.Null(await client.ActiveAsync());
    }

    [Fact]
    public async Task A_rating_is_optional()
    {
        using var client = await factory.NewSleepUserAsync("h-norating");

        var session = await client.RecordAsync(Ago(8), Ago(1));

        Assert.Null(session.Quality);
        Assert.Null(session.Note);
        Assert.Equal(420, session.DurationMinutes);
    }

    [Fact]
    public async Task A_rating_can_be_added_after_the_fact_without_touching_the_interval()
    {
        using var client = await factory.NewSleepUserAsync("h-rate-later");
        var session = await client.StartAsync(Ago(8));
        var stopped = await client.StopAsync(session.Id, Ago(1));

        using var response = await client.PutSessionAsync(stopped, quality: 5, note: "dincəldim");
        response.EnsureSuccessStatusCode();
        var rated = (await response.Content.ReadFromJsonAsync<SleepSessionResponse>())!;

        Assert.Equal(5, rated.Quality);
        Assert.Equal("dincəldim", rated.Note);
        Assert.Equal(stopped.StartedAtUtc, rated.StartedAtUtc);
        Assert.Equal(stopped.EndedAtUtc, rated.EndedAtUtc);
        Assert.Equal(stopped.DurationMinutes, rated.DurationMinutes);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(6)]
    public async Task A_rating_outside_one_to_five_is_refused(int quality)
    {
        using var client = await factory.NewSleepUserAsync("h-quality");

        using var response = await client.PostSessionAsync(Ago(9), Ago(1), quality);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, (await client.HistoryAsync()).TotalCount);
    }

    [Fact]
    public async Task An_interval_that_ends_before_it_starts_is_refused()
    {
        using var client = await factory.NewSleepUserAsync("h-order");

        var instant = Ago(5);
        using var backwards = await client.PostSessionAsync(Ago(1), Ago(9));
        using var identical = await client.PostSessionAsync(instant, instant);

        Assert.Equal(HttpStatusCode.BadRequest, backwards.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, identical.StatusCode);
    }

    [Fact]
    public async Task A_future_interval_is_refused()
    {
        using var client = await factory.NewSleepUserAsync("h-future");

        using var response = await client.PostSessionAsync(DateTimeOffset.UtcNow.AddHours(1), DateTimeOffset.UtcNow.AddHours(3));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task A_night_longer_than_the_documented_limit_is_refused()
    {
        using var client = await factory.NewSleepUserAsync("h-toolong");

        using var response = await client.PostSessionAsync(Ago(30), Ago(1));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, (await client.HistoryAsync()).TotalCount);
    }

    [Fact]
    public async Task Two_nights_that_meet_at_one_instant_are_adjacent_not_overlapping()
    {
        using var client = await factory.NewSleepUserAsync("h-adjacent");
        var boundary = Ago(6);

        await client.RecordAsync(Ago(12), boundary);
        var second = await client.RecordAsync(boundary, Ago(1));

        Assert.Equal(300, second.DurationMinutes);
        Assert.Equal(2, (await client.HistoryAsync()).TotalCount);
    }

    [Fact]
    public async Task An_overlapping_night_is_refused()
    {
        using var client = await factory.NewSleepUserAsync("h-overlap");
        await client.RecordAsync(Ago(10), Ago(4));

        using var inside = await client.PostSessionAsync(Ago(8), Ago(6));
        using var straddling = await client.PostSessionAsync(Ago(5), Ago(1));

        Assert.Equal(HttpStatusCode.Conflict, inside.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, straddling.StatusCode);
        Assert.Equal(1, (await client.HistoryAsync()).TotalCount);
    }

    [Fact]
    public async Task Concurrent_writes_of_overlapping_nights_leave_only_one()
    {
        using var client = await factory.NewSleepUserAsync("h-overlap-race");
        var start = Ago(10);
        var end = Ago(2);

        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(index =>
            client.PostSessionAsync(start.AddMinutes(index * 5), end.AddMinutes(-index * 5))));

        var created = 0;
        foreach (var response in responses)
        {
            Assert.True(
                response.StatusCode is HttpStatusCode.Created or HttpStatusCode.Conflict,
                $"A concurrent overlapping write answered {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
            if (response.StatusCode == HttpStatusCode.Created)
            {
                created += 1;
            }

            response.Dispose();
        }

        // The exclusion constraint is what makes this true when the application checks all pass at once.
        Assert.Equal(1, created);
        Assert.Equal(1, (await client.HistoryAsync()).TotalCount);
    }

    [Fact]
    public async Task A_correction_that_would_overlap_another_night_is_refused()
    {
        using var client = await factory.NewSleepUserAsync("h-correct-overlap");
        await client.RecordAsync(Ago(20), Ago(14));
        var later = await client.RecordAsync(Ago(10), Ago(2));

        using var response = await client.PutSessionAsync(later, startedAt: Ago(16));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var stored = await client.HistoryAsync();
        Assert.Equal(Ago(10).UtcDateTime.Minute, stored.Items.Single(item => item.Id == later.Id).StartedAtUtc.Minute);
    }

    [Fact]
    public async Task A_correction_from_a_stale_read_is_refused_instead_of_overwriting()
    {
        using var client = await factory.NewSleepUserAsync("h-stale");
        var session = await client.RecordAsync(Ago(9), Ago(1), quality: 3);

        using (var winner = await client.PutSessionAsync(session, quality: 5))
        {
            winner.EnsureSuccessStatusCode();
        }

        // The stale client still holds the version it read before that.
        using var loser = await client.PutSessionAsync(session, quality: 1);

        Assert.Equal(HttpStatusCode.Conflict, loser.StatusCode);
        Assert.Equal("application/problem+json", loser.Content.Headers.ContentType?.MediaType);
        var stored = (await client.HistoryAsync()).Items.Single();
        Assert.Equal(5, stored.Quality);
    }

    [Fact]
    public async Task A_correction_may_reopen_nothing_but_may_leave_a_session_open()
    {
        using var client = await factory.NewSleepUserAsync("h-keep-open");
        var session = await client.StartAsync(Ago(30));

        using var response = await client.PutSessionAsync(session, startedAt: Ago(9), clearEnd: true);
        response.EnsureSuccessStatusCode();
        var corrected = (await response.Content.ReadFromJsonAsync<SleepSessionResponse>())!;

        Assert.True(corrected.IsOpen);
        Assert.Null(corrected.DurationMinutes);
        Assert.NotNull(await client.ActiveAsync());
    }

    [Fact]
    public async Task History_is_newest_first_and_pages()
    {
        using var client = await factory.NewSleepUserAsync("h-paging");
        for (var night = 1; night <= 12; night++)
        {
            await client.RecordAsync(Ago(night * 24 + 8), Ago(night * 24));
        }

        var first = await client.HistoryAsync(pageNumber: 1, pageSize: 5);
        var second = await client.HistoryAsync(pageNumber: 2, pageSize: 5);

        Assert.Equal(12, first.TotalCount);
        Assert.Equal(5, first.Items.Count);
        Assert.True(first.Items[0].StartedAtUtc > first.Items[^1].StartedAtUtc);
        Assert.True(first.Items[^1].StartedAtUtc > second.Items[0].StartedAtUtc);
        Assert.Empty(first.Items.Select(item => item.Id).Intersect(second.Items.Select(item => item.Id)));
    }

    [Fact]
    public async Task Deleting_a_night_removes_it_from_the_history()
    {
        using var client = await factory.NewSleepUserAsync("h-delete");
        var session = await client.RecordAsync(Ago(9), Ago(1));

        using (var deleted = await client.DeleteSessionAsync(session.Id))
        {
            Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        }

        Assert.Equal(0, (await client.HistoryAsync()).TotalCount);
        using var missing = await client.GetAsync($"{SleepTestClient.Sessions}/{session.Id}");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [Fact]
    public async Task A_retried_manual_record_returns_the_first_night()
    {
        using var client = await factory.NewSleepUserAsync("h-idempotent");
        var requestId = Guid.NewGuid();
        var start = Ago(9);
        var end = Ago(1);

        var first = await client.RecordAsync(start, end, clientRequestId: requestId);
        using var repeat = await client.PostSessionAsync(start, end, clientRequestId: requestId);

        Assert.Equal(HttpStatusCode.OK, repeat.StatusCode);
        Assert.Equal(first.Id, (await repeat.Content.ReadFromJsonAsync<SleepSessionResponse>())!.Id);
        Assert.Equal(1, (await client.HistoryAsync()).TotalCount);
    }
}
