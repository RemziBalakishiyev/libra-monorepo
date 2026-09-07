using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Libra.Application.Common;

public static class DatabaseErrors
{
    /// <summary>True when a save failed because a unique index or constraint rejected the row (SQLSTATE 23505).</summary>
    public static bool IsUniqueViolation(this DbUpdateException exception)
    {
        ArgumentNullException.ThrowIfNull(exception);
        return exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation };
    }
}
