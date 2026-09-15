using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Libra.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddFoodAnalysis : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "food_analysis_images",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    storage_key = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    content_type = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    width = table.Column<int>(type: "integer", nullable: false),
                    height = table.Column<int>(type: "integer", nullable: false),
                    byte_size = table.Column<long>(type: "bigint", nullable: false),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    retain_until_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    bytes_deleted_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_food_analysis_images", x => x.id);
                    table.CheckConstraint("ck_food_analysis_images_dimensions", "width > 0 AND height > 0 AND byte_size > 0");
                    table.ForeignKey(
                        name: "fk_food_analysis_images_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "food_analysis_drafts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    image_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    outcome = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    schema_version = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    model = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    confidence = table.Column<decimal>(type: "numeric(4,2)", precision: 4, scale: 2, nullable: true),
                    client_request_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    expires_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    confirmed_entry_id = table.Column<Guid>(type: "uuid", nullable: true),
                    confirmed_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_food_analysis_drafts", x => x.id);
                    table.CheckConstraint("ck_food_analysis_drafts_confidence", "confidence IS NULL OR (confidence >= 0 AND confidence <= 1)");
                    table.CheckConstraint("ck_food_analysis_drafts_confirmed_entry", "(status = 'Confirmed' AND confirmed_entry_id IS NOT NULL AND confirmed_at_utc IS NOT NULL) OR (status <> 'Confirmed' AND confirmed_entry_id IS NULL)");
                    table.CheckConstraint("ck_food_analysis_drafts_outcome", "outcome IN ('Success', 'InsufficientInformation', 'NoFoodDetected')");
                    table.CheckConstraint("ck_food_analysis_drafts_status", "status IN ('PendingConfirmation', 'Confirmed', 'Discarded')");
                    table.ForeignKey(
                        name: "fk_food_analysis_drafts_food_analysis_images_image_id",
                        column: x => x.image_id,
                        principalTable: "food_analysis_images",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_food_analysis_drafts_nutrition_entries_confirmed_entry_id",
                        column: x => x.confirmed_entry_id,
                        principalTable: "nutrition_entries",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_food_analysis_drafts_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "food_analysis_items",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    draft_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    portion_description = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    estimated_grams = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: true),
                    basis = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    energy_kcal = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true),
                    protein_grams = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true),
                    carb_grams = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true),
                    fat_grams = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true),
                    confidence = table.Column<decimal>(type: "numeric(4,2)", precision: 4, scale: 2, nullable: true),
                    position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_food_analysis_items", x => x.id);
                    table.CheckConstraint("ck_food_analysis_items_basis", "basis IN ('PicturedPortion', 'Per100Grams')");
                    table.CheckConstraint("ck_food_analysis_items_grams_positive", "estimated_grams IS NULL OR estimated_grams > 0");
                    table.CheckConstraint("ck_food_analysis_items_nutrients_non_negative", "(energy_kcal IS NULL OR energy_kcal >= 0) AND (protein_grams IS NULL OR protein_grams >= 0) AND (carb_grams IS NULL OR carb_grams >= 0) AND (fat_grams IS NULL OR fat_grams >= 0)");
                    table.ForeignKey(
                        name: "fk_food_analysis_items_food_analysis_drafts_draft_id",
                        column: x => x.draft_id,
                        principalTable: "food_analysis_drafts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_food_analysis_drafts_confirmed_entry_id",
                table: "food_analysis_drafts",
                column: "confirmed_entry_id",
                unique: true,
                filter: "confirmed_entry_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_food_analysis_drafts_expires_at_utc",
                table: "food_analysis_drafts",
                column: "expires_at_utc",
                filter: "status <> 'Confirmed'");

            migrationBuilder.CreateIndex(
                name: "ix_food_analysis_drafts_image_id",
                table: "food_analysis_drafts",
                column: "image_id");

            migrationBuilder.CreateIndex(
                name: "ix_food_analysis_drafts_user_id_client_request_id",
                table: "food_analysis_drafts",
                columns: new[] { "user_id", "client_request_id" },
                unique: true,
                filter: "client_request_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_food_analysis_drafts_user_id_created_at_utc",
                table: "food_analysis_drafts",
                columns: new[] { "user_id", "created_at_utc" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "ix_food_analysis_images_retain_until_utc",
                table: "food_analysis_images",
                column: "retain_until_utc",
                filter: "bytes_deleted_at_utc IS NULL");

            migrationBuilder.CreateIndex(
                name: "ix_food_analysis_images_user_id_id",
                table: "food_analysis_images",
                columns: new[] { "user_id", "id" });

            migrationBuilder.CreateIndex(
                name: "ix_food_analysis_items_draft_id_position",
                table: "food_analysis_items",
                columns: new[] { "draft_id", "position" });

            migrationBuilder.CreateIndex(
                name: "ix_food_analysis_items_user_id",
                table: "food_analysis_items",
                column: "user_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "food_analysis_items");

            migrationBuilder.DropTable(
                name: "food_analysis_drafts");

            migrationBuilder.DropTable(
                name: "food_analysis_images");
        }
    }
}
