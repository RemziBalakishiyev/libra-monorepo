using Libra.Application.Common;
using Libra.Domain.Nutrition;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Libra.Application.Nutrition.FoodAnalysis;

/// <summary>The stored picture handed back to its owner.</summary>
public sealed record FoodAnalysisImageContent(byte[] Bytes, string ContentType);

/// <summary>
/// Photo analysis: analyze, read, discard and confirm. The boundary this class defends is that an analysis
/// result is never a meal. A draft holds the model's estimates; only <see cref="ConfirmAsync"/> — with items the
/// user reviewed — creates a nutrition entry, through the same domain path as the manual form.
/// </summary>
public sealed class FoodAnalysisHandler(
    ILibraDbContext db,
    NutritionEntriesHandler entries,
    IAiFoodAnalyzer analyzer,
    IFoodImageProcessor imageProcessor,
    IImageStore imageStore,
    IOptions<FoodAnalysisOptions> options,
    TimeProvider clock)
{
    private readonly FoodAnalysisOptions _options = options.Value;

    public async Task<Result<CreateOutcome<FoodAnalysisDraftResponse>>> AnalyzeAsync(Guid userId, AnalyzeFoodPhotoCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // A retried upload returns the draft the first attempt produced instead of paying for a second analysis.
        if (command.ClientRequestId is Guid requestId)
        {
            var existing = await FindByClientRequestIdAsync(userId, requestId, cancellationToken);
            if (existing is not null)
            {
                return Result.Success(new CreateOutcome<FoodAnalysisDraftResponse>(existing, Created: false));
            }
        }

        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var windowStart = nowUtc.AddHours(-1);
        var recent = await db.FoodAnalysisDrafts.CountAsync(draft => draft.UserId == userId && draft.CreatedAtUtc >= windowStart, cancellationToken);
        if (recent >= _options.MaxAnalysesPerHour)
        {
            return Result.Failure<CreateOutcome<FoodAnalysisDraftResponse>>(
                new AppError(AppErrorType.RateLimited, FoodAnalysisErrors.RateLimited, $"At most {_options.MaxAnalysesPerHour} analyses per hour. Add the meal manually or try again later."));
        }

        var processed = imageProcessor.Process(command.Bytes);
        if (!processed.IsValid)
        {
            return Result.Validation<CreateOutcome<FoodAnalysisDraftResponse>>(FoodAnalysisErrors.ImageRejected, DescribeRejection(processed.Rejection!.Value));
        }

        var image = processed.Image!;
        var outcome = await analyzer.AnalyzeAsync(new AiFoodImage(image.Bytes, image.ContentType, image.Width, image.Height), cancellationToken);
        if (!outcome.IsSuccess)
        {
            return Result.Failure<CreateOutcome<FoodAnalysisDraftResponse>>(DescribeFailure(outcome.Failure!.Value, outcome.Detail));
        }

        // The bytes are stored only once the analysis succeeded, so a failed call leaves nothing behind.
        var storageKey = await imageStore.SaveAsync(image.Bytes, image.ContentType, cancellationToken);
        var result = outcome.Result!;
        var storedImage = FoodAnalysisImage.Create(userId, storageKey, image.ContentType, image.Width, image.Height, image.Bytes.LongLength, nowUtc, _options.ImageRetention);
        var draft = FoodAnalysisDraft.Create(
            userId,
            storedImage.Id,
            result.Outcome,
            result.SchemaVersion,
            result.Model,
            result.Notes,
            result.Confidence,
            result.Items,
            command.ClientRequestId,
            nowUtc,
            _options.DraftLifetime);

        db.FoodAnalysisImages.Add(storedImage);
        db.FoodAnalysisDrafts.Add(draft);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (exception.IsUniqueViolation() && command.ClientRequestId is Guid raced)
        {
            await imageStore.DeleteAsync(storageKey, cancellationToken);
            var winner = await FindByClientRequestIdAsync(userId, raced, cancellationToken);
            if (winner is not null)
            {
                return Result.Success(new CreateOutcome<FoodAnalysisDraftResponse>(winner, Created: false));
            }

            throw;
        }

        var response = await Projection(userId).SingleAsync(row => row.Id == draft.Id, cancellationToken);
        return Result.Success(new CreateOutcome<FoodAnalysisDraftResponse>(ToResponse(response, nowUtc), Created: true));
    }

    public async Task<Result<FoodAnalysisDraftResponse>> GetAsync(Guid userId, Guid draftId, CancellationToken cancellationToken)
    {
        var row = await Projection(userId).SingleOrDefaultAsync(candidate => candidate.Id == draftId, cancellationToken);
        return row is null
            ? Result.NotFound<FoodAnalysisDraftResponse>(FoodAnalysisErrors.DraftNotFound)
            : Result.Success(ToResponse(row, clock.GetUtcNow().UtcDateTime));
    }

    /// <summary>Returns the picture to its owner. A foreign id is indistinguishable from a missing one.</summary>
    public async Task<Result<FoodAnalysisImageContent>> GetImageAsync(Guid userId, Guid imageId, CancellationToken cancellationToken)
    {
        var image = await db.FoodAnalysisImages
            .AsNoTracking()
            .SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == imageId, cancellationToken);
        if (image is null || !image.HasBytes)
        {
            return Result.NotFound<FoodAnalysisImageContent>(FoodAnalysisErrors.ImageNotFound);
        }

        var bytes = await imageStore.ReadAsync(image.StorageKey, cancellationToken);
        return bytes is null
            ? Result.NotFound<FoodAnalysisImageContent>(FoodAnalysisErrors.ImageNotFound)
            : Result.Success(new FoodAnalysisImageContent(bytes, image.ContentType));
    }

    public async Task<Result<bool>> DiscardAsync(Guid userId, Guid draftId, CancellationToken cancellationToken)
    {
        var draft = await db.FoodAnalysisDrafts
            .SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == draftId, cancellationToken);
        if (draft is null)
        {
            return Result.NotFound<bool>(FoodAnalysisErrors.DraftNotFound);
        }

        if (draft.Status == FoodAnalysisStatus.Confirmed)
        {
            // Discarding a confirmed draft would suggest the meal disappears with it; it does not.
            return Result.Conflict<bool>(FoodAnalysisErrors.DraftDiscarded, "This draft was already confirmed. Delete the meal from the diary instead.");
        }

        var nowUtc = clock.GetUtcNow().UtcDateTime;
        if (draft.Status == FoodAnalysisStatus.PendingConfirmation)
        {
            draft.Discard(nowUtc);
            await db.SaveChangesAsync(cancellationToken);
        }

        await DeleteImageAsync(userId, draft.ImageId, nowUtc, cancellationToken);
        return Result.Success(true);
    }

    /// <summary>
    /// Creates the meal the user reviewed. The draft is the idempotency key: a second confirmation — retried,
    /// concurrent, or sent with a different client request id — returns the entry the first one created, because
    /// the entry insert and the draft transition are saved in a single transaction.
    /// </summary>
    public async Task<Result<CreateOutcome<NutritionEntryResponse>>> ConfirmAsync(Guid userId, Guid draftId, ConfirmFoodAnalysisCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var draft = await db.FoodAnalysisDrafts
            .SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == draftId, cancellationToken);
        if (draft is null)
        {
            return Result.NotFound<CreateOutcome<NutritionEntryResponse>>(FoodAnalysisErrors.DraftNotFound);
        }

        var nowUtc = clock.GetUtcNow().UtcDateTime;

        if (draft.Status == FoodAnalysisStatus.Confirmed)
        {
            return await ReplayAsync(userId, draft, cancellationToken);
        }

        if (draft.Status == FoodAnalysisStatus.Discarded)
        {
            return Result.Conflict<CreateOutcome<NutritionEntryResponse>>(FoodAnalysisErrors.DraftDiscarded, "Take another photo or add the meal manually.");
        }

        if (draft.IsExpired(nowUtc))
        {
            return Result.Conflict<CreateOutcome<NutritionEntryResponse>>(FoodAnalysisErrors.DraftExpired, "Take another photo or add the meal manually.");
        }

        var entry = NutritionEntry.Create(
            userId,
            command.MealType,
            command.ConsumedAtUtc.UtcDateTime,
            command.Note,
            command.Items.Select(item => item.ToDraft()),
            command.ClientRequestId,
            nowUtc);

        draft.Confirm(entry.Id, nowUtc);
        db.NutritionEntries.Add(entry);

        try
        {
            // One SaveChanges, one transaction: either the meal exists and the draft is confirmed, or neither.
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            // Another confirmation won the race; its entry is the one that exists.
            db.NutritionEntries.Remove(entry);
            var winner = await db.FoodAnalysisDrafts.AsNoTracking().SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == draftId, cancellationToken);
            return winner?.ConfirmedEntryId is Guid
                ? await ReplayAsync(userId, winner, cancellationToken)
                : Result.Conflict<CreateOutcome<NutritionEntryResponse>>(FoodAnalysisErrors.DraftDiscarded, "The draft changed while it was being confirmed.");
        }
        catch (DbUpdateException exception) when (exception.IsUniqueViolation())
        {
            var winner = await db.FoodAnalysisDrafts.AsNoTracking().SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == draftId, cancellationToken);
            if (winner?.ConfirmedEntryId is Guid)
            {
                return await ReplayAsync(userId, winner, cancellationToken);
            }

            throw;
        }

        // The picture has done its job; the meal keeps the reviewed values, not the photo.
        await DeleteImageAsync(userId, draft.ImageId, nowUtc, cancellationToken);

        var response = await NutritionProjection(userId).SingleAsync(row => row.Id == entry.Id, cancellationToken);
        return Result.Success(new CreateOutcome<NutritionEntryResponse>(response, Created: true));
    }

    /// <summary>
    /// Removes expired pending drafts and every picture past its retention deadline. Confirmed drafts keep their
    /// original estimates; nutrition entries are never touched.
    /// </summary>
    public async Task<(int DraftsRemoved, int ImagesRemoved)> CleanupAsync(CancellationToken cancellationToken)
    {
        var nowUtc = clock.GetUtcNow().UtcDateTime;

        var staleImages = await db.FoodAnalysisImages
            .Where(image => image.BytesDeletedAtUtc == null && image.RetainUntilUtc <= nowUtc)
            .ToListAsync(cancellationToken);
        foreach (var image in staleImages)
        {
            await imageStore.DeleteAsync(image.StorageKey, cancellationToken);
            image.MarkBytesDeleted(nowUtc);
        }

        var expiredDrafts = await db.FoodAnalysisDrafts
            .Where(draft => draft.Status != FoodAnalysisStatus.Confirmed && draft.ExpiresAtUtc <= nowUtc)
            .ToListAsync(cancellationToken);
        db.FoodAnalysisDrafts.RemoveRange(expiredDrafts);

        var orphanImageIds = expiredDrafts.Select(draft => draft.ImageId).ToList();
        var orphanImages = await db.FoodAnalysisImages.Where(image => orphanImageIds.Contains(image.Id)).ToListAsync(cancellationToken);
        foreach (var image in orphanImages)
        {
            await imageStore.DeleteAsync(image.StorageKey, cancellationToken);
        }

        db.FoodAnalysisImages.RemoveRange(orphanImages);
        await db.SaveChangesAsync(cancellationToken);
        return (expiredDrafts.Count, staleImages.Count + orphanImages.Count);
    }

    private async Task<Result<CreateOutcome<NutritionEntryResponse>>> ReplayAsync(Guid userId, FoodAnalysisDraft draft, CancellationToken cancellationToken)
    {
        var entry = await NutritionProjection(userId).SingleOrDefaultAsync(row => row.Id == draft.ConfirmedEntryId, cancellationToken);
        return entry is null
            ? Result.Conflict<CreateOutcome<NutritionEntryResponse>>(FoodAnalysisErrors.DraftDiscarded, "The confirmed meal was deleted. Add it again from the diary.")
            : Result.Success(new CreateOutcome<NutritionEntryResponse>(entry, Created: false));
    }

    private async Task DeleteImageAsync(Guid userId, Guid imageId, DateTime nowUtc, CancellationToken cancellationToken)
    {
        var image = await db.FoodAnalysisImages.SingleOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Id == imageId, cancellationToken);
        if (image is null || !image.HasBytes)
        {
            return;
        }

        await imageStore.DeleteAsync(image.StorageKey, cancellationToken);
        image.MarkBytesDeleted(nowUtc);
        await db.SaveChangesAsync(cancellationToken);
    }

    private IQueryable<NutritionEntryResponse> NutritionProjection(Guid userId) => entries.Projection(userId);

    private async Task<FoodAnalysisDraftResponse?> FindByClientRequestIdAsync(Guid userId, Guid clientRequestId, CancellationToken cancellationToken)
    {
        var row = await Projection(userId).SingleOrDefaultAsync(candidate => candidate.ClientRequestId == clientRequestId, cancellationToken);
        return row is null ? null : ToResponse(row, clock.GetUtcNow().UtcDateTime);
    }

    /// <summary>Owner-scoped read shape. Item ordering is stable so the review list matches the estimate order.</summary>
    private IQueryable<DraftRow> Projection(Guid userId) =>
        db.FoodAnalysisDrafts
            .Where(draft => draft.UserId == userId)
            .Select(draft => new DraftRow
            {
                Id = draft.Id,
                Status = draft.Status,
                Outcome = draft.Outcome,
                SchemaVersion = draft.SchemaVersion,
                Model = draft.Model,
                Notes = draft.Notes,
                Confidence = draft.Confidence,
                ClientRequestId = draft.ClientRequestId,
                ImageId = draft.ImageId,
                HasImage = db.FoodAnalysisImages.Any(image => image.Id == draft.ImageId && image.BytesDeletedAtUtc == null),
                CreatedAtUtc = draft.CreatedAtUtc,
                ExpiresAtUtc = draft.ExpiresAtUtc,
                ConfirmedEntryId = draft.ConfirmedEntryId,
                Items = draft.Items
                    .OrderBy(item => item.Position)
                    .Select(item => new ItemRow
                    {
                        Id = item.Id,
                        Name = item.Name,
                        PortionDescription = item.PortionDescription,
                        EstimatedGrams = item.EstimatedGrams,
                        Basis = item.Basis,
                        EnergyKcal = item.EnergyKcal,
                        ProteinGrams = item.ProteinGrams,
                        CarbGrams = item.CarbGrams,
                        FatGrams = item.FatGrams,
                        Confidence = item.Confidence,
                        Position = item.Position,
                    })
                    .ToList(),
            })
            .AsNoTracking();

    private static FoodAnalysisDraftResponse ToResponse(DraftRow row, DateTime nowUtc) =>
        new()
        {
            Id = row.Id,
            Status = row.Status,
            Outcome = row.Outcome,
            SchemaVersion = row.SchemaVersion,
            Model = row.Model,
            Notes = row.Notes,
            Confidence = row.Confidence,
            ImageId = row.ImageId,
            HasImage = row.HasImage,
            CreatedAtUtc = row.CreatedAtUtc,
            ExpiresAtUtc = row.ExpiresAtUtc,
            IsExpired = row.Status == FoodAnalysisStatus.PendingConfirmation && nowUtc >= row.ExpiresAtUtc,
            ConfirmedEntryId = row.ConfirmedEntryId,
            Items = row.Items.Select(ToItemResponse).ToList(),
        };

    private static FoodAnalysisItemResponse ToItemResponse(ItemRow item)
    {
        var normalized = FoodAnalysisNormalization.Normalize(item.Basis, item.EstimatedGrams, item.EnergyKcal, item.ProteinGrams, item.CarbGrams, item.FatGrams);
        return new FoodAnalysisItemResponse
        {
            Id = item.Id,
            Name = item.Name,
            PortionDescription = item.PortionDescription,
            EstimatedGrams = item.EstimatedGrams,
            Basis = item.Basis,
            EnergyKcal = item.EnergyKcal,
            ProteinGrams = item.ProteinGrams,
            CarbGrams = item.CarbGrams,
            FatGrams = item.FatGrams,
            Confidence = item.Confidence,
            Position = item.Position,
            SuggestedQuantityMode = normalized.QuantityMode,
            SuggestedQuantity = normalized.Quantity ?? 0m,
            SuggestedEnergyKcalPerUnit = normalized.EnergyKcalPerUnit,
            SuggestedProteinGramsPerUnit = normalized.ProteinGramsPerUnit,
            SuggestedCarbGramsPerUnit = normalized.CarbGramsPerUnit,
            SuggestedFatGramsPerUnit = normalized.FatGramsPerUnit,
            IsComplete = normalized.IsComplete,
        };
    }

    private static string DescribeRejection(ImageRejection rejection) => rejection switch
    {
        ImageRejection.Empty => "The file is empty.",
        ImageRejection.TooLarge => "The picture is too large.",
        ImageRejection.UnsupportedType => "Only JPEG, PNG and WebP pictures are supported.",
        ImageRejection.Unreadable => "The file is not a readable picture.",
        ImageRejection.TooSmall => "The picture is too small to estimate anything from.",
        ImageRejection.TooManyPixels => "The picture has too many pixels.",
        _ => "The picture could not be used.",
    };

    private static AppError DescribeFailure(AiFoodAnalysisFailure failure, string? detail) => failure switch
    {
        AiFoodAnalysisFailure.NotConfigured => new AppError(AppErrorType.Unavailable, FoodAnalysisErrors.AnalysisUnavailable, "Photo analysis is not configured on this server. Add the meal manually."),
        AiFoodAnalysisFailure.Timeout => new AppError(AppErrorType.Timeout, FoodAnalysisErrors.AnalysisTimedOut, "The analysis took too long. Try again or add the meal manually."),
        AiFoodAnalysisFailure.ProviderUnavailable => new AppError(AppErrorType.Unavailable, FoodAnalysisErrors.AnalysisUnavailable, "The analysis service is unavailable. Try again later or add the meal manually."),
        AiFoodAnalysisFailure.Refused => new AppError(AppErrorType.Validation, FoodAnalysisErrors.AnalysisRefused, "The analysis was refused for this picture. Add the meal manually."),
        AiFoodAnalysisFailure.Incomplete => new AppError(AppErrorType.Unavailable, FoodAnalysisErrors.AnalysisIncomplete, "The analysis stopped before it finished. Try again with a clearer picture."),
        AiFoodAnalysisFailure.InvalidOutput => new AppError(AppErrorType.Unavailable, FoodAnalysisErrors.AnalysisInvalid, "The analysis result could not be used. Try again or add the meal manually."),
        AiFoodAnalysisFailure.Busy => new AppError(AppErrorType.RateLimited, FoodAnalysisErrors.AnalysisBusy, "Too many analyses at once. Try again in a moment."),
        _ => new AppError(AppErrorType.Unavailable, FoodAnalysisErrors.AnalysisUnavailable, detail),
    };

    private sealed record DraftRow
    {
        public required Guid Id { get; init; }
        public required FoodAnalysisStatus Status { get; init; }
        public required FoodAnalysisOutcome Outcome { get; init; }
        public required string SchemaVersion { get; init; }
        public required string Model { get; init; }
        public string? Notes { get; init; }
        public decimal? Confidence { get; init; }
        public Guid? ClientRequestId { get; init; }
        public required Guid ImageId { get; init; }
        public required bool HasImage { get; init; }
        public required DateTime CreatedAtUtc { get; init; }
        public required DateTime ExpiresAtUtc { get; init; }
        public Guid? ConfirmedEntryId { get; init; }
        public required List<ItemRow> Items { get; init; }
    }

    private sealed record ItemRow
    {
        public required Guid Id { get; init; }
        public required string Name { get; init; }
        public string? PortionDescription { get; init; }
        public decimal? EstimatedGrams { get; init; }
        public required FoodAnalysisBasis Basis { get; init; }
        public decimal? EnergyKcal { get; init; }
        public decimal? ProteinGrams { get; init; }
        public decimal? CarbGrams { get; init; }
        public decimal? FatGrams { get; init; }
        public decimal? Confidence { get; init; }
        public required int Position { get; init; }
    }
}
