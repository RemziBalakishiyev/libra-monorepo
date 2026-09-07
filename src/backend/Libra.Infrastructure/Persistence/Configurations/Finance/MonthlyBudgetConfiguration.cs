using Libra.Domain.Finance;
using Libra.Domain.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Libra.Infrastructure.Persistence.Configurations.Finance;

internal sealed class MonthlyBudgetConfiguration : IEntityTypeConfiguration<MonthlyBudget>
{
    public void Configure(EntityTypeBuilder<MonthlyBudget> builder)
    {
        builder.ToTable("monthly_budgets", table =>
        {
            table.HasCheckConstraint("ck_monthly_budgets_amount_positive", "amount > 0");
            table.HasCheckConstraint("ck_monthly_budgets_month", "month BETWEEN 1 AND 12");
            table.HasCheckConstraint("ck_monthly_budgets_year", $"year BETWEEN {MonthlyBudget.MinYear} AND {MonthlyBudget.MaxYear}");
            table.HasCheckConstraint("ck_monthly_budgets_currency_length", "char_length(currency_code) = 3");
        });

        builder.HasKey(budget => budget.Id);
        builder.Property(budget => budget.Id).ValueGeneratedNever();

        builder.Property(budget => budget.CurrencyCode).HasMaxLength(Money.CurrencyCodeLength).IsFixedLength().IsRequired();
        builder.Property(budget => budget.Amount).HasPrecision(18, 2);
        builder.Property(budget => budget.CreatedAtUtc).IsRequired();
        builder.Property(budget => budget.UpdatedAtUtc).IsRequired();

        // One overall budget (category null) and one budget per category for each user, month, and currency.
        builder.HasIndex(budget => new { budget.UserId, budget.Year, budget.Month, budget.CurrencyCode, budget.CategoryId })
            .IsUnique()
            .AreNullsDistinct(false);
        builder.HasIndex(budget => budget.CategoryId);

        builder.HasOne<User>()
            .WithMany()
            .HasForeignKey(budget => budget.UserId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<FinanceCategory>()
            .WithMany()
            .HasForeignKey(budget => budget.CategoryId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
