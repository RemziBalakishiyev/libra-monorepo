using System.Security.Cryptography;
using Libra.Application.Nutrition.FoodAnalysis;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Libra.Infrastructure.Ai;

/// <summary>
/// Small private image store on the local filesystem. Keys are random, generated here and never derived from
/// user input, and every read is resolved back inside the root directory, so a key from elsewhere cannot escape
/// it. A deployment that needs shared storage replaces this one class.
/// </summary>
public sealed class FileSystemImageStore : IImageStore
{
    private readonly string _root;
    private readonly ILogger<FileSystemImageStore> _logger;

    public FileSystemImageStore(IConfiguration configuration, ILogger<FileSystemImageStore> logger)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        _logger = logger;
        var configured = configuration["Storage:ImagesPath"];
        _root = Path.GetFullPath(string.IsNullOrWhiteSpace(configured) ? Path.Combine(AppContext.BaseDirectory, "storage", "food-analysis") : configured);
        Directory.CreateDirectory(_root);
    }

    public async Task<string> SaveAsync(byte[] bytes, string contentType, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(bytes);

        var key = $"{DateTime.UtcNow:yyyyMMdd}/{Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant()}.jpg";
        var path = ResolvePath(key) ?? throw new InvalidOperationException("Generated storage key resolved outside the store.");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await File.WriteAllBytesAsync(path, bytes, cancellationToken);
        return key;
    }

    public async Task<byte[]?> ReadAsync(string storageKey, CancellationToken cancellationToken)
    {
        var path = ResolvePath(storageKey);
        if (path is null || !File.Exists(path))
        {
            return null;
        }

        return await File.ReadAllBytesAsync(path, cancellationToken);
    }

    public Task DeleteAsync(string storageKey, CancellationToken cancellationToken)
    {
        var path = ResolvePath(storageKey);
        if (path is not null && File.Exists(path))
        {
            try
            {
                File.Delete(path);
            }
            catch (IOException exception)
            {
                // The next sweep retries; a locked file must not fail the user's request.
                _logger.LogWarning(exception, "Could not delete a stored analysis image; it will be retried by the cleanup sweep.");
            }
        }

        return Task.CompletedTask;
    }

    /// <summary>Full path for a key, or null when the key would escape the store.</summary>
    private string? ResolvePath(string storageKey)
    {
        if (string.IsNullOrWhiteSpace(storageKey))
        {
            return null;
        }

        var candidate = Path.GetFullPath(Path.Combine(_root, storageKey));
        return candidate.StartsWith(_root + Path.DirectorySeparatorChar, StringComparison.Ordinal) ? candidate : null;
    }
}
