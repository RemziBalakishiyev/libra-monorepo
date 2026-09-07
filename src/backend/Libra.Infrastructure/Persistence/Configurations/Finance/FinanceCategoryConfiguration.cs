using Libra.Domain.Finance;
using Libra.Domain.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Libra.Infrastructure.Persistence.Configurations.Finance;

internal sealed class FinanceCategoryConfiguration : IEntityTypeConfiguration<FinanceCategory>
{
    public void Configure(EntityTypeBuilder<FinanceCategory> builder)
    {
        builder.ToTable("finance_categories", table =>
            table.HasCheckConstraint("ck_finance_categories_kind", "kind IN ('Income', 'Expense')"));

        builder.HasKey(category => category.Id);
        builder.Property(category => category.Id).ValueGeneratedNever();

        builder.Property(category => category.Name).HasMaxLength(FinanceCategory.NameMaxLength).IsRequired();
        builder.Property(category => category.Kind).HasConversion<string>().HasMaxLength(10).IsRequired();
        builder.Property(category => category.CreatedAtUtc).IsRequired();
        builder.Property(category => category.UpdatedAtUtc).IsRequired();

        builder.HasIndex(category => new { category.UserId, category.Kind, category.Name }).IsUnique();

        builder.HasOne<User>()
            .WithMany()
            .HasForeignKey(category => category.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
