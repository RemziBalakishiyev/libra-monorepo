using Libra.Application.Identity.Register;
using Libra.Domain.Identity;
using Libra.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Libra.UnitTests.Identity;

/// <summary>
/// Validation limits at the API boundary must never exceed what the database column can hold.
/// Builds the EF model without a connection.
/// </summary>
public sealed class SchemaLengthTests
{
    private static readonly LibraDbContext Context = new(
        new DbContextOptionsBuilder<LibraDbContext>()
            .UseNpgsql("Host=localhost;Database=model-only")
            .UseSnakeCaseNamingConvention()
            .Options);

    [Theory]
    [InlineData(typeof(User), nameof(User.Email), RegisterCommandValidator.EmailMaxLength)]
    [InlineData(typeof(User), nameof(User.NormalizedEmail), RegisterCommandValidator.EmailMaxLength)]
    [InlineData(typeof(User), nameof(User.DisplayName), RegisterCommandValidator.DisplayNameMaxLength)]
    [InlineData(typeof(UserPreference), nameof(UserPreference.TimeZone), 64)]
    [InlineData(typeof(UserPreference), nameof(UserPreference.Locale), 16)]
    [InlineData(typeof(UserPreference), nameof(UserPreference.Currency), 3)]
    [InlineData(typeof(RefreshToken), nameof(RefreshToken.TokenHash), 64)]
    public void Column_max_length_matches_validation_limit(Type entity, string property, int expected)
    {
        var maxLength = Context.Model.FindEntityType(entity)!.FindProperty(property)!.GetMaxLength();

        Assert.Equal(expected, maxLength);
    }

    [Fact]
    public void Password_hash_column_fits_the_identity_hasher_output()
    {
        // ASP.NET Core PasswordHasher v3 emits 84 base64 characters; leave headroom for future formats.
        var maxLength = Context.Model.FindEntityType(typeof(User))!.FindProperty(nameof(User.PasswordHash))!.GetMaxLength();

        Assert.NotNull(maxLength);
        Assert.InRange(maxLength.Value, 128, 512);
    }

    [Fact]
    public void Column_names_are_snake_case()
    {
        // Entities mapped into a JSON column have document keys rather than columns, and EF's own internals
        // inside one (the owner key, the array ordinal) cannot be named at all. The convention is about the
        // real table columns.
        var names = Context.Model.GetEntityTypes()
            .Where(entity => entity.GetContainerColumnName() is null)
            .SelectMany(entity => entity.GetProperties())
            .Select(property => property.GetColumnName())
            .ToArray();

        Assert.NotEmpty(names);
        Assert.All(names, name => Assert.Matches("^[a-z0-9_]+$", name));
    }
}
