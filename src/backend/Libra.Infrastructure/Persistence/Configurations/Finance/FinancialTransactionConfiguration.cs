using Libra.Domain.Finance;
using Libra.Domain.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Libra.Infrastructure.Persistence.Configurations.Finance;

internal sealed class FinancialTransactionConfiguration : IEntityTypeConfiguration<FinancialTransaction>
{
    public void Configure(EntityTypeBuilder<FinancialTransaction> builder)
    {
        builder.ToTable("financial_transactions", table =>
        {
            table.HasCheckConstraint("ck_financial_transactions_amount_positive", "amount > 0");
            table.HasCheckConstraint("ck_financial_transactions_type", "type IN ('Income', 'Expense')");
        });

        builder.HasKey(transaction => transaction.Id);
        builder.Property(transaction => transaction.Id).ValueGeneratedNever();

        builder.Property(transaction => transaction.Type).HasConversion<string>().HasMaxLength(10).IsRequired();
        builder.Property(transaction => transaction.Amount).HasPrecision(18, 2);
        builder.Property(transaction => transaction.Note).HasMaxLength(FinancialTransaction.NoteMaxLength);
        builder.Property(transaction => transaction.OccurredAtUtc).IsRequired();
        builder.Property(transaction => transaction.CreatedAtUtc).IsRequired();
        builder.Property(transaction => transaction.UpdatedAtUtc).IsRequired();

        // Stable list ordering: newest first, ties broken by id.
        builder.HasIndex(transaction => new { transaction.UserId, transaction.OccurredAtUtc, transaction.Id })
            .IsDescending(false, true, true);
        builder.HasIndex(transaction => transaction.AccountId);
        builder.HasIndex(transaction => transaction.CategoryId);
        builder.HasIndex(transaction => new { transaction.UserId, transaction.ClientRequestId })
            .IsUnique()
            .HasFilter("client_request_id IS NOT NULL");

        builder.HasOne<User>()
            .WithMany()
            .HasForeignKey(transaction => transaction.UserId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<FinancialAccount>()
            .WithMany()
            .HasForeignKey(transaction => transaction.AccountId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<FinanceCategory>()
            .WithMany()
            .HasForeignKey(transaction => transaction.CategoryId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
