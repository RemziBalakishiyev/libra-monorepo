namespace Libra.Application.Identity;

/// <summary>Token lifetimes. Bound from the <c>Auth</c> configuration section and validated at startup.</summary>
public sealed class AuthOptions
{
    public const string SectionName = "Auth";

    public int AccessTokenMinutes { get; set; } = 15;

    public int RefreshTokenDays { get; set; } = 30;

    public TimeSpan AccessTokenLifetime => TimeSpan.FromMinutes(AccessTokenMinutes);

    public TimeSpan RefreshTokenLifetime => TimeSpan.FromDays(RefreshTokenDays);

    public bool IsValid() => AccessTokenMinutes is >= 1 and <= 24 * 60 && RefreshTokenDays is >= 1 and <= 365;
}
