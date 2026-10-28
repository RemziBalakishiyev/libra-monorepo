# API

## Conventions

- Base path for business endpoints: `/api/...`. Operational endpoints (`/health/*`, `/openapi/*`) sit at the root.
- JSON with camelCase property names. Enums are strings (`"Income"`, `"BankCard"`). Requests and responses use DTOs, never EF entities.
- Errors: RFC 9457 Problem Details (`application/problem+json`). Validation errors include an `errors` map keyed by property path (for example `Preferences.TimeZone`, `SourceAmount`).
- Authentication: `Authorization: Bearer <access token>`. `UserId` is always derived from the token's `sub` claim; clients never send it. Missing or invalid tokens return `401` Problem Details.
- Any resource that belongs to another user, whether read, updated, deleted, or referenced from a new record, answers `404` so ids cannot be enumerated.
- Instants are ISO 8601 UTC (`2026-09-05T10:15:00Z`); property names end with `Utc`. Calendar months (`year`, `month`) are interpreted in the user's IANA time zone.
- Money is a JSON number with at most two decimals. Currency is a three-letter ISO 4217 code, normalized to upper case.
- List endpoints use `pageNumber`/`pageSize` (default 20, max 100) and return `{ items, pageNumber, pageSize, totalCount, hasNextPage }`. Ordering is `occurredAtUtc desc, id desc`.
- Idempotent creates: transactions and transfers accept an optional `clientRequestId` (UUID). Repeating it for the same user returns the existing record with `200` instead of creating another (`201`).
- Rate limits return `429` Problem Details with a `Retry-After` header. Auth responses carry `Cache-Control: no-store`.
- OpenAPI is generated from code and served at `/openapi/v1.json` in Development.
- CORS: Development-only named policy from `Cors:AllowedOrigins` (Expo Web); no credentials; nothing in Production.

## Operational endpoints

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/health/live` | none | 200 `{ status, totalDurationMs, checks: [] }` |
| GET | `/health/ready` | none | 200 when PostgreSQL reachable, otherwise 503 |
| GET | `/openapi/v1.json` | none (Development only) | OpenAPI 3 document |

## Auth and profile (Phase 1)

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/api/auth/register` | `{ email, password, displayName? }` | 201 session | 400, 409 email taken, 429 |
| POST | `/api/auth/login` | `{ email, password }` | 200 session | 400, 401 `Invalid credentials`, 429 |
| POST | `/api/auth/refresh` | `{ refreshToken }` | 200 new session (rotation) | 400, 401 invalid/expired/reused, 429 |
| POST | `/api/auth/logout` | `{ refreshToken }` + Bearer | 204 | 400, 401 |
| GET | `/api/profile` | – | 200 profile | 401 |
| PUT | `/api/profile` | `{ displayName?, preferences: { timeZone, locale, currency } }` | 200 profile | 400, 401 |

Session: `{ accessToken, accessTokenExpiresAtUtc, refreshToken, refreshTokenExpiresAtUtc }`. Profile: `{ id, email, displayName, createdAtUtc, preferences }`. Refresh tokens are single-use families; reuse revokes the family.

## Finance (Phase 2)

All finance endpoints require a bearer token.

### Shapes

```text
Account      { id, name, type, currencyCode, openingBalance, currentBalance, isIncludedInTotal, isArchived, hasActivity, createdAtUtc, updatedAtUtc }
Category     { id, name, kind, isSystemDefault, isArchived, createdAtUtc, updatedAtUtc }
Transaction  { id, accountId, accountName, currencyCode, categoryId, categoryName, type, amount, occurredAtUtc, note, clientRequestId, createdAtUtc, updatedAtUtc }
Transfer     { id, sourceAccountId, sourceAccountName, sourceCurrencyCode, sourceAmount, destinationAccountId, destinationAccountName, destinationCurrencyCode, destinationAmount, effectiveRate, occurredAtUtc, note, clientRequestId, createdAtUtc, updatedAtUtc }
Budget       { id, year, month, currencyCode, categoryId, categoryName, amount, usedAmount, remainingAmount, usagePercent, isOverBudget, createdAtUtc, updatedAtUtc }
Dashboard    { currencyCode, year, month, timeZone, periodStartUtc, periodEndUtc, totalBalance, monthlyIncome, monthlyExpense, monthlyNet, dailyAverageExpense, daysElapsed,
               overallBudget: { budgetId, amount, usedAmount, remainingAmount, usagePercent, isOverBudget } | null,
               expenseByCategory: [{ categoryId, categoryName, amount, percent }],
               recentTransactions: [Transaction],
               accounts: [{ accountId, name, type, currencyCode, balance, isIncludedInTotal }],
               negativeAccounts: [same shape],
               otherCurrencies: [{ currencyCode, totalBalance, accountCount }],
               availableCurrencies: [string] }
```

`type` ∈ Cash, BankCard, BankAccount, Savings, Other. `kind`/transaction `type` ∈ Income, Expense. `effectiveRate` = destinationAmount ÷ sourceAmount rounded to 6 decimals, `null` for same-currency transfers.

### Setup

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/api/finance/setup` | `{ firstAccount?: { name, type, currencyCode, openingBalance, isIncludedInTotal } }` | 200 `{ isComplete, categoriesCreated, accountCreated, categories[], accounts[] }` | 400 |

Idempotent and serialized per user: missing default categories are created without duplicates; the first account is created only when the user has none and one is supplied; nothing is ever overwritten or invented. `isComplete` is true when at least one non-archived account exists.

### Accounts

| Method | Path | Body / query | Success | Errors |
|---|---|---|---|---|
| GET | `/api/finance/accounts` | `includeArchived=false` | 200 `[Account]` | |
| POST | `/api/finance/accounts` | `{ name, type, currencyCode, openingBalance, isIncludedInTotal }` | 201 Account | 400 |
| GET | `/api/finance/accounts/{id}` | | 200 | 404 |
| PUT | `/api/finance/accounts/{id}` | `{ name, type, currencyCode, openingBalance, isIncludedInTotal, isArchived }` | 200 | 400, 404, 409 currency/opening balance locked by activity |
| DELETE | `/api/finance/accounts/{id}` | | 204 | 404, 409 has activity (archive instead) |

### Categories

| Method | Path | Body / query | Success | Errors |
|---|---|---|---|---|
| GET | `/api/finance/categories` | `kind`, `includeArchived=false` | 200 `[Category]` | |
| POST | `/api/finance/categories` | `{ name, kind }` | 201 | 400, 409 name taken |
| GET | `/api/finance/categories/{id}` | | 200 | 404 |
| PUT | `/api/finance/categories/{id}` | `{ name, isArchived }` | 200 | 400, 404, 409 name taken |
| DELETE | `/api/finance/categories/{id}` | | 204 | 404, 409 in use (archive instead) |

### Transactions

| Method | Path | Body / query | Success | Errors |
|---|---|---|---|---|
| GET | `/api/finance/transactions` | `pageNumber, pageSize, from, to, type, accountId, categoryId, currencyCode` | 200 paged | 400 |
| POST | `/api/finance/transactions` | `{ accountId, categoryId, type, amount, occurredAtUtc, note?, clientRequestId? }` | 201 (200 on replay) | 400 amount/scale/date, 404 foreign account or category, 409 archived account/category or kind mismatch |
| GET | `/api/finance/transactions/{id}` | | 200 | 404 |
| PUT | `/api/finance/transactions/{id}` | same as POST without `clientRequestId` | 200 | 400, 404, 409 |
| DELETE | `/api/finance/transactions/{id}` | | 204 | 404, 409 when a recurring occurrence links the transaction (undo the month from Təkrarlananlar instead) |

### Transfers

| Method | Path | Body / query | Success | Errors |
|---|---|---|---|---|
| GET | `/api/finance/transfers` | `pageNumber, pageSize, from, to, accountId` | 200 paged | 400 |
| POST | `/api/finance/transfers` | `{ sourceAccountId, destinationAccountId, sourceAmount, destinationAmount, occurredAtUtc, note?, clientRequestId? }` | 201 (200 on replay) | 400 same account, non-positive amount, same-currency amounts differ; 404 foreign account; 409 archived account |
| GET | `/api/finance/transfers/{id}` | | 200 | 404 |
| PUT | `/api/finance/transfers/{id}` | same as POST without `clientRequestId` | 200 | 400, 404, 409 |
| DELETE | `/api/finance/transfers/{id}` | | 204 | 404 |

### Budgets

| Method | Path | Body / query | Success | Errors |
|---|---|---|---|---|
| GET | `/api/finance/budgets` | `year, month, currencyCode` | 200 `[Budget]` with usage | 400 |
| POST | `/api/finance/budgets` | `{ year, month, currencyCode, categoryId?, amount }` | 201 | 400, 404 foreign category, 409 duplicate scope or category not an active expense category |
| GET | `/api/finance/budgets/{id}` | | 200 | 404 |
| PUT | `/api/finance/budgets/{id}` | `{ amount }` | 200 | 400, 404 |
| DELETE | `/api/finance/budgets/{id}` | | 204 | 404 |

### Dashboard

| Method | Path | Query | Success | Errors |
|---|---|---|---|---|
| GET | `/api/finance/dashboard` | `currencyCode?` (default: profile currency), `year?`+`month?` (default: current local month) | 200 Dashboard | 400 |

Formulas are documented in [DOMAIN.md](DOMAIN.md). Balances are as of the request time; monthly figures use the local month in the profile time zone; other currencies are never added into `totalBalance`.

`Dashboard.debts` (Phase 3) keeps principal apart from income and expense:
`{ monthlyPrincipalNet, monthlyCashChange, receivablesOutstanding, payablesOutstanding, overdueReceivables,
overduePayables, overdueCount, netPosition }` — all in the dashboard currency. `monthlyNet` stays income − expense;
`monthlyCashChange = monthlyNet + monthlyPrincipalNet`; `netPosition = totalBalance + receivablesOutstanding −
payablesOutstanding` and is labelled as such wherever it is shown.

### Recurring (Phase 3)

A template is a monthly plan; a month is only ever recorded by the user's explicit confirmation. `GET
/api/finance/recurring` computes `Pending` rows on read and stores nothing, so reads can never post money.

```text
RecurringTemplate   { id, title, type, amount, currencyCode, categoryId, categoryName, accountId, accountName,
                      dayOfMonth, startDate, endDate, isActive, note, clientRequestId, createdAtUtc, updatedAtUtc }
RecurringOccurrence { templateId, occurrenceId, year, month, dueDate, status: Pending|Recorded|Skipped,
                      title, type, amount, currencyCode, categoryId, categoryName, accountId, accountName,
                      transactionId, recordedAtUtc, templateIsActive, updatedAtUtc }
RecurringMonth      { year, month, timeZone, occurrences: [RecurringOccurrence],
                      pendingTotals: [{ currencyCode, income, expense }], recordedTotals: [...] }
```

| Method | Path | Body / query | Success | Errors |
|---|---|---|---|---|
| GET | `/api/finance/recurring` | `year?`, `month?` (default: current local month) | 200 RecurringMonth | 400 |
| GET | `/api/finance/recurring/templates` | – | 200 `[RecurringTemplate]` | 401 |
| POST | `/api/finance/recurring/templates` | `{ title, type, amount, categoryId, accountId, dayOfMonth 1–31, startDate, endDate?, note?, clientRequestId? }` | 201 (200 on replay) | 400, 404 foreign account/category, 409 archived account/category, kind mismatch, or key reused with different input |
| GET | `/api/finance/recurring/templates/{id}` | – | 200 | 404 |
| PUT | `/api/finance/recurring/templates/{id}` | same as POST plus `isActive`, `expectedUpdatedAtUtc?` | 200 | 400, 404, 409 stale edit or archived/mismatched references |
| DELETE | `/api/finance/recurring/templates/{id}` | – | 204 | 404, 409 when any month is recorded or skipped (deactivate instead) |
| POST | `/api/finance/recurring/templates/{id}/occurrences/{year}/{month}/record` | `{ accountId?, amount?, occurredOn?, note?, clientRequestId? }` — absent fields fall back to the plan; `occurredOn` defaults to the due date once passed, otherwise today | 201 `{ occurrence, transaction }` (200 when the month is already recorded, whatever the key) | 400 amount/date, 404 template or foreign account, 409 template inactive, month not scheduled, account archived or in another currency, key reused for another month |
| POST | `/api/finance/recurring/templates/{id}/occurrences/{year}/{month}/skip` | – | 200 occurrence | 404, 409 already recorded |
| POST | `/api/finance/recurring/templates/{id}/occurrences/{year}/{month}/undo` | – | 200 occurrence (`Skipped`, transaction deleted; repeat is a no-op) | 404 |

The currency of a template is copied from its account at creation and on edit; recording accepts only an
account in that currency. Editing applies to every unrecorded month, missed past months included, and never to
a recorded one. `updatedAtUtc` echoed as `expectedUpdatedAtUtc` guards against stale edits (409); racing writes
are additionally guarded by `xmin`.

### Debts (Phase 3)

```text
Debt          { id, direction: Receivable|Payable, counterpartyName, principal, paidAmount, remainingAmount,
                currencyCode, openedOn, dueOn, status: Open|PartiallyPaid|Settled, isOverdue,
                movedCashAtOpening, hasMovements, note, clientRequestId, createdAtUtc, updatedAtUtc }
DebtMovement  { id, kind: Opening|Payment, accountId, accountName, amount, cashEffect, occurredAtUtc, note,
                isReversed, reversedAtUtc, createdAtUtc }
DebtDetail    { debt: Debt, history: [DebtMovement] }
DebtSummary   { timeZone, today, currencies: [{ currencyCode, receivableOutstanding, payableOutstanding,
                overdueReceivable, overduePayable, openReceivables, openPayables, overdueCount }] }
```

| Method | Path | Body / query | Success | Errors |
|---|---|---|---|---|
| GET | `/api/finance/debts` | `direction?`, `includeSettled?`, `currencyCode?`, `pageNumber?`, `pageSize?` | 200 paged Debt | 400 |
| GET | `/api/finance/debts/summary` | – | 200 DebtSummary — aggregated in SQL over every debt, independent of paging | 401 |
| POST | `/api/finance/debts` | `{ direction, counterpartyName, principal, currencyCode, openedOn, dueOn?, note?, accountId?, clientRequestId? }` — `accountId` present means the principal moves through that account now; absent means an existing obligation, no balance changes | 201 DebtDetail (200 on replay) | 400 principal/dates, 404 foreign account, 409 archived account, currency mismatch, or key reused with different principal/direction/currency |
| GET | `/api/finance/debts/{id}` | – | 200 DebtDetail | 404 |
| PUT | `/api/finance/debts/{id}` | `{ counterpartyName, principal, openedOn, dueOn?, note?, expectedUpdatedAtUtc? }` | 200 DebtDetail | 400, 404, 409 stale edit, or principal/openedOn changed while movements exist |
| DELETE | `/api/finance/debts/{id}` | – | 204 | 404, 409 when movements exist |
| POST | `/api/finance/debts/{id}/payments` | `{ accountId, amount, paidOn, note?, clientRequestId? }` | 201 DebtDetail (200 on replay with the same key and input) | 400 zero, negative or over-remaining amount, 404 foreign account, 409 settled, archived account, currency mismatch, key reused with different input, or a concurrent payment changed the balance (re-read and retry) |
| POST | `/api/finance/debts/{id}/payments/{paymentId}/undo` | – | 200 DebtDetail (repeat is a no-op) | 404 |

A payment and the debt's version bump are one database transaction, so two payments racing for the same
remaining balance cannot both succeed. Undo reverses the movement (it stays in `history` marked `isReversed`)
and restores the remaining balance and the account balance together. Overdue is decided on the server in the
profile time zone; clients display it and never recompute it.

## Nutrition (Phase 3A)

All nutrition endpoints require a bearer token. Days are local calendar days in the profile time zone.

### Shapes

```text
NutritionItem   { id, name, quantityMode, quantity, energyKcalPerUnit, proteinGramsPerUnit, carbGramsPerUnit, fatGramsPerUnit,
                  energyKcal, proteinGrams, carbGrams, fatGrams, position }
NutritionEntry  { id, mealType, consumedAtUtc, note, clientRequestId, energyKcal, proteinGrams, carbGrams, fatGrams,
                  items: [NutritionItem], createdAtUtc, updatedAtUtc }
NutritionGoal   { id, effectiveFrom, energyKcal, proteinGrams, carbGrams, fatGrams, createdAtUtc, updatedAtUtc }
NutritionDay    { date, timeZone, startUtc, endUtc, totals: { energyKcal, proteinGrams, carbGrams, fatGrams }, entryCount,
                  goal: NutritionGoal | null,
                  meals: [{ mealType, totals, entries: [NutritionEntry] }] }
NutritionGoals  { date, timeZone, current: NutritionGoal | null, history: [NutritionGoal] }
```

`mealType` is `Breakfast | Lunch | Dinner | Snack`. `quantityMode` is `PerPortion` (quantity counts portions) or
`Per100Grams` (quantity is the consumed weight in grams). The `*PerUnit` values are what the user entered for one
portion or for 100 g; the unsuffixed values are what the item contributed and are computed by the server. Energy
is never derived from the macros. A target may be `null`, which means it is not tracked.

### Endpoints

| Method | Path | Body / query | Success | Errors |
|---|---|---|---|---|
| GET | `/api/nutrition/day` | `date?` (default: today in the profile time zone) | 200 NutritionDay | 400, 401 |
| GET | `/api/nutrition/entries` | `date?`, `from?`, `to?`, `mealType?`, `pageNumber?`, `pageSize?` | 200 paged NutritionEntry | 400, 401 |
| POST | `/api/nutrition/entries` | `{ mealType, consumedAtUtc, note?, items[1..20], clientRequestId? }` | 201 entry (200 on an idempotent replay) | 400, 401 |
| GET | `/api/nutrition/entries/{id}` | – | 200 entry | 401, 404 |
| PUT | `/api/nutrition/entries/{id}` | `{ mealType, consumedAtUtc, note?, items[1..20] }` | 200 entry | 400, 401, 404 |
| DELETE | `/api/nutrition/entries/{id}` | – | 204 | 401, 404 |
| GET | `/api/nutrition/goals` | `date?` | 200 NutritionGoals | 400, 401 |
| PUT | `/api/nutrition/goals` | `{ effectiveFrom?, energyKcal?, proteinGrams?, carbGrams?, fatGrams? }` | 200 goal, or 204 when every target was cleared | 400, 401 |
| DELETE | `/api/nutrition/goals/{id}` | – | 204 | 401, 404 |

Item ids inside a `PUT` body are ignored: the entry rebuilds its own snapshot rows, so an edit can neither adopt
another user's item nor change the row another entry stored. Day totals are summed over every stored entry of
the day, independently of list pagination. Copying a meal is an ordinary `POST` built from the source's inputs.

## Nutrition photo analysis (Phase 3B)

All endpoints require a bearer token and are scoped to the caller. Uploading a photo produces a **draft**, which
contributes nothing to any total; only `POST /{id}/confirm` writes a meal, through the ordinary nutrition create
path. A draft belonging to another user is answered exactly like one that does not exist (404).

### Shapes

```text
FoodAnalysisItem  { id, name, portionDescription, estimatedGrams, basis,
                    energyKcal, proteinGrams, carbGrams, fatGrams, confidence, position,
                    suggestedQuantityMode, suggestedQuantity,
                    suggestedEnergyKcalPerUnit, suggestedProteinGramsPerUnit,
                    suggestedCarbGramsPerUnit, suggestedFatGramsPerUnit, isComplete }
FoodAnalysisDraft { id, status, outcome, schemaVersion, model, notes, confidence,
                    imageId, hasImage, createdAtUtc, expiresAtUtc, isExpired,
                    confirmedEntryId, items: [FoodAnalysisItem] }
```

`status` is `PendingConfirmation | Confirmed | Discarded`. `outcome` is `Success | InsufficientInformation |
NoFoodDetected`. `basis` says what the model's own numbers describe: `PicturedPortion` (the portion in the photo)
or `Per100Grams`. `confidence` is the model's self-assessment in 0–1, not a measured accuracy. Any nutrient the
model could not judge is `null` and stays `null` — it is never a zero.

The `suggested*` fields are the same food expressed as meal-entry input, and are the only sanctioned way to turn
an estimate into an item: a `PicturedPortion` estimate becomes `PerPortion` with quantity 1 (the estimated weight
stays metadata), and a `Per100Grams` estimate becomes `Per100Grams` with the estimated weight as the quantity. The
weight and the portion count are therefore never applied as two multipliers to the same food. `isComplete` is
false while a required value is still missing, so the client asks for it instead of inventing one.

### Endpoints

| Method | Path | Body / query | Success | Errors |
|---|---|---|---|---|
| POST | `/api/nutrition/food-analysis` | `multipart/form-data` with `photo`; `clientRequestId?` in the query | 201 draft (200 on an idempotent replay) | 400, 401, 413, 429, 503, 504 |
| GET | `/api/nutrition/food-analysis/{id}` | – | 200 draft | 401, 404 |
| GET | `/api/nutrition/food-analysis/images/{imageId}` | – | 200 `image/jpeg` | 401, 404 |
| POST | `/api/nutrition/food-analysis/{id}/confirm` | `{ mealType, consumedAtUtc, note?, items[1..20], clientRequestId? }` | 201 NutritionEntry (200 on a replay) | 400, 401, 404, 409 |
| DELETE | `/api/nutrition/food-analysis/{id}` | – | 204 | 401, 404, 409 |

Failure statuses are distinct on purpose: 400 for a picture the server could not use or the provider refused,
413 for an upload over the configured size, 429 for the per-user hourly ceiling, 503 when analysis is not
configured or the provider is unavailable, and 504 for a timeout. None of them stores anything.

The confirm body carries the user's own diary date, meal type and time; nothing in the photo, its metadata or the
model's answer can override them. **The draft is the idempotency key.** A second confirmation — retried,
concurrent, or sent with a different `clientRequestId` — returns the meal the first one created, because the entry
insert and the draft transition are saved in one transaction guarded by `xmin`. Confirming a discarded or expired
draft is a 409 and creates nothing.

Pending drafts expire after `Ai:FoodAnalysis:DraftLifetimeMinutes`; a background sweep then removes them together
with their pictures, and stored bytes are deleted at `ImageRetentionMinutes` regardless. Confirmed drafts keep
their original estimates, and no sweep ever touches a nutrition entry.

## Tasks (Phase 4A)

All endpoints require a bearer token and are scoped to the caller; another user's id is answered exactly like one
that does not exist (404). Planned dates and times are local calendar labels; every timestamp is a UTC instant.

### Shapes

```text
Task        { id, title, note, plannedDate, plannedTime, priority, state, isCompleted, completedAtUtc,
              isOverdue, seriesId, seriesKind, clientRequestId, createdAtUtc, updatedAtUtc }
TaskCounts  { scheduled, completed, overdue }
TaskDay     { date, timeZone, counts: TaskCounts, tasks: [Task], overdue: [Task] }
TaskSeries  { id, title, note, plannedTime, priority, kind, weekdays, startDate, endDate, isStopped,
              createdAtUtc, updatedAtUtc }
TaskDetail  { task: Task, series: TaskSeries | null, history: [{ kind, occurredAtUtc }] }
```

`priority` is `Low | Normal | High`. `state` is `Pending | Completed | Removed` — a `Removed` row is the tombstone
of a deleted series occurrence and never appears in any read. `kind` is `None | Daily | Weekly`, and `weekdays`
are ISO numbers (1 = Monday … 7 = Sunday). `isOverdue` is decided by the server in the profile time zone: a task
without a time is late once its planned day has ended, one with a time once that minute has passed.

### Endpoints

| Method | Path | Body / query | Success | Errors |
|---|---|---|---|---|
| GET | `/api/tasks/today` | `date?` (default: today in the profile time zone) | 200 TaskDay | 400, 401 |
| GET | `/api/tasks` | `view?` (`Today\|Upcoming\|Completed`), `from?`, `to?`, `priority?`, `pageNumber?`, `pageSize?` | 200 paged Task | 400, 401 |
| POST | `/api/tasks` | `{ title, note?, plannedDate, plannedTime?, priority, recurrence?, clientRequestId? }` | 201 task (200 on an idempotent replay) | 400, 401 |
| GET | `/api/tasks/{id}` | – | 200 TaskDetail | 401, 404 |
| PUT | `/api/tasks/{id}` | `{ title, note?, plannedDate, plannedTime?, priority, expectedUpdatedAtUtc? }` | 200 task | 400, 401, 404, 409 |
| POST | `/api/tasks/{id}/completion` | `{ completed }` | 200 task | 401, 404, 409 |
| DELETE | `/api/tasks/{id}` | – | 204 | 401, 404 |
| GET | `/api/tasks/series/{id}` | – | 200 TaskSeries | 401, 404 |
| PUT | `/api/tasks/series/{id}` | `{ title, note?, plannedTime?, priority, recurrence, expectedUpdatedAtUtc? }` | 200 series | 400, 401, 404, 409 |
| POST | `/api/tasks/series/{id}/stop` | – | 200 series | 401, 404 |

**Completion is a state, not a toggle.** `POST /{id}/completion` carries the value the caller wants, so a retried
request is harmless: repeating `completed: true` leaves the task completed, changes no timestamp and records no
second history event. There is deliberately no toggle endpoint.

**Views are disjoint slices**, so a task appears in exactly one of them: `Today` is everything pending up to and
including today, `Upcoming` is pending after today, `Completed` is what is done. `TaskDay.tasks` is different — it
is everything planned for that one day, done or not, which is what the diary-style screen shows. Counts and
percentages are aggregated over the whole matching set in the database, never over the returned page, and a list
range may span at most 366 days.

**Stale edits.** `PUT` bodies may echo the `updatedAtUtc` the client last read. A stored row that has moved on
answers 409 instead of silently overwriting the newer state; omitting the field keeps the old behaviour. Racing
writes are additionally guarded by the row's `xmin` version, which reports the same 409.

**Recurrence.** A create with `recurrence` produces a `TaskSeries` plus one `TaskItem` per scheduled date, and
returns the first occurrence. Occurrences are materialized from the series start through 30 days ahead — missed
past dates included, so nothing silently vanishes from the counts — and `(series_id, planned_date)` is unique, so
concurrent or repeated generation cannot duplicate a date. `PUT /series/{id}` changes the rule and rebuilds only
the pending occurrences from today onwards; `POST /series/{id}/stop` ends it today and drops pending future dates
while keeping every completed one. Deleting one occurrence tombstones that date so regeneration cannot undo it.

**Time zones and daylight saving.** Because planned dates and times are calendar labels rather than instants, a
profile that moves to another zone keeps every task on the day and minute it was planned for; only which day
counts as "today", and therefore what is overdue, follows the new zone. A daylight-saving jump has no effect on a
task's identity for the same reason: an 09:00 task is 09:00 local before and after the transition, and a
day-only task is still due by the end of its own local day, whether that day is 23, 24 or 25 hours long.

## Sleep (Phase 4B)

All endpoints require a bearer token and are scoped to the caller; another user's id is answered exactly like one
that does not exist (404). Every timestamp is a UTC instant; `wakeDate` and the summary's dates are local
calendar labels in the profile time zone.

### Shapes

```text
SleepSession  { id, startedAtUtc, endedAtUtc, isOpen, durationMinutes, wakeDate, quality, note,
                clientRequestId, createdAtUtc, updatedAtUtc }
SleepDay      { date, totalMinutes, sessionCount }
SleepSummary  { timeZone, from, to, days: [SleepDay], averageMinutes, recordedDays, totalMinutes,
                sessionCount, active: SleepSession | null, latest: SleepSession | null }
```

`durationMinutes`, `endedAtUtc` and `wakeDate` are `null` while a session is open. `SleepDay.totalMinutes` is
`null` for a date with **nothing recorded**, which a client must not render as zero minutes of sleep.
`quality` is an integer 1–5 or `null`; `note` is at most 500 characters or `null`.

### Endpoints

| Method | Path | Body / query | Success | Errors |
|---|---|---|---|---|
| GET | `/api/sleep/active` | – | 200 session, **204** when none is running | 401 |
| GET | `/api/sleep/summary` | `date?` (default: today in the profile time zone) | 200 SleepSummary | 400, 401 |
| POST | `/api/sleep/start` | `{ startedAtUtc?, clientRequestId? }` | 201 session (200 on an idempotent replay) | 400, 401, 409 |
| POST | `/api/sleep/sessions/{id}/stop` | `{ endedAtUtc }` | 200 session | 400, 401, 404, 409 |
| GET | `/api/sleep/sessions` | `from?`, `to?`, `pageNumber?`, `pageSize?` | 200 paged SleepSession | 400, 401 |
| POST | `/api/sleep/sessions` | `{ startedAtUtc, endedAtUtc, quality?, note?, clientRequestId? }` | 201 session (200 on an idempotent replay) | 400, 401, 409 |
| GET | `/api/sleep/sessions/{id}` | – | 200 session | 401, 404 |
| PUT | `/api/sleep/sessions/{id}` | `{ startedAtUtc, endedAtUtc, quality?, note?, expectedUpdatedAtUtc? }` | 200 session | 400, 401, 404, 409 |
| DELETE | `/api/sleep/sessions/{id}` | – | 204 | 401, 404 |

**Starting.** `startedAtUtc` defaults to the server clock. A second start while one session is open answers 409
(`sleep_open_session_exists`); a repeated call carrying the same `clientRequestId` returns the session that
already exists, so a retry after an answer that never arrived cannot open two.

**Stopping is idempotent per session.** The stop names both the session and the instant the user pressed, so a
retry minutes later records when they woke rather than when the network came back. Stopping an already completed
session returns it unchanged — the recorded end never moves — and never falls through to a newer session. A stop
instant that is not after the start, is in the future, or would make the session longer than 24 hours is a 400.

**Recording and correcting.** `POST /sessions` writes a completed session directly; `PUT` corrects one.
A `PUT` with `endedAtUtc: null` leaves the session open, which is how a forgotten night is fixed without
inventing a wake-up. Quality and note are optional everywhere: nothing about rating a night is required to
record that it happened.

**Limits and overlap.** A completed session is at most **24 hours** and may not start more than 5 minutes ahead
of the server clock. Completed sessions of one user may not overlap (409 `sleep_overlap`), enforced by a
`btree_gist` EXCLUDE constraint over the half-open range `[start, end)` — so **two sessions may meet at an
endpoint**: 23:00–07:00 and 07:00–07:30 both stand. An open session is treated as reaching the present moment,
so nothing can be recorded inside a night that is still running. An open session itself has **no** upper bound
and is never clipped or auto-closed; it is resolved by a correction or an explicit delete.

**Stale edits.** `PUT` bodies may echo the `updatedAtUtc` the client last read; a row that has moved on answers
409 rather than overwriting the newer state. Racing writes are additionally guarded by `xmin`, which reports the
same 409.

**The summary.** `GET /summary` returns the last seven local dates ending on `date`, each session attributed to
the local date it **ended** on, so a night across midnight is counted once, on the wake-up day. `averageMinutes`
is the mean over `recordedDays` — the dates that hold a record — never over seven, and is `null` when the window
holds nothing. Totals, counts and averages cover every matching session, independently of any paging used to
list them. `active` is the running session if there is one; `latest` is the most recently completed one.

## Focus (Fokus)

Both endpoints require a bearer token and are scoped to the caller. Only **focus runs** are ever recorded:
breaks are local and are never uploaded, so nothing in this group can describe one.

### Shapes

```text
FocusSession  { id, clientSessionId, taskId, taskTitle, configuredSeconds, startedAtUtc, endedAtUtc,
                activeSeconds, outcome: "Completed" | "Stopped", createdAtUtc }
FocusDay      { date, activeSeconds, completedSessions, stoppedSessions }
FocusSummary  { timeZone, today: FocusDay }
```

`activeSeconds` is the time the timer actually ran, with every pause excluded — precise seconds, never the
rounded minutes a screen displayed. `outcome` is `Completed` only for a run that reached its configured
duration; a run the user ended early is `Stopped`, keeps the time it ran, and is never a completed Pomodoro.

### Endpoints

```text
POST /api/focus/sessions            Records one finished run. 201 the first time, 200 on a replay.
GET  /api/focus/summary[?date=]     Today's focus in the profile time zone.
```

The request body is `{ clientSessionId, taskId, taskTitle, configuredSeconds, intervals, outcome }`, where
`intervals` is the list of `{ startedAtUtc, endedAtUtc }` stretches the timer ran for.

**Idempotency.** `clientSessionId` is generated on the device *before* the run starts, and the database holds
one row per `(user, clientSessionId)`. A retry from the offline outbox — or two racing retries — is answered
with the record that already exists (200), so a flaky connection can never duplicate history or inflate a
total. It is the only key the client needs; nothing else about a run is used to match it.

**Validation.** `configuredSeconds` is 60–14 400. Intervals must be non-empty, must each end after they start,
must not overlap, and must not end more than five minutes ahead of the server clock. A run claiming
`Completed` with less active time than it was configured for is refused, as is active time exceeding the wall
clock the run occupied. Malformed payloads are 400 with Problem Details; none of them is reshaped to fit.

**The linked task.** `taskId` is validated against the caller: an id belonging to someone else, or to a
deleted task, is treated exactly like one that does not exist and the run is stored **unlinked** rather than
refused — the history of time actually spent outlives the task it was spent on. When the id does resolve, the
stored title wins over the device's snapshot. Deleting the task later sets `task_id` to null and keeps the
row, with its title snapshot, intact.

**The summary.** `activeSeconds` is split across local midnight by interval, so a run that started the evening
before counts on both dates in the proportion it was actually spent. `completedSessions` counts runs on the
local date they *finished*. Pauses are in neither figure, and a stopped run contributes time but never a
completed count.

## Assistant (Libra AI, Phase 7)

Every endpoint requires a bearer token and is owner-scoped. A conversation id belonging to another account is
answered exactly like one that does not exist (404), and nothing in this group can read or write another
user's records. The assistant is **read-only**: no endpoint here creates a transaction, completes a task,
changes a goal, starts a timer or schedules a notification. A suggestion is text in a conversation.

### Shapes

```text
AssistantModule       "Finance" | "Nutrition" | "Tasks" | "Sleep" | "Focus"
AssistantPeriod       "Today" | "LastSevenDays"
AssistantOutcome      "Answer" | "InsufficientData" | "ClarificationNeeded" | "Refusal"
FactAvailability      "Available" | "NoRecords" | "Partial" | "Unavailable"

AssistantFact         { id, module, label, availability, value, unit, text, period, caveat, sourceRoute }
AssistantSnapshot     { timeZone, rangeFrom, rangeTo, collectedAtUtc, modules, facts }
AssistantObservation  { text, factIds }
AssistantAnswer       { outcome, summary, observations, suggestions, followUps, clarification,
                        model, isFixture, snapshot }
AssistantMessage      { id, role: "user" | "assistant", text, createdAtUtc, answer }
AssistantConversation { id, title, modules, period, createdAtUtc, updatedAtUtc, messages }
AssistantSummary      { id, title, modules, period, updatedAtUtc }
AssistantStatus       { isConfigured, isFixture, model, defaultModules }
```

A **fact** is one figure this application computed, with a stable id (`finance.expense.month`,
`nutrition.energy.today`, `sleep.average.week`, `tasks.overdue`, `focus.minutes.today`, …). `availability`
carries the state explicitly: `Available` has a value, `NoRecords` means nothing was logged — which is *not* a
zero the user achieved — `Partial` means the period is only partly covered, and `Unavailable` means that
module could not be read for this request. `caveat` carries the domain qualification (logged intake may be
incomplete; an open sleep session is not a completed night). `sourceRoute` is the module screen the figure
came from, so the client can open it.

### Endpoints

```text
GET    /api/assistant/status                  Whether the assistant can answer, and with which model.
POST   /api/assistant/ask                     Asks one question. 200 with the whole conversation.
GET    /api/assistant/conversations           Paged history, newest first.
GET    /api/assistant/conversations/{id}      One conversation with every stored turn.
DELETE /api/assistant/conversations/{id}      204. Removes the conversation and its turns.
```

`POST /ask` takes `{ conversationId, question, modules, period, clientRequestId }`. `conversationId` null
starts a conversation; `modules` and `period` default to `Ai:Assistant:DefaultModules` and `Today`. An empty
question, a question over `AssistantMessage.QuestionMaxLength`, an unknown module or an unknown period is 400
with Problem Details.

**Grounding.** Each question builds a fresh snapshot from the caller's own records, using the same aggregates
the module screens use — complete aggregates, never a total summed from a page of a list — resolved through
the profile's IANA time zone. The provider receives that snapshot, the question and at most
`MaxHistoryTurns` earlier question/summary pairs. It receives no database access, no credentials, no SQL and
no tools. Observations may cite only fact ids present in that snapshot: a single unknown id invalidates the
whole answer, which is returned as 503 and **not stored**. Partial credit is never given.

**Retained snapshots.** The snapshot is stored with the answer, so an older turn keeps the figures it was
actually based on and never appears to reference today's numbers. Changing the selected modules or the period
starts a new conversation rather than re-scoping an old one, so an earlier turn cannot reintroduce data that
is now excluded.

**Idempotency.** `clientRequestId` is generated on the device before the send. One row exists per
`(user, clientRequestId)`, so a retry after an uncertain answer returns the turn that was already stored —
the provider is not asked, and not paid, twice.

**Limits.** `MaxQuestionsPerHour` (30) per user, process-wide concurrency of 8 with a `QueueSeconds` wait
before 429, `TimeoutSeconds` (40) per provider call and `MaxOutputTokens` (900) per answer. They are
configured separately from `Ai:FoodAnalysis` so neither feature can exhaust the other's budget.

**Unavailable.** With no provider key the status endpoint reports `isConfigured: false` and `/ask` is 503 with
`"AI köməkçi hələ aktiv deyil."`. No canned text is ever returned as an answer. A development fixture exists
behind `Ai:Assistant:UseDevelopmentFixture` in Development only, and every answer it produces carries
`isFixture: true` so the interface can label it.

## Planned endpoint groups

```text
/api/analytics/dashboard/*          Phase 5
```
