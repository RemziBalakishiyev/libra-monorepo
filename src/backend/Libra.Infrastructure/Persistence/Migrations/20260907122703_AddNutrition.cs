using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Libra.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddNutrition : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "nutrition_entries",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    meal_type = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    consumed_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    client_request_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_nutrition_entries", x => x.id);
                    table.CheckConstraint("ck_nutrition_entries_meal_type", "meal_type IN ('Breakfast', 'Lunch', 'Dinner', 'Snack')");
                    table.ForeignKey(
                        name: "fk_nutrition_entries_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "nutrition_goals",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    effective_from = table.Column<DateOnly>(type: "date", nullable: false),
                    energy_kcal = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true),
                    protein_grams = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true),
                    carb_grams = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true),
                    fat_grams = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_nutrition_goals", x => x.id);
                    table.CheckConstraint("ck_nutrition_goals_targets_positive", "(energy_kcal IS NULL OR energy_kcal > 0) AND (protein_grams IS NULL OR protein_grams > 0) AND (carb_grams IS NULL OR carb_grams > 0) AND (fat_grams IS NULL OR fat_grams > 0)");
                    table.ForeignKey(
                        name: "fk_nutrition_goals_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "nutrition_entry_items",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    entry_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    quantity_mode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    quantity = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: false),
                    energy_kcal_per_unit = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: false),
                    protein_grams_per_unit = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: false),
                    carb_grams_per_unit = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: false),
                    fat_grams_per_unit = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: false),
                    energy_kcal = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    protein_grams = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    carb_grams = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    fat_grams = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_nutrition_entry_items", x => x.id);
                    table.CheckConstraint("ck_nutrition_entry_items_quantity_mode", "quantity_mode IN ('PerPortion', 'Per100Grams')");
                    table.CheckConstraint("ck_nutrition_entry_items_quantity_positive", "quantity > 0");
                    table.CheckConstraint("ck_nutrition_entry_items_nutrients_non_negative", "energy_kcal_per_unit >= 0 AND protein_grams_per_unit >= 0 AND carb_grams_per_unit >= 0 AND fat_grams_per_unit >= 0 AND energy_kcal >= 0 AND protein_grams >= 0 AND carb_grams >= 0 AND fat_grams >= 0");
                    table.ForeignKey(
                        name: "fk_nutrition_entry_items_nutrition_entries_entry_id",
                        column: x => x.entry_id,
                        principalTable: "nutrition_entries",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_nutrition_entries_user_id_client_request_id",
                table: "nutrition_entries",
                columns: new[] { "user_id", "client_request_id" },
                unique: true,
                filter: "client_request_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_nutrition_entries_user_id_consumed_at_utc_id",
                table: "nutrition_entries",
                columns: new[] { "user_id", "consumed_at_utc", "id" },
                descending: new[] { false, true, true });

            migrationBuilder.CreateIndex(
                name: "ix_nutrition_entry_items_entry_id_position",
                table: "nutrition_entry_items",
                columns: new[] { "entry_id", "position" });

            migrationBuilder.CreateIndex(
                name: "ix_nutrition_entry_items_user_id",
                table: "nutrition_entry_items",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_nutrition_goals_user_id_effective_from",
                table: "nutrition_goals",
                columns: new[] { "user_id", "effective_from" },
                unique: true,
                descending: new[] { false, true });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "nutrition_entry_items");

            migrationBuilder.DropTable(
                name: "nutrition_goals");

            migrationBuilder.DropTable(
                name: "nutrition_entries");
        }
    }
}
