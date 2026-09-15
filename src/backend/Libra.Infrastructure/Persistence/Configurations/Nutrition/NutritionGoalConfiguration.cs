using Libra.Domain.Identity;
using Libra.Domain.Nutrition;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Libra.Infrastructure.Persistence.Configurations.Nutrition;

internal sealed class NutritionGoalConfiguration : IEntityTypeConfiguration<NutritionGoal>
{
    public void Configure(EntityTypeBuilder<NutritionGoal> builder)
    {
        builder.ToTable("nutrition_goals", table =>
            table.HasCheckConstraint(
                "ck_nutrition_goals_targets_positive",
                "(energy_kcal IS NULL OR energy_kcal > 0) AND (protein_grams IS NULL OR protein_grams > 0) " +
                "AND (carb_grams IS NULL OR carb_grams > 0) AND (fat_grams IS NULL OR fat_grams > 0)"));

        builder.HasKey(goal => goal.Id);
        builder.Property(goal => goal.Id).ValueGeneratedNever();

        builder.Property(goal => goal.EffectiveFrom).HasColumnType("date").IsRequired();
        builder.Property(goal => goal.EnergyKcal).HasPrecision(10, NutritionAmounts.NutrientScale);
        builder.Property(goal => goal.ProteinGrams).HasPrecision(10, NutritionAmounts.NutrientScale);
        builder.Property(goal => goal.CarbGrams).HasPrecision(10, NutritionAmounts.NutrientScale);
        builder.Property(goal => goal.FatGrams).HasPrecision(10, NutritionAmounts.NutrientScale);
        builder.Property(goal => goal.CreatedAtUtc).IsRequired();
        builder.Property(goal => goal.UpdatedAtUtc).IsRequired();
        builder.Ignore(goal => goal.IsEmpty);

        // One record per user and effective date; a day resolves to the newest one on or before it.
        builder.HasIndex(goal => new { goal.UserId, goal.EffectiveFrom }).IsUnique().IsDescending(false, true);

        builder.HasOne<User>()
            .WithMany()
            .HasForeignKey(goal => goal.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
