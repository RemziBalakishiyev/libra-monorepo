using Libra.Application.Common;
using Libra.Application.Finance.Transactions;
using Libra.Domain.Finance;
using Microsoft.EntityFrameworkCore;

namespace Libra.Application.Finance.Recurring;

/// <summary>
/// Monthly recurring templates and the months they produce.
///
/// Reading is free of side effects: a month's pending occurrences are computed from the templates on every
/// request and never written. Money moves only in <see cref="RecordAsync"/>, where one transaction and one
/// occurrence row are saved together, and the unique <c>(template, year, month)</c> index makes the second of
/// two racing confirmations replay the first instead of posting again.
/// </summary>
public sealed class RecurringHandler(ILibraDbContext db, TransactionsHandler transactions, TimeProvider clock)
{
    public async Task<IReadOnlyList<RecurringTemplateResponse>> ListTemplatesAsync(Guid userId, CancellationToken cancellationToken) =>
        await TemplateProjection(userId)
            .OrderByDescending(row => row.IsActive)
            .ThenBy(row => row.DayOfMonth)
            .ThenBy(row => row.Title)
            .ToListAsync(cancellationToken);

    public async Task<Result<RecurringTemplateResponse>> GetTemplateAsync(Guid userId, Guid templateId, CancellationToken cancellationToken)
    {
        var row = await TemplateProjection(userId).SingleOrDefaultAsync(candidate => candidate.Id == templateId, cancellationToken);
        return row is null ? Result.NotFound<RecurringTemplateResponse>(RecurringErrors.TemplateNotFound) : Result.Success(row);
    }

    public async Task<Result<CreateOutcome<RecurringTemplateResponse>>> CreateTemplateAsync(Guid userId, CreateRecurringTemplateCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        if (command.ClientRequestId is Guid requestId)
        {
            var existing = await TemplateProjection(userId).SingleOrDefaultAsync(row => row.ClientRequestId == requestId, cancellationToken);
            if (existing is not null)
            {
                return Result.Success(new CreateOutcome<RecurringTemplateResponse>(existing, Created: false));
            }
        }

        var references = await LoadReferencesAsync(userId, command.AccountId, command.CategoryId, command.Type, cancellationToken);
        if (!references.IsSuccess)
        {
            return Result.Failure<CreateOutcome<RecurringTemplateResponse>>(references.Error!);
        }

        var (account, category) = references.Value!;
        var template = RecurringTransaction.Create(
            userId,
            command.Title,
            command.Type,
            command.Amount,
            account,
            category,
            command.DayOfMonth,
            command.StartDate,
            command.EndDate,
            command.Note,
            command.ClientRequestId,
            clock.GetUtcNow().UtcDateTime);
        db.RecurringTransactions.Add(template);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (exception.IsUniqueViolation() && command.ClientRequestId is Guid raced)
        {
            var winner = await TemplateProjection(userId).SingleOrDefaultAsync(row => row.ClientRequestId == raced, cancellationToken);
            if (winner is not null)
            {
                return Result.Success(new CreateOutcome<RecurringTemplateResponse>(winner, Created: false));
            }

            throw;
        }

        var response = await TemplateProjection(userId).SingleAsync(row => row.Id == template.Id, cancellationToken);
        return Result.Success(new CreateOutcome<RecurringTemplateResponse>(response, Created: true));
    }

    /// <summary>
    /// Edits the plan going forward. "Forward" means every month without an occurrence row — which includes
    /// earlier months the user never recorded, since those are still just the plan. Recorded months keep the
    /// snapshot and transaction they already have. Deactivating removes the template from every such month at
    /// once and touches nothing that was recorded.
    /// </summary>
    public async Task<Result<RecurringTemplateResponse>> UpdateTemplateAsync(Guid userId, Guid templateId, UpdateRecurringTemplateCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var template = await db.RecurringTransactions.SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == templateId, cancellationToken);
        if (template is null)
        {
            return Result.NotFound<RecurringTemplateResponse>(RecurringErrors.TemplateNotFound);
        }

        if (TasksStale(command.ExpectedUpdatedAtUtc, template.UpdatedAtUtc))
        {
            return Result.Conflict<RecurringTemplateResponse>(RecurringErrors.StaleEdit, "Reload the template and apply the change again.");
        }

        var references = await LoadReferencesAsync(userId, command.AccountId, command.CategoryId, command.Type, cancellationToken);
        if (!references.IsSuccess)
        {
            return Result.Failure<RecurringTemplateResponse>(references.Error!);
        }

        var (account, category) = references.Value!;
        var nowUtc = clock.GetUtcNow().UtcDateTime;
        template.Update(command.Title, command.Type, command.Amount, account, category, command.DayOfMonth, command.StartDate, command.EndDate, command.Note, nowUtc);
        template.SetActive(command.IsActive, nowUtc);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Result.Conflict<RecurringTemplateResponse>(RecurringErrors.StaleEdit, "Reload the template and apply the change again.");
        }

        return Result.Success(await TemplateProjection(userId).SingleAsync(row => row.Id == template.Id, cancellationToken));
    }

    /// <summary>A template with history is deactivated, never deleted: its recorded months must keep pointing at it.</summary>
    public async Task<Result<bool>> DeleteTemplateAsync(Guid userId, Guid templateId, CancellationToken cancellationToken)
    {
        var template = await db.RecurringTransactions.SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == templateId, cancellationToken);
        if (template is null)
        {
            return Result.NotFound<bool>(RecurringErrors.TemplateNotFound);
        }

        if (await db.RecurringOccurrences.AnyAsync(occurrence => occurrence.TemplateId == template.Id, cancellationToken))
        {
            return Result.Conflict<bool>(RecurringErrors.TemplateHasHistory, "Deactivate it instead; recorded months stay in history.");
        }

        db.RecurringTransactions.Remove(template);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success(true);
    }

    /// <summary>The selected month: pending rows computed from the plan, recorded and skipped rows from history. Reads only.</summary>
    public async Task<RecurringMonthResponse> ListMonthAsync(Guid userId, RecurringMonthQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var settings = await UserFinanceSettings.LoadAsync(db, userId, cancellationToken);
        var month = query.Year is int year && query.Month is int monthNumber
            ? LocalCalendar.Month(settings.TimeZone, year, monthNumber)
            : LocalCalendar.MonthOf(settings.TimeZone, clock.GetUtcNow().UtcDateTime);

        var templates = await TemplateProjection(userId).ToListAsync(cancellationToken);
        var rows = await db.RecurringOccurrences
            .AsNoTracking()
            .Where(occurrence => occurrence.UserId == userId && occurrence.Year == month.Year && occurrence.Month == month.Month)
            .ToListAsync(cancellationToken);
        var byTemplate = rows.ToDictionary(row => row.TemplateId);
        var domainTemplates = await db.RecurringTransactions
            .AsNoTracking()
            .Where(template => template.UserId == userId)
            .ToDictionaryAsync(template => template.Id, cancellationToken);

        var occurrences = new List<RecurringOccurrenceResponse>();
        foreach (var template in templates)
        {
            var domain = domainTemplates[template.Id];
            if (byTemplate.TryGetValue(template.Id, out var row))
            {
                occurrences.Add(new RecurringOccurrenceResponse(
                    template.Id,
                    row.Id,
                    row.Year,
                    row.Month,
                    row.DueDate,
                    row.Status,
                    row.Title,
                    template.Type,
                    row.Amount,
                    row.CurrencyCode,
                    template.CategoryId,
                    template.CategoryName,
                    template.AccountId,
                    template.AccountName,
                    row.TransactionId,
                    row.Status == RecurringOccurrenceStatus.Recorded ? row.UpdatedAtUtc : null,
                    template.IsActive,
                    row.UpdatedAtUtc));
                continue;
            }

            if (!template.IsActive || domain.DueDateIn(month.Year, month.Month) is not DateOnly due)
            {
                continue;
            }

            occurrences.Add(new RecurringOccurrenceResponse(
                template.Id,
                null,
                month.Year,
                month.Month,
                due,
                RecurringOccurrenceStatus.Pending,
                template.Title,
                template.Type,
                template.Amount,
                template.CurrencyCode,
                template.CategoryId,
                template.CategoryName,
                template.AccountId,
                template.AccountName,
                null,
                null,
                template.IsActive,
                null));
        }

        occurrences.Sort((left, right) =>
        {
            var byDate = left.DueDate.CompareTo(right.DueDate);
            return byDate != 0 ? byDate : string.Compare(left.Title, right.Title, StringComparison.OrdinalIgnoreCase);
        });

        return new RecurringMonthResponse(
            month.Year,
            month.Month,
            settings.TimeZone,
            occurrences,
            Totals(occurrences.Where(item => item.Status == RecurringOccurrenceStatus.Pending)),
            Totals(occurrences.Where(item => item.Status == RecurringOccurrenceStatus.Recorded)));
    }

    /// <summary>
    /// The user's confirmation. One ordinary transaction and one occurrence row are saved in a single
    /// transaction, so either both exist or neither. A month that is already recorded — by an earlier request,
    /// a retry with any client request id, or a concurrent confirmation that won the race — comes back as it
    /// was, with nothing posted again.
    /// </summary>
    public async Task<Result<CreateOutcome<RecordOccurrenceResponse>>> RecordAsync(Guid userId, Guid templateId, int year, int month, RecordOccurrenceCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        if (month is < 1 or > 12 || year is < MonthlyBudget.MinYear or > MonthlyBudget.MaxYear)
        {
            return Result.Validation<CreateOutcome<RecordOccurrenceResponse>>("Invalid month", "Year and month must name a calendar month between 2000 and 2100.");
        }

        var template = await db.RecurringTransactions.SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == templateId, cancellationToken);
        if (template is null)
        {
            return Result.NotFound<CreateOutcome<RecordOccurrenceResponse>>(RecurringErrors.TemplateNotFound);
        }

        var existing = await db.RecurringOccurrences.SingleOrDefaultAsync(
            occurrence => occurrence.TemplateId == template.Id && occurrence.Year == year && occurrence.Month == month,
            cancellationToken);
        if (existing is { Status: RecurringOccurrenceStatus.Recorded })
        {
            return Result.Success(new CreateOutcome<RecordOccurrenceResponse>(await ReplayAsync(userId, existing, cancellationToken), Created: false));
        }

        if (command.ClientRequestId is Guid requestId)
        {
            // The same key for a different month is a client bug, not a retry; accepting it would post money the
            // caller did not mean to post.
            var elsewhere = await db.RecurringOccurrences.AnyAsync(
                occurrence => occurrence.UserId == userId && occurrence.ClientRequestId == requestId && !(occurrence.TemplateId == template.Id && occurrence.Year == year && occurrence.Month == month),
                cancellationToken);
            if (elsewhere)
            {
                return Result.Conflict<CreateOutcome<RecordOccurrenceResponse>>(RecurringErrors.IdempotencyKeyReused);
            }
        }

        if (!template.IsActive)
        {
            return Result.Conflict<CreateOutcome<RecordOccurrenceResponse>>(RecurringErrors.Inactive, "Reactivate the template to record a month.");
        }

        var settings = await UserFinanceSettings.LoadAsync(db, userId, cancellationToken);
        var dueDate = existing?.DueDate ?? template.DueDateIn(year, month);
        if (dueDate is not DateOnly due)
        {
            return Result.Conflict<CreateOutcome<RecordOccurrenceResponse>>(RecurringErrors.NotScheduled);
        }

        var references = await LoadReferencesAsync(userId, command.AccountId ?? template.AccountId, template.CategoryId, template.Type, cancellationToken);
        if (!references.IsSuccess)
        {
            return Result.Failure<CreateOutcome<RecordOccurrenceResponse>>(references.Error!);
        }

        var (account, category) = references.Value!;
        if (account.CurrencyCode != template.CurrencyCode)
        {
            return Result.Conflict<CreateOutcome<RecordOccurrenceResponse>>(
                RecurringErrors.CurrencyMismatch,
                $"Choose an account in {template.CurrencyCode}; this one is in {account.CurrencyCode}.");
        }

        var nowUtc = clock.GetUtcNow().UtcDateTime;
        // The actual date defaults to the due date for a month already past and to today for one still ahead:
        // a confirmation says the money moved, and future-dated activity stays out of balances until it occurs.
        var todayLocal = LocalCalendar.ToLocalDate(settings.TimeZone, nowUtc);
        var occurredOn = command.OccurredOn ?? (due < todayLocal ? due : todayLocal);
        var occurredAtUtc = LocalCalendar.Day(settings.TimeZone, occurredOn).StartUtc.AddHours(12);
        var transaction = FinancialTransaction.Create(
            userId,
            account,
            category,
            template.Type,
            command.Amount ?? template.Amount,
            occurredAtUtc,
            command.Note ?? template.Note,
            null,
            nowUtc);
        db.FinancialTransactions.Add(transaction);

        RecurringOccurrence occurrence;
        if (existing is null)
        {
            occurrence = RecurringOccurrence.Recorded(userId, template, year, month, due, transaction, command.ClientRequestId, nowUtc);
            db.RecurringOccurrences.Add(occurrence);
        }
        else
        {
            occurrence = existing;
            occurrence.Record(template, transaction, command.ClientRequestId, nowUtc);
        }

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (Exception exception) when (IsWriteConflict(exception))
        {
            // Another confirmation of the same month got there first. Drop ours and answer with theirs.
            db.FinancialTransactions.Remove(transaction);
            if (existing is null)
            {
                db.RecurringOccurrences.Remove(occurrence);
            }

            var winner = await db.RecurringOccurrences
                .AsNoTracking()
                .SingleOrDefaultAsync(candidate => candidate.TemplateId == template.Id && candidate.Year == year && candidate.Month == month, cancellationToken);
            if (winner is { Status: RecurringOccurrenceStatus.Recorded })
            {
                return Result.Success(new CreateOutcome<RecordOccurrenceResponse>(await ReplayAsync(userId, winner, cancellationToken), Created: false));
            }

            return Result.Conflict<CreateOutcome<RecordOccurrenceResponse>>(RecurringErrors.AlreadyRecorded, "Reload the month and try again.");
        }

        var response = new RecordOccurrenceResponse(
            await OccurrenceResponseAsync(userId, occurrence, cancellationToken),
            await transactions.Projection(userId).SingleAsync(row => row.Id == transaction.Id, cancellationToken));
        return Result.Success(new CreateOutcome<RecordOccurrenceResponse>(response, Created: true));
    }

    /// <summary>The user declines this month. It stays in history as skipped and is never proposed again on its own.</summary>
    public async Task<Result<RecurringOccurrenceResponse>> SkipAsync(Guid userId, Guid templateId, int year, int month, CancellationToken cancellationToken)
    {
        if (month is < 1 or > 12 || year is < MonthlyBudget.MinYear or > MonthlyBudget.MaxYear)
        {
            return Result.Validation<RecurringOccurrenceResponse>("Invalid month", "Year and month must name a calendar month between 2000 and 2100.");
        }

        var template = await db.RecurringTransactions.SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == templateId, cancellationToken);
        if (template is null)
        {
            return Result.NotFound<RecurringOccurrenceResponse>(RecurringErrors.TemplateNotFound);
        }

        var existing = await db.RecurringOccurrences.SingleOrDefaultAsync(
            occurrence => occurrence.TemplateId == template.Id && occurrence.Year == year && occurrence.Month == month,
            cancellationToken);
        if (existing is not null)
        {
            return existing.Status == RecurringOccurrenceStatus.Recorded
                ? Result.Conflict<RecurringOccurrenceResponse>(RecurringErrors.AlreadyRecorded, "Undo the recording first.")
                : Result.Success(await OccurrenceResponseAsync(userId, existing, cancellationToken));
        }

        if (template.DueDateIn(year, month) is not DateOnly due)
        {
            return Result.Conflict<RecurringOccurrenceResponse>(RecurringErrors.NotScheduled);
        }

        var occurrence = RecurringOccurrence.Skipped(userId, template, year, month, due, clock.GetUtcNow().UtcDateTime);
        db.RecurringOccurrences.Add(occurrence);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (Exception exception) when (IsWriteConflict(exception))
        {
            db.RecurringOccurrences.Remove(occurrence);
            var winner = await db.RecurringOccurrences.AsNoTracking().SingleAsync(candidate => candidate.TemplateId == template.Id && candidate.Year == year && candidate.Month == month, cancellationToken);
            return Result.Success(await OccurrenceResponseAsync(userId, winner, cancellationToken));
        }

        return Result.Success(await OccurrenceResponseAsync(userId, occurrence, cancellationToken));
    }

    /// <summary>
    /// Takes a recording back: the transaction is deleted and the month becomes skipped, in one save. History
    /// keeps the row, the month is not re-proposed, and undoing twice is harmless.
    /// </summary>
    public async Task<Result<RecurringOccurrenceResponse>> UndoAsync(Guid userId, Guid templateId, int year, int month, CancellationToken cancellationToken)
    {
        var occurrence = await db.RecurringOccurrences.SingleOrDefaultAsync(
            candidate => candidate.UserId == userId && candidate.TemplateId == templateId && candidate.Year == year && candidate.Month == month,
            cancellationToken);
        if (occurrence is null)
        {
            return Result.NotFound<RecurringOccurrenceResponse>(RecurringErrors.NothingToUndo);
        }

        var transactionId = occurrence.TransactionId;
        if (occurrence.Undo(clock.GetUtcNow().UtcDateTime) && transactionId is Guid linked)
        {
            var transaction = await db.FinancialTransactions.SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == linked, cancellationToken);
            if (transaction is not null)
            {
                db.FinancialTransactions.Remove(transaction);
            }

            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateConcurrencyException)
            {
                return Result.Conflict<RecurringOccurrenceResponse>(RecurringErrors.StaleEdit, "Reload the month and try again.");
            }
        }

        return Result.Success(await OccurrenceResponseAsync(userId, occurrence, cancellationToken));
    }

    /// <summary>True when an ordinary transaction is the recording of a month; the generic delete refuses it.</summary>
    public Task<bool> IsLinkedAsync(Guid userId, Guid transactionId, CancellationToken cancellationToken) =>
        db.RecurringOccurrences.AnyAsync(occurrence => occurrence.UserId == userId && occurrence.TransactionId == transactionId, cancellationToken);

    private async Task<RecordOccurrenceResponse> ReplayAsync(Guid userId, RecurringOccurrence occurrence, CancellationToken cancellationToken) =>
        new(
            await OccurrenceResponseAsync(userId, occurrence, cancellationToken),
            await transactions.Projection(userId).SingleAsync(row => row.Id == occurrence.TransactionId, cancellationToken));

    private async Task<RecurringOccurrenceResponse> OccurrenceResponseAsync(Guid userId, RecurringOccurrence occurrence, CancellationToken cancellationToken)
    {
        var template = await TemplateProjection(userId).SingleAsync(row => row.Id == occurrence.TemplateId, cancellationToken);
        return new RecurringOccurrenceResponse(
            template.Id,
            occurrence.Id,
            occurrence.Year,
            occurrence.Month,
            occurrence.DueDate,
            occurrence.Status,
            occurrence.Title,
            template.Type,
            occurrence.Amount,
            occurrence.CurrencyCode,
            template.CategoryId,
            template.CategoryName,
            template.AccountId,
            template.AccountName,
            occurrence.TransactionId,
            occurrence.Status == RecurringOccurrenceStatus.Recorded ? occurrence.UpdatedAtUtc : null,
            template.IsActive,
            occurrence.UpdatedAtUtc);
    }

    private static List<CurrencyAmount> Totals(IEnumerable<RecurringOccurrenceResponse> items) =>
        items
            .GroupBy(item => item.CurrencyCode)
            .Select(group => new CurrencyAmount(
                group.Key,
                group.Where(item => item.Type == FinancialTransactionType.Income).Sum(item => item.Amount),
                group.Where(item => item.Type == FinancialTransactionType.Expense).Sum(item => item.Amount)))
            .OrderBy(total => total.CurrencyCode)
            .ToList();

    private IQueryable<RecurringTemplateResponse> TemplateProjection(Guid userId) =>
        db.RecurringTransactions
            .Where(template => template.UserId == userId)
            .Join(db.FinancialAccounts, template => template.AccountId, account => account.Id, (template, account) => new { template, account })
            .Join(db.FinanceCategories, pair => pair.template.CategoryId, category => category.Id, (pair, category) => new RecurringTemplateResponse
            {
                Id = pair.template.Id,
                Title = pair.template.Title,
                Type = pair.template.Type,
                Amount = pair.template.Amount,
                CurrencyCode = pair.template.CurrencyCode,
                CategoryId = category.Id,
                CategoryName = category.Name,
                AccountId = pair.account.Id,
                AccountName = pair.account.Name,
                DayOfMonth = pair.template.DayOfMonth,
                StartDate = pair.template.StartDate,
                EndDate = pair.template.EndDate,
                IsActive = pair.template.IsActive,
                Note = pair.template.Note,
                ClientRequestId = pair.template.ClientRequestId,
                CreatedAtUtc = pair.template.CreatedAtUtc,
                UpdatedAtUtc = pair.template.UpdatedAtUtc,
            })
            .AsNoTracking();

    /// <summary>Owner's account and category with the archive and kind rules; foreign ids look absent (404).</summary>
    private async Task<Result<(FinancialAccount Account, FinanceCategory Category)>> LoadReferencesAsync(Guid userId, Guid accountId, Guid categoryId, FinancialTransactionType type, CancellationToken cancellationToken)
    {
        var account = await db.FinancialAccounts.SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == accountId, cancellationToken);
        if (account is null)
        {
            return Result.NotFound<(FinancialAccount, FinanceCategory)>(FinanceErrors.AccountNotFound);
        }

        var category = await db.FinanceCategories.SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == categoryId, cancellationToken);
        if (category is null)
        {
            return Result.NotFound<(FinancialAccount, FinanceCategory)>(FinanceErrors.CategoryNotFound);
        }

        if (account.IsArchived)
        {
            return Result.Conflict<(FinancialAccount, FinanceCategory)>(FinanceErrors.AccountArchived, "Choose an active account for this month.");
        }

        if (category.IsArchived)
        {
            return Result.Conflict<(FinancialAccount, FinanceCategory)>(FinanceErrors.CategoryArchived, "Edit the template to use an active category.");
        }

        if (!category.Matches(type))
        {
            return Result.Conflict<(FinancialAccount, FinanceCategory)>(FinanceErrors.CategoryKindMismatch);
        }

        return Result.Success((account, category));
    }

    private static bool TasksStale(DateTime? expected, DateTime actual) =>
        expected is DateTime seen && Math.Abs((actual - seen).TotalMilliseconds) > 1;

    /// <summary>
    /// Walks the whole chain: EF Core wraps a unique or serialization failure in an InvalidOperationException
    /// about transient retries, and the PostgreSQL error sits two levels down. A concurrency exception on a
    /// skipped row being recorded twice counts too.
    /// </summary>
    private static bool IsWriteConflict(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is DbUpdateConcurrencyException || current is Npgsql.PostgresException { SqlState: "23505" or "40P01" or "40001" })
            {
                return true;
            }
        }

        return false;
    }
}
