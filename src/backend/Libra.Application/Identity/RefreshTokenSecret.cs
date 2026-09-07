using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;

namespace Libra.Application.Identity;

/// <summary>
/// Raw refresh tokens are 256 bits of CSPRNG output, base64url encoded. Only their SHA-256 hash is persisted,
/// so a database leak does not yield usable tokens.
/// </summary>
public static class RefreshTokenSecret
{
    private const int SecretSizeBytes = 32;

    public static string Generate() =>
        Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(SecretSizeBytes));

    public static string Hash(string rawToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(rawToken);
        return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken)));
    }
}
