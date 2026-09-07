namespace Libra.Domain.Identity;

/// <summary>
/// An account. Every user-owned entity in every module references <see cref="Id"/> as its data boundary.
/// </summary>
public sealed class User
{
    private User()
    {
    }

    public Guid Id { get; private set; }

    /// <summary>Email as entered (trimmed). Used for display and mail.</summary>
    public string Email { get; private set; } = string.Empty;

    /// <summary>Trimmed, lower-cased email used for lookups and uniqueness.</summary>
    public string NormalizedEmail { get; private set; } = string.Empty;

    public string PasswordHash { get; private set; } = string.Empty;

    public string? DisplayName { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public UserPreference Preferences { get; private set; } = null!;

    public static string NormalizeEmail(string email)
    {
        ArgumentNullException.ThrowIfNull(email);
        return email.Trim().ToLowerInvariant();
    }

    /// <summary>
    /// Creates an account without a password hash; the caller must set it with <see cref="UpdatePasswordHash"/>
    /// before saving, because the hasher needs the user instance.
    /// </summary>
    public static User Register(string email, string? displayName, DateTime nowUtc)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(email);

        var id = Guid.CreateVersion7();
        return new User
        {
            Id = id,
            Email = email.Trim(),
            NormalizedEmail = NormalizeEmail(email),
            DisplayName = CleanDisplayName(displayName),
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
            Preferences = UserPreference.CreateDefault(id, nowUtc),
        };
    }

    public void UpdatePasswordHash(string passwordHash, DateTime nowUtc)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(passwordHash);
        PasswordHash = passwordHash;
        UpdatedAtUtc = nowUtc;
    }

    public void UpdateDisplayName(string? displayName, DateTime nowUtc)
    {
        DisplayName = CleanDisplayName(displayName);
        UpdatedAtUtc = nowUtc;
    }

    private static string? CleanDisplayName(string? displayName)
    {
        var trimmed = displayName?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }
}
