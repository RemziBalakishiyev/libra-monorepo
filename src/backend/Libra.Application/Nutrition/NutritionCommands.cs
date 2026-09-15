using FluentValidation;
using Libra.Application.Common;
using Libra.Domain.Nutrition;

namespace Libra.Application.Nutrition;

/// <summary>
/// One food item as the client sends it. Every nutrient is required: a missing value is a validation error,
/// while an explicit zero is a legitimate input (a black coffee has 0 g of fat).
/// </summary>
public sealed record NutritionItemCommand(
    string Name,
    FoodQuantityMode QuantityMode,
    decimal Quantity,
    decimal EnergyKcalPerUnit,
    decimal ProteinGramsPerUnit,
    decimal CarbGramsPerUnit,
    decimal FatGramsPerUnit)
{
    internal NutritionItemDraft ToDraft() =>
        new(Name, QuantityMode, Quantity, EnergyKcalPerUnit, ProteinGramsPerUnit, CarbGramsPerUnit, FatGramsPerUnit);
}

public sealed record CreateNutritionEntryCommand(
    MealType MealType,
    DateTimeOffset ConsumedAtUtc,
    string? Note,
    IReadOnlyList<NutritionItemCommand> Items,
    Guid? ClientRequestId);

public sealed record UpdateNutritionEntryCommand(
    MealType MealType,
    DateTimeOffset ConsumedAtUtc,
    string? Note,
    IReadOnlyList<NutritionItemCommand> Items);

public sealed record NutritionEntryListQuery(
    int PageNumber = 1,
    int PageSize = Paging.DefaultPageSize,
    DateOnly? Date = null,
    DateTimeOffset? From = null,
    DateTimeOffset? To = null,
    MealType? MealType = null);

/// <summary>
/// Sets the targets that apply from <see cref="EffectiveFrom"/> (today in the user's time zone when omitted).
/// All-null targets clear the record for that date; earlier dates keep the targets they already resolved to.
/// </summary>
public sealed record SaveNutritionGoalCommand(
    DateOnly? EffectiveFrom,
    decimal? EnergyKcal,
    decimal? ProteinGrams,
    decimal? CarbGrams,
    decimal? FatGrams);

internal static class NutritionValidation
{
    public const int MinYear = 2000;
    public const int MaxYear = 2100;

    /// <summary>An entered nutrient: zero or more, at most two decimals.</summary>
    public static IRuleBuilderOptions<T, decimal> Nutrient<T>(this IRuleBuilder<T, decimal> rule) =>
        rule
            .GreaterThanOrEqualTo(0).WithMessage("'{PropertyName}' must be zero or more.")
            .LessThanOrEqualTo(NutritionAmounts.MaxNutrient)
            .Must(NutritionAmounts.HasNutrientScale).WithMessage("'{PropertyName}' must have at most two decimal places.");

    /// <summary>An optional target: unset, or a positive two-decimal value. Never defaulted for the user.</summary>
    public static IRuleBuilderOptions<T, decimal?> OptionalTarget<T>(this IRuleBuilder<T, decimal?> rule) =>
        rule
            .Must(value => value is null || (value > 0 && value <= NutritionAmounts.MaxNutrient && NutritionAmounts.HasNutrientScale(value.Value)))
            .WithMessage("'{PropertyName}' must be greater than zero with at most two decimal places.");

    public static IRuleBuilderOptions<T, decimal> ConsumedQuantity<T>(this IRuleBuilder<T, decimal> rule) =>
        rule
            .GreaterThan(0).WithMessage("'{PropertyName}' must be greater than zero.")
            .LessThanOrEqualTo(NutritionAmounts.MaxQuantity)
            .Must(NutritionAmounts.HasQuantityScale).WithMessage("'{PropertyName}' must have at most three decimal places.");

    public static IRuleBuilderOptions<T, DateTimeOffset> KnownInstant<T>(this IRuleBuilder<T, DateTimeOffset> rule) =>
        rule
            .NotEqual(default(DateTimeOffset))
            .Must(instant => instant.Year is >= MinYear and <= MaxYear)
            .WithMessage($"'{{PropertyName}}' must be between the years {MinYear} and {MaxYear}.");

    public static IRuleBuilderOptions<T, DateOnly> KnownDate<T>(this IRuleBuilder<T, DateOnly> rule) =>
        rule
            .Must(date => date.Year is >= MinYear and <= MaxYear)
            .WithMessage($"'{{PropertyName}}' must be between the years {MinYear} and {MaxYear}.");
}

public sealed class NutritionItemCommandValidator : AbstractValidator<NutritionItemCommand>
{
    public NutritionItemCommandValidator()
    {
        RuleFor(item => item.Name).NotEmpty().MaximumLength(NutritionEntryItem.NameMaxLength);
        RuleFor(item => item.QuantityMode).IsInEnum();
        RuleFor(item => item.Quantity).ConsumedQuantity();
        RuleFor(item => item.EnergyKcalPerUnit).Nutrient();
        RuleFor(item => item.ProteinGramsPerUnit).Nutrient();
        RuleFor(item => item.CarbGramsPerUnit).Nutrient();
        RuleFor(item => item.FatGramsPerUnit).Nutrient();
    }
}

public sealed class CreateNutritionEntryCommandValidator : AbstractValidator<CreateNutritionEntryCommand>
{
    public CreateNutritionEntryCommandValidator()
    {
        RuleFor(command => command.MealType).IsInEnum();
        RuleFor(command => command.ConsumedAtUtc).KnownInstant();
        RuleFor(command => command.Note).MaximumLength(NutritionEntry.NoteMaxLength);
        RuleFor(command => command.Items).NotEmpty().Must(items => items is null || items.Count <= NutritionEntry.MaxItems)
            .WithMessage($"'{{PropertyName}}' can hold at most {NutritionEntry.MaxItems} food items.");
        RuleForEach(command => command.Items).SetValidator(new NutritionItemCommandValidator());
    }
}

public sealed class UpdateNutritionEntryCommandValidator : AbstractValidator<UpdateNutritionEntryCommand>
{
    public UpdateNutritionEntryCommandValidator()
    {
        RuleFor(command => command.MealType).IsInEnum();
        RuleFor(command => command.ConsumedAtUtc).KnownInstant();
        RuleFor(command => command.Note).MaximumLength(NutritionEntry.NoteMaxLength);
        RuleFor(command => command.Items).NotEmpty().Must(items => items is null || items.Count <= NutritionEntry.MaxItems)
            .WithMessage($"'{{PropertyName}}' can hold at most {NutritionEntry.MaxItems} food items.");
        RuleForEach(command => command.Items).SetValidator(new NutritionItemCommandValidator());
    }
}

public sealed class NutritionEntryListQueryValidator : AbstractValidator<NutritionEntryListQuery>
{
    public NutritionEntryListQueryValidator()
    {
        RuleFor(query => query.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(query => query.PageSize).InclusiveBetween(1, Paging.MaxPageSize);
        RuleFor(query => query.MealType).IsInEnum().When(query => query.MealType is not null);
        RuleFor(query => query.Date!.Value).KnownDate().When(query => query.Date is not null);
        RuleFor(query => query)
            .Must(query => query.From is null || query.To is null || query.From <= query.To)
            .WithMessage("'From' must not be after 'To'.")
            .WithName("From");
    }
}

public sealed class SaveNutritionGoalCommandValidator : AbstractValidator<SaveNutritionGoalCommand>
{
    public SaveNutritionGoalCommandValidator()
    {
        RuleFor(command => command.EffectiveFrom!.Value).KnownDate().When(command => command.EffectiveFrom is not null);
        RuleFor(command => command.EnergyKcal).OptionalTarget();
        RuleFor(command => command.ProteinGrams).OptionalTarget();
        RuleFor(command => command.CarbGrams).OptionalTarget();
        RuleFor(command => command.FatGrams).OptionalTarget();
    }
}
