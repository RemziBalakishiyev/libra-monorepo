using Libra.Application.Common;
using Microsoft.EntityFrameworkCore;

namespace Libra.Application.Identity.Profile;

public sealed class UpdateProfileHandler(ILibraDbContext db, TimeProvider clock)
{
    public async Task<Result<ProfileResponse>> HandleAsync(Guid userId, UpdateProfileCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var user = await db.Users
            .Include(candidate => candidate.Preferences)
            .SingleOrDefaultAsync(candidate => candidate.Id == userId, cancellationToken);
        if (user is null)
        {
            return Result.NotFound<ProfileResponse>(GetProfileHandler.UserNotFoundTitle);
        }

        var nowUtc = clock.GetUtcNow().UtcDateTime;
        user.UpdateDisplayName(command.DisplayName, nowUtc);
        user.Preferences.Update(command.Preferences.TimeZone, command.Preferences.Locale, command.Preferences.Currency, nowUtc);

        await db.SaveChangesAsync(cancellationToken);

        return Result.Success(new ProfileResponse(
            user.Id,
            user.Email,
            user.DisplayName,
            user.CreatedAtUtc,
            new PreferencesDto(user.Preferences.TimeZone, user.Preferences.Locale, user.Preferences.Currency)));
    }
}
