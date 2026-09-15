using Libra.Domain.Identity;
using Libra.Domain.Sleep;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Libra.Infrastructure.Persistence.Configurations.Sleep;

internal sealed class SleepSessionConfiguration : IEntityTypeConfiguration<SleepSession>
{
    public void Configure(EntityTypeBuilder<SleepSession> builder)
    {
        builder.ToTable("sleep_sessions", table =>
        {
            table.HasCheckConstraint("ck_sleep_sessions_interval", "ended_at_utc IS NULL OR ended_at_utc > started_at_utc");
            table.HasCheckConstraint("ck_sleep_sessions_quality", "quality IS NULL OR (quality >= 1 AND quality <= 5)");
            // A completed night is bounded; an open one deliberately is not, so a forgotten session survives
            // exactly as long as it really ran and can be corrected instead of quietly clipped.
            table.HasCheckConstraint(
                "ck_sleep_sessions_duration",
                "ended_at_utc IS NULL OR ended_at_utc <= started_at_utc + INTERVAL '24 hours'");
        });

        builder.HasKey(session => session.Id);
        builder.Property(session => session.Id).ValueGeneratedNever();

        builder.Property(session => session.StartedAtUtc).IsRequired();
        builder.Property(session => session.Note).HasMaxLength(SleepSession.NoteMaxLength);
        builder.Property(session => session.CreatedAtUtc).IsRequired();
        builder.Property(session => session.UpdatedAtUtc).IsRequired();
        builder.Ignore(session => session.IsOpen);
        builder.Ignore(session => session.Duration);

        // Optimistic concurrency: a stale correction fails the save instead of overwriting a newer one.
        builder.Property<uint>("Version").IsRowVersion().HasColumnName("xmin").HasColumnType("xid").ValueGeneratedOnAddOrUpdate();

        // At most one running session per user — the database's own answer, not just the handler's.
        builder.HasIndex(session => session.UserId).IsUnique().HasFilter("ended_at_utc IS NULL").HasDatabaseName("ix_sleep_sessions_open");
        builder.HasIndex(session => new { session.UserId, session.StartedAtUtc }).IsDescending(false, true);
        builder.HasIndex(session => new { session.UserId, session.EndedAtUtc });
        builder.HasIndex(session => new { session.UserId, session.ClientRequestId }).IsUnique().HasFilter("client_request_id IS NOT NULL");

        builder.HasOne<User>().WithMany().HasForeignKey(session => session.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
