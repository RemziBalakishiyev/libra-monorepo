using Libra.Application.Common;
using Microsoft.EntityFrameworkCore;

namespace Libra.Application.Identity.Profile;

public sealed class GetProfileHandler(ILibraDbContext db)
{
    public const string UserNotFoundTitle = "User not found";

    public async Task<Result<ProfileResponse>> HandleAsync(Guid userId, CancellationToken cancellationToken)
    {
        var profile = await db.Users
            .AsNoTracking()
            .Where(user => user.Id == userId)
            .Select(user => new ProfileResponse(
                user.Id,
                user.Email,
                user.DisplayName,
                user.CreatedAtUtc,
                new PreferencesDto(user.Preferences.TimeZone, user.Preferences.Locale, user.Preferences.Currency)))
            .SingleOrDefaultAsync(cancellationToken);

        return profile is null
            ? Result.NotFound<ProfileResponse>(UserNotFoundTitle)
            : Result.Success(profile);
    }
}
