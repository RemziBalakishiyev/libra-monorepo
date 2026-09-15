using Libra.Domain.Identity;
using Microsoft.EntityFrameworkCore;

namespace Libra.Application.Common;

/// <summary>
/// Loads the IANA time zone a user's calendar days are resolved in. Modules that only need day boundaries use
/// this instead of a module-specific settings record.
/// </summary>
public static class UserTimeZone
{
    public static async Task<string> LoadAsync(ILibraDbContext db, Guid userId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(db);

        var timeZone = await db.UserPreferences
            .AsNoTracking()
            .Where(preference => preference.UserId == userId)
            .Select(preference => preference.TimeZone)
            .SingleOrDefaultAsync(cancellationToken);

        return timeZone ?? UserPreference.DefaultTimeZone;
    }
}
