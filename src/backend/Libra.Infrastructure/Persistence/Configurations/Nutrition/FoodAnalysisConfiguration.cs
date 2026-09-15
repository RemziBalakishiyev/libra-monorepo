using Libra.Domain.Identity;
using Libra.Domain.Nutrition;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Libra.Infrastructure.Persistence.Configurations.Nutrition;

internal sealed class FoodAnalysisImageConfiguration : IEntityTypeConfiguration<FoodAnalysisImage>
{
    public void Configure(EntityTypeBuilder<FoodAnalysisImage> builder)
    {
        builder.ToTable("food_analysis_images", table =>
            table.HasCheckConstraint("ck_food_analysis_images_dimensions", "width > 0 AND height > 0 AND byte_size > 0"));

        builder.HasKey(image => image.Id);
        builder.Property(image => image.Id).ValueGeneratedNever();

        builder.Property(image => image.StorageKey).HasMaxLength(FoodAnalysisImage.StorageKeyMaxLength).IsRequired();
        builder.Property(image => image.ContentType).HasMaxLength(FoodAnalysisImage.ContentTypeMaxLength).IsRequired();
        builder.Property(image => image.CreatedAtUtc).IsRequired();
        builder.Property(image => image.RetainUntilUtc).IsRequired();
        builder.Ignore(image => image.HasBytes);

        builder.HasIndex(image => new { image.UserId, image.Id });
        // Drives the retention sweep: the pictures whose bytes are still around and already due.
        builder.HasIndex(image => image.RetainUntilUtc).HasFilter("bytes_deleted_at_utc IS NULL");

        builder.HasOne<User>().WithMany().HasForeignKey(image => image.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class FoodAnalysisDraftConfiguration : IEntityTypeConfiguration<FoodAnalysisDraft>
{
    public void Configure(EntityTypeBuilder<FoodAnalysisDraft> builder)
    {
        builder.ToTable("food_analysis_drafts", table =>
        {
            table.HasCheckConstraint("ck_food_analysis_drafts_status", "status IN ('PendingConfirmation', 'Confirmed', 'Discarded')");
            table.HasCheckConstraint("ck_food_analysis_drafts_outcome", "outcome IN ('Success', 'InsufficientInformation', 'NoFoodDetected')");
            table.HasCheckConstraint("ck_food_analysis_drafts_confidence", "confidence IS NULL OR (confidence >= 0 AND confidence <= 1)");
            // A confirmed draft always names its entry, and only a confirmed one may.
            table.HasCheckConstraint(
                "ck_food_analysis_drafts_confirmed_entry",
                "(status = 'Confirmed' AND confirmed_entry_id IS NOT NULL AND confirmed_at_utc IS NOT NULL) OR (status <> 'Confirmed' AND confirmed_entry_id IS NULL)");
        });

        builder.HasKey(draft => draft.Id);
        builder.Property(draft => draft.Id).ValueGeneratedNever();

        builder.Property(draft => draft.Status).HasConversion<string>().HasMaxLength(20).IsRequired();
        builder.Property(draft => draft.Outcome).HasConversion<string>().HasMaxLength(30).IsRequired();
        builder.Property(draft => draft.SchemaVersion).HasMaxLength(FoodAnalysisDraft.SchemaVersionMaxLength).IsRequired();
        builder.Property(draft => draft.Model).HasMaxLength(FoodAnalysisDraft.ModelMaxLength).IsRequired();
        builder.Property(draft => draft.Notes).HasMaxLength(FoodAnalysisDraft.NotesMaxLength);
        builder.Property(draft => draft.Confidence).HasPrecision(4, 2);
        builder.Property(draft => draft.CreatedAtUtc).IsRequired();
        builder.Property(draft => draft.UpdatedAtUtc).IsRequired();
        builder.Property(draft => draft.ExpiresAtUtc).IsRequired();

        // Optimistic concurrency: two confirmations of the same draft cannot both win. PostgreSQL's system
        // column `xmin` changes on every update, so a stale read fails the save instead of overwriting.
        builder.Property<uint>("Version").IsRowVersion().HasColumnName("xmin").HasColumnType("xid").ValueGeneratedOnAddOrUpdate();

        builder.HasIndex(draft => new { draft.UserId, draft.CreatedAtUtc }).IsDescending(false, true);
        builder.HasIndex(draft => new { draft.UserId, draft.ClientRequestId }).IsUnique().HasFilter("client_request_id IS NOT NULL");
        // One draft per confirmed entry, so a replay can never produce a second meal.
        builder.HasIndex(draft => draft.ConfirmedEntryId).IsUnique().HasFilter("confirmed_entry_id IS NOT NULL");
        builder.HasIndex(draft => draft.ExpiresAtUtc).HasFilter("status <> 'Confirmed'");

        builder.HasOne<User>().WithMany().HasForeignKey(draft => draft.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<FoodAnalysisImage>().WithMany().HasForeignKey(draft => draft.ImageId).OnDelete(DeleteBehavior.Restrict);
        // Deleting a confirmed meal must not cascade into the draft; the link simply stops resolving.
        builder.HasOne<NutritionEntry>().WithMany().HasForeignKey(draft => draft.ConfirmedEntryId).OnDelete(DeleteBehavior.SetNull);

        builder.HasMany(draft => draft.Items).WithOne().HasForeignKey(item => item.DraftId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(draft => draft.Items).UsePropertyAccessMode(PropertyAccessMode.Field).AutoInclude();
    }
}

internal sealed class FoodAnalysisItemConfiguration : IEntityTypeConfiguration<FoodAnalysisItem>
{
    public void Configure(EntityTypeBuilder<FoodAnalysisItem> builder)
    {
        builder.ToTable("food_analysis_items", table =>
        {
            table.HasCheckConstraint("ck_food_analysis_items_basis", "basis IN ('PicturedPortion', 'Per100Grams')");
            table.HasCheckConstraint(
                "ck_food_analysis_items_nutrients_non_negative",
                "(energy_kcal IS NULL OR energy_kcal >= 0) AND (protein_grams IS NULL OR protein_grams >= 0) " +
                "AND (carb_grams IS NULL OR carb_grams >= 0) AND (fat_grams IS NULL OR fat_grams >= 0)");
            table.HasCheckConstraint("ck_food_analysis_items_grams_positive", "estimated_grams IS NULL OR estimated_grams > 0");
        });

        builder.HasKey(item => item.Id);
        builder.Property(item => item.Id).ValueGeneratedNever();

        builder.Property(item => item.Name).HasMaxLength(FoodAnalysisItem.NameMaxLength).IsRequired();
        builder.Property(item => item.PortionDescription).HasMaxLength(FoodAnalysisItem.PortionDescriptionMaxLength);
        builder.Property(item => item.Basis).HasConversion<string>().HasMaxLength(20).IsRequired();
        builder.Property(item => item.EstimatedGrams).HasPrecision(12, NutritionAmounts.QuantityScale);
        builder.Property(item => item.EnergyKcal).HasPrecision(10, NutritionAmounts.NutrientScale);
        builder.Property(item => item.ProteinGrams).HasPrecision(10, NutritionAmounts.NutrientScale);
        builder.Property(item => item.CarbGrams).HasPrecision(10, NutritionAmounts.NutrientScale);
        builder.Property(item => item.FatGrams).HasPrecision(10, NutritionAmounts.NutrientScale);
        builder.Property(item => item.Confidence).HasPrecision(4, 2);
        builder.Property(item => item.Position).IsRequired();

        builder.HasIndex(item => new { item.DraftId, item.Position });
        builder.HasIndex(item => item.UserId);
    }
}
