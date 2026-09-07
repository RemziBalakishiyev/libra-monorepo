using Libra.Application.Common;
using Libra.Domain.Finance;
using Microsoft.EntityFrameworkCore;

namespace Libra.Application.Finance.Categories;

public sealed class CategoriesHandler(ILibraDbContext db, TimeProvider clock)
{
    public async Task<IReadOnlyList<CategoryResponse>> ListAsync(Guid userId, FinanceCategoryKind? kind, bool includeArchived, CancellationToken cancellationToken)
    {
        var categories = await db.FinanceCategories
            .AsNoTracking()
            .Where(category => category.UserId == userId
                && (includeArchived || !category.IsArchived)
                && (kind == null || category.Kind == kind))
            .OrderBy(category => category.IsArchived)
            .ThenBy(category => category.Kind)
            .ThenBy(category => category.Name)
            .ThenBy(category => category.Id)
            .ToListAsync(cancellationToken);

        return categories.Select(category => category.ToResponse()).ToList();
    }

    public async Task<Result<CategoryResponse>> GetAsync(Guid userId, Guid categoryId, CancellationToken cancellationToken)
    {
        var category = await db.FinanceCategories
            .AsNoTracking()
            .SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == categoryId, cancellationToken);

        return category is null
            ? Result.NotFound<CategoryResponse>(FinanceErrors.CategoryNotFound)
            : Result.Success(category.ToResponse());
    }

    public async Task<Result<CategoryResponse>> CreateAsync(Guid userId, CreateCategoryCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var name = command.Name.Trim();
        var taken = await db.FinanceCategories.AnyAsync(
            candidate => candidate.UserId == userId && candidate.Kind == command.Kind && candidate.Name == name,
            cancellationToken);
        if (taken)
        {
            return Result.Conflict<CategoryResponse>(FinanceErrors.CategoryNameTaken);
        }

        var category = FinanceCategory.Create(userId, name, command.Kind, isSystemDefault: false, clock.GetUtcNow().UtcDateTime);
        db.FinanceCategories.Add(category);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (exception.IsUniqueViolation())
        {
            return Result.Conflict<CategoryResponse>(FinanceErrors.CategoryNameTaken);
        }

        return Result.Success(category.ToResponse());
    }

    public async Task<Result<CategoryResponse>> UpdateAsync(Guid userId, Guid categoryId, UpdateCategoryCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var category = await db.FinanceCategories
            .SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == categoryId, cancellationToken);
        if (category is null)
        {
            return Result.NotFound<CategoryResponse>(FinanceErrors.CategoryNotFound);
        }

        var name = command.Name.Trim();
        var taken = await db.FinanceCategories.AnyAsync(
            candidate => candidate.UserId == userId && candidate.Kind == category.Kind && candidate.Name == name && candidate.Id != categoryId,
            cancellationToken);
        if (taken)
        {
            return Result.Conflict<CategoryResponse>(FinanceErrors.CategoryNameTaken);
        }

        var nowUtc = clock.GetUtcNow().UtcDateTime;
        category.Rename(name, nowUtc);
        if (command.IsArchived && !category.IsArchived)
        {
            category.Archive(nowUtc);
        }
        else if (!command.IsArchived && category.IsArchived)
        {
            category.Restore(nowUtc);
        }

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (exception.IsUniqueViolation())
        {
            return Result.Conflict<CategoryResponse>(FinanceErrors.CategoryNameTaken);
        }

        return Result.Success(category.ToResponse());
    }

    public async Task<Result<bool>> DeleteAsync(Guid userId, Guid categoryId, CancellationToken cancellationToken)
    {
        var category = await db.FinanceCategories
            .SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == categoryId, cancellationToken);
        if (category is null)
        {
            return Result.NotFound<bool>(FinanceErrors.CategoryNotFound);
        }

        var inUse = await db.FinancialTransactions.AnyAsync(transaction => transaction.CategoryId == categoryId, cancellationToken)
            || await db.MonthlyBudgets.AnyAsync(budget => budget.CategoryId == categoryId, cancellationToken);
        if (inUse)
        {
            return Result.Conflict<bool>(FinanceErrors.CategoryInUse);
        }

        db.FinanceCategories.Remove(category);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success(true);
    }
}
