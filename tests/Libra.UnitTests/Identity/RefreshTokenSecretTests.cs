using System.Text.RegularExpressions;
using Libra.Application.Identity;

namespace Libra.UnitTests.Identity;

public sealed partial class RefreshTokenSecretTests
{
    [Fact]
    public void Generate_produces_unique_base64url_tokens_of_256_bits()
    {
        var tokens = Enumerable.Range(0, 100).Select(_ => RefreshTokenSecret.Generate()).ToArray();

        Assert.Equal(100, tokens.Distinct(StringComparer.Ordinal).Count());
        Assert.All(tokens, token =>
        {
            Assert.Equal(43, token.Length); // 32 bytes without padding
            Assert.Matches(Base64UrlPattern(), token);
        });
    }

    [Fact]
    public void Hash_is_deterministic_lowercase_hex_sha256()
    {
        var token = RefreshTokenSecret.Generate();

        var first = RefreshTokenSecret.Hash(token);
        var second = RefreshTokenSecret.Hash(token);

        Assert.Equal(first, second);
        Assert.Equal(64, first.Length);
        Assert.Matches(LowerHexPattern(), first);
        Assert.NotEqual(first, RefreshTokenSecret.Hash(token + "x"));
    }

    [GeneratedRegex("^[A-Za-z0-9_-]+$")]
    private static partial Regex Base64UrlPattern();

    [GeneratedRegex("^[0-9a-f]+$")]
    private static partial Regex LowerHexPattern();
}
