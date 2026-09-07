using Libra.Domain.Identity;

namespace Libra.UnitTests.Identity;

public sealed class RefreshTokenTests
{
    private static readonly DateTime Now = new(2026, 9, 5, 10, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Issue_sets_expiry_from_lifetime_and_is_active()
    {
        var token = RefreshToken.Issue(Guid.NewGuid(), Guid.NewGuid(), "hash", Now, TimeSpan.FromDays(30));

        Assert.Equal(Now.AddDays(30), token.ExpiresAtUtc);
        Assert.True(token.IsActive(Now));
        Assert.True(token.IsActive(Now.AddDays(29)));
        Assert.False(token.IsActive(Now.AddDays(30)));
        Assert.True(token.IsExpired(Now.AddDays(30)));
    }

    [Fact]
    public void Revoke_is_idempotent_and_keeps_first_replacement()
    {
        var token = RefreshToken.Issue(Guid.NewGuid(), Guid.NewGuid(), "hash", Now, TimeSpan.FromDays(30));
        var replacement = Guid.NewGuid();

        token.Revoke(Now.AddMinutes(1), replacement);
        token.Revoke(Now.AddMinutes(2), Guid.NewGuid());

        Assert.True(token.IsRevoked);
        Assert.False(token.IsActive(Now.AddMinutes(3)));
        Assert.Equal(Now.AddMinutes(1), token.RevokedAtUtc);
        Assert.Equal(replacement, token.ReplacedByTokenId);
    }

    [Fact]
    public void Issue_rejects_non_positive_lifetime()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            RefreshToken.Issue(Guid.NewGuid(), Guid.NewGuid(), "hash", Now, TimeSpan.Zero));
    }
}
