using System.Net;
using System.Net.Http.Json;
using Libra.Application.Focus;
using Libra.Domain.Focus;
using Libra.IntegrationTests.Infrastructure;

namespace Libra.IntegrationTests.Focus;

/// <summary>
/// Saving focus history through the API: the idempotency an offline outbox depends on, the ownership rules,
/// and the payloads the server refuses rather than reshaping into a total that would be wrong.
/// </summary>
[Collection(LibraApiCollection.Name)]
public sealed class FocusHistoryTests(LibraApiFactory factory)
{
    private static DateTimeOffset Ago(double minutes) => DateTimeOffset.UtcNow.AddMinutes(-minutes);

    [Fact]
    public async Task A_completed_run_is_stored_with_the_time_it_actually_ran()
    {
        using var client = await factory.NewFocusUserAsync("f-save");
        var clientId = Guid.CreateVersion7();

        var saved = await client.SaveAsync(FocusTestClient.Run(clientId, Ago(1)));

        Assert.Equal(clientId, saved.ClientSessionId);
        Assert.Equal(25 * 60, saved.ActiveSeconds);
        Assert.Equal(25 * 60, saved.ConfiguredSeconds);
        Assert.Equal(FocusOutcome.Completed, saved.Outcome);
        Assert.Null(saved.TaskId);
    }

    [Fact]
    public async Task Uploading_the_same_run_twice_returns_the_same_record_and_never_inflates_a_total()
    {
        using var client = await factory.NewFocusUserAsync("f-idem");
        var clientId = Guid.CreateVersion7();
        var command = FocusTestClient.Run(clientId, Ago(1));

        using var first = await client.PostSessionAsync(command);
        using var second = await client.PostSessionAsync(command);

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        // The retry is answered with the record that already exists, not a second creation.
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        var a = (await first.Content.ReadFromJsonAsync<FocusSessionResponse>())!;
        var b = (await second.Content.ReadFromJsonAsync<FocusSessionResponse>())!;
        Assert.Equal(a.Id, b.Id);

        var summary = await client.FocusSummaryAsync();
        Assert.Equal(1, summary.Today.CompletedSessions);
        Assert.Equal(25 * 60, summary.Today.ActiveSeconds);
    }

    [Fact]
    public async Task Concurrent_uploads_of_one_run_settle_on_a_single_row()
    {
        using var client = await factory.NewFocusUserAsync("f-race");
        var command = FocusTestClient.Run(Guid.CreateVersion7(), Ago(1));

        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => client.PostSessionAsync(command)));
        try
        {
            var ids = new List<Guid>();
            foreach (var response in responses)
            {
                response.EnsureSuccessStatusCode();
                ids.Add((await response.Content.ReadFromJsonAsync<FocusSessionResponse>())!.Id);
            }

            Assert.Single(ids.Distinct());
            Assert.Single(responses, response => response.StatusCode == HttpStatusCode.Created);
        }
        finally
        {
            foreach (var response in responses)
            {
                response.Dispose();
            }
        }
    }

    [Fact]
    public async Task One_users_run_is_invisible_to_another_and_never_counted_for_them()
    {
        using var mine = await factory.NewFocusUserAsync("f-mine");
        using var theirs = await factory.NewFocusUserAsync("f-theirs");
        var clientId = Guid.CreateVersion7();

        await mine.SaveAsync(FocusTestClient.Run(clientId, Ago(1)));
        // The same client id under another account is a different run, not a replay of mine.
        var other = await theirs.SaveAsync(FocusTestClient.Run(clientId, Ago(1), minutes: 15));

        Assert.Equal(15 * 60, other.ActiveSeconds);
        var mySummary = await mine.FocusSummaryAsync();
        var theirSummary = await theirs.FocusSummaryAsync();
        Assert.Equal(25 * 60, mySummary.Today.ActiveSeconds);
        Assert.Equal(15 * 60, theirSummary.Today.ActiveSeconds);
    }

    [Fact]
    public async Task A_run_links_to_the_callers_task_and_takes_its_stored_title()
    {
        using var client = await factory.NewFocusUserAsync("f-link");
        var task = await client.AddTaskAsync("Hesabatı yaz");

        var saved = await client.SaveAsync(FocusTestClient.Run(Guid.CreateVersion7(), Ago(1), taskId: task.Id, taskTitle: "köhnə ad"));

        Assert.Equal(task.Id, saved.TaskId);
        // The device's snapshot is a fallback; the stored title is the truthful one.
        Assert.Equal("Hesabatı yaz", saved.TaskTitle);
    }

    [Fact]
    public async Task A_task_belonging_to_someone_else_is_treated_exactly_like_one_that_does_not_exist()
    {
        using var mine = await factory.NewFocusUserAsync("f-foreign");
        using var theirs = await factory.NewFocusUserAsync("f-foreign-owner");
        var foreign = await theirs.AddTaskAsync("Başqasının işi");

        var saved = await mine.SaveAsync(FocusTestClient.Run(Guid.CreateVersion7(), Ago(1), taskId: foreign.Id, taskTitle: "Mənim işim"));

        // The run is kept — the time was really spent — but it is not attached to another account's task.
        Assert.Null(saved.TaskId);
        Assert.Equal("Mənim işim", saved.TaskTitle);
    }

    [Fact]
    public async Task Deleting_the_linked_task_keeps_the_focus_history()
    {
        using var client = await factory.NewFocusUserAsync("f-orphan");
        var task = await client.AddTaskAsync("Silinəcək iş");
        await client.SaveAsync(FocusTestClient.Run(Guid.CreateVersion7(), Ago(1), taskId: task.Id));

        using var deleted = await client.DeleteAsync($"/api/tasks/{task.Id}");
        deleted.EnsureSuccessStatusCode();

        var summary = await client.FocusSummaryAsync();
        Assert.Equal(25 * 60, summary.Today.ActiveSeconds);
        Assert.Equal(1, summary.Today.CompletedSessions);
    }

    [Fact]
    public async Task A_completed_claim_shorter_than_its_configured_duration_is_refused()
    {
        using var client = await factory.NewFocusUserAsync("f-short");

        using var response = await client.PostSessionAsync(
            FocusTestClient.Run(Guid.CreateVersion7(), Ago(1), minutes: 25, activeMinutes: 9));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Overlapping_intervals_are_refused_rather_than_counted_twice()
    {
        using var client = await factory.NewFocusUserAsync("f-overlap");
        var end = Ago(1);
        var command = new SaveFocusSessionCommand(
            Guid.CreateVersion7(),
            null,
            null,
            25 * 60,
            [new FocusIntervalInput(end.AddMinutes(-30), end.AddMinutes(-10)), new FocusIntervalInput(end.AddMinutes(-15), end)],
            FocusOutcome.Stopped);

        using var response = await client.PostSessionAsync(command);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(30)]
    [InlineData(5 * 60 * 60)]
    public async Task A_configured_duration_outside_the_allowed_range_is_a_validation_error(int seconds)
    {
        using var client = await factory.NewFocusUserAsync("f-range");
        var command = FocusTestClient.Run(Guid.CreateVersion7(), Ago(1), outcome: FocusOutcome.Stopped) with { ConfiguredSeconds = seconds };

        using var response = await client.PostSessionAsync(command);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task A_run_with_no_interval_is_a_validation_error()
    {
        using var client = await factory.NewFocusUserAsync("f-empty");
        var command = new SaveFocusSessionCommand(Guid.CreateVersion7(), null, null, 25 * 60, [], FocusOutcome.Stopped);

        using var response = await client.PostSessionAsync(command);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Saving_needs_a_signed_in_caller()
    {
        using var anonymous = factory.CreateClient();

        using var response = await anonymous.PostSessionAsync(FocusTestClient.Run(Guid.CreateVersion7(), Ago(1)));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
