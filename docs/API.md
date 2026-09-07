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
| DELETE | `/api/finance/transactions/{id}` | | 204 | 404 |

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

## Planned endpoint groups

```text
/api/finance/recurring/*            Phase 3
/api/debts/*                        Phase 3
/api/tasks/*                        Phase 4
/api/sleep/sessions/*               Phase 4
/api/nutrition/meals/*              Phase 5
/api/nutrition/goals/*              Phase 5
/api/analytics/dashboard/*          Phase 5
/api/nutrition/food-analysis/*      Phase 6
/api/assistant/conversations/*      Phase 7
```
