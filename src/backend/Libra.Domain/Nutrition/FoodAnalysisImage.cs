namespace Libra.Domain.Nutrition;

/// <summary>
/// A photo the user submitted for analysis, after the backend normalized it (orientation applied, resized,
/// metadata dropped). The bytes live in the image store; this row is the owner-scoped handle for them and
/// carries the retention deadline the cleanup sweep enforces.
/// </summary>
public sealed class FoodAnalysisImage
{
    public const int StorageKeyMaxLength = 200;
    public const int ContentTypeMaxLength = 60;

    private FoodAnalysisImage()
    {
        StorageKey = string.Empty;
        ContentType = string.Empty;
    }

    public Guid Id { get; private set; }

    public Guid UserId { get; private set; }

    /// <summary>Opaque key in the image store. Never derived from user input.</summary>
    public string StorageKey { get; private set; }

    public string ContentType { get; private set; }

    public int Width { get; private set; }

    public int Height { get; private set; }

    public long ByteSize { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>When the bytes may be deleted. Deleting them never touches a confirmed nutrition entry.</summary>
    public DateTime RetainUntilUtc { get; private set; }

    /// <summary>Set once the bytes are gone; the row stays so a draft can still explain that the photo expired.</summary>
    public DateTime? BytesDeletedAtUtc { get; private set; }

    public bool HasBytes => BytesDeletedAtUtc is null;

    public static FoodAnalysisImage Create(
        Guid userId,
        string storageKey,
        string contentType,
        int width,
        int height,
        long byteSize,
        DateTime nowUtc,
        TimeSpan retention)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(storageKey);
        ArgumentException.ThrowIfNullOrWhiteSpace(contentType);
        ArgumentOutOfRangeException.ThrowIfLessThanOrEqual(width, 0);
        ArgumentOutOfRangeException.ThrowIfLessThanOrEqual(height, 0);
        ArgumentOutOfRangeException.ThrowIfLessThanOrEqual(byteSize, 0);
        ArgumentOutOfRangeException.ThrowIfLessThanOrEqual(retention, TimeSpan.Zero);

        return new FoodAnalysisImage
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            StorageKey = storageKey,
            ContentType = contentType,
            Width = width,
            Height = height,
            ByteSize = byteSize,
            CreatedAtUtc = nowUtc,
            RetainUntilUtc = nowUtc.Add(retention),
        };
    }

    public void MarkBytesDeleted(DateTime nowUtc) => BytesDeletedAtUtc ??= nowUtc;
}
