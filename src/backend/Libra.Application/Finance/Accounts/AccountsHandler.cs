using Libra.Application.Common;
using Libra.Domain.Finance;
using Microsoft.EntityFrameworkCore;

namespace Libra.Application.Finance.Accounts;

public sealed class AccountsHandler(ILibraDbContext db, AccountBalanceCalculator balances, TimeProvider clock)
{
    public async Task<IReadOnlyList<AccountResponse>> ListAsync(Guid userId, bool includeArchived, CancellationToken cancellationToken)
    {
        var accounts = await db.FinancialAccounts
            .AsNoTracking()
            .Where(account => account.UserId == userId && (includeArchived || !account.IsArchived))
            .OrderBy(account => account.IsArchived)
            .ThenBy(account => account.Name)
            .ThenBy(account => account.Id)
            .ToListAsync(cancellationToken);

        return await MapAsync(userId, accounts, cancellationToken);
    }

    public async Task<Result<AccountResponse>> GetAsync(Guid userId, Guid accountId, CancellationToken cancellationToken)
    {
        var account = await db.FinancialAccounts
            .AsNoTracking()
            .SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == accountId, cancellationToken);
        if (account is null)
        {
            return Result.NotFound<AccountResponse>(FinanceErrors.AccountNotFound);
        }

        var responses = await MapAsync(userId, [account], cancellationToken);
        return Result.Success(responses[0]);
    }

    public async Task<Result<AccountResponse>> CreateAsync(Guid userId, CreateAccountCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var account = FinancialAccount.Create(
            userId,
            command.Name,
            command.Type,
            command.CurrencyCode,
            command.OpeningBalance,
            command.IsIncludedInTotal,
            nowUtc);

        db.FinancialAccounts.Add(account);
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success(account.ToResponse(account.OpeningBalance, hasActivity: false));
    }

    public async Task<Result<AccountResponse>> UpdateAsync(Guid userId, Guid accountId, UpdateAccountCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var account = await db.FinancialAccounts
            .SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == accountId, cancellationToken);
        if (account is null)
        {
            return Result.NotFound<AccountResponse>(FinanceErrors.AccountNotFound);
        }

        var hasActivity = await balances.HasActivityAsync(userId, accountId, cancellationToken);
        var currency = Money.NormalizeCurrencyCode(command.CurrencyCode);
        var nowUtc = clock.GetUtcNow().UtcDateTime;

        if (!string.Equals(currency, account.CurrencyCode, StringComparison.Ordinal))
        {
            if (hasActivity)
            {
                return Result.Conflict<AccountResponse>(FinanceErrors.CurrencyLocked);
            }

            account.ChangeCurrency(currency, nowUtc);
        }

        if (command.OpeningBalance != account.OpeningBalance)
        {
            if (hasActivity)
            {
                return Result.Conflict<AccountResponse>(FinanceErrors.OpeningBalanceLocked);
            }

            account.ChangeOpeningBalance(command.OpeningBalance, nowUtc);
        }

        account.UpdateDetails(command.Name, command.Type, command.IsIncludedInTotal, nowUtc);

        if (command.IsArchived && !account.IsArchived)
        {
            account.Archive(nowUtc);
        }
        else if (!command.IsArchived && account.IsArchived)
        {
            account.Restore(nowUtc);
        }

        await db.SaveChangesAsync(cancellationToken);

        var deltas = await balances.DeltasAsync(userId, nowUtc, cancellationToken);
        return Result.Success(account.ToResponse(AccountBalanceCalculator.BalanceOf(account, deltas), hasActivity));
    }

    public async Task<Result<bool>> DeleteAsync(Guid userId, Guid accountId, CancellationToken cancellationToken)
    {
        var account = await db.FinancialAccounts
            .SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == accountId, cancellationToken);
        if (account is null)
        {
            return Result.NotFound<bool>(FinanceErrors.AccountNotFound);
        }

        if (await balances.HasActivityAsync(userId, accountId, cancellationToken))
        {
            return Result.Conflict<bool>(FinanceErrors.AccountInUse);
        }

        db.FinancialAccounts.Remove(account);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success(true);
    }

    private async Task<IReadOnlyList<AccountResponse>> MapAsync(Guid userId, List<FinancialAccount> accounts, CancellationToken cancellationToken)
    {
        if (accounts.Count == 0)
        {
            return [];
        }

        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var deltas = await balances.DeltasAsync(userId, nowUtc, cancellationToken);
        var active = await balances.AccountsWithActivityAsync(userId, cancellationToken);

        return accounts
            .Select(account => account.ToResponse(AccountBalanceCalculator.BalanceOf(account, deltas), active.Contains(account.Id)))
            .ToList();
    }
}
