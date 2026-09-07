using Libra.Domain.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Libra.Infrastructure.Persistence.Configurations.Identity;

internal sealed class UserPreferenceConfiguration : IEntityTypeConfiguration<UserPreference>
{
    public void Configure(EntityTypeBuilder<UserPreference> builder)
    {
        builder.ToTable("user_preferences", table =>
            table.HasCheckConstraint("ck_user_preferences_currency_length", "char_length(currency) = 3"));

        builder.HasKey(preference => preference.UserId);
        builder.Property(preference => preference.UserId).ValueGeneratedNever();

        builder.Property(preference => preference.TimeZone).HasMaxLength(64).IsRequired();
        builder.Property(preference => preference.Locale).HasMaxLength(16).IsRequired();
        builder.Property(preference => preference.Currency).HasMaxLength(3).IsFixedLength().IsRequired();
        builder.Property(preference => preference.UpdatedAtUtc).IsRequired();
    }
}
