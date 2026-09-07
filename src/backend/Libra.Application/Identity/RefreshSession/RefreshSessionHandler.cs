using Libra.Application.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Libra.Application.Identity.RefreshSession;

/// <summary>
/// Rotates a refresh token. A token that was already rotated or revoked is treated as stolen:
/// every token in its family is revoked and the caller must sign in again.
/// </summary>
public sealed class RefreshSessionHandler(
    ILibraDbContext db,
    SessionIssuer sessions,
    TimeProvider clock,
    ILogger<RefreshSessionHandler> logger)
{
    public const string InvalidRefreshTokenTitle = "Invalid refresh token";

    public async Task<Result<AuthSession>> HandleAsync(RefreshSessionCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var tokenHash = RefreshTokenSecret.Hash(command.RefreshToken);
        var token = await db.RefreshTokens.SingleOrDefaultAsync(candidate => candidate.TokenHash == tokenHash, cancellationToken);
        if (token is null)
        {
            return Result.Unauthorized<AuthSession>(InvalidRefreshTokenTitle);
        }

        var nowUtc = clock.GetUtcNow().UtcDateTime;

        if (token.IsRevoked)
        {
            await RevokeFamilyAsync(token.UserId, token.FamilyId, nowUtc, cancellationToken);
            logger.LogWarning("Refresh token reuse detected for user {UserId}; family {FamilyId} revoked", token.UserId, token.FamilyId);
            return Result.Unauthorized<AuthSession>(InvalidRefreshTokenTitle);
        }

        if (token.IsExpired(nowUtc))
        {
            return Result.Unauthorized<AuthSession>(InvalidRefreshTokenTitle);
        }

        var user = await db.Users.SingleOrDefaultAsync(candidate => candidate.Id == token.UserId, cancellationToken);
        if (user is null)
        {
            return Result.Unauthorized<AuthSession>(InvalidRefreshTokenTitle);
        }

        var (session, replacement) = sessions.StartSession(user, token.FamilyId);
        token.Revoke(nowUtc, replacedByTokenId: replacement.Id);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            // Another request rotated the same token first (RevokedAtUtc is a concurrency token). Treat as reuse.
            logger.LogWarning("Concurrent refresh for user {UserId}; family {FamilyId} revoked", token.UserId, token.FamilyId);
            await RevokeFamilyAsync(token.UserId, token.FamilyId, nowUtc, cancellationToken);
            return Result.Unauthorized<AuthSession>(InvalidRefreshTokenTitle);
        }

        return Result.Success(session);
    }

    private async Task RevokeFamilyAsync(Guid userId, Guid familyId, DateTime nowUtc, CancellationToken cancellationToken)
    {
        await db.RefreshTokens
            .Where(candidate => candidate.UserId == userId && candidate.FamilyId == familyId && candidate.RevokedAtUtc == null)
            .ExecuteUpdateAsync(setters => setters.SetProperty(candidate => candidate.RevokedAtUtc, nowUtc), cancellationToken);
    }
}
