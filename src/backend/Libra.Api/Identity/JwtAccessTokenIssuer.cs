using Libra.Application.Identity;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Libra.Api.Identity;

/// <summary>Signing material resolved once at startup and shared by the issuer and the bearer handler.</summary>
public sealed record JwtSigningMaterial(SymmetricSecurityKey Key, string Issuer, string Audience, bool IsEphemeral);

public sealed class JwtAccessTokenIssuer(JwtSigningMaterial material, IOptions<AuthOptions> options) : IAccessTokenIssuer
{
    private static readonly JsonWebTokenHandler TokenHandler = new() { SetDefaultTimesOnTokenCreation = false };

    public AccessToken Issue(Guid userId, string email, DateTime nowUtc)
    {
        var expiresAtUtc = nowUtc + options.Value.AccessTokenLifetime;

        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = material.Issuer,
            Audience = material.Audience,
            IssuedAt = nowUtc,
            NotBefore = nowUtc,
            Expires = expiresAtUtc,
            Claims = new Dictionary<string, object>
            {
                [JwtRegisteredClaimNames.Sub] = userId.ToString(),
                [JwtRegisteredClaimNames.Email] = email,
                [JwtRegisteredClaimNames.Jti] = Guid.NewGuid().ToString("N"),
            },
            SigningCredentials = new SigningCredentials(material.Key, SecurityAlgorithms.HmacSha256),
        };

        return new AccessToken(TokenHandler.CreateToken(descriptor), expiresAtUtc);
    }
}
