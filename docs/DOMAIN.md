# Domain

## Modules

The backend is a modular monolith. Each module owns its entities, use cases, and tables. Modules do not query each other's tables directly; cross-module needs go through application-level contracts.

| Module | Responsibility | Entities |
|---|---|---|
| Identity | users, sessions, preferences | User, RefreshToken, UserPreference (Phase 1) |
| Finance | accounts, categories, income/expense, transfers, budgets | FinancialAccount, FinanceCategory, FinancialTransaction, AccountTransfer, MonthlyBudget (Phase 2); RecurringTransaction, RecurringTransactionOccurrence (Phase 3) |
| Debts | receivables/payables and payments | Debt, DebtPayment, Counterparty (Phase 3) |
| Nutrition | meals, goals, AI drafts | Meal, MealItem, NutritionGoal, FoodAnalysisDraft, FoodAnalysisImage |
| Sleep | sleep sessions and goals | SleepSession, SleepGoal |
| Tasks | daily tasks and recurrence | TaskItem, TaskRecurrence, TaskCompletion |
| Analytics | read models across modules | none (computed) |
| Assistant | conversations, tool audit, insights | Conversation, Message, AiToolCallAudit, Insight |
| Notifications | reminder scheduling metadata | to be defined |

## Glossary

- **Financial account** — a place money lives: `Cash`, `BankCard`, `BankAccount`, `Savings`, `Other`. It has an immutable currency once it has activity, an opening balance, an `IsIncludedInTotal` flag, and an archive flag.
- **Category** — an income or expense label owned by the user. Kind is immutable. Sixteen Azerbaijani defaults are created by the finance setup use case.
- **Transaction** (`FinancialTransaction`) — a real income or expense on one account at `OccurredAtUtc`. Its currency is the account's currency.
- **Transfer** (`AccountTransfer`) — money moved between two of the user's own accounts. Never income, never expense, never budget usage. Cross-currency transfers carry both amounts as entered; the effective rate is informational.
- **Monthly budget** — an expense limit for one local calendar month and currency, either overall (`CategoryId` null) or for one expense category.
- **Account balance** — opening balance plus activity up to an instant (see formulas).
- **Monthly net cash flow** — income minus expense for the local month, per currency. Distinct from the account balance.
- **Client request id** — a client-generated UUID sent with creates so retries and double taps are idempotent per user.
- **Recurring template** — a rule (amount, cadence, day of month) that can generate one occurrence per period (Phase 3). The template itself is never money moved.
- **Debt** — an amount owed with direction `Receivable` (they owe me) or `Payable` (I owe them) (Phase 3).
- **Receivable** — money expected; not part of cash balance.
- **Projected balance** — cash balance plus receivables minus payables; shown separately, never mixed into cash (Phase 3).
- **Meal / meal item**, **Food analysis draft**, **Sleep session**, **Task**, **Insight** — later phases.

## Finance formulas (Phase 2)

- **Account balance as of instant T** (default: now):
  `OpeningBalance + Σ income(occurred ≤ T) − Σ expense(≤ T) + Σ incoming transfer DestinationAmount(≤ T) − Σ outgoing transfer SourceAmount(≤ T)`.
  Future-dated activity is excluded until it occurs. Computed with three grouped queries per request, never per account.
- **Local month** — `[start, end)` where start is local `YYYY-MM-01 00:00` in the user's IANA time zone converted to UTC and end is the same for the next month (`LocalCalendar`).
- **Monthly income / expense / net** per currency: sums of transactions whose `OccurredAtUtc` falls in the local month; net = income − expense. Transfers are excluded.
- **Budget usage**: Σ expense in the budget currency within the local month, restricted to the category for category budgets. `remaining = amount − used` (negative when over), `usagePercent = used / amount × 100` (one decimal), `isOverBudget = used > amount`. Income and transfers never consume a budget.
- **Daily average expense**: monthly expense ÷ days elapsed in the local month (through today inclusive for the current month; full month for past months; 0 for future months).
- **Total balance (dashboard)**: Σ balances of non-archived accounts with `IsIncludedInTotal` in the selected currency. Other currencies are reported as separate totals and are never converted or added.

## Invariants

1. All timestamps are stored in UTC and rendered in the user's IANA timezone. Default timezone `Asia/Baku`, locale `az-AZ`.
2. Money is `decimal` in code and `numeric(18,2)` in PostgreSQL. `float`/`double` are forbidden for money and macros. Amounts have at most two decimals and are enforced at the API boundary and in the domain.
3. Every financial record has a currency: accounts carry an ISO 4217 code and transactions/transfers inherit it. Default `AZN`. No exchange-rate conversion in the MVP.
4. Transfers between the user's own accounts are neither income nor expense and never affect category totals or budgets.
5. Account balance and monthly income-minus-expense are different numbers and are always reported separately.
6. An account's currency and opening balance are immutable once it has any transaction or transfer. Accounts and categories with references cannot be hard-deleted, only archived; archived ones reject new or edited activity but stay in history.
7. Transaction type must match category kind. Account and category must belong to the same user as the transaction (checked in the handler and in the domain).
8. A transfer needs two distinct active accounts of the same user; both amounts are positive; same-currency transfers have equal amounts.
9. Budgets are unique per user, local month, currency, and scope (overall or category). Category budgets reference only active expense categories.
10. Reusing a non-null client request id for the same user never creates a second transaction or transfer; the existing record is returned.
11. Negative balances are allowed and displayed clearly; the MVP does not block spending.
12. Receivables are not cash. Dashboards will show cash balance, receivables, payables, and projected balance separately (Phase 3).
13. A recurring template is not a transaction. Occurrences for a period are generated idempotently (Phase 3).
14. A user has at most one open sleep session; sleep duration derives from timestamps (Phase 4).
15. AI food analysis starts as a draft and enters totals only after user confirmation; AI never mutates user data without explicit confirmation and never receives the whole database (Phases 6–7).
16. `UserId` is the data boundary on every user-owned entity. No endpoint reads or mutates another user's object; foreign ids look absent (404).
17. Reports are computed from source transactions. No snapshot or cache tables.

## Day boundaries

"Today", "this month", and "this week" are computed by converting UTC instants to the user's timezone, then taking calendar boundaries there. Ranges passed to queries are converted back to UTC instants. This lives in one place, `Libra.Application.Common.LocalCalendar`, introduced in Phase 2. The mobile app enters dates in the device time zone, which the MVP assumes equals the profile time zone.
