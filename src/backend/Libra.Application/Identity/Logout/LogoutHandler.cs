using Libra.Application.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Libra.Application.Identity.Logout;

/// <summary>
/// Revokes the session (token family) that the presented refresh token belongs to.
/// Idempotent: unknown or foreign tokens are ignored so the client can always finish signing out.
/// </summary>
public sealed class LogoutHandler(ILibraDbContext db, TimeProvider clock, ILogger<LogoutHandler> logger)
{
    public async Task HandleAsync(Guid userId, LogoutCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var tokenHash = RefreshTokenSecret.Hash(command.RefreshToken);
        var token = await db.RefreshTokens
            .SingleOrDefaultAsync(candidate => candidate.TokenHash == tokenHash && candidate.UserId == userId, cancellationToken);
        if (token is null)
        {
            return;
        }

        var nowUtc = clock.GetUtcNow().UtcDateTime;
        await db.RefreshTokens
            .Where(candidate => candidate.UserId == userId && candidate.FamilyId == token.FamilyId && candidate.RevokedAtUtc == null)
            .ExecuteUpdateAsync(setters => setters.SetProperty(candidate => candidate.RevokedAtUtc, nowUtc), cancellationToken);

        logger.LogInformation("User {UserId} logged out of session family {FamilyId}", userId, token.FamilyId);
    }
}
