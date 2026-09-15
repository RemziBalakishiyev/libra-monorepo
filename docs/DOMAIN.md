# Domain

## Modules

The backend is a modular monolith. Each module owns its entities, use cases, and tables. Modules do not query each other's tables directly; cross-module needs go through application-level contracts.

| Module | Responsibility | Entities |
|---|---|---|
| Identity | users, sessions, preferences | User, RefreshToken, UserPreference (Phase 1) |
| Finance | accounts, categories, income/expense, transfers, budgets, recurring plans, debts | FinancialAccount, FinanceCategory, FinancialTransaction, AccountTransfer, MonthlyBudget (Phase 2); RecurringTransaction, RecurringOccurrence, Debt, DebtMovement (Phase 3) |
| Plan | tasks, schedules, completion history | TaskItem, TaskSeries, TaskCompletionEvent (Phase 4A) |
| Nutrition | meals, goals, AI drafts | NutritionEntry, NutritionEntryItem, NutritionGoal (Phase 3A); FoodAnalysisDraft, FoodAnalysisImage (Phase 3B) |
| Sleep | sleep sessions | SleepSession (Phase 4B) |
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
- **Recurring template** (`RecurringTransaction`) — a monthly plan: title, type, amount, currency (copied from the
  preferred account), category, preferred account, day of month, start date, optional end date, active flag. The
  template itself is never money moved (Phase 3).
- **Recurring occurrence** — one template in one calendar month. `Pending` is computed on read and never stored;
  `Recorded` is a stored row pointing at the one ordinary transaction the user's confirmation created; `Skipped`
  is a stored row for a month the user declined or undid.
- **Debt** — an amount owed with direction `Receivable` ("Mənə borcludurlar") or `Payable` ("Mən borcluyam"):
  counterparty name, principal, currency, opening date, optional due date, note. Principal only — no interest,
  amortisation or conversion.
- **Debt movement** — principal passing through one of the user's accounts: an `Opening` movement when the money
  is lent or borrowed at creation, or a `Payment`. A movement is not a `FinancialTransaction`; it changes cash and
  the obligation, never income, expense or budgets. Undo marks it reversed rather than deleting it.
- **Receivable** — money expected; not part of cash balance.
- **Net position** — cash balance plus receivables outstanding minus payables outstanding, per currency; shown
  labelled and separately, never mixed into cash.
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
- **Principal movements (Phase 3)**: the balance formula also adds Σ `CashEffect` of non-reversed debt movements
  with `OccurredAtUtc ≤ T`, where `CashEffect(Receivable, Opening) = −amount`, `(Receivable, Payment) = +amount`,
  `(Payable, Opening) = +amount`, `(Payable, Payment) = −amount`. One more grouped query; still never per account.
- **Monthly cash change (dashboard)**: `monthlyNet + monthlyPrincipalNet`, where `monthlyPrincipalNet` is the
  month's Σ `CashEffect` in the dashboard currency. `monthlyNet` stays income − expense so the two remain
  distinguishable.

## Nutrition formulas (Phase 3A)

- **Local day** — `[start, end)` where start is local `YYYY-MM-DD 00:00` in the user's IANA time zone converted to
  UTC and end is the same for the next day (`LocalCalendar.Day`). An entry belongs to the day that contains its
  `ConsumedAtUtc`.
- **Item contribution** — `multiplier = quantity` for `PerPortion` and `quantity ÷ 100` for `Per100Grams`; each
  nutrient is `enteredValuePerUnit × multiplier`, computed from the unrounded inputs and rounded once to two
  decimals when it is stored on the item.
- **Entry totals** — the sum of its items' stored contributions.
- **Day totals** — summed in the database over every item of every entry inside the local day, grouped by meal.
  They never depend on a page of the list endpoint.
- **Applicable goal for a date** — the newest `NutritionGoal` whose `EffectiveFrom` is on or before that date;
  none when the user saved no targets on or before it. Targets are individually optional.
- **Target progress** — `remaining = target − consumed` (negative when exceeded). With no target the consumed
  amount is shown on its own; no percentage is derived from an absent target.

## Task rules (Phase 4A)

- **Planned day** — `TaskItem.PlannedDate` is a local calendar label (`date` in PostgreSQL), never an instant.
  `PlannedTime` is an optional local time of day. Created, updated and completed moments are UTC instants, so a
  time-zone change moves neither the day a task was planned for nor the record of when it was ticked off.
- **Today** — the local date of `now` in the profile time zone, resolved once per request from the injected
  clock. Two users in different zones see different days from the same instant.
- **Overdue** — a pending task is late once its local due moment has passed: the *end of its planned day* when it
  carries no time, and the *planned minute itself* when it does. Completed tasks are never overdue.
- **Today's n / N** — `completed / scheduled` over every task whose `PlannedDate` is today, aggregated in the
  database. Overdue tasks from earlier days are counted **separately** and never inflate today's progress.
- **Occurrence dates** — a `Daily` series yields every date in `[start, end]`; a `Weekly` series yields the dates
  in that range whose ISO weekday is in the mask (bit 0 = Monday … bit 6 = Sunday). Each yielded date becomes one
  `TaskItem` with its own completion state.
- **Materialization window** — every scheduled date from the series start through `today + 30` days, capped at
  500 rows per pass. Missed past dates are materialized too, so a skipped day is reported as overdue rather than
  dropped from the counts. A schedule may start at most 365 days in the past and end at most 730 days ahead.

## Sleep rules (Phase 4B)

- **A session is two instants.** `StartedAtUtc` and `EndedAtUtc` are UTC instants; the duration is always
  `end − start`, computed on read. Nothing accumulates a timer, so an app that was closed, backgrounded or
  reinstalled reports the same length as one that stayed open, and a clock that jumps does not change a record.
- **Stored precision.** Every instant is rounded to the microsecond PostgreSQL will actually store, so a session
  reports the same moment whether it was just created in memory or read back from the database — and a retried
  stop compares equal to the one already on disk.
- **At most one open session.** Enforced in the aggregate, in the handler, and by `ix_sleep_sessions_open`, a
  partial unique index on `user_id` where `ended_at_utc IS NULL`. Two concurrent starts leave one session and one
  409; they never leave two.
- **Idempotent start.** A non-null `clientRequestId` is unique per user, so a retried start after an answer that
  never arrived returns the session that already exists instead of opening a second one.
- **Stopping names its session.** A stop targets one identified session at an instant the client captured. Once
  it is closed, stopping it again returns the same completed session with the same end — it never moves that end
  and never falls through to a newer session.
- **Overlap.** Completed sessions of one user may not overlap: `ex_sleep_sessions_no_overlap` is a `btree_gist`
  EXCLUDE constraint over `tstzrange(started_at_utc, ended_at_utc, '[)')`. The range is half-open, so **adjacent
  intervals may meet at an endpoint** — a night ending at 07:00 and a nap starting at 07:00 both stand. An open
  session is compared against the present moment, so a night cannot be recorded inside one that is still running.
- **Duration limit.** A *completed* session may not exceed **24 hours**, and may not start more than 5 minutes
  ahead of the server clock. An **open** session is deliberately unbounded: a user who forgot to press "Oyandım"
  keeps a session of exactly the length it has, and it is never clipped, never closed automatically, and never
  quietly shortened. It is resolved by correcting it or discarding it, both explicit.
- **The wake date.** A completed session is attributed to the local date of its **end** in the profile time zone,
  so a night that crosses midnight is counted once, on the day the user woke up. Several sessions ending on the
  same local date sum on that date. Open sessions are counted nowhere until they close.
- **Time-zone changes.** Attribution is computed on read from the profile time zone, never stored. Changing the
  profile time zone therefore re-groups history — the same instants, regrouped onto the local dates they now fall
  on. Durations are unaffected, including across a DST transition, because they are the distance between two
  instants rather than a difference of wall-clock readings.
- **The weekly figure.** The summary covers the last seven local dates including today. Its average is over the
  dates that actually hold a record — never over seven — and is always presented with that denominator. A date
  with nothing recorded is reported as *no record*, which is not the same as sleeping zero minutes.
- **Aggregates and paging.** Totals, counts and averages are computed over every matching session in the window,
  independently of the page size used to list them.
- **Quality and note.** Both are optional. A quality is an integer 1–5; a note is at most 500 characters.
  Recording that the user woke up never depends on supplying either.

## Recurring and debt rules (Phase 3)

- **Due date of a template in month `(y, m)`**: `min(dayOfMonth, daysInMonth(y, m))` as a calendar date in the
  profile time zone; a template on the 31st falls due on 28/29 February, 30 April, and back on the 31st in May.
  The month has an occurrence only when `startDate ≤ due ≤ endDate` (both inclusive, `endDate` optional).
- **Month view**: for every active template with a due date in the month, a `Pending` row unless a stored row
  exists; every stored (`Recorded`/`Skipped`) row is shown whether or not its template is still active or still
  scheduled. Pending rows are computed on read, so listing, refreshing, fetching due dates or restarting the
  API never posts money.
- **Confirmation** ("Gəliri qeyd et" / "Ödənişi qeyd et"): the user reviews amount, account and actual date and
  confirms. The default actual date is the due date once it has passed and today while the due date is still
  ahead — a confirmation says the money moved, and future-dated activity stays out of balances. One request
  creates one ordinary transaction and the `Recorded` row in the same database transaction. The stored row keeps
  a snapshot of title, amount and currency as recorded.
- **Idempotency**: `(template_id, year, month)` is unique in the database. A concurrent or retried confirmation —
  with the same or a different `clientRequestId` — loses the insert race, reads the winner and returns it with
  200; the same `clientRequestId` for a different month is refused (409).
- **Undo** deletes the linked transaction and turns the row into `Skipped` in one save; the month is never
  regenerated as pending. A second undo is a no-op (200). The generic transaction DELETE refuses a linked
  transaction (409) and points to Təkrarlananlar.
- **Editing** a template changes every month that is not recorded — including earlier months the user never got
  to — and nothing about recorded months. **Deactivation** hides unrecorded months; recorded and skipped rows
  stay as history and unrecorded months are never marked paid. A template with any stored occurrence cannot be
  deleted, only deactivated.
- **Debt remaining** = `principal − Σ amount of non-reversed Payment movements`. Status: `Open` when nothing is
  paid, `PartiallyPaid` when `0 < paid < principal`, `Settled` when `paid = principal`. `Overdue` = a due date
  exists, the status is not `Settled`, and the profile-time-zone local date is after the due date; a partially
  paid debt can be overdue, a settled one never is.
- **Payment**: `0 < amount ≤ remaining`, currency of the account = currency of the debt, account active. The
  payment insert and a bump of the debt's row version happen in one database transaction, so two payments racing
  for the same remaining balance cannot both succeed: the second sees a concurrency conflict (409) and re-reads.
- **Creation** is explicit about cash: with no account the obligation is recorded and no balance changes; with
  an account the principal moves through it as an `Opening` movement in the same request (all or nothing).
- **Undo of a payment** marks the movement reversed and bumps the debt's version in one save; remaining and the
  account balance move back together. Repeating the undo changes nothing.
- **Structure lock**: counterparty, due date and note can always be edited; principal and opening date only
  while no movement exists. A debt with movements cannot be deleted.

## Photo-analysis formulas (Phase 3B)

- **Normalizing an estimate** — a `PicturedPortion` estimate becomes `PerPortion` with quantity 1 and the model's
  nutrient values unchanged; the estimated weight is kept as metadata only. A `Per100Grams` estimate becomes
  `Per100Grams` with the estimated weight as the quantity, so the values are scaled once by the existing
  `quantity ÷ 100` rule. The weight and the portion count are never both applied to the same food.
- **Conservation** — the two representations of one estimate contribute the same amount: scaling a per-100 g
  estimate by `grams ÷ 100` and calling it one pictured portion yields exactly the contribution the per-100 g form
  produces. Changing the quantity scales the contribution and nothing else.
- **Unknown values** — a nutrient the model did not judge stays `null` through normalization and contributes
  nothing; the estimate reports itself incomplete instead of defaulting to zero, and confirmation is blocked until
  the user supplies it.
- **Rounding** — unchanged from 3A: one multiplication from the entered values, rounded once at the end.

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
12. Receivables are not cash. The dashboard shows cash balance, receivables, payables and the labelled net position separately, per currency, and never adds them into cash.
13. A recurring template is not a transaction. A month is recorded at most once, enforced by a unique `(template_id, year, month)` row, and only by the user's explicit confirmation.
14. A user has at most one open sleep session; sleep duration derives from timestamps (Phase 4).
15. AI food analysis starts as a draft and enters totals only after user confirmation; AI never mutates user data without explicit confirmation and never receives the whole database (Phases 6–7).
16. `UserId` is the data boundary on every user-owned entity. No endpoint reads or mutates another user's object; foreign ids look absent (404).
17. Reports are computed from source transactions. No snapshot or cache tables.
18. Nutrition energy and macros are `decimal`; entered nutrients are `numeric(10,2)`, stored contributions
    `numeric(12,2)`, and quantities `numeric(12,3)`. A nutrient may be zero but never negative; a quantity is
    always greater than zero.
19. An entered kcal value is never recomputed from protein/carbohydrate/fat, and a macro-derived estimate never
    overwrites a food label's energy.
20. A nutrition entry stores the inputs and the computed contribution of each item as a snapshot. Editing an
    entry replaces its items with new rows, so no other entry — including a copy made from it — ever changes.
21. A meal holds between 1 and 20 food items. Reusing a non-null client request id never creates a second entry.
22. Nutrition goals are unique per user and effective date. Changing today's targets leaves earlier days
    resolving to the targets they already used; clearing every target removes that record instead of storing
    zeros, and no target is ever invented for the user.
23. Nutrition is independent of Finance: a user with no financial account can record meals.
24. A food-photo analysis is a draft, never a meal. Drafts contribute nothing to any total; only an explicit
    confirmation of user-reviewed items creates a nutrition entry, through the same domain path as the manual
    form, and the draft keeps the original estimate beside it.
25. Confirmation is idempotent per draft. A repeated, retried or concurrent confirmation returns the first entry,
    even under a different client request id, and a discarded or expired draft can never be confirmed.
26. A nutrient the model could not judge stays missing. It is never stored, displayed or confirmed as zero.
27. A confirmed nutrition entry is never removed by draft expiry or image cleanup.
28. A task's planned day is a fact about the plan, not about when it was done. Completing an overdue task never
    moves its `PlannedDate`.
29. Completion is a state, not a switch. Setting the state a task is already in changes nothing and records no
    second history event; reopening clears the completed state and adds a `Reopened` event without erasing the
    `Completed` one.
30. Every scheduled date of a series is its own task with its own completion state. Completing one says nothing
    about any other date, and nothing about the series.
31. A series never has two occurrences on one date: `(series_id, planned_date)` is unique, which is also what
    makes generation idempotent under concurrency.
32. Deleting one occurrence of a series leaves a tombstone, so regeneration cannot bring that date back. Editing
    or stopping a series changes only pending occurrences from today onwards; past and completed ones stay as
    they were.
33. An edit that echoes an older `updatedAtUtc` than the stored row is refused (409) rather than applied.
34. A user has at most one open sleep session, at the application level and in the database, including under
    concurrent requests. Sleep duration is derived from two stored instants and never from a running timer.
35. A completed sleep session lasts at most 24 hours and may not overlap another of the same user; adjacent
    sessions may meet at an endpoint. An open session is unbounded and is never clipped or closed on the user's
    behalf.
36. A completed session is counted once, on the local date it ended in the profile time zone. Sleep is
    independent of Finance and Nutrition: a user with neither configured can record it.
37. The wake instant is whatever the user's device captured when they pressed "Oyandım". A retry after a failure
    records that moment, never the moment the connection returned, so reconnecting later can only leave the
    recorded duration the same.
38. Local sleep reminders are a convenience on one device. Tracking works fully without them, a notification is
    never a record, and tapping one opens the session rather than recording waking.
39. A pending recurring month contributes nothing to any balance, monthly total or budget. Reading months, moving
    between them, computing due dates or restarting the API never creates a transaction.
40. Confirming a recurring month creates exactly one ordinary transaction and the occurrence row in one database
    transaction. Concurrent confirmations and retries — including a retry with a different client request id —
    resolve to that same transaction; a client request id reused for a different month is refused.
41. A recorded occurrence keeps its snapshot. Editing or deactivating the template changes only unrecorded
    months (missed past months included) and never marks an unrecorded month as paid. Undo removes the linked
    transaction, leaves the month `Skipped`, and never regenerates it; the generic transaction delete refuses a
    linked transaction.
42. A debt movement is not income or expense. Lending, borrowing and repaying change cash and the obligation
    only; income, expense, category totals and budgets never see principal.
43. Debt remaining is derived from principal and non-reversed payments; status and overdue derive from remaining,
    the due date and the profile-time-zone date. Zero, negative and over-remaining payments are refused, and two
    concurrent payments cannot overpay: the database transaction that inserts a payment also bumps the debt's
    row version, so the loser gets a conflict rather than a second success.
44. Every debt movement shares the debt's currency and belongs to an account of the same user; a debt's
    direction and currency never change. Principal and opening date are locked once any movement exists, and a
    debt with movements cannot be deleted. Undoing a payment restores remaining and the account balance together
    and is safe to repeat.

## Day boundaries

"Today", "this month", and "this week" are computed by converting UTC instants to the user's timezone, then taking calendar boundaries there. Ranges passed to queries are converted back to UTC instants. This lives in one place, `Libra.Application.Common.LocalCalendar`, introduced in Phase 2. The mobile app enters dates in the device time zone, which the MVP assumes equals the profile time zone.
