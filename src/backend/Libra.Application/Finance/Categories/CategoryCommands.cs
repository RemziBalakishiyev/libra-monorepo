using FluentValidation;
using Libra.Domain.Finance;

namespace Libra.Application.Finance.Categories;

public sealed record CreateCategoryCommand(string Name, FinanceCategoryKind Kind);

public sealed record UpdateCategoryCommand(string Name, bool IsArchived);

public sealed class CreateCategoryCommandValidator : AbstractValidator<CreateCategoryCommand>
{
    public CreateCategoryCommandValidator()
    {
        RuleFor(command => command.Name).NotEmpty().MaximumLength(FinanceCategory.NameMaxLength);
        RuleFor(command => command.Kind).IsInEnum();
    }
}

public sealed class UpdateCategoryCommandValidator : AbstractValidator<UpdateCategoryCommand>
{
    public UpdateCategoryCommandValidator()
    {
        RuleFor(command => command.Name).NotEmpty().MaximumLength(FinanceCategory.NameMaxLength);
    }
}

/// <summary>Azerbaijani defaults created idempotently by the finance setup use case.</summary>
public static class DefaultCategories
{
    public static readonly IReadOnlyList<(FinanceCategoryKind Kind, string Name)> All =
    [
        (FinanceCategoryKind.Income, "Maaş"),
        (FinanceCategoryKind.Income, "Bonus"),
        (FinanceCategoryKind.Income, "Freelance"),
        (FinanceCategoryKind.Income, "Digər gəlir"),
        (FinanceCategoryKind.Expense, "Ev"),
        (FinanceCategoryKind.Expense, "Market"),
        (FinanceCategoryKind.Expense, "Restoran"),
        (FinanceCategoryKind.Expense, "Nəqliyyat"),
        (FinanceCategoryKind.Expense, "Kredit"),
        (FinanceCategoryKind.Expense, "Kommunal"),
        (FinanceCategoryKind.Expense, "Sağlamlıq"),
        (FinanceCategoryKind.Expense, "İdman"),
        (FinanceCategoryKind.Expense, "Təhsil"),
        (FinanceCategoryKind.Expense, "Əyləncə"),
        (FinanceCategoryKind.Expense, "Abunəliklər"),
        (FinanceCategoryKind.Expense, "Digər xərc"),
    ];
}
