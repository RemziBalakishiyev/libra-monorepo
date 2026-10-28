using Libra.Domain.Focus;
using Libra.Domain.Identity;
using Libra.Domain.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Libra.Infrastructure.Persistence.Configurations.Focus;

internal sealed class FocusSessionConfiguration : IEntityTypeConfiguration<FocusSession>
{
    public void Configure(EntityTypeBuilder<FocusSession> builder)
    {
        builder.ToTable("focus_sessions", table =>
        {
            table.HasCheckConstraint("ck_focus_sessions_interval", "ended_at_utc > started_at_utc");
            table.HasCheckConstraint("ck_focus_sessions_configured", "configured_duration >= INTERVAL '1 minute' AND configured_duration <= INTERVAL '4 hours'");
            // Active time is what the timer actually ran for: never negative, and never more than the wall
            // clock the run occupied. The second of slack absorbs rounding at storage precision.
            table.HasCheckConstraint(
                "ck_focus_sessions_active",
                "active_duration > INTERVAL '0' AND active_duration <= (ended_at_utc - started_at_utc) + INTERVAL '1 second'");
        });

        builder.HasKey(session => session.Id);
        builder.Property(session => session.Id).ValueGeneratedNever();

        builder.Property(session => session.ClientSessionId).IsRequired();
        builder.Property(session => session.TaskTitle).HasMaxLength(FocusSession.TaskTitleMaxLength);
        builder.Property(session => session.ConfiguredDuration).IsRequired();
        builder.Property(session => session.StartedAtUtc).IsRequired();
        builder.Property(session => session.EndedAtUtc).IsRequired();
        builder.Property(session => session.ActiveDuration).IsRequired();
        builder.Property(session => session.Outcome).IsRequired();
        builder.Property(session => session.CreatedAtUtc).IsRequired();
        builder.Ignore(session => session.IsCompleted);

        // The intervals travel with the run and are only ever read with it, so they live in the row itself
        // rather than in a child table nothing else joins to.
        builder.OwnsMany(session => session.Intervals, intervals =>
        {
            intervals.ToJson("active_intervals");
            intervals.Property(interval => interval.StartedAtUtc).HasJsonPropertyName("started_at_utc").IsRequired();
            intervals.Property(interval => interval.EndedAtUtc).HasJsonPropertyName("ended_at_utc").IsRequired();
            intervals.Ignore(interval => interval.Duration);
        });
        builder.Navigation(session => session.Intervals).HasField("intervals").UsePropertyAccessMode(PropertyAccessMode.Field);

        // The device's own id, unique per user: this is the idempotency the outbox relies on, enforced by the
        // database rather than by a handler that could race with itself.
        builder.HasIndex(session => new { session.UserId, session.ClientSessionId }).IsUnique().HasDatabaseName("ix_focus_sessions_client");
        builder.HasIndex(session => new { session.UserId, session.EndedAtUtc }).IsDescending(false, true);
        builder.HasIndex(session => new { session.UserId, session.TaskId }).HasFilter("task_id IS NOT NULL");

        builder.HasOne<User>().WithMany().HasForeignKey(session => session.UserId).OnDelete(DeleteBehavior.Cascade);

        // Deleting a task must not delete the history of the time spent on it: the link is dropped and the
        // title snapshot keeps the record readable.
        builder.HasOne<TaskItem>().WithMany().HasForeignKey(session => session.TaskId).OnDelete(DeleteBehavior.SetNull);
    }
}
