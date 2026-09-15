using Libra.Domain.Identity;
using Libra.Domain.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Libra.Infrastructure.Persistence.Configurations.Tasks;

internal sealed class TaskSeriesConfiguration : IEntityTypeConfiguration<TaskSeries>
{
    public void Configure(EntityTypeBuilder<TaskSeries> builder)
    {
        builder.ToTable("task_series", table =>
        {
            table.HasCheckConstraint("ck_task_series_priority", "priority IN ('Low', 'Normal', 'High')");
            // `None` is a task without a schedule; a series always repeats.
            table.HasCheckConstraint("ck_task_series_kind", "kind IN ('Daily', 'Weekly')");
            // Bit 0 = Monday … bit 6 = Sunday. Daily rules carry no weekdays; weekly ones carry at least one.
            table.HasCheckConstraint(
                "ck_task_series_weekdays",
                "(kind = 'Weekly' AND weekday_mask > 0 AND weekday_mask < 128) OR (kind <> 'Weekly' AND weekday_mask = 0)");
            table.HasCheckConstraint("ck_task_series_range", "end_date IS NULL OR end_date >= start_date");
        });

        builder.HasKey(series => series.Id);
        builder.Property(series => series.Id).ValueGeneratedNever();

        builder.Property(series => series.Title).HasMaxLength(TaskItem.TitleMaxLength).IsRequired();
        builder.Property(series => series.Note).HasMaxLength(TaskItem.NoteMaxLength);
        builder.Property(series => series.Priority).HasConversion<string>().HasMaxLength(10).IsRequired();
        builder.Property(series => series.Kind).HasConversion<string>().HasMaxLength(10).IsRequired();
        builder.Property(series => series.WeekdayMask).IsRequired();
        builder.Property(series => series.StartDate).IsRequired();
        builder.Property(series => series.CreatedAtUtc).IsRequired();
        builder.Property(series => series.UpdatedAtUtc).IsRequired();
        builder.Ignore(series => series.IsStopped);
        builder.Ignore(series => series.Recurrence);

        // Optimistic concurrency: a stale series edit fails the save instead of overwriting a newer rule.
        builder.Property<uint>("Version").IsRowVersion().HasColumnName("xmin").HasColumnType("xid").ValueGeneratedOnAddOrUpdate();

        builder.HasIndex(series => new { series.UserId, series.StoppedAtUtc });
        // One schedule per retry key: two concurrent retries of the same create cannot become two series.
        builder.HasIndex(series => new { series.UserId, series.ClientRequestId }).IsUnique().HasFilter("client_request_id IS NOT NULL");

        builder.HasOne<User>().WithMany().HasForeignKey(series => series.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class TaskItemConfiguration : IEntityTypeConfiguration<TaskItem>
{
    public void Configure(EntityTypeBuilder<TaskItem> builder)
    {
        builder.ToTable("tasks", table =>
        {
            table.HasCheckConstraint("ck_tasks_priority", "priority IN ('Low', 'Normal', 'High')");
            table.HasCheckConstraint("ck_tasks_state", "state IN ('Pending', 'Completed', 'Removed')");
            // Only a completed task carries a completion instant, and it always carries one.
            table.HasCheckConstraint(
                "ck_tasks_completed_at",
                "(state = 'Completed' AND completed_at_utc IS NOT NULL) OR (state <> 'Completed' AND completed_at_utc IS NULL)");
        });

        builder.HasKey(task => task.Id);
        builder.Property(task => task.Id).ValueGeneratedNever();

        builder.Property(task => task.Title).HasMaxLength(TaskItem.TitleMaxLength).IsRequired();
        builder.Property(task => task.Note).HasMaxLength(TaskItem.NoteMaxLength);
        builder.Property(task => task.PlannedDate).IsRequired();
        builder.Property(task => task.Priority).HasConversion<string>().HasMaxLength(10).IsRequired();
        builder.Property(task => task.State).HasConversion<string>().HasMaxLength(10).IsRequired();
        builder.Property(task => task.CreatedAtUtc).IsRequired();
        builder.Property(task => task.UpdatedAtUtc).IsRequired();
        builder.Ignore(task => task.IsCompleted);

        // Optimistic concurrency: two writes to one task cannot both win silently.
        builder.Property<uint>("Version").IsRowVersion().HasColumnName("xmin").HasColumnType("xid").ValueGeneratedOnAddOrUpdate();

        // Drives every view: the day's tasks, the overdue sweep and the upcoming list.
        builder.HasIndex(task => new { task.UserId, task.PlannedDate, task.State });
        builder.HasIndex(task => new { task.UserId, task.State, task.CompletedAtUtc });
        builder.HasIndex(task => new { task.UserId, task.ClientRequestId }).IsUnique().HasFilter("client_request_id IS NOT NULL");
        // One row per scheduled date. This is what makes occurrence generation idempotent under concurrency,
        // and what stops a deleted occurrence — which stays as a tombstone — from being generated again.
        builder.HasIndex(task => new { task.SeriesId, task.PlannedDate }).IsUnique().HasFilter("series_id IS NOT NULL");

        builder.HasOne<User>().WithMany().HasForeignKey(task => task.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<TaskSeries>().WithMany().HasForeignKey(task => task.SeriesId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class TaskCompletionEventConfiguration : IEntityTypeConfiguration<TaskCompletionEvent>
{
    public void Configure(EntityTypeBuilder<TaskCompletionEvent> builder)
    {
        builder.ToTable("task_completion_events", table =>
            table.HasCheckConstraint("ck_task_completion_events_kind", "kind IN ('Completed', 'Reopened')"));

        builder.HasKey(entry => entry.Id);
        builder.Property(entry => entry.Id).ValueGeneratedNever();
        builder.Property(entry => entry.Kind).HasConversion<string>().HasMaxLength(10).IsRequired();
        builder.Property(entry => entry.OccurredAtUtc).IsRequired();

        builder.HasIndex(entry => new { entry.UserId, entry.TaskId, entry.OccurredAtUtc });

        builder.HasOne<User>().WithMany().HasForeignKey(entry => entry.UserId).OnDelete(DeleteBehavior.Cascade);
        // History follows its task: deleting a standalone task removes the events it produced.
        builder.HasOne<TaskItem>().WithMany().HasForeignKey(entry => entry.TaskId).OnDelete(DeleteBehavior.Cascade);
    }
}
