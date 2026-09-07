using Libra.Application.Common;
using Libra.Domain.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Libra.Application.Identity.Register;

public sealed class RegisterHandler(
    ILibraDbContext db,
    IPasswordHasher<User> passwordHasher,
    SessionIssuer sessions,
    TimeProvider clock,
    ILogger<RegisterHandler> logger)
{
    public const string EmailTakenTitle = "Email is already registered";

    public async Task<Result<AuthSession>> HandleAsync(RegisterCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var normalizedEmail = User.NormalizeEmail(command.Email);
        var exists = await db.Users.AnyAsync(user => user.NormalizedEmail == normalizedEmail, cancellationToken);
        if (exists)
        {
            return Result.Conflict<AuthSession>(EmailTakenTitle);
        }

        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var user = User.Register(command.Email, command.DisplayName, nowUtc);
        user.UpdatePasswordHash(passwordHasher.HashPassword(user, command.Password), nowUtc);
        db.Users.Add(user);

        var (session, _) = sessions.StartSession(user, familyId: Guid.CreateVersion7());

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsUniqueViolation(exception))
        {
            // Two concurrent registrations with the same email: the unique index decides, we report the conflict.
            return Result.Conflict<AuthSession>(EmailTakenTitle);
        }

        logger.LogInformation("User {UserId} registered", user.Id);

        return Result.Success(session);
    }

    private static bool IsUniqueViolation(DbUpdateException exception) =>
        exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation };
}
