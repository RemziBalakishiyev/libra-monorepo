using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Libra.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTasks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "task_series",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    note = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    planned_time = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    priority = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    kind = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    weekday_mask = table.Column<int>(type: "integer", nullable: false),
                    start_date = table.Column<DateOnly>(type: "date", nullable: false),
                    end_date = table.Column<DateOnly>(type: "date", nullable: true),
                    stopped_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    client_request_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_task_series", x => x.id);
                    table.CheckConstraint("ck_task_series_kind", "kind IN ('Daily', 'Weekly')");
                    table.CheckConstraint("ck_task_series_priority", "priority IN ('Low', 'Normal', 'High')");
                    table.CheckConstraint("ck_task_series_range", "end_date IS NULL OR end_date >= start_date");
                    table.CheckConstraint("ck_task_series_weekdays", "(kind = 'Weekly' AND weekday_mask > 0 AND weekday_mask < 128) OR (kind <> 'Weekly' AND weekday_mask = 0)");
                    table.ForeignKey(
                        name: "fk_task_series_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "tasks",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    series_id = table.Column<Guid>(type: "uuid", nullable: true),
                    title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    note = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    planned_date = table.Column<DateOnly>(type: "date", nullable: false),
                    planned_time = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    priority = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    state = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    completed_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    client_request_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_tasks", x => x.id);
                    table.CheckConstraint("ck_tasks_completed_at", "(state = 'Completed' AND completed_at_utc IS NOT NULL) OR (state <> 'Completed' AND completed_at_utc IS NULL)");
                    table.CheckConstraint("ck_tasks_priority", "priority IN ('Low', 'Normal', 'High')");
                    table.CheckConstraint("ck_tasks_state", "state IN ('Pending', 'Completed', 'Removed')");
                    table.ForeignKey(
                        name: "fk_tasks_task_series_series_id",
                        column: x => x.series_id,
                        principalTable: "task_series",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_tasks_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "task_completion_events",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    task_id = table.Column<Guid>(type: "uuid", nullable: false),
                    kind = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    occurred_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_task_completion_events", x => x.id);
                    table.CheckConstraint("ck_task_completion_events_kind", "kind IN ('Completed', 'Reopened')");
                    table.ForeignKey(
                        name: "fk_task_completion_events_tasks_task_id",
                        column: x => x.task_id,
                        principalTable: "tasks",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_task_completion_events_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_task_completion_events_task_id",
                table: "task_completion_events",
                column: "task_id");

            migrationBuilder.CreateIndex(
                name: "ix_task_completion_events_user_id_task_id_occurred_at_utc",
                table: "task_completion_events",
                columns: new[] { "user_id", "task_id", "occurred_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_task_series_user_id_client_request_id",
                table: "task_series",
                columns: new[] { "user_id", "client_request_id" },
                unique: true,
                filter: "client_request_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_task_series_user_id_stopped_at_utc",
                table: "task_series",
                columns: new[] { "user_id", "stopped_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_tasks_series_id_planned_date",
                table: "tasks",
                columns: new[] { "series_id", "planned_date" },
                unique: true,
                filter: "series_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_tasks_user_id_client_request_id",
                table: "tasks",
                columns: new[] { "user_id", "client_request_id" },
                unique: true,
                filter: "client_request_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_tasks_user_id_planned_date_state",
                table: "tasks",
                columns: new[] { "user_id", "planned_date", "state" });

            migrationBuilder.CreateIndex(
                name: "ix_tasks_user_id_state_completed_at_utc",
                table: "tasks",
                columns: new[] { "user_id", "state", "completed_at_utc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "task_completion_events");

            migrationBuilder.DropTable(
                name: "tasks");

            migrationBuilder.DropTable(
                name: "task_series");
        }
    }
}
