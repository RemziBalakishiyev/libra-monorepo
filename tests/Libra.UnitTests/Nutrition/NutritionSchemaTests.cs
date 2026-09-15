using Libra.Domain.Nutrition;
using Libra.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;

namespace Libra.UnitTests.Nutrition;

/// <summary>Database constraints must mirror the nutrition invariants (built from the EF model, no connection).</summary>
public sealed class NutritionSchemaTests
{
    private static readonly LibraDbContext Context = new(
        new DbContextOptionsBuilder<LibraDbContext>()
            .UseNpgsql("Host=localhost;Database=model-only")
            .UseSnakeCaseNamingConvention()
            .Options);

    private static readonly IModel Model = Context.GetService<IDesignTimeModel>().Model;

    [Theory]
    [InlineData(typeof(NutritionEntry), "ck_nutrition_entries_meal_type")]
    [InlineData(typeof(NutritionEntryItem), "ck_nutrition_entry_items_quantity_positive")]
    [InlineData(typeof(NutritionEntryItem), "ck_nutrition_entry_items_quantity_mode")]
    [InlineData(typeof(NutritionEntryItem), "ck_nutrition_entry_items_nutrients_non_negative")]
    [InlineData(typeof(NutritionGoal), "ck_nutrition_goals_targets_positive")]
    public void Check_constraint_exists(Type entity, string name)
    {
        var constraints = Model.FindEntityType(entity)!.GetCheckConstraints().Select(constraint => constraint.Name);

        Assert.Contains(name, constraints);
    }

    [Theory]
    [InlineData(nameof(NutritionEntryItem.EnergyKcal))]
    [InlineData(nameof(NutritionEntryItem.ProteinGrams))]
    [InlineData(nameof(NutritionEntryItem.CarbGrams))]
    [InlineData(nameof(NutritionEntryItem.FatGrams))]
    public void Computed_nutrient_columns_keep_two_decimals(string property)
    {
        var column = Model.FindEntityType(typeof(NutritionEntryItem))!.FindProperty(property)!;

        Assert.Equal(typeof(decimal), column.ClrType);
        Assert.Equal(NutritionAmounts.NutrientScale, column.GetScale());
    }

    [Fact]
    public void Quantities_keep_three_decimals_and_targets_stay_nullable()
    {
        var quantity = Model.FindEntityType(typeof(NutritionEntryItem))!.FindProperty(nameof(NutritionEntryItem.Quantity))!;
        Assert.Equal(NutritionAmounts.QuantityScale, quantity.GetScale());

        var energyTarget = Model.FindEntityType(typeof(NutritionGoal))!.FindProperty(nameof(NutritionGoal.EnergyKcal))!;
        Assert.True(energyTarget.IsNullable);
    }

    [Fact]
    public void Unique_indexes_protect_idempotency_and_one_goal_per_effective_date()
    {
        var entryIndexes = Model.FindEntityType(typeof(NutritionEntry))!.GetIndexes().ToList();
        Assert.Contains(entryIndexes, index => index.IsUnique && index.GetFilter() == "client_request_id IS NOT NULL");

        var goalIndexes = Model.FindEntityType(typeof(NutritionGoal))!.GetIndexes().ToList();
        var scope = Assert.Single(goalIndexes, index => index.IsUnique);
        Assert.Equal(["UserId", "EffectiveFrom"], scope.Properties.Select(property => property.Name));
    }

    [Fact]
    public void Deleting_an_entry_deletes_its_item_snapshots()
    {
        var item = Model.FindEntityType(typeof(NutritionEntryItem))!;
        var toEntry = Assert.Single(item.GetForeignKeys(), key => key.PrincipalEntityType.ClrType == typeof(NutritionEntry));

        Assert.Equal(DeleteBehavior.Cascade, toEntry.DeleteBehavior);
    }
}
