using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Libra.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSleep : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Equality on uuid inside a GiST index needs btree_gist; the exclusion constraint below is what
            // keeps two completed sessions of one user from overlapping even when they are written at the same
            // moment, which no application-level check can promise on its own.
            migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS btree_gist;");

            migrationBuilder.CreateTable(
                name: "sleep_sessions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    started_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ended_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    quality = table.Column<int>(type: "integer", nullable: true),
                    note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    client_request_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_sleep_sessions", x => x.id);
                    table.CheckConstraint("ck_sleep_sessions_duration", "ended_at_utc IS NULL OR ended_at_utc <= started_at_utc + INTERVAL '24 hours'");
                    table.CheckConstraint("ck_sleep_sessions_interval", "ended_at_utc IS NULL OR ended_at_utc > started_at_utc");
                    table.CheckConstraint("ck_sleep_sessions_quality", "quality IS NULL OR (quality >= 1 AND quality <= 5)");
                    table.ForeignKey(
                        name: "fk_sleep_sessions_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_sleep_sessions_open",
                table: "sleep_sessions",
                column: "user_id",
                unique: true,
                filter: "ended_at_utc IS NULL");

            migrationBuilder.CreateIndex(
                name: "ix_sleep_sessions_user_id_client_request_id",
                table: "sleep_sessions",
                columns: new[] { "user_id", "client_request_id" },
                unique: true,
                filter: "client_request_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_sleep_sessions_user_id_ended_at_utc",
                table: "sleep_sessions",
                columns: new[] { "user_id", "ended_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_sleep_sessions_user_id_started_at_utc",
                table: "sleep_sessions",
                columns: new[] { "user_id", "started_at_utc" },
                descending: new[] { false, true });
            // Half-open ranges on purpose: two nights that meet exactly at one instant are adjacent, not
            // overlapping. Only completed sessions take part — an open one has no end yet, and the partial
            // unique index above already allows just one of those per user.
            migrationBuilder.Sql(
                "ALTER TABLE sleep_sessions ADD CONSTRAINT ex_sleep_sessions_no_overlap " +
                "EXCLUDE USING gist (user_id WITH =, tstzrange(started_at_utc, ended_at_utc, '[)') WITH &&) " +
                "WHERE (ended_at_utc IS NOT NULL);");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("ALTER TABLE sleep_sessions DROP CONSTRAINT IF EXISTS ex_sleep_sessions_no_overlap;");

            migrationBuilder.DropTable(
                name: "sleep_sessions");
        }
    }
}
