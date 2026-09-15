using Libra.Application.Common;
using Libra.Domain.Nutrition;
using Microsoft.EntityFrameworkCore;

namespace Libra.Application.Nutrition;

/// <summary>
/// Create, read, edit and delete meals. Every query filters on the owner, so an id belonging to another user
/// simply does not exist (404) and can never be read, edited, deleted, or adopted through a nested item id.
/// </summary>
public sealed class NutritionEntriesHandler(ILibraDbContext db, TimeProvider clock)
{
    public async Task<PagedResponse<NutritionEntryResponse>> ListAsync(Guid userId, NutritionEntryListQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var range = query.Date is DateOnly date
            ? LocalCalendar.Day(await UserTimeZone.LoadAsync(db, userId, cancellationToken), date)
            : null;
        var fromUtc = range?.StartUtc ?? query.From?.UtcDateTime;
        var toUtc = range?.EndUtc ?? query.To?.UtcDateTime;
        var exclusiveEnd = range is not null;

        var filtered = Projection(userId)
            .Where(row => fromUtc == null || row.ConsumedAtUtc >= fromUtc)
            .Where(row => toUtc == null || (exclusiveEnd ? row.ConsumedAtUtc < toUtc : row.ConsumedAtUtc <= toUtc))
            .Where(row => query.MealType == null || row.MealType == query.MealType);

        var totalCount = await filtered.CountAsync(cancellationToken);
        var items = await filtered
            .OrderByDescending(row => row.ConsumedAtUtc)
            .ThenByDescending(row => row.Id)
            .Skip((query.PageNumber - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken);

        return new PagedResponse<NutritionEntryResponse>(items, query.PageNumber, query.PageSize, totalCount);
    }

    public async Task<Result<NutritionEntryResponse>> GetAsync(Guid userId, Guid entryId, CancellationToken cancellationToken)
    {
        var row = await Projection(userId).SingleOrDefaultAsync(candidate => candidate.Id == entryId, cancellationToken);
        return row is null
            ? Result.NotFound<NutritionEntryResponse>(NutritionErrors.EntryNotFound)
            : Result.Success(row);
    }

    public async Task<Result<CreateOutcome<NutritionEntryResponse>>> CreateAsync(Guid userId, CreateNutritionEntryCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        if (command.ClientRequestId is Guid requestId)
        {
            var existing = await FindByClientRequestIdAsync(userId, requestId, cancellationToken);
            if (existing is not null)
            {
                return Result.Success(new CreateOutcome<NutritionEntryResponse>(existing, Created: false));
            }
        }

        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var entry = NutritionEntry.Create(
            userId,
            command.MealType,
            command.ConsumedAtUtc.UtcDateTime,
            command.Note,
            command.Items.Select(item => item.ToDraft()),
            command.ClientRequestId,
            nowUtc);

        db.NutritionEntries.Add(entry);

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
                return Result.Success(new CreateOutcome<NutritionEntryResponse>(winner, Created: false));
            }

            throw;
        }

        var response = await Projection(userId).SingleAsync(row => row.Id == entry.Id, cancellationToken);
        return Result.Success(new CreateOutcome<NutritionEntryResponse>(response, Created: true));
    }

    public async Task<Result<NutritionEntryResponse>> UpdateAsync(Guid userId, Guid entryId, UpdateNutritionEntryCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var entry = await db.NutritionEntries
            .SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == entryId, cancellationToken);
        if (entry is null)
        {
            return Result.NotFound<NutritionEntryResponse>(NutritionErrors.EntryNotFound);
        }

        // Item ids from the request are ignored: the entry rebuilds its own snapshot rows.
        entry.Update(command.MealType, command.ConsumedAtUtc.UtcDateTime, command.Note, command.Items.Select(item => item.ToDraft()), clock.GetUtcNow().UtcDateTime);
        await db.SaveChangesAsync(cancellationToken);

        var response = await Projection(userId).SingleAsync(row => row.Id == entry.Id, cancellationToken);
        return Result.Success(response);
    }

    public async Task<Result<bool>> DeleteAsync(Guid userId, Guid entryId, CancellationToken cancellationToken)
    {
        var entry = await db.NutritionEntries
            .SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == entryId, cancellationToken);
        if (entry is null)
        {
            return Result.NotFound<bool>(NutritionErrors.EntryNotFound);
        }

        db.NutritionEntries.Remove(entry);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success(true);
    }

    /// <summary>Owner-scoped projection with the item snapshots and the entry totals; the only read shape exposed.</summary>
    internal IQueryable<NutritionEntryResponse> Projection(Guid userId) =>
        db.NutritionEntries
            .Where(entry => entry.UserId == userId)
            .Select(entry => new NutritionEntryResponse
            {
                Id = entry.Id,
                MealType = entry.MealType,
                ConsumedAtUtc = entry.ConsumedAtUtc,
                Note = entry.Note,
                ClientRequestId = entry.ClientRequestId,
                EnergyKcal = entry.Items.Sum(item => item.EnergyKcal),
                ProteinGrams = entry.Items.Sum(item => item.ProteinGrams),
                CarbGrams = entry.Items.Sum(item => item.CarbGrams),
                FatGrams = entry.Items.Sum(item => item.FatGrams),
                Items = entry.Items
                    .OrderBy(item => item.Position)
                    .Select(item => new NutritionItemResponse
                    {
                        Id = item.Id,
                        Name = item.Name,
                        QuantityMode = item.QuantityMode,
                        Quantity = item.Quantity,
                        EnergyKcalPerUnit = item.EnergyKcalPerUnit,
                        ProteinGramsPerUnit = item.ProteinGramsPerUnit,
                        CarbGramsPerUnit = item.CarbGramsPerUnit,
                        FatGramsPerUnit = item.FatGramsPerUnit,
                        EnergyKcal = item.EnergyKcal,
                        ProteinGrams = item.ProteinGrams,
                        CarbGrams = item.CarbGrams,
                        FatGrams = item.FatGrams,
                        Position = item.Position,
                    })
                    .ToList(),
                CreatedAtUtc = entry.CreatedAtUtc,
                UpdatedAtUtc = entry.UpdatedAtUtc,
            })
            .AsNoTracking();

    private Task<NutritionEntryResponse?> FindByClientRequestIdAsync(Guid userId, Guid clientRequestId, CancellationToken cancellationToken) =>
        Projection(userId).SingleOrDefaultAsync(row => row.ClientRequestId == clientRequestId, cancellationToken);
}
