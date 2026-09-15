using Libra.Domain.Identity;
using Libra.Domain.Nutrition;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Libra.Infrastructure.Persistence.Configurations.Nutrition;

internal sealed class NutritionEntryConfiguration : IEntityTypeConfiguration<NutritionEntry>
{
    public void Configure(EntityTypeBuilder<NutritionEntry> builder)
    {
        builder.ToTable("nutrition_entries", table =>
            table.HasCheckConstraint("ck_nutrition_entries_meal_type", "meal_type IN ('Breakfast', 'Lunch', 'Dinner', 'Snack')"));

        builder.HasKey(entry => entry.Id);
        builder.Property(entry => entry.Id).ValueGeneratedNever();

        builder.Property(entry => entry.MealType).HasConversion<string>().HasMaxLength(10).IsRequired();
        builder.Property(entry => entry.ConsumedAtUtc).IsRequired();
        builder.Property(entry => entry.Note).HasMaxLength(NutritionEntry.NoteMaxLength);
        builder.Property(entry => entry.CreatedAtUtc).IsRequired();
        builder.Property(entry => entry.UpdatedAtUtc).IsRequired();
        builder.Ignore(entry => entry.EnergyKcal);

        // Stable day listing: newest first, ties broken by id.
        builder.HasIndex(entry => new { entry.UserId, entry.ConsumedAtUtc, entry.Id })
            .IsDescending(false, true, true);
        builder.HasIndex(entry => new { entry.UserId, entry.ClientRequestId })
            .IsUnique()
            .HasFilter("client_request_id IS NOT NULL");

        builder.HasOne<User>()
            .WithMany()
            .HasForeignKey(entry => entry.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(entry => entry.Items)
            .WithOne()
            .HasForeignKey(item => item.EntryId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(entry => entry.Items).UsePropertyAccessMode(PropertyAccessMode.Field).AutoInclude();
    }
}

internal sealed class NutritionEntryItemConfiguration : IEntityTypeConfiguration<NutritionEntryItem>
{
    public void Configure(EntityTypeBuilder<NutritionEntryItem> builder)
    {
        builder.ToTable("nutrition_entry_items", table =>
        {
            table.HasCheckConstraint("ck_nutrition_entry_items_quantity_positive", "quantity > 0");
            table.HasCheckConstraint("ck_nutrition_entry_items_quantity_mode", "quantity_mode IN ('PerPortion', 'Per100Grams')");
            table.HasCheckConstraint(
                "ck_nutrition_entry_items_nutrients_non_negative",
                "energy_kcal_per_unit >= 0 AND protein_grams_per_unit >= 0 AND carb_grams_per_unit >= 0 AND fat_grams_per_unit >= 0 " +
                "AND energy_kcal >= 0 AND protein_grams >= 0 AND carb_grams >= 0 AND fat_grams >= 0");
        });

        builder.HasKey(item => item.Id);
        builder.Property(item => item.Id).ValueGeneratedNever();

        builder.Property(item => item.Name).HasMaxLength(NutritionEntryItem.NameMaxLength).IsRequired();
        builder.Property(item => item.QuantityMode).HasConversion<string>().HasMaxLength(20).IsRequired();
        builder.Property(item => item.Quantity).HasPrecision(12, NutritionAmounts.QuantityScale);
        builder.Property(item => item.EnergyKcalPerUnit).HasPrecision(10, NutritionAmounts.NutrientScale);
        builder.Property(item => item.ProteinGramsPerUnit).HasPrecision(10, NutritionAmounts.NutrientScale);
        builder.Property(item => item.CarbGramsPerUnit).HasPrecision(10, NutritionAmounts.NutrientScale);
        builder.Property(item => item.FatGramsPerUnit).HasPrecision(10, NutritionAmounts.NutrientScale);
        builder.Property(item => item.EnergyKcal).HasPrecision(12, NutritionAmounts.NutrientScale);
        builder.Property(item => item.ProteinGrams).HasPrecision(12, NutritionAmounts.NutrientScale);
        builder.Property(item => item.CarbGrams).HasPrecision(12, NutritionAmounts.NutrientScale);
        builder.Property(item => item.FatGrams).HasPrecision(12, NutritionAmounts.NutrientScale);
        builder.Property(item => item.Position).IsRequired();

        builder.HasIndex(item => new { item.EntryId, item.Position });
        // Daily totals are summed over items filtered by owner, so the owner column carries its own index.
        builder.HasIndex(item => item.UserId);
    }
}
