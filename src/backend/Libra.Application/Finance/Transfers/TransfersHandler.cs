using Libra.Application.Common;
using Libra.Domain.Finance;
using Microsoft.EntityFrameworkCore;

namespace Libra.Application.Finance.Transfers;

public sealed class TransfersHandler(ILibraDbContext db, TimeProvider clock)
{
    public async Task<PagedResponse<TransferResponse>> ListAsync(Guid userId, TransferListQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var fromUtc = query.From?.UtcDateTime;
        var toUtc = query.To?.UtcDateTime;

        var filtered = Projection(userId)
            .Where(row => fromUtc == null || row.OccurredAtUtc >= fromUtc)
            .Where(row => toUtc == null || row.OccurredAtUtc <= toUtc)
            .Where(row => query.AccountId == null || row.SourceAccountId == query.AccountId || row.DestinationAccountId == query.AccountId);

        var totalCount = await filtered.CountAsync(cancellationToken);
        var items = await filtered
            .OrderByDescending(row => row.OccurredAtUtc)
            .ThenByDescending(row => row.Id)
            .Skip((query.PageNumber - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken);

        return new PagedResponse<TransferResponse>(items, query.PageNumber, query.PageSize, totalCount);
    }

    public async Task<Result<TransferResponse>> GetAsync(Guid userId, Guid transferId, CancellationToken cancellationToken)
    {
        var row = await Projection(userId).SingleOrDefaultAsync(candidate => candidate.Id == transferId, cancellationToken);
        return row is null
            ? Result.NotFound<TransferResponse>(FinanceErrors.TransferNotFound)
            : Result.Success(row);
    }

    public async Task<Result<CreateOutcome<TransferResponse>>> CreateAsync(Guid userId, CreateTransferCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        if (command.ClientRequestId is Guid requestId)
        {
            var existing = await FindByClientRequestIdAsync(userId, requestId, cancellationToken);
            if (existing is not null)
            {
                return Result.Success(new CreateOutcome<TransferResponse>(existing, Created: false));
            }
        }

        var accounts = await LoadAccountsAsync(userId, command.SourceAccountId, command.DestinationAccountId, command.SourceAmount, command.DestinationAmount, cancellationToken);
        if (!accounts.IsSuccess)
        {
            return Result.Failure<CreateOutcome<TransferResponse>>(accounts.Error!);
        }

        var (source, destination) = accounts.Value!;
        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var transfer = AccountTransfer.Create(
            userId,
            source,
            destination,
            command.SourceAmount,
            command.DestinationAmount,
            command.OccurredAtUtc.UtcDateTime,
            command.Note,
            command.ClientRequestId,
            nowUtc);

        db.AccountTransfers.Add(transfer);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (exception.IsUniqueViolation() && command.ClientRequestId is Guid raced)
        {
            var winner = await FindByClientRequestIdAsync(userId, raced, cancellationToken);
            if (winner is not null)
            {
                return Result.Success(new CreateOutcome<TransferResponse>(winner, Created: false));
            }

            throw;
        }

        var response = await Projection(userId).SingleAsync(row => row.Id == transfer.Id, cancellationToken);
        return Result.Success(new CreateOutcome<TransferResponse>(response, Created: true));
    }

    public async Task<Result<TransferResponse>> UpdateAsync(Guid userId, Guid transferId, UpdateTransferCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var transfer = await db.AccountTransfers
            .SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == transferId, cancellationToken);
        if (transfer is null)
        {
            return Result.NotFound<TransferResponse>(FinanceErrors.TransferNotFound);
        }

        var accounts = await LoadAccountsAsync(userId, command.SourceAccountId, command.DestinationAccountId, command.SourceAmount, command.DestinationAmount, cancellationToken);
        if (!accounts.IsSuccess)
        {
            return Result.Failure<TransferResponse>(accounts.Error!);
        }

        var (source, destination) = accounts.Value!;
        transfer.Update(source, destination, command.SourceAmount, command.DestinationAmount, command.OccurredAtUtc.UtcDateTime, command.Note, clock.GetUtcNow().UtcDateTime);
        await db.SaveChangesAsync(cancellationToken);

        var response = await Projection(userId).SingleAsync(row => row.Id == transfer.Id, cancellationToken);
        return Result.Success(response);
    }

    public async Task<Result<bool>> DeleteAsync(Guid userId, Guid transferId, CancellationToken cancellationToken)
    {
        var transfer = await db.AccountTransfers
            .SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == transferId, cancellationToken);
        if (transfer is null)
        {
            return Result.NotFound<bool>(FinanceErrors.TransferNotFound);
        }

        db.AccountTransfers.Remove(transfer);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success(true);
    }

    private IQueryable<TransferResponse> Projection(Guid userId) =>
        db.AccountTransfers
            .Where(transfer => transfer.UserId == userId)
            .Join(db.FinancialAccounts, transfer => transfer.SourceAccountId, source => source.Id, (transfer, source) => new { transfer, source })
            .Join(db.FinancialAccounts, pair => pair.transfer.DestinationAccountId, destination => destination.Id, (pair, destination) => new TransferResponse
            {
                Id = pair.transfer.Id,
                SourceAccountId = pair.source.Id,
                SourceAccountName = pair.source.Name,
                SourceCurrencyCode = pair.source.CurrencyCode,
                SourceAmount = pair.transfer.SourceAmount,
                DestinationAccountId = destination.Id,
                DestinationAccountName = destination.Name,
                DestinationCurrencyCode = destination.CurrencyCode,
                DestinationAmount = pair.transfer.DestinationAmount,
                EffectiveRate = pair.source.CurrencyCode == destination.CurrencyCode ? null : decimal.Round(pair.transfer.DestinationAmount / pair.transfer.SourceAmount, 6),
                OccurredAtUtc = pair.transfer.OccurredAtUtc,
                Note = pair.transfer.Note,
                ClientRequestId = pair.transfer.ClientRequestId,
                CreatedAtUtc = pair.transfer.CreatedAtUtc,
                UpdatedAtUtc = pair.transfer.UpdatedAtUtc,
            })
            .AsNoTracking();

    private Task<TransferResponse?> FindByClientRequestIdAsync(Guid userId, Guid clientRequestId, CancellationToken cancellationToken) =>
        Projection(userId).SingleOrDefaultAsync(row => row.ClientRequestId == clientRequestId, cancellationToken);

    private async Task<Result<(FinancialAccount Source, FinancialAccount Destination)>> LoadAccountsAsync(
        Guid userId,
        Guid sourceId,
        Guid destinationId,
        decimal sourceAmount,
        decimal destinationAmount,
        CancellationToken cancellationToken)
    {
        if (sourceId == destinationId)
        {
            return Result.Validation<(FinancialAccount, FinancialAccount)>(FinanceErrors.SameAccountTransfer);
        }

        var accounts = await db.FinancialAccounts
            .Where(candidate => candidate.UserId == userId && (candidate.Id == sourceId || candidate.Id == destinationId))
            .ToListAsync(cancellationToken);

        var source = accounts.SingleOrDefault(candidate => candidate.Id == sourceId);
        var destination = accounts.SingleOrDefault(candidate => candidate.Id == destinationId);
        if (source is null || destination is null)
        {
            return Result.NotFound<(FinancialAccount, FinancialAccount)>(FinanceErrors.AccountNotFound);
        }

        if (source.IsArchived || destination.IsArchived)
        {
            return Result.Conflict<(FinancialAccount, FinancialAccount)>(FinanceErrors.AccountArchived);
        }

        if (string.Equals(source.CurrencyCode, destination.CurrencyCode, StringComparison.Ordinal) && sourceAmount != destinationAmount)
        {
            return Result.Validation<(FinancialAccount, FinancialAccount)>(FinanceErrors.SameCurrencyAmountsDiffer);
        }

        return Result.Success((source, destination));
    }
}
