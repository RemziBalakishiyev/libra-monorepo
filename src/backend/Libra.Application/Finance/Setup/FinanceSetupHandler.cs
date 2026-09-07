using Libra.Application.Common;
using Libra.Application.Finance.Accounts;
using Libra.Application.Finance.Categories;
using Libra.Domain.Finance;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Libra.Application.Finance.Setup;

public sealed class FinanceSetupHandler(
    ILibraDbContext db,
    AccountsHandler accounts,
    CategoriesHandler categories,
    TimeProvider clock,
    ILogger<FinanceSetupHandler> logger)
{
    public async Task<Result<FinanceSetupResponse>> HandleAsync(Guid userId, FinanceSetupCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // Serialize concurrent setup calls per user (double taps, retries) so the "no account yet" check and the
        // default-category insert cannot race. The advisory lock is released with the transaction.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await db.Database.ExecuteSqlAsync($"SELECT pg_advisory_xact_lock({LockKey(userId)})", cancellationToken);

        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var categoriesCreated = await EnsureDefaultCategoriesAsync(userId, nowUtc, cancellationToken);

        var accountCreated = false;
        var hasAccounts = await db.FinancialAccounts.AnyAsync(account => account.UserId == userId, cancellationToken);
        if (!hasAccounts && command.FirstAccount is not null)
        {
            var created = await accounts.CreateAsync(userId, command.FirstAccount, cancellationToken);
            if (!created.IsSuccess)
            {
                return Result.Failure<FinanceSetupResponse>(created.Error!);
            }

            accountCreated = true;
        }

        var accountList = await accounts.ListAsync(userId, includeArchived: false, cancellationToken);
        var categoryList = await categories.ListAsync(userId, kind: null, includeArchived: false, cancellationToken);

        await transaction.CommitAsync(cancellationToken);

        if (categoriesCreated > 0 || accountCreated)
        {
            logger.LogInformation("Finance setup for user {UserId}: {Categories} categories created, account created: {AccountCreated}", userId, categoriesCreated, accountCreated);
        }

        return Result.Success(new FinanceSetupResponse(
            IsComplete: accountList.Count > 0,
            categoriesCreated,
            accountCreated,
            categoryList,
            accountList));
    }

    private async Task<int> EnsureDefaultCategoriesAsync(Guid userId, DateTime nowUtc, CancellationToken cancellationToken)
    {
        var existing = await db.FinanceCategories
            .Where(category => category.UserId == userId)
            .Select(category => new { category.Kind, category.Name })
            .ToListAsync(cancellationToken);
        var existingKeys = existing.Select(category => (category.Kind, category.Name)).ToHashSet();

        var missing = DefaultCategories.All.Where(candidate => !existingKeys.Contains(candidate)).ToList();
        if (missing.Count == 0)
        {
            return 0;
        }

        var added = missing
            .Select(pair => FinanceCategory.Create(userId, pair.Name, pair.Kind, isSystemDefault: true, nowUtc))
            .ToList();
        db.FinanceCategories.AddRange(added);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
            return added.Count;
        }
        catch (DbUpdateException exception) when (exception.IsUniqueViolation())
        {
            // Defense in depth: should not happen under the advisory lock. Drop the failed inserts so the rest of
            // the unit of work can still be saved.
            db.FinanceCategories.RemoveRange(added);
            logger.LogInformation("Finance setup for user {UserId} found defaults already present", userId);
            return 0;
        }
    }

    /// <summary>Stable 64-bit key for pg_advisory_xact_lock derived from the user id.</summary>
    private static long LockKey(Guid userId) => BitConverter.ToInt64(userId.ToByteArray(), 0);
}
