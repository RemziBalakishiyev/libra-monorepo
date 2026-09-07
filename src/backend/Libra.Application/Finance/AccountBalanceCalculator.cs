using Libra.Application.Common;
using Libra.Domain.Finance;
using Microsoft.EntityFrameworkCore;

namespace Libra.Application.Finance;

/// <summary>
/// Balance = opening balance + income − expense + incoming transfers − outgoing transfers, for activity that
/// occurred at or before the requested instant. Uses three grouped queries per call, never one per account.
/// </summary>
public sealed class AccountBalanceCalculator(ILibraDbContext db)
{
    public async Task<IReadOnlyDictionary<Guid, decimal>> DeltasAsync(Guid userId, DateTime asOfUtc, CancellationToken cancellationToken)
    {
        var deltas = new Dictionary<Guid, decimal>();

        var transactions = await db.FinancialTransactions
            .Where(transaction => transaction.UserId == userId && transaction.OccurredAtUtc <= asOfUtc)
            .GroupBy(transaction => new { transaction.AccountId, transaction.Type })
            .Select(group => new { group.Key.AccountId, group.Key.Type, Total = group.Sum(transaction => transaction.Amount) })
            .ToListAsync(cancellationToken);

        foreach (var row in transactions)
        {
            Add(deltas, row.AccountId, row.Type == FinancialTransactionType.Income ? row.Total : -row.Total);
        }

        var outgoing = await db.AccountTransfers
            .Where(transfer => transfer.UserId == userId && transfer.OccurredAtUtc <= asOfUtc)
            .GroupBy(transfer => transfer.SourceAccountId)
            .Select(group => new { AccountId = group.Key, Total = group.Sum(transfer => transfer.SourceAmount) })
            .ToListAsync(cancellationToken);

        foreach (var row in outgoing)
        {
            Add(deltas, row.AccountId, -row.Total);
        }

        var incoming = await db.AccountTransfers
            .Where(transfer => transfer.UserId == userId && transfer.OccurredAtUtc <= asOfUtc)
            .GroupBy(transfer => transfer.DestinationAccountId)
            .Select(group => new { AccountId = group.Key, Total = group.Sum(transfer => transfer.DestinationAmount) })
            .ToListAsync(cancellationToken);

        foreach (var row in incoming)
        {
            Add(deltas, row.AccountId, row.Total);
        }

        return deltas;
    }

    public static decimal BalanceOf(FinancialAccount account, IReadOnlyDictionary<Guid, decimal> deltas)
    {
        ArgumentNullException.ThrowIfNull(account);
        ArgumentNullException.ThrowIfNull(deltas);
        return account.OpeningBalance + deltas.GetValueOrDefault(account.Id);
    }

    /// <summary>Ids of the user's accounts that have at least one transaction or transfer.</summary>
    public async Task<HashSet<Guid>> AccountsWithActivityAsync(Guid userId, CancellationToken cancellationToken)
    {
        var fromTransactions = db.FinancialTransactions
            .Where(transaction => transaction.UserId == userId)
            .Select(transaction => transaction.AccountId);
        var fromSources = db.AccountTransfers
            .Where(transfer => transfer.UserId == userId)
            .Select(transfer => transfer.SourceAccountId);
        var fromDestinations = db.AccountTransfers
            .Where(transfer => transfer.UserId == userId)
            .Select(transfer => transfer.DestinationAccountId);

        var ids = await fromTransactions.Union(fromSources).Union(fromDestinations).ToListAsync(cancellationToken);
        return [.. ids];
    }

    public async Task<bool> HasActivityAsync(Guid userId, Guid accountId, CancellationToken cancellationToken) =>
        await db.FinancialTransactions.AnyAsync(transaction => transaction.UserId == userId && transaction.AccountId == accountId, cancellationToken)
        || await db.AccountTransfers.AnyAsync(
            transfer => transfer.UserId == userId && (transfer.SourceAccountId == accountId || transfer.DestinationAccountId == accountId),
            cancellationToken);

    private static void Add(Dictionary<Guid, decimal> deltas, Guid accountId, decimal amount) =>
        deltas[accountId] = deltas.GetValueOrDefault(accountId) + amount;
}
