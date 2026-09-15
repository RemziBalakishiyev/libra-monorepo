using Libra.Application.Common;
using Libra.Domain.Finance;
using Microsoft.EntityFrameworkCore;

namespace Libra.Application.Finance.Debts;

/// <summary>
/// Receivables and payables as principal obligations.
///
/// Cash moves only through <see cref="DebtMovement"/> rows, which the balance calculator reads; the debt row
/// never carries a running total. Every payment also touches the debt row, so two payments racing on one debt
/// collide on its row version inside the database transaction — the second cannot commit, whatever it read.
/// </summary>
public sealed class DebtsHandler(ILibraDbContext db, TimeProvider clock)
{
    public async Task<PagedResponse<DebtResponse>> ListAsync(Guid userId, DebtListQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var settings = await UserFinanceSettings.LoadAsync(db, userId, cancellationToken);
        var today = LocalCalendar.ToLocalDate(settings.TimeZone, clock.GetUtcNow().UtcDateTime);
        var currency = query.CurrencyCode is null ? null : Money.NormalizeCurrencyCode(query.CurrencyCode);

        var filtered = Rows(userId)
            .Where(row => query.Direction == null || row.Debt.Direction == query.Direction)
            .Where(row => currency == null || row.Debt.CurrencyCode == currency)
            .Where(row => query.IncludeSettled || row.Paid < row.Debt.Principal);

        var totalCount = await filtered.CountAsync(cancellationToken);
        var page = await filtered
            .OrderBy(row => row.Debt.DueOn == null)
            .ThenBy(row => row.Debt.DueOn)
            .ThenByDescending(row => row.Debt.OpenedOn)
            .ThenBy(row => row.Debt.Id)
            .Skip((query.PageNumber - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken);

        return new PagedResponse<DebtResponse>(page.Select(row => ToResponse(row.Debt, row.Paid, row.OpeningActive, row.MovementCount, today)).ToList(), query.PageNumber, query.PageSize, totalCount);
    }

    public async Task<Result<DebtDetailResponse>> GetAsync(Guid userId, Guid debtId, CancellationToken cancellationToken)
    {
        var settings = await UserFinanceSettings.LoadAsync(db, userId, cancellationToken);
        var today = LocalCalendar.ToLocalDate(settings.TimeZone, clock.GetUtcNow().UtcDateTime);
        var detail = await DetailAsync(userId, debtId, today, cancellationToken);
        return detail is null ? Result.NotFound<DebtDetailResponse>(DebtErrors.DebtNotFound) : Result.Success(detail);
    }

    /// <summary>Outstanding, overdue and counts per currency over the whole data set, grouped in SQL.</summary>
    public async Task<DebtSummaryResponse> SummaryAsync(Guid userId, CancellationToken cancellationToken)
    {
        var settings = await UserFinanceSettings.LoadAsync(db, userId, cancellationToken);
        var today = LocalCalendar.ToLocalDate(settings.TimeZone, clock.GetUtcNow().UtcDateTime);

        var rows = await Rows(userId)
            .Select(row => new
            {
                row.Debt.CurrencyCode,
                row.Debt.Direction,
                Remaining = row.Debt.Principal - row.Paid,
                Overdue = row.Debt.DueOn != null && row.Debt.DueOn < today && row.Paid < row.Debt.Principal,
            })
            .GroupBy(row => new { row.CurrencyCode, row.Direction })
            .Select(group => new
            {
                group.Key.CurrencyCode,
                group.Key.Direction,
                Outstanding = group.Sum(row => row.Remaining > 0 ? row.Remaining : 0),
                OverdueAmount = group.Sum(row => row.Overdue ? row.Remaining : 0),
                OpenCount = group.Count(row => row.Remaining > 0),
                OverdueCount = group.Count(row => row.Overdue),
            })
            .ToListAsync(cancellationToken);

        var currencies = rows
            .GroupBy(row => row.CurrencyCode)
            .Select(group =>
            {
                var receivable = group.FirstOrDefault(row => row.Direction == DebtDirection.Receivable);
                var payable = group.FirstOrDefault(row => row.Direction == DebtDirection.Payable);
                return new DebtCurrencySummary(
                    group.Key,
                    receivable?.Outstanding ?? 0,
                    payable?.Outstanding ?? 0,
                    receivable?.OverdueAmount ?? 0,
                    payable?.OverdueAmount ?? 0,
                    receivable?.OpenCount ?? 0,
                    payable?.OpenCount ?? 0,
                    (receivable?.OverdueCount ?? 0) + (payable?.OverdueCount ?? 0));
            })
            .OrderBy(summary => summary.CurrencyCode)
            .ToList();

        return new DebtSummaryResponse(settings.TimeZone, today, currencies);
    }

    /// <summary>
    /// Records an obligation. With an account, the principal also moves through it now — one debt and one
    /// opening movement in a single save; without one, only the obligation exists and no balance changes.
    /// </summary>
    public async Task<Result<CreateOutcome<DebtDetailResponse>>> CreateAsync(Guid userId, CreateDebtCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var settings = await UserFinanceSettings.LoadAsync(db, userId, cancellationToken);
        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var today = LocalCalendar.ToLocalDate(settings.TimeZone, nowUtc);

        if (command.ClientRequestId is Guid requestId)
        {
            var existing = await db.Debts.AsNoTracking().SingleOrDefaultAsync(debt => debt.UserId == userId && debt.ClientRequestId == requestId, cancellationToken);
            if (existing is not null)
            {
                if (existing.Principal != command.Principal || existing.Direction != command.Direction || existing.CurrencyCode != Money.NormalizeCurrencyCode(command.CurrencyCode))
                {
                    return Result.Conflict<CreateOutcome<DebtDetailResponse>>(DebtErrors.IdempotencyKeyReused);
                }

                return Result.Success(new CreateOutcome<DebtDetailResponse>((await DetailAsync(userId, existing.Id, today, cancellationToken))!, Created: false));
            }
        }

        FinancialAccount? account = null;
        if (command.AccountId is Guid accountId)
        {
            var loaded = await LoadAccountAsync(userId, accountId, Money.NormalizeCurrencyCode(command.CurrencyCode), cancellationToken);
            if (!loaded.IsSuccess)
            {
                return Result.Failure<CreateOutcome<DebtDetailResponse>>(loaded.Error!);
            }

            account = loaded.Value;
        }

        var debt = Debt.Create(userId, command.Direction, command.CounterpartyName, command.Principal, command.CurrencyCode, command.OpenedOn, command.DueOn, command.Note, command.ClientRequestId, nowUtc);
        db.Debts.Add(debt);
        if (account is not null)
        {
            var occurredAtUtc = LocalCalendar.Day(settings.TimeZone, command.OpenedOn).StartUtc.AddHours(12);
            db.DebtMovements.Add(DebtMovement.Create(debt, DebtMovementKind.Opening, account, command.Principal, occurredAtUtc, null, null, nowUtc));
        }

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (exception.IsUniqueViolation() && command.ClientRequestId is Guid raced)
        {
            var winner = await db.Debts.AsNoTracking().SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.ClientRequestId == raced, cancellationToken);
            if (winner is not null)
            {
                return Result.Success(new CreateOutcome<DebtDetailResponse>((await DetailAsync(userId, winner.Id, today, cancellationToken))!, Created: false));
            }

            throw;
        }

        return Result.Success(new CreateOutcome<DebtDetailResponse>((await DetailAsync(userId, debt.Id, today, cancellationToken))!, Created: true));
    }

    /// <summary>
    /// Who, when it is due and the note may always change. Principal and opening date may change only while no
    /// money has moved: once an opening movement or a payment exists, those rows were recorded against the
    /// figures as they were, and rewriting one side would leave the other telling a different story.
    /// </summary>
    public async Task<Result<DebtDetailResponse>> UpdateAsync(Guid userId, Guid debtId, UpdateDebtCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var debt = await db.Debts.SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == debtId, cancellationToken);
        if (debt is null)
        {
            return Result.NotFound<DebtDetailResponse>(DebtErrors.DebtNotFound);
        }

        if (IsStale(command.ExpectedUpdatedAtUtc, debt.UpdatedAtUtc))
        {
            return Result.Conflict<DebtDetailResponse>(DebtErrors.StaleEdit, "Reload the debt and apply the change again.");
        }

        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var structural = command.Principal != debt.Principal || command.OpenedOn != debt.OpenedOn;
        if (structural)
        {
            var hasMovements = await db.DebtMovements.AnyAsync(movement => movement.DebtId == debt.Id, cancellationToken);
            if (hasMovements)
            {
                return Result.Conflict<DebtDetailResponse>(DebtErrors.StructureLocked, "Undo the payments first, or record the difference as a new debt.");
            }

            debt.Restructure(command.Principal, command.OpenedOn, command.DueOn, nowUtc);
        }

        debt.Describe(command.CounterpartyName, command.DueOn, command.Note, nowUtc);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Result.Conflict<DebtDetailResponse>(DebtErrors.StaleEdit, "Reload the debt and apply the change again.");
        }

        var settings = await UserFinanceSettings.LoadAsync(db, userId, cancellationToken);
        return Result.Success((await DetailAsync(userId, debt.Id, LocalCalendar.ToLocalDate(settings.TimeZone, nowUtc), cancellationToken))!);
    }

    /// <summary>Only a debt that never moved money can be deleted; anything else keeps its history.</summary>
    public async Task<Result<bool>> DeleteAsync(Guid userId, Guid debtId, CancellationToken cancellationToken)
    {
        var debt = await db.Debts.SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == debtId, cancellationToken);
        if (debt is null)
        {
            return Result.NotFound<bool>(DebtErrors.DebtNotFound);
        }

        if (await db.DebtMovements.AnyAsync(movement => movement.DebtId == debt.Id, cancellationToken))
        {
            return Result.Conflict<bool>(DebtErrors.HasMovements, "Undo its payments and opening movement first.");
        }

        db.Debts.Remove(debt);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success(true);
    }

    /// <summary>
    /// A partial or full repayment. The amount is checked against the remaining principal, and the debt row is
    /// touched in the same save, so a concurrent payment that already changed that remaining makes this save
    /// fail on the row version — the check and the write are one transaction. A retry with the same client
    /// request id replays the recorded payment.
    /// </summary>
    public async Task<Result<CreateOutcome<DebtDetailResponse>>> RecordPaymentAsync(Guid userId, Guid debtId, RecordDebtPaymentCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var settings = await UserFinanceSettings.LoadAsync(db, userId, cancellationToken);
        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var today = LocalCalendar.ToLocalDate(settings.TimeZone, nowUtc);

        var debt = await db.Debts.SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == debtId, cancellationToken);
        if (debt is null)
        {
            return Result.NotFound<CreateOutcome<DebtDetailResponse>>(DebtErrors.DebtNotFound);
        }

        if (command.ClientRequestId is Guid requestId)
        {
            var existing = await db.DebtMovements.AsNoTracking().SingleOrDefaultAsync(movement => movement.UserId == userId && movement.ClientRequestId == requestId, cancellationToken);
            if (existing is not null)
            {
                if (existing.DebtId != debt.Id || existing.Amount != command.Amount || existing.AccountId != command.AccountId)
                {
                    return Result.Conflict<CreateOutcome<DebtDetailResponse>>(DebtErrors.IdempotencyKeyReused);
                }

                return Result.Success(new CreateOutcome<DebtDetailResponse>((await DetailAsync(userId, debt.Id, today, cancellationToken))!, Created: false));
            }
        }

        var loaded = await LoadAccountAsync(userId, command.AccountId, debt.CurrencyCode, cancellationToken);
        if (!loaded.IsSuccess)
        {
            return Result.Failure<CreateOutcome<DebtDetailResponse>>(loaded.Error!);
        }

        var paid = await PaidAsync(debt.Id, cancellationToken);
        var remaining = Debt.RemainingOf(debt.Principal, paid);
        if (remaining <= 0)
        {
            return Result.Conflict<CreateOutcome<DebtDetailResponse>>(DebtErrors.AlreadySettled);
        }

        if (command.Amount > remaining)
        {
            return Result.Validation<CreateOutcome<DebtDetailResponse>>(DebtErrors.PaymentExceedsRemaining, $"At most {remaining:0.00} {debt.CurrencyCode} is outstanding.");
        }

        var occurredAtUtc = LocalCalendar.Day(settings.TimeZone, command.PaidOn).StartUtc.AddHours(12);
        var payment = DebtMovement.Create(debt, DebtMovementKind.Payment, loaded.Value!, command.Amount, occurredAtUtc, command.Note, command.ClientRequestId, nowUtc);
        db.DebtMovements.Add(payment);
        debt.Touch(nowUtc);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            // The remaining we checked is no longer the remaining: another payment committed first.
            db.DebtMovements.Remove(payment);
            return Result.Conflict<CreateOutcome<DebtDetailResponse>>(DebtErrors.ConcurrentPayment, "Reload the debt and check the remaining amount before paying again.");
        }
        catch (DbUpdateException exception) when (exception.IsUniqueViolation() && command.ClientRequestId is Guid raced)
        {
            db.DebtMovements.Remove(payment);
            var winner = await db.DebtMovements.AsNoTracking().SingleOrDefaultAsync(movement => movement.UserId == userId && movement.ClientRequestId == raced, cancellationToken);
            if (winner is not null && winner.DebtId == debt.Id)
            {
                return Result.Success(new CreateOutcome<DebtDetailResponse>((await DetailAsync(userId, debt.Id, today, cancellationToken))!, Created: false));
            }

            throw;
        }

        return Result.Success(new CreateOutcome<DebtDetailResponse>((await DetailAsync(userId, debt.Id, today, cancellationToken))!, Created: true));
    }

    /// <summary>
    /// Takes a payment back. The movement is marked reversed and the debt touched in one save, so the remaining
    /// principal and the account balance move together. An already reversed payment is left alone and the
    /// current state returned, which makes a retried undo harmless.
    /// </summary>
    public async Task<Result<DebtDetailResponse>> UndoPaymentAsync(Guid userId, Guid debtId, Guid paymentId, CancellationToken cancellationToken)
    {
        var settings = await UserFinanceSettings.LoadAsync(db, userId, cancellationToken);
        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var today = LocalCalendar.ToLocalDate(settings.TimeZone, nowUtc);

        var debt = await db.Debts.SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == debtId, cancellationToken);
        if (debt is null)
        {
            return Result.NotFound<DebtDetailResponse>(DebtErrors.DebtNotFound);
        }

        var payment = await db.DebtMovements.SingleOrDefaultAsync(
            candidate => candidate.UserId == userId && candidate.DebtId == debt.Id && candidate.Id == paymentId && candidate.Kind == DebtMovementKind.Payment,
            cancellationToken);
        if (payment is null)
        {
            return Result.NotFound<DebtDetailResponse>(DebtErrors.PaymentNotFound);
        }

        if (payment.Reverse(nowUtc))
        {
            debt.Touch(nowUtc);
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateConcurrencyException)
            {
                return Result.Conflict<DebtDetailResponse>(DebtErrors.ConcurrentPayment, "Reload the debt and try again.");
            }
        }

        return Result.Success((await DetailAsync(userId, debt.Id, today, cancellationToken))!);
    }

    private async Task<DebtDetailResponse?> DetailAsync(Guid userId, Guid debtId, DateOnly today, CancellationToken cancellationToken)
    {
        var row = await Rows(userId).SingleOrDefaultAsync(candidate => candidate.Debt.Id == debtId, cancellationToken);
        if (row is null)
        {
            return null;
        }

        var history = await db.DebtMovements
            .AsNoTracking()
            .Where(movement => movement.DebtId == debtId)
            .Join(db.FinancialAccounts, movement => movement.AccountId, account => account.Id, (movement, account) => new { movement, account })
            .OrderByDescending(pair => pair.movement.OccurredAtUtc)
            .ThenByDescending(pair => pair.movement.Id)
            .ToListAsync(cancellationToken);

        return new DebtDetailResponse(
            ToResponse(row.Debt, row.Paid, row.OpeningActive, row.MovementCount, today),
            history.Select(pair => new DebtMovementResponse(
                pair.movement.Id,
                pair.movement.Kind,
                pair.account.Id,
                pair.account.Name,
                pair.movement.Amount,
                pair.movement.IsReversed ? 0 : DebtMovement.CashEffect(row.Debt.Direction, pair.movement.Kind, pair.movement.Amount),
                pair.movement.OccurredAtUtc,
                pair.movement.Note,
                pair.movement.IsReversed,
                pair.movement.ReversedAtUtc,
                pair.movement.CreatedAtUtc)).ToList());
    }

    private static DebtResponse ToResponse(Debt debt, decimal paid, bool openingActive, int movementCount, DateOnly today)
    {
        var status = Debt.StatusOf(debt.Principal, paid);
        return new DebtResponse(
            debt.Id,
            debt.Direction,
            debt.CounterpartyName,
            debt.Principal,
            paid,
            Debt.RemainingOf(debt.Principal, paid),
            debt.CurrencyCode,
            debt.OpenedOn,
            debt.DueOn,
            status,
            Debt.IsOverdue(debt.DueOn, status, today),
            openingActive,
            movementCount > 0,
            debt.Note,
            debt.ClientRequestId,
            debt.CreatedAtUtc,
            debt.UpdatedAtUtc);
    }

    /// <summary>Each debt with its valid payments summed and its movement facts, computed in the database.</summary>
    private IQueryable<DebtRow> Rows(Guid userId) =>
        db.Debts
            .AsNoTracking()
            .Where(debt => debt.UserId == userId)
            .Select(debt => new DebtRow
            {
                Debt = debt,
                Paid = db.DebtMovements
                    .Where(movement => movement.DebtId == debt.Id && movement.Kind == DebtMovementKind.Payment && movement.ReversedAtUtc == null)
                    .Sum(movement => (decimal?)movement.Amount) ?? 0,
                OpeningActive = db.DebtMovements.Any(movement => movement.DebtId == debt.Id && movement.Kind == DebtMovementKind.Opening && movement.ReversedAtUtc == null),
                MovementCount = db.DebtMovements.Count(movement => movement.DebtId == debt.Id),
            });

    private Task<decimal> PaidAsync(Guid debtId, CancellationToken cancellationToken) =>
        db.DebtMovements
            .Where(movement => movement.DebtId == debtId && movement.Kind == DebtMovementKind.Payment && movement.ReversedAtUtc == null)
            .SumAsync(movement => movement.Amount, cancellationToken);

    private async Task<Result<FinancialAccount>> LoadAccountAsync(Guid userId, Guid accountId, string currency, CancellationToken cancellationToken)
    {
        var account = await db.FinancialAccounts.SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == accountId, cancellationToken);
        if (account is null)
        {
            return Result.NotFound<FinancialAccount>(FinanceErrors.AccountNotFound);
        }

        if (account.IsArchived)
        {
            return Result.Conflict<FinancialAccount>(FinanceErrors.AccountArchived, "Choose an active account.");
        }

        if (account.CurrencyCode != currency)
        {
            return Result.Conflict<FinancialAccount>(DebtErrors.CurrencyMismatch, $"Choose an account in {currency}; this one is in {account.CurrencyCode}.");
        }

        return Result.Success(account);
    }

    private static bool IsStale(DateTime? expected, DateTime actual) =>
        expected is DateTime seen && Math.Abs((actual - seen).TotalMilliseconds) > 1;

    private sealed class DebtRow
    {
        public required Debt Debt { get; init; }

        public decimal Paid { get; init; }

        public bool OpeningActive { get; init; }

        public int MovementCount { get; init; }
    }
}
