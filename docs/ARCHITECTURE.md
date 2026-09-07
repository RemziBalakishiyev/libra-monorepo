# Architecture

## Overview

One deployable API (modular monolith) plus one Expo mobile app, backed by PostgreSQL.

```text
mobile (Expo)  --HTTPS/JSON-->  Libra.Api (ASP.NET Core)  --EF Core-->  PostgreSQL
                                    |
                                    +--> AI provider adapter (Phase 6+)
                                    +--> Object storage adapter (Phase 6+)
```

## Backend layers

```text
Libra.Domain          entities, value objects, domain rules       -> depends on nothing
Libra.Application     use cases per module, contracts, validation -> depends on Domain
Libra.Infrastructure  EF Core, PostgreSQL, external adapters       -> depends on Application
Libra.Api             host, endpoints, auth, Problem Details       -> depends on Application + Infrastructure
```

The dependency direction is enforced by `tests/Libra.UnitTests/Architecture/DependencyDirectionTests.cs`.

### Vertical slices

Application code is organized by module and use case, not by technical layer:

```text
Libra.Application/
  Finance/
    Transactions/
      CreateTransaction/    CreateTransactionCommand.cs, Handler.cs, Validator.cs
      ListTransactions/     ListTransactionsQuery.cs, Handler.cs, TransactionListItem.cs
  Debts/
  ...
Libra.Domain/
  Finance/                  Transaction.cs, FinanceCategory.cs, ...
Libra.Infrastructure/
  Persistence/              LibraDbContext.cs, Configurations/<Module>/*.cs, Migrations/
Libra.Api/
  Finance/                  endpoint mapping for the module (Minimal APIs)
```

Rules:

- No generic repositories, no mediator, no event bus unless a concrete requirement appears. Handlers take `ILibraDbContext` (the EF context behind a narrow interface that exposes the module DbSets and `SaveChangesAsync`) directly.
- Handlers return `Result<T>`; expected failures are `AppError` values (`Unauthorized`, `Conflict`, `NotFound`, `Validation`) that the API maps to Problem Details. Exceptions are for unexpected faults only.
- Request DTOs are the command/query records themselves, validated at the boundary by FluentValidation through `ValidationFilter<T>`.
- Endpoints map request DTOs to commands/queries, return response DTOs, and never expose EF entities.
- Every handler that touches user-owned data receives the authenticated `UserId` from claims and filters by it.
- Async I/O always takes a `CancellationToken`.

### Identity module (Phase 1)

- Domain: `User` (email, normalized email, password hash, display name), `UserPreference` (time zone, locale, currency), `RefreshToken` (hashed, family, expiry, revocation, replacement).
- Application: `Register`, `Login`, `RefreshSession`, `Logout`, `GetProfile`, `UpdateProfile` handlers plus `SessionIssuer` (creates the token pair) and `RefreshTokenSecret` (CSPRNG + SHA-256).
- Api: `AuthenticationSetup` (JWT bearer validation, `GetUserId()` from the `sub` claim), `JwtAccessTokenIssuer` (HS256, 15 min), `RateLimitingSetup` (fixed windows per IP on register/login/refresh), `AuthEndpoints`, `ProfileEndpoints`.
- Middleware order: exception handler, status code pages, request logging, (Development: CORS, OpenAPI), rate limiter, authentication, authorization, endpoints.

### Finance module (Phase 2)

- Domain: `FinancialAccount`, `FinanceCategory`, `FinancialTransaction`, `AccountTransfer`, `MonthlyBudget`, and `Money` (scale and currency-code rules). Entities validate their own invariants; handlers add the cross-entity and persistence rules.
- Application: one handler class per aggregate (`AccountsHandler`, `CategoriesHandler`, `TransactionsHandler`, `TransfersHandler`, `BudgetsHandler`), plus `FinanceSetupHandler` (idempotent onboarding under a per-user Postgres advisory lock) and `DashboardHandler`. Shared calculators: `AccountBalanceCalculator` (grouped balance deltas), `BudgetUsageCalculator` (expense per currency and category for a local month), `LocalCalendar` (time-zone month ranges), `UserFinanceSettings` (profile time zone and currency).
- Read shapes: list endpoints project directly into init-only response records so filters, ordering, and paging compose in SQL; no entity graph is loaded for reads.
- Idempotency: creates accept `clientRequestId`; the handler checks for an existing record, then relies on the filtered unique index and a unique-violation catch for concurrent retries.
- Api: `FinanceEndpoints` maps `/api/finance/*` under `RequireAuthorization()`; `ToCreatedOrReplayed` renders 201 for a new record and 200 for a replayed create.

### Host composition

`Program.cs` wires Serilog (bootstrap + configuration-driven), Problem Details, OpenAPI (Development only), Infrastructure (`AddInfrastructure`), and health endpoints:

- `/health/live` — no checks, proves the process serves requests.
- `/health/ready` — checks tagged `ready` (PostgreSQL via EF Core `CanConnect`).

`Program` is `public partial` so integration tests can host it with `WebApplicationFactory`.

### Configuration and secrets

- Configuration keys follow ASP.NET Core conventions; the database connection string is `ConnectionStrings:Libra` (`ConnectionStrings__Libra` as an environment variable).
- Development uses `appsettings.Development.json` (matches Docker Compose defaults) or `dotnet user-secrets`.
- Production values come only from the environment. Missing connection string fails fast at startup.
- Nothing secret is committed. `.env` is ignored; `.env.example` documents keys.

### Logging

Serilog writes structured logs to console. Request logging is enabled. Passwords, tokens, raw AI prompts with private data, and image bytes are never logged (rules in CLAUDE.md; redaction utilities are added when those features arrive).

### Errors

Unhandled exceptions and non-success status codes are rendered as RFC 9457 Problem Details via `AddProblemDetails` + `UseExceptionHandler` + `UseStatusCodePages`. Validation errors will use the same format (Phase 1+).

### Containers

`src/backend/Dockerfile` is a multi-stage build (SDK 10 → ASP.NET 10 runtime, non-root user, port 8080). `docker-compose.yml` runs PostgreSQL by default and the API under the `api` profile.

## Mobile

```text
src/mobile/src/
  app/          Expo Router routes only: (auth) group, (app) stack with (tabs) [index, finance, nutrition, plan, ai], profile, quick-add modal, finance/* forms and lists
  screens/      screen bodies rendered by routes; private sub-components colocated
  components/   design-system components (text, button, screen, sheet, form fields, finance widgets, tab bar, sidebar, ...)
  hooks/        reusable hooks (use-theme, use-api-health, ...)
  lib/          env, query client, API client modules (lib/api/<area>.ts), money/date helpers, client request ids, validation schemas
  constants/    design tokens (theme.ts)
```

- **Server state**: TanStack Query. One `QueryClient` from `lib/query-client.ts`. Query keys are exported constants next to their hooks; every finance mutation invalidates the `['finance']` prefix because balances, budgets, and the dashboard all depend on each other.
- **Client/UI state**: Zustand, only when component state is insufficient. Not for server data.
- **Forms**: React Hook Form + Zod.
- **Config**: `lib/env.ts` validates `EXPO_PUBLIC_*` variables with Zod. No secrets in the app bundle.
- **API contracts**: response shapes are validated with Zod schemas in `lib/api/*` for now. When the API grows, DTO types will be generated from the OpenAPI document (decision pending, see DECISIONS.md D-011).
- **Credentials**: Expo SecureStore only (Phase 1).
- **Design tokens**: `constants/theme.ts` (semantic light/dark palettes, spacing, radii, type ramp, shadows, motion, layout breakpoints, category colours) read through `hooks/use-theme.ts`. Screens must not use raw values. See [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).
- **Shell**: `app/_layout.tsx` (providers, session restore), `app/(app)/_layout.tsx` (headerless stack + desktop sidebar), `app/(app)/(tabs)/_layout.tsx` (custom floating tab bar). Native headers are off; screens render `ScreenHeader`.

## CI

`.github/workflows/ci.yml` runs two jobs on push/PR: backend (restore, format check, build, test with Testcontainers, Docker image build) and mobile (npm ci, lint, typecheck, tests).
