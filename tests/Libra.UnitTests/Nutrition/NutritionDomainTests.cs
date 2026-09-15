using Libra.Domain.Nutrition;

namespace Libra.UnitTests.Nutrition;

public sealed class NutritionDomainTests
{
    private static readonly DateTime Now = new(2026, 9, 7, 10, 0, 0, DateTimeKind.Utc);
    private static readonly Guid Owner = Guid.NewGuid();

    private static NutritionItemDraft Portion(string name = "Omlet", decimal quantity = 1m, decimal kcal = 250m, decimal protein = 18m, decimal carbs = 3m, decimal fat = 19m) =>
        new(name, FoodQuantityMode.PerPortion, quantity, kcal, protein, carbs, fat);

    private static NutritionItemDraft Hundred(string name = "Düyü", decimal grams = 100m, decimal kcal = 130m, decimal protein = 2.7m, decimal carbs = 28.2m, decimal fat = 0.3m) =>
        new(name, FoodQuantityMode.Per100Grams, grams, kcal, protein, carbs, fat);

    [Theory]
    [InlineData(1, 250, 18)]
    [InlineData(2, 500, 36)]
    [InlineData(0.5, 125, 9)]
    [InlineData(1.5, 375, 27)]
    public void Portion_quantities_multiply_the_entered_nutrients(decimal quantity, decimal expectedKcal, decimal expectedProtein)
    {
        var entry = NutritionEntry.Create(Owner, MealType.Breakfast, Now, null, [Portion(quantity: quantity)], null, Now);

        var item = Assert.Single(entry.Items);
        Assert.Equal(expectedKcal, item.EnergyKcal);
        Assert.Equal(expectedProtein, item.ProteinGrams);
        // The entered label value is kept as it was typed.
        Assert.Equal(250m, item.EnergyKcalPerUnit);
    }

    [Theory]
    [InlineData(100, 130, 28.2)]
    [InlineData(150, 195, 42.3)]
    [InlineData(75.5, 98.15, 21.29)]
    [InlineData(33, 42.9, 9.31)]
    public void Per_100_gram_quantities_scale_by_weight(decimal grams, decimal expectedKcal, decimal expectedCarbs)
    {
        var entry = NutritionEntry.Create(Owner, MealType.Lunch, Now, null, [Hundred(grams: grams)], null, Now);

        var item = Assert.Single(entry.Items);
        Assert.Equal(expectedKcal, item.EnergyKcal);
        Assert.Equal(expectedCarbs, item.CarbGrams);
    }

    [Fact]
    public void Totals_come_from_the_unrounded_inputs_and_are_rounded_once()
    {
        // 33 g of 9.99 g protein per 100 g is 3.2967 g; a per-step rounding would produce 3.30 twice over.
        var entry = NutritionEntry.Create(Owner, MealType.Snack, Now, null, [Hundred(grams: 33m, protein: 9.99m)], null, Now);

        Assert.Equal(3.30m, Assert.Single(entry.Items).ProteinGrams);
    }

    [Fact]
    public void Entered_energy_is_never_derived_from_the_macros()
    {
        // 4/4/9 would make this 96 kcal; the label says 120 and the label wins.
        var entry = NutritionEntry.Create(Owner, MealType.Snack, Now, null, [Portion(kcal: 120m, protein: 4m, carbs: 20m, fat: 0m)], null, Now);

        var item = Assert.Single(entry.Items);
        Assert.Equal(120m, item.EnergyKcal);
        Assert.Equal(120m, item.EnergyKcalPerUnit);
    }

    [Fact]
    public void Zero_is_a_valid_nutrient_but_zero_quantity_is_not()
    {
        var entry = NutritionEntry.Create(Owner, MealType.Snack, Now, null, [Portion(name: "Qara qəhvə", kcal: 2m, protein: 0m, carbs: 0m, fat: 0m)], null, Now);

        var item = Assert.Single(entry.Items);
        Assert.Equal(0m, item.FatGrams);
        Assert.Equal(2m, item.EnergyKcal);

        Assert.Throws<ArgumentException>(() => NutritionEntry.Create(Owner, MealType.Snack, Now, null, [Portion(quantity: 0m)], null, Now));
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(-0.01)]
    public void Negative_nutrients_are_rejected(decimal value)
    {
        Assert.Throws<ArgumentException>(() => NutritionEntry.Create(Owner, MealType.Dinner, Now, null, [Portion(protein: value)], null, Now));
    }

    [Theory]
    [InlineData(-2)]
    [InlineData(10_001)]
    [InlineData(1.0005)]
    public void Invalid_quantities_are_rejected(decimal quantity)
    {
        Assert.Throws<ArgumentException>(() => NutritionEntry.Create(Owner, MealType.Dinner, Now, null, [Portion(quantity: quantity)], null, Now));
    }

    [Fact]
    public void Nutrients_need_at_most_two_decimals()
    {
        Assert.Throws<ArgumentException>(() => NutritionEntry.Create(Owner, MealType.Dinner, Now, null, [Portion(kcal: 12.345m)], null, Now));
    }

    [Fact]
    public void A_meal_needs_a_named_item_and_at_most_twenty()
    {
        Assert.Throws<ArgumentException>(() => NutritionEntry.Create(Owner, MealType.Dinner, Now, null, [], null, Now));
        Assert.Throws<ArgumentException>(() => NutritionEntry.Create(Owner, MealType.Dinner, Now, null, [Portion(name: "  ")], null, Now));
        Assert.Throws<ArgumentException>(() =>
            NutritionEntry.Create(Owner, MealType.Dinner, Now, null, Enumerable.Range(0, NutritionEntry.MaxItems + 1).Select(index => Portion(name: $"Yemək {index}")), null, Now));
    }

    [Fact]
    public void Editing_an_entry_replaces_its_items_with_new_snapshots()
    {
        var entry = NutritionEntry.Create(Owner, MealType.Breakfast, Now, "səhər", [Portion()], null, Now);
        var originalItemId = entry.Items[0].Id;

        entry.Update(MealType.Lunch, Now.AddHours(3), null, [Portion(quantity: 2m)], Now.AddHours(3));

        var item = Assert.Single(entry.Items);
        Assert.NotEqual(originalItemId, item.Id);
        Assert.Equal(500m, item.EnergyKcal);
        Assert.Equal(MealType.Lunch, entry.MealType);
        Assert.Null(entry.Note);
    }

    [Fact]
    public void Copying_an_entry_leaves_the_source_untouched()
    {
        var source = NutritionEntry.Create(Owner, MealType.Dinner, Now, "orijinal", [Portion(), Hundred()], null, Now);

        var copy = NutritionEntry.Create(Owner, MealType.Lunch, Now.AddDays(1), null, source.Items.Select(item => item.ToDraft()), null, Now);
        copy.Update(MealType.Lunch, Now.AddDays(1), null, [Portion(quantity: 3m)], Now);

        Assert.NotEqual(source.Id, copy.Id);
        Assert.Equal(2, source.Items.Count);
        Assert.Equal(380m, source.EnergyKcal);
        Assert.Equal("orijinal", source.Note);
        Assert.Empty(source.Items.Select(item => item.Id).Intersect(copy.Items.Select(item => item.Id)));
    }

    [Fact]
    public void Entry_energy_is_the_sum_of_its_items()
    {
        var entry = NutritionEntry.Create(Owner, MealType.Lunch, Now, null, [Portion(), Hundred(grams: 150m)], null, Now);

        Assert.Equal(445m, entry.EnergyKcal);
        Assert.Equal([0, 1], entry.Items.Select(item => item.Position));
    }

    [Fact]
    public void Notes_are_trimmed_and_length_limited()
    {
        var entry = NutritionEntry.Create(Owner, MealType.Snack, Now, "  gec yedim  ", [Portion()], null, Now);
        Assert.Equal("gec yedim", entry.Note);

        Assert.Throws<ArgumentOutOfRangeException>(() =>
            NutritionEntry.Create(Owner, MealType.Snack, Now, new string('a', NutritionEntry.NoteMaxLength + 1), [Portion()], null, Now));
    }

    [Fact]
    public void Goal_targets_are_optional_but_must_be_positive_when_set()
    {
        var goal = NutritionGoal.Create(Owner, new DateOnly(2026, 9, 7), 2200m, 130m, null, null, Now);

        Assert.Equal(2200m, goal.EnergyKcal);
        Assert.Null(goal.CarbGrams);
        Assert.False(goal.IsEmpty);

        Assert.True(NutritionGoal.Create(Owner, new DateOnly(2026, 9, 7), null, null, null, null, Now).IsEmpty);
        Assert.Throws<ArgumentException>(() => NutritionGoal.Create(Owner, new DateOnly(2026, 9, 7), 0m, null, null, null, Now));
        Assert.Throws<ArgumentException>(() => NutritionGoal.Create(Owner, new DateOnly(2026, 9, 7), -5m, null, null, null, Now));
        Assert.Throws<ArgumentException>(() => NutritionGoal.Create(Owner, new DateOnly(2026, 9, 7), 2000.005m, null, null, null, Now));
    }
}
