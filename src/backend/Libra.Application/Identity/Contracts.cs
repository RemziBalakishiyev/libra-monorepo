namespace Libra.Application.Identity;

/// <summary>Tokens handed to the client after register, login, or refresh. Never logged.</summary>
public sealed record AuthSession(
    string AccessToken,
    DateTime AccessTokenExpiresAtUtc,
    string RefreshToken,
    DateTime RefreshTokenExpiresAtUtc);

public sealed record PreferencesDto(string TimeZone, string Locale, string Currency);

public sealed record ProfileResponse(
    Guid Id,
    string Email,
    string? DisplayName,
    DateTime CreatedAtUtc,
    PreferencesDto Preferences);

/// <summary>A signed access token and its expiry, produced by the host's JWT issuer.</summary>
public sealed record AccessToken(string Token, DateTime ExpiresAtUtc);

public interface IAccessTokenIssuer
{
    AccessToken Issue(Guid userId, string email, DateTime nowUtc);
}
