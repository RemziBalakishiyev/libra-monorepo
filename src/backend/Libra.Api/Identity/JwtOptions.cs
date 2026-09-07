using System.ComponentModel.DataAnnotations;

namespace Libra.Api.Identity;

/// <summary>Bound from the <c>Jwt</c> section. The signing key must come from user-secrets or the environment.</summary>
public sealed class JwtOptions
{
    public const string SectionName = "Jwt";
    public const int MinimumSigningKeyBytes = 32;

    [Required]
    public string Issuer { get; set; } = "libra";

    [Required]
    public string Audience { get; set; } = "libra-mobile";

    /// <summary>At least 32 bytes. Never commit a value; Development generates an ephemeral key when absent.</summary>
    public string? SigningKey { get; set; }
}
