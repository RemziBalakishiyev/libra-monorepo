using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Libra.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddFocusSessions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "focus_sessions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_session_id = table.Column<Guid>(type: "uuid", nullable: false),
                    task_id = table.Column<Guid>(type: "uuid", nullable: true),
                    task_title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    configured_duration = table.Column<TimeSpan>(type: "interval", nullable: false),
                    started_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ended_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    active_duration = table.Column<TimeSpan>(type: "interval", nullable: false),
                    outcome = table.Column<int>(type: "integer", nullable: false),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    active_intervals = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_focus_sessions", x => x.id);
                    table.CheckConstraint("ck_focus_sessions_active", "active_duration > INTERVAL '0' AND active_duration <= (ended_at_utc - started_at_utc) + INTERVAL '1 second'");
                    table.CheckConstraint("ck_focus_sessions_configured", "configured_duration >= INTERVAL '1 minute' AND configured_duration <= INTERVAL '4 hours'");
                    table.CheckConstraint("ck_focus_sessions_interval", "ended_at_utc > started_at_utc");
                    table.ForeignKey(
                        name: "fk_focus_sessions_tasks_task_id",
                        column: x => x.task_id,
                        principalTable: "tasks",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_focus_sessions_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_focus_sessions_client",
                table: "focus_sessions",
                columns: new[] { "user_id", "client_session_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_focus_sessions_task_id",
                table: "focus_sessions",
                column: "task_id");

            migrationBuilder.CreateIndex(
                name: "ix_focus_sessions_user_id_ended_at_utc",
                table: "focus_sessions",
                columns: new[] { "user_id", "ended_at_utc" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "ix_focus_sessions_user_id_task_id",
                table: "focus_sessions",
                columns: new[] { "user_id", "task_id" },
                filter: "task_id IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "focus_sessions");
        }
    }
}
