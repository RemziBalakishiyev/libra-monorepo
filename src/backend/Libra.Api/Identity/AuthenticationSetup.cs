using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Libra.Application.Identity;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Libra.Api.Identity;

internal static class AuthenticationSetup
{
    private static readonly TimeSpan ClockSkew = TimeSpan.FromSeconds(30);

    public static IServiceCollection AddJwtAuthentication(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        var jwt = configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>() ?? new JwtOptions();
        var material = ResolveSigningMaterial(jwt, environment);

        services.AddSingleton(material);
        services.AddSingleton<IAccessTokenIssuer, JwtAccessTokenIssuer>();

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                // Keep the raw JWT claim names ("sub", "email") instead of the legacy SOAP-style URIs.
                options.MapInboundClaims = false;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = material.Issuer,
                    ValidateAudience = true,
                    ValidAudience = material.Audience,
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = material.Key,
                    ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
                    ValidateLifetime = true,
                    RequireExpirationTime = true,
                    ClockSkew = ClockSkew,
                    NameClaimType = JwtRegisteredClaimNames.Sub,
                };
            });

        services.AddAuthorization();

        return services;
    }

    /// <summary>Reads the <c>sub</c> claim. Only valid behind <c>RequireAuthorization</c>.</summary>
    public static Guid GetUserId(this ClaimsPrincipal principal)
    {
        ArgumentNullException.ThrowIfNull(principal);

        var subject = principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
        return Guid.TryParse(subject, out var userId)
            ? userId
            : throw new InvalidOperationException("The authenticated principal has no valid 'sub' claim.");
    }

    private static JwtSigningMaterial ResolveSigningMaterial(JwtOptions jwt, IHostEnvironment environment)
    {
        if (!string.IsNullOrWhiteSpace(jwt.SigningKey))
        {
            var keyBytes = Encoding.UTF8.GetBytes(jwt.SigningKey);
            if (keyBytes.Length < JwtOptions.MinimumSigningKeyBytes)
            {
                throw new InvalidOperationException(
                    $"Jwt:SigningKey must be at least {JwtOptions.MinimumSigningKeyBytes} bytes.");
            }

            return new JwtSigningMaterial(new SymmetricSecurityKey(keyBytes), jwt.Issuer, jwt.Audience, IsEphemeral: false);
        }

        if (environment.IsDevelopment())
        {
            // Local convenience only: tokens stop validating on restart, but refresh tokens live in the database,
            // so clients silently obtain a new access token.
            var ephemeralKey = RandomNumberGenerator.GetBytes(64);
            return new JwtSigningMaterial(new SymmetricSecurityKey(ephemeralKey), jwt.Issuer, jwt.Audience, IsEphemeral: true);
        }

        throw new InvalidOperationException(
            "Jwt:SigningKey is not configured. Set the environment variable Jwt__SigningKey (at least 32 bytes).");
    }
}
