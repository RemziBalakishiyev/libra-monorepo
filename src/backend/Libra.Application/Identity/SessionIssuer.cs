using Libra.Application.Common;
using Libra.Domain.Identity;
using Microsoft.Extensions.Options;

namespace Libra.Application.Identity;

/// <summary>
/// Creates the access/refresh token pair for a user. The refresh token entity is added to the context;
/// the calling handler decides when to save.
/// </summary>
public sealed class SessionIssuer(
    ILibraDbContext db,
    IAccessTokenIssuer accessTokens,
    IOptions<AuthOptions> options,
    TimeProvider clock)
{
    public (AuthSession Session, RefreshToken RefreshToken) StartSession(User user, Guid familyId)
    {
        ArgumentNullException.ThrowIfNull(user);

        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var rawRefreshToken = RefreshTokenSecret.Generate();
        var refreshToken = RefreshToken.Issue(
            user.Id,
            familyId,
            RefreshTokenSecret.Hash(rawRefreshToken),
            nowUtc,
            options.Value.RefreshTokenLifetime);

        db.RefreshTokens.Add(refreshToken);

        var accessToken = accessTokens.Issue(user.Id, user.Email, nowUtc);

        var session = new AuthSession(
            accessToken.Token,
            accessToken.ExpiresAtUtc,
            rawRefreshToken,
            refreshToken.ExpiresAtUtc);

        return (session, refreshToken);
    }
}
