using Libra.Application.Common;
using Libra.Domain.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Libra.Application.Identity.Login;

public sealed class LoginHandler(
    ILibraDbContext db,
    IPasswordHasher<User> passwordHasher,
    SessionIssuer sessions,
    TimeProvider clock,
    ILogger<LoginHandler> logger)
{
    public const string InvalidCredentialsTitle = "Invalid credentials";

    /// <summary>
    /// Hash of a random password, verified when the email is unknown so that both failure paths cost
    /// roughly the same time and do not reveal which emails exist.
    /// </summary>
    private static readonly Lazy<string> DummyHash = new(() =>
        new PasswordHasher<User>().HashPassword(null!, RefreshTokenSecret.Generate()));

    public async Task<Result<AuthSession>> HandleAsync(LoginCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var normalizedEmail = User.NormalizeEmail(command.Email);
        var user = await db.Users.SingleOrDefaultAsync(candidate => candidate.NormalizedEmail == normalizedEmail, cancellationToken);

        if (user is null)
        {
            passwordHasher.VerifyHashedPassword(null!, DummyHash.Value, command.Password);
            return Result.Unauthorized<AuthSession>(InvalidCredentialsTitle);
        }

        var verification = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, command.Password);
        if (verification == PasswordVerificationResult.Failed)
        {
            logger.LogInformation("Failed login for user {UserId}", user.Id);
            return Result.Unauthorized<AuthSession>(InvalidCredentialsTitle);
        }

        var nowUtc = clock.GetUtcNow().UtcDateTime;
        if (verification == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.UpdatePasswordHash(passwordHasher.HashPassword(user, command.Password), nowUtc);
        }

        var (session, _) = sessions.StartSession(user, familyId: Guid.CreateVersion7());
        await db.SaveChangesAsync(cancellationToken);

        logger.LogInformation("User {UserId} logged in", user.Id);

        return Result.Success(session);
    }
}
