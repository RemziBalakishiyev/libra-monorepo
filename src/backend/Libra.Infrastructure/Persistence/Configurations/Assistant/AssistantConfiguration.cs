using Libra.Domain.Assistant;
using Libra.Domain.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Libra.Infrastructure.Persistence.Configurations.Assistant;

internal sealed class AssistantConversationConfiguration : IEntityTypeConfiguration<AssistantConversation>
{
    public void Configure(EntityTypeBuilder<AssistantConversation> builder)
    {
        builder.ToTable("assistant_conversations");

        builder.HasKey(conversation => conversation.Id);
        builder.Property(conversation => conversation.Id).ValueGeneratedNever();
        builder.Property(conversation => conversation.Title).HasMaxLength(AssistantConversation.TitleMaxLength).IsRequired();
        builder.Property(conversation => conversation.Modules).HasMaxLength(100).IsRequired();
        builder.Property(conversation => conversation.Period).HasMaxLength(40).IsRequired();
        builder.Property(conversation => conversation.CreatedAtUtc).IsRequired();
        builder.Property(conversation => conversation.UpdatedAtUtc).IsRequired();

        // History is listed newest first, for one user.
        builder.HasIndex(conversation => new { conversation.UserId, conversation.UpdatedAtUtc }).IsDescending(false, true);

        builder.HasOne<User>().WithMany().HasForeignKey(conversation => conversation.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class AssistantMessageConfiguration : IEntityTypeConfiguration<AssistantMessage>
{
    public void Configure(EntityTypeBuilder<AssistantMessage> builder)
    {
        builder.ToTable("assistant_messages");

        builder.HasKey(message => message.Id);
        builder.Property(message => message.Id).ValueGeneratedNever();
        builder.Property(message => message.Text).HasMaxLength(4000).IsRequired();
        builder.Property(message => message.Role).IsRequired();
        // The validated answer and the snapshot it was grounded in, kept exactly as they were.
        builder.Property(message => message.AnswerJson).HasColumnType("jsonb");
        builder.Property(message => message.SnapshotJson).HasColumnType("jsonb");
        builder.Property(message => message.CreatedAtUtc).IsRequired();

        builder.HasIndex(message => new { message.UserId, message.ConversationId, message.CreatedAtUtc });
        // A retried send carries the same client id, so the database refuses the second turn rather than
        // relying on a handler that could race with itself.
        builder.HasIndex(message => new { message.UserId, message.ClientRequestId })
            .IsUnique()
            .HasFilter("client_request_id IS NOT NULL")
            .HasDatabaseName("ix_assistant_messages_client");

        builder.HasOne<User>().WithMany().HasForeignKey(message => message.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<AssistantConversation>().WithMany().HasForeignKey(message => message.ConversationId).OnDelete(DeleteBehavior.Cascade);
    }
}
