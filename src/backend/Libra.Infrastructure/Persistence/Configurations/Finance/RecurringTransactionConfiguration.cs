using Libra.Domain.Finance;
using Libra.Domain.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Libra.Infrastructure.Persistence.Configurations.Finance;

internal sealed class RecurringTransactionConfiguration : IEntityTypeConfiguration<RecurringTransaction>
{
    public void Configure(EntityTypeBuilder<RecurringTransaction> builder)
    {
        builder.ToTable("recurring_transactions", table =>
        {
            table.HasCheckConstraint("ck_recurring_transactions_amount_positive", "amount > 0");
            table.HasCheckConstraint("ck_recurring_transactions_type", "type IN ('Income', 'Expense')");
            table.HasCheckConstraint("ck_recurring_transactions_day", "day_of_month BETWEEN 1 AND 31");
            table.HasCheckConstraint("ck_recurring_transactions_range", "end_date IS NULL OR end_date >= start_date");
        });

        builder.HasKey(template => template.Id);
        builder.Property(template => template.Id).ValueGeneratedNever();

        builder.Property(template => template.Title).HasMaxLength(RecurringTransaction.TitleMaxLength).IsRequired();
        builder.Property(template => template.Type).HasConversion<string>().HasMaxLength(10).IsRequired();
        builder.Property(template => template.Amount).HasPrecision(18, 2);
        builder.Property(template => template.CurrencyCode).HasMaxLength(Money.CurrencyCodeLength).IsFixedLength().IsRequired();
        builder.Property(template => template.StartDate).HasColumnType("date").IsRequired();
        builder.Property(template => template.EndDate).HasColumnType("date");
        builder.Property(template => template.Note).HasMaxLength(RecurringTransaction.NoteMaxLength);
        builder.Property(template => template.CreatedAtUtc).IsRequired();
        builder.Property(template => template.UpdatedAtUtc).IsRequired();

        // Stale edits fail the save instead of overwriting a newer plan.
        builder.Property<uint>("Version").IsRowVersion().HasColumnName("xmin").HasColumnType("xid").ValueGeneratedOnAddOrUpdate();

        builder.HasIndex(template => new { template.UserId, template.IsActive });
        builder.HasIndex(template => new { template.UserId, template.ClientRequestId }).IsUnique().HasFilter("client_request_id IS NOT NULL");

        builder.HasOne<User>().WithMany().HasForeignKey(template => template.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<FinancialAccount>().WithMany().HasForeignKey(template => template.AccountId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<FinanceCategory>().WithMany().HasForeignKey(template => template.CategoryId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class RecurringOccurrenceConfiguration : IEntityTypeConfiguration<RecurringOccurrence>
{
    public void Configure(EntityTypeBuilder<RecurringOccurrence> builder)
    {
        builder.ToTable("recurring_occurrences", table =>
        {
            table.HasCheckConstraint("ck_recurring_occurrences_month", "month BETWEEN 1 AND 12");
            table.HasCheckConstraint("ck_recurring_occurrences_status", "status IN ('Recorded', 'Skipped')");
            // A recorded month has its transaction; a skipped one never does.
            table.HasCheckConstraint(
                "ck_recurring_occurrences_link",
                "(status = 'Recorded' AND transaction_id IS NOT NULL) OR (status = 'Skipped' AND transaction_id IS NULL)");
        });

        builder.HasKey(occurrence => occurrence.Id);
        builder.Property(occurrence => occurrence.Id).ValueGeneratedNever();

        builder.Property(occurrence => occurrence.DueDate).HasColumnType("date").IsRequired();
        builder.Property(occurrence => occurrence.Status).HasConversion<string>().HasMaxLength(10).IsRequired();
        builder.Property(occurrence => occurrence.Title).HasMaxLength(RecurringOccurrence.TitleMaxLength).IsRequired();
        builder.Property(occurrence => occurrence.Amount).HasPrecision(18, 2);
        builder.Property(occurrence => occurrence.CurrencyCode).HasMaxLength(Money.CurrencyCodeLength).IsFixedLength().IsRequired();
        builder.Property(occurrence => occurrence.CreatedAtUtc).IsRequired();
        builder.Property(occurrence => occurrence.UpdatedAtUtc).IsRequired();

        builder.Property<uint>("Version").IsRowVersion().HasColumnName("xmin").HasColumnType("xid").ValueGeneratedOnAddOrUpdate();

        // One outcome per template per month — the database's answer to a double confirmation.
        builder.HasIndex(occurrence => new { occurrence.TemplateId, occurrence.Year, occurrence.Month })
            .IsUnique()
            .HasDatabaseName("ix_recurring_occurrences_template_month");
        // One transaction belongs to at most one occurrence.
        builder.HasIndex(occurrence => occurrence.TransactionId).IsUnique().HasFilter("transaction_id IS NOT NULL");
        builder.HasIndex(occurrence => new { occurrence.UserId, occurrence.Year, occurrence.Month });
        builder.HasIndex(occurrence => new { occurrence.UserId, occurrence.ClientRequestId }).IsUnique().HasFilter("client_request_id IS NOT NULL");

        builder.HasOne<User>().WithMany().HasForeignKey(occurrence => occurrence.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<RecurringTransaction>().WithMany().HasForeignKey(occurrence => occurrence.TemplateId).OnDelete(DeleteBehavior.Restrict);
        // The transaction is removed through the occurrence's own undo, which clears the link first; the
        // generic transaction delete is refused while a link exists.
        builder.HasOne<FinancialTransaction>().WithMany().HasForeignKey(occurrence => occurrence.TransactionId).OnDelete(DeleteBehavior.Restrict);
    }
}
