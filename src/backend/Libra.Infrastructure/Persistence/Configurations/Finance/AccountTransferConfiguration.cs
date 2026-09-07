using Libra.Domain.Finance;
using Libra.Domain.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Libra.Infrastructure.Persistence.Configurations.Finance;

internal sealed class AccountTransferConfiguration : IEntityTypeConfiguration<AccountTransfer>
{
    public void Configure(EntityTypeBuilder<AccountTransfer> builder)
    {
        builder.ToTable("account_transfers", table =>
        {
            table.HasCheckConstraint("ck_account_transfers_amounts_positive", "source_amount > 0 AND destination_amount > 0");
            table.HasCheckConstraint("ck_account_transfers_distinct_accounts", "source_account_id <> destination_account_id");
        });

        builder.HasKey(transfer => transfer.Id);
        builder.Property(transfer => transfer.Id).ValueGeneratedNever();

        builder.Property(transfer => transfer.SourceAmount).HasPrecision(18, 2);
        builder.Property(transfer => transfer.DestinationAmount).HasPrecision(18, 2);
        builder.Property(transfer => transfer.Note).HasMaxLength(FinancialTransaction.NoteMaxLength);
        builder.Property(transfer => transfer.OccurredAtUtc).IsRequired();
        builder.Property(transfer => transfer.CreatedAtUtc).IsRequired();
        builder.Property(transfer => transfer.UpdatedAtUtc).IsRequired();

        builder.HasIndex(transfer => new { transfer.UserId, transfer.OccurredAtUtc, transfer.Id })
            .IsDescending(false, true, true);
        builder.HasIndex(transfer => transfer.SourceAccountId);
        builder.HasIndex(transfer => transfer.DestinationAccountId);
        builder.HasIndex(transfer => new { transfer.UserId, transfer.ClientRequestId })
            .IsUnique()
            .HasFilter("client_request_id IS NOT NULL");

        builder.HasOne<User>()
            .WithMany()
            .HasForeignKey(transfer => transfer.UserId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<FinancialAccount>()
            .WithMany()
            .HasForeignKey(transfer => transfer.SourceAccountId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<FinancialAccount>()
            .WithMany()
            .HasForeignKey(transfer => transfer.DestinationAccountId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
