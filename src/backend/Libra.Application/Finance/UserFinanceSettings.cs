using Libra.Application.Common;
using Libra.Domain.Identity;
using Microsoft.EntityFrameworkCore;

namespace Libra.Application.Finance;

/// <summary>The per-user settings finance calculations depend on: IANA time zone and default currency.</summary>
public sealed record UserFinanceSettings(string TimeZone, string Currency)
{
    public static async Task<UserFinanceSettings> LoadAsync(ILibraDbContext db, Guid userId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(db);

        var preference = await db.UserPreferences
            .AsNoTracking()
            .Where(candidate => candidate.UserId == userId)
            .Select(candidate => new { candidate.TimeZone, candidate.Currency })
            .SingleOrDefaultAsync(cancellationToken);

        return preference is null
            ? new UserFinanceSettings(UserPreference.DefaultTimeZone, UserPreference.DefaultCurrency)
            : new UserFinanceSettings(preference.TimeZone, preference.Currency);
    }
}
