using FluentValidation;
using Libra.Domain.Nutrition;

namespace Libra.Application.Nutrition.FoodAnalysis;

/// <summary>
/// The user-reviewed meal. The diary date, meal type and time come from the client's own choice; nothing the
/// model or the image metadata said can override them, and the items are validated by the ordinary nutrition
/// rules before anything is stored.
/// </summary>
public sealed record ConfirmFoodAnalysisCommand(
    MealType MealType,
    DateTimeOffset ConsumedAtUtc,
    string? Note,
    IReadOnlyList<NutritionItemCommand> Items,
    Guid? ClientRequestId);

public sealed class ConfirmFoodAnalysisCommandValidator : AbstractValidator<ConfirmFoodAnalysisCommand>
{
    public ConfirmFoodAnalysisCommandValidator()
    {
        RuleFor(command => command.MealType).IsInEnum();
        RuleFor(command => command.ConsumedAtUtc).KnownInstant();
        RuleFor(command => command.Note).MaximumLength(NutritionEntry.NoteMaxLength);
        RuleFor(command => command.Items)
            .NotEmpty()
            .Must(items => items is null || items.Count <= NutritionEntry.MaxItems)
            .WithMessage($"'{{PropertyName}}' can hold at most {NutritionEntry.MaxItems} food items.");
        RuleForEach(command => command.Items).SetValidator(new NutritionItemCommandValidator());
    }
}

/// <summary>A picture submitted for analysis. Bytes are validated and normalized before they leave the process.</summary>
public sealed record AnalyzeFoodPhotoCommand(byte[] Bytes, string ContentType, string? FileName, Guid? ClientRequestId);
