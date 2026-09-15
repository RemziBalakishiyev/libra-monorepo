using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Libra.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRecurringAndDebts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "debts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    direction = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    counterparty_name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    principal = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    currency_code = table.Column<string>(type: "character(3)", fixedLength: true, maxLength: 3, nullable: false),
                    opened_on = table.Column<DateOnly>(type: "date", nullable: false),
                    due_on = table.Column<DateOnly>(type: "date", nullable: true),
                    note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    client_request_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_debts", x => x.id);
                    table.CheckConstraint("ck_debts_direction", "direction IN ('Receivable', 'Payable')");
                    table.CheckConstraint("ck_debts_due", "due_on IS NULL OR due_on >= opened_on");
                    table.CheckConstraint("ck_debts_principal_positive", "principal > 0");
                    table.ForeignKey(
                        name: "fk_debts_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "recurring_transactions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    type = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    currency_code = table.Column<string>(type: "character(3)", fixedLength: true, maxLength: 3, nullable: false),
                    category_id = table.Column<Guid>(type: "uuid", nullable: false),
                    account_id = table.Column<Guid>(type: "uuid", nullable: false),
                    day_of_month = table.Column<int>(type: "integer", nullable: false),
                    start_date = table.Column<DateOnly>(type: "date", nullable: false),
                    end_date = table.Column<DateOnly>(type: "date", nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    client_request_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_recurring_transactions", x => x.id);
                    table.CheckConstraint("ck_recurring_transactions_amount_positive", "amount > 0");
                    table.CheckConstraint("ck_recurring_transactions_day", "day_of_month BETWEEN 1 AND 31");
                    table.CheckConstraint("ck_recurring_transactions_range", "end_date IS NULL OR end_date >= start_date");
                    table.CheckConstraint("ck_recurring_transactions_type", "type IN ('Income', 'Expense')");
                    table.ForeignKey(
                        name: "fk_recurring_transactions_finance_categories_category_id",
                        column: x => x.category_id,
                        principalTable: "finance_categories",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_recurring_transactions_financial_accounts_account_id",
                        column: x => x.account_id,
                        principalTable: "financial_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_recurring_transactions_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "debt_movements",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    debt_id = table.Column<Guid>(type: "uuid", nullable: false),
                    kind = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    account_id = table.Column<Guid>(type: "uuid", nullable: false),
                    amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    occurred_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    client_request_id = table.Column<Guid>(type: "uuid", nullable: true),
                    reversed_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_debt_movements", x => x.id);
                    table.CheckConstraint("ck_debt_movements_amount_positive", "amount > 0");
                    table.CheckConstraint("ck_debt_movements_kind", "kind IN ('Opening', 'Payment')");
                    table.ForeignKey(
                        name: "fk_debt_movements_debts_debt_id",
                        column: x => x.debt_id,
                        principalTable: "debts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_debt_movements_financial_accounts_account_id",
                        column: x => x.account_id,
                        principalTable: "financial_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_debt_movements_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "recurring_occurrences",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    template_id = table.Column<Guid>(type: "uuid", nullable: false),
                    year = table.Column<int>(type: "integer", nullable: false),
                    month = table.Column<int>(type: "integer", nullable: false),
                    due_date = table.Column<DateOnly>(type: "date", nullable: false),
                    status = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    transaction_id = table.Column<Guid>(type: "uuid", nullable: true),
                    title = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    currency_code = table.Column<string>(type: "character(3)", fixedLength: true, maxLength: 3, nullable: false),
                    client_request_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_recurring_occurrences", x => x.id);
                    table.CheckConstraint("ck_recurring_occurrences_link", "(status = 'Recorded' AND transaction_id IS NOT NULL) OR (status = 'Skipped' AND transaction_id IS NULL)");
                    table.CheckConstraint("ck_recurring_occurrences_month", "month BETWEEN 1 AND 12");
                    table.CheckConstraint("ck_recurring_occurrences_status", "status IN ('Recorded', 'Skipped')");
                    table.ForeignKey(
                        name: "fk_recurring_occurrences_financial_transactions_transaction_id",
                        column: x => x.transaction_id,
                        principalTable: "financial_transactions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_recurring_occurrences_recurring_transactions_template_id",
                        column: x => x.template_id,
                        principalTable: "recurring_transactions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_recurring_occurrences_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_debt_movements_account_id",
                table: "debt_movements",
                column: "account_id");

            migrationBuilder.CreateIndex(
                name: "ix_debt_movements_debt_id_occurred_at_utc",
                table: "debt_movements",
                columns: new[] { "debt_id", "occurred_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_debt_movements_opening",
                table: "debt_movements",
                column: "debt_id",
                unique: true,
                filter: "kind = 'Opening'");

            migrationBuilder.CreateIndex(
                name: "ix_debt_movements_user_id_account_id",
                table: "debt_movements",
                columns: new[] { "user_id", "account_id" });

            migrationBuilder.CreateIndex(
                name: "ix_debt_movements_user_id_client_request_id",
                table: "debt_movements",
                columns: new[] { "user_id", "client_request_id" },
                unique: true,
                filter: "client_request_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_debts_user_id_client_request_id",
                table: "debts",
                columns: new[] { "user_id", "client_request_id" },
                unique: true,
                filter: "client_request_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_debts_user_id_direction",
                table: "debts",
                columns: new[] { "user_id", "direction" });

            migrationBuilder.CreateIndex(
                name: "ix_recurring_occurrences_template_month",
                table: "recurring_occurrences",
                columns: new[] { "template_id", "year", "month" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_recurring_occurrences_transaction_id",
                table: "recurring_occurrences",
                column: "transaction_id",
                unique: true,
                filter: "transaction_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_recurring_occurrences_user_id_client_request_id",
                table: "recurring_occurrences",
                columns: new[] { "user_id", "client_request_id" },
                unique: true,
                filter: "client_request_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_recurring_occurrences_user_id_year_month",
                table: "recurring_occurrences",
                columns: new[] { "user_id", "year", "month" });

            migrationBuilder.CreateIndex(
                name: "ix_recurring_transactions_account_id",
                table: "recurring_transactions",
                column: "account_id");

            migrationBuilder.CreateIndex(
                name: "ix_recurring_transactions_category_id",
                table: "recurring_transactions",
                column: "category_id");

            migrationBuilder.CreateIndex(
                name: "ix_recurring_transactions_user_id_client_request_id",
                table: "recurring_transactions",
                columns: new[] { "user_id", "client_request_id" },
                unique: true,
                filter: "client_request_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_recurring_transactions_user_id_is_active",
                table: "recurring_transactions",
                columns: new[] { "user_id", "is_active" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "debt_movements");

            migrationBuilder.DropTable(
                name: "recurring_occurrences");

            migrationBuilder.DropTable(
                name: "debts");

            migrationBuilder.DropTable(
                name: "recurring_transactions");
        }
    }
}
