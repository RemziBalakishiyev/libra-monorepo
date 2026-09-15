using Libra.Domain.Finance;
using Libra.Domain.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Libra.Infrastructure.Persistence.Configurations.Finance;

internal sealed class DebtConfiguration : IEntityTypeConfiguration<Debt>
{
    public void Configure(EntityTypeBuilder<Debt> builder)
    {
        builder.ToTable("debts", table =>
        {
            table.HasCheckConstraint("ck_debts_principal_positive", "principal > 0");
            table.HasCheckConstraint("ck_debts_direction", "direction IN ('Receivable', 'Payable')");
            table.HasCheckConstraint("ck_debts_due", "due_on IS NULL OR due_on >= opened_on");
        });

        builder.HasKey(debt => debt.Id);
        builder.Property(debt => debt.Id).ValueGeneratedNever();

        builder.Property(debt => debt.Direction).HasConversion<string>().HasMaxLength(10).IsRequired();
        builder.Property(debt => debt.CounterpartyName).HasMaxLength(Debt.CounterpartyMaxLength).IsRequired();
        builder.Property(debt => debt.Principal).HasPrecision(18, 2);
        builder.Property(debt => debt.CurrencyCode).HasMaxLength(Money.CurrencyCodeLength).IsFixedLength().IsRequired();
        builder.Property(debt => debt.OpenedOn).HasColumnType("date").IsRequired();
        builder.Property(debt => debt.DueOn).HasColumnType("date");
        builder.Property(debt => debt.Note).HasMaxLength(Debt.NoteMaxLength);
        builder.Property(debt => debt.CreatedAtUtc).IsRequired();
        builder.Property(debt => debt.UpdatedAtUtc).IsRequired();

        // Every payment touches the debt row, so two payments racing on one debt collide here, inside the
        // database transaction, and cannot both commit.
        builder.Property<uint>("Version").IsRowVersion().HasColumnName("xmin").HasColumnType("xid").ValueGeneratedOnAddOrUpdate();

        builder.HasIndex(debt => new { debt.UserId, debt.Direction });
        builder.HasIndex(debt => new { debt.UserId, debt.ClientRequestId }).IsUnique().HasFilter("client_request_id IS NOT NULL");

        builder.HasOne<User>().WithMany().HasForeignKey(debt => debt.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class DebtMovementConfiguration : IEntityTypeConfiguration<DebtMovement>
{
    public void Configure(EntityTypeBuilder<DebtMovement> builder)
    {
        builder.ToTable("debt_movements", table =>
        {
            table.HasCheckConstraint("ck_debt_movements_amount_positive", "amount > 0");
            table.HasCheckConstraint("ck_debt_movements_kind", "kind IN ('Opening', 'Payment')");
        });

        builder.HasKey(movement => movement.Id);
        builder.Property(movement => movement.Id).ValueGeneratedNever();

        builder.Property(movement => movement.Kind).HasConversion<string>().HasMaxLength(10).IsRequired();
        builder.Property(movement => movement.Amount).HasPrecision(18, 2);
        builder.Property(movement => movement.OccurredAtUtc).IsRequired();
        builder.Property(movement => movement.Note).HasMaxLength(DebtMovement.NoteMaxLength);
        builder.Property(movement => movement.CreatedAtUtc).IsRequired();
        builder.Ignore(movement => movement.IsReversed);

        builder.HasIndex(movement => new { movement.DebtId, movement.OccurredAtUtc });
        builder.HasIndex(movement => new { movement.UserId, movement.AccountId });
        // At most one opening movement per debt.
        builder.HasIndex(movement => movement.DebtId).IsUnique().HasFilter("kind = 'Opening'").HasDatabaseName("ix_debt_movements_opening");
        builder.HasIndex(movement => new { movement.UserId, movement.ClientRequestId }).IsUnique().HasFilter("client_request_id IS NOT NULL");

        builder.HasOne<User>().WithMany().HasForeignKey(movement => movement.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Debt>().WithMany().HasForeignKey(movement => movement.DebtId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<FinancialAccount>().WithMany().HasForeignKey(movement => movement.AccountId).OnDelete(DeleteBehavior.Restrict);
    }
}
