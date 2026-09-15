using Libra.Application.Common;
using Libra.Domain.Finance;
using Microsoft.EntityFrameworkCore;

namespace Libra.Application.Finance.Transactions;

public sealed class TransactionsHandler(ILibraDbContext db, TimeProvider clock)
{
    public async Task<PagedResponse<TransactionResponse>> ListAsync(Guid userId, TransactionListQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var currency = query.CurrencyCode is null ? null : Money.NormalizeCurrencyCode(query.CurrencyCode);
        var fromUtc = query.From?.UtcDateTime;
        var toUtc = query.To?.UtcDateTime;

        var filtered = Projection(userId)
            .Where(row => fromUtc == null || row.OccurredAtUtc >= fromUtc)
            .Where(row => toUtc == null || row.OccurredAtUtc <= toUtc)
            .Where(row => query.Type == null || row.Type == query.Type)
            .Where(row => query.AccountId == null || row.AccountId == query.AccountId)
            .Where(row => query.CategoryId == null || row.CategoryId == query.CategoryId)
            .Where(row => currency == null || row.CurrencyCode == currency);

        var totalCount = await filtered.CountAsync(cancellationToken);
        var items = await filtered
            .OrderByDescending(row => row.OccurredAtUtc)
            .ThenByDescending(row => row.Id)
            .Skip((query.PageNumber - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken);

        return new PagedResponse<TransactionResponse>(items, query.PageNumber, query.PageSize, totalCount);
    }

    public async Task<Result<TransactionResponse>> GetAsync(Guid userId, Guid transactionId, CancellationToken cancellationToken)
    {
        var row = await Projection(userId).SingleOrDefaultAsync(candidate => candidate.Id == transactionId, cancellationToken);
        return row is null
            ? Result.NotFound<TransactionResponse>(FinanceErrors.TransactionNotFound)
            : Result.Success(row);
    }

    public async Task<Result<CreateOutcome<TransactionResponse>>> CreateAsync(Guid userId, CreateTransactionCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        if (command.ClientRequestId is Guid requestId)
        {
            var existing = await FindByClientRequestIdAsync(userId, requestId, cancellationToken);
            if (existing is not null)
            {
                return Result.Success(new CreateOutcome<TransactionResponse>(existing, Created: false));
            }
        }

        var references = await LoadReferencesAsync(userId, command.AccountId, command.CategoryId, command.Type, cancellationToken);
        if (!references.IsSuccess)
        {
            return Result.Failure<CreateOutcome<TransactionResponse>>(references.Error!);
        }

        var (account, category) = references.Value!;
        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var transaction = FinancialTransaction.Create(
            userId,
            account,
            category,
            command.Type,
            command.Amount,
            command.OccurredAtUtc.UtcDateTime,
            command.Note,
            command.ClientRequestId,
            nowUtc);

        db.FinancialTransactions.Add(transaction);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (exception.IsUniqueViolation() && command.ClientRequestId is Guid raced)
        {
            // Concurrent retry with the same ClientRequestId: the first insert won; return it.
            var winner = await FindByClientRequestIdAsync(userId, raced, cancellationToken);
            if (winner is not null)
            {
                return Result.Success(new CreateOutcome<TransactionResponse>(winner, Created: false));
            }

            throw;
        }

        var response = await Projection(userId).SingleAsync(row => row.Id == transaction.Id, cancellationToken);
        return Result.Success(new CreateOutcome<TransactionResponse>(response, Created: true));
    }

    public async Task<Result<TransactionResponse>> UpdateAsync(Guid userId, Guid transactionId, UpdateTransactionCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var transaction = await db.FinancialTransactions
            .SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == transactionId, cancellationToken);
        if (transaction is null)
        {
            return Result.NotFound<TransactionResponse>(FinanceErrors.TransactionNotFound);
        }

        var references = await LoadReferencesAsync(userId, command.AccountId, command.CategoryId, command.Type, cancellationToken);
        if (!references.IsSuccess)
        {
            return Result.Failure<TransactionResponse>(references.Error!);
        }

        var (account, category) = references.Value!;
        transaction.Update(account, category, command.Type, command.Amount, command.OccurredAtUtc.UtcDateTime, command.Note, clock.GetUtcNow().UtcDateTime);
        await db.SaveChangesAsync(cancellationToken);

        var response = await Projection(userId).SingleAsync(row => row.Id == transaction.Id, cancellationToken);
        return Result.Success(response);
    }

    public async Task<Result<bool>> DeleteAsync(Guid userId, Guid transactionId, CancellationToken cancellationToken)
    {
        var transaction = await db.FinancialTransactions
            .SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == transactionId, cancellationToken);
        if (transaction is null)
        {
            return Result.NotFound<bool>(FinanceErrors.TransactionNotFound);
        }

        // A transaction that records a recurring month is owned by that month. Deleting it here would leave the
        // month claiming to be recorded with nothing behind it; the recurring screen's undo removes both together.
        if (await db.RecurringOccurrences.AnyAsync(occurrence => occurrence.UserId == userId && occurrence.TransactionId == transaction.Id, cancellationToken))
        {
            return Result.Conflict<bool>(FinanceErrors.TransactionLinkedToRecurring, "Undo the month from Təkrarlananlar; that removes the transaction with it.");
        }

        db.FinancialTransactions.Remove(transaction);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success(true);
    }

    /// <summary>Owner-scoped projection with account and category names; the only read shape exposed.</summary>
    internal IQueryable<TransactionResponse> Projection(Guid userId) =>
        db.FinancialTransactions
            .Where(transaction => transaction.UserId == userId)
            .Join(db.FinancialAccounts, transaction => transaction.AccountId, account => account.Id, (transaction, account) => new { transaction, account })
            .Join(db.FinanceCategories, pair => pair.transaction.CategoryId, category => category.Id, (pair, category) => new TransactionResponse
            {
                Id = pair.transaction.Id,
                AccountId = pair.account.Id,
                AccountName = pair.account.Name,
                CurrencyCode = pair.account.CurrencyCode,
                CategoryId = category.Id,
                CategoryName = category.Name,
                Type = pair.transaction.Type,
                Amount = pair.transaction.Amount,
                OccurredAtUtc = pair.transaction.OccurredAtUtc,
                Note = pair.transaction.Note,
                ClientRequestId = pair.transaction.ClientRequestId,
                CreatedAtUtc = pair.transaction.CreatedAtUtc,
                UpdatedAtUtc = pair.transaction.UpdatedAtUtc,
            })
            .AsNoTracking();

    private Task<TransactionResponse?> FindByClientRequestIdAsync(Guid userId, Guid clientRequestId, CancellationToken cancellationToken) =>
        Projection(userId).SingleOrDefaultAsync(row => row.ClientRequestId == clientRequestId, cancellationToken);

    /// <summary>Loads the owner's account and category, enforcing archive and kind rules. Foreign ids look absent (404).</summary>
    private async Task<Result<(FinancialAccount Account, FinanceCategory Category)>> LoadReferencesAsync(
        Guid userId,
        Guid accountId,
        Guid categoryId,
        FinancialTransactionType type,
        CancellationToken cancellationToken)
    {
        var account = await db.FinancialAccounts
            .SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == accountId, cancellationToken);
        if (account is null)
        {
            return Result.NotFound<(FinancialAccount, FinanceCategory)>(FinanceErrors.AccountNotFound);
        }

        var category = await db.FinanceCategories
            .SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == categoryId, cancellationToken);
        if (category is null)
        {
            return Result.NotFound<(FinancialAccount, FinanceCategory)>(FinanceErrors.CategoryNotFound);
        }

        if (account.IsArchived)
        {
            return Result.Conflict<(FinancialAccount, FinanceCategory)>(FinanceErrors.AccountArchived);
        }

        if (category.IsArchived)
        {
            return Result.Conflict<(FinancialAccount, FinanceCategory)>(FinanceErrors.CategoryArchived);
        }

        if (!category.Matches(type))
        {
            return Result.Conflict<(FinancialAccount, FinanceCategory)>(FinanceErrors.CategoryKindMismatch);
        }

        return Result.Success((account, category));
    }
}
