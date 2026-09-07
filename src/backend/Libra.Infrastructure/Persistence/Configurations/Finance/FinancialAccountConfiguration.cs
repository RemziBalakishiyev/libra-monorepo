using Libra.Domain.Finance;
using Libra.Domain.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Libra.Infrastructure.Persistence.Configurations.Finance;

internal sealed class FinancialAccountConfiguration : IEntityTypeConfiguration<FinancialAccount>
{
    public void Configure(EntityTypeBuilder<FinancialAccount> builder)
    {
        builder.ToTable("financial_accounts", table =>
        {
            table.HasCheckConstraint("ck_financial_accounts_type", "type IN ('Cash', 'BankCard', 'BankAccount', 'Savings', 'Other')");
            table.HasCheckConstraint("ck_financial_accounts_currency_length", "char_length(currency_code) = 3");
        });

        builder.HasKey(account => account.Id);
        builder.Property(account => account.Id).ValueGeneratedNever();

        builder.Property(account => account.Name).HasMaxLength(FinancialAccount.NameMaxLength).IsRequired();
        builder.Property(account => account.Type).HasConversion<string>().HasMaxLength(20).IsRequired();
        builder.Property(account => account.CurrencyCode).HasMaxLength(Money.CurrencyCodeLength).IsFixedLength().IsRequired();
        builder.Property(account => account.OpeningBalance).HasPrecision(18, 2);
        builder.Property(account => account.CreatedAtUtc).IsRequired();
        builder.Property(account => account.UpdatedAtUtc).IsRequired();

        builder.HasIndex(account => account.UserId);

        builder.HasOne<User>()
            .WithMany()
            .HasForeignKey(account => account.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
