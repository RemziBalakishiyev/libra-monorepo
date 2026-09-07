# CLAUDE.md — Libra Engineering Rules

## Product
Libra is a mobile personal-life tracker for finance, nutrition, sleep, tasks, analytics, and an AI assistant. The default locale is az-AZ, timezone is Asia/Baku, and currency is AZN, but domain models must not hardcode them.

## Working protocol
1. Before changing code, read README.md, docs/IMPLEMENTATION-PLAN.md, docs/DOMAIN.md, docs/ARCHITECTURE.md, docs/API.md, and docs/DECISIONS.md.
2. Inspect the existing repository. Never assume a file, package, API, migration, or command exists.
3. Work on only the phase and vertical slice explicitly requested in the current prompt.
4. Before implementation, state a concise plan, affected files, assumptions, and acceptance criteria. Ask only if a missing decision materially changes the domain or security model.
5. Preserve user changes. Do not delete or rewrite unrelated code. Never run destructive git or database commands.
6. Prefer simple production-quality code. Do not introduce microservices, event buses, generic repositories, speculative abstractions, or packages without a current requirement.
7. Do not mark work complete until relevant builds, tests, lint, and type checks pass.
8. If a command fails, diagnose and fix it within scope. Do not hide, skip, or weaken tests.
9. End every implementation turn with: changed files, migrations, commands run and results, security considerations, remaining work, and exact manual test steps.
10. Update relevant docs and docs/IMPLEMENTATION-PLAN.md checkboxes after verified completion.

## Backend rules
- Use .NET 10 LTS and the latest compatible stable patch/packages. Never use preview packages unless explicitly approved.
- Use ASP.NET Core Web API, EF Core, PostgreSQL, and a modular monolith.
- Organize application code by module/use case, not one giant service folder.
- Domain must not depend on Infrastructure or Api.
- Every user-owned query and mutation must enforce UserId server-side.
- Use UTC in persistence and DateTimeOffset at boundaries. Convert days/ranges using the user's IANA timezone.
- Use decimal for money/macros and numeric(18,2) for money. Never use float/double for financial values.
- Use ISO 4217 currency codes.
- Validate input at the API boundary and return Problem Details.
- Use CancellationToken for async I/O and no sync-over-async.
- Do not expose EF entities directly from endpoints.
- Migrations must be deterministic. Never auto-run destructive migrations in production.
- Secrets must come from environment variables/user-secrets. Never commit secrets or print them.
- Logs must not contain passwords, access/refresh tokens, full AI prompts with private data, or raw meal images.

## Mobile rules
- Use React Native with Expo, TypeScript strict mode, and Expo Router.
- Choose versions compatible with the current Expo SDK; verify using official Expo tooling before installing packages (`npx expo install`, `npx expo-doctor`).
- Use TanStack Query for server state and Zustand only for client/UI state.
- Use React Hook Form and Zod for forms.
- Store credentials only in SecureStore, never AsyncStorage.
- Build reusable design tokens and components; do not scatter raw colors/spacing across screens.
- Implement loading, empty, error, retry, validation, and keyboard-safe states.
- Meet basic accessibility: labels, touch targets, contrast, dynamic text behavior.
- Keep API DTO types synchronized through an explicit generation or contract workflow; do not duplicate types silently.

## Domain invariants
- Receivables are not available cash.
- A recurring template creates an idempotent occurrence; it is not itself a paid transaction.
- Debt remaining amount derives from principal and valid payments.
- One user can have at most one open sleep session.
- Sleep duration derives from timestamps, not an in-memory timer.
- AI food analysis is an estimate and remains a draft until user confirmation.
- AI cannot mutate user data without an explicit preview and confirmation.
- AI gets least-privilege application tools, never direct database access.

## Testing gates
Run the relevant subset during work, then before phase completion run:
- dotnet format --verify-no-changes
- dotnet build
- dotnet test
- mobile lint
- mobile typecheck
- mobile tests

Add integration tests for authorization boundaries, calculations, database constraints, recurring idempotency, and AI confirmation gates.

## Repository map and commands
- Solution: `Libra.slnx` at the repository root. Build settings live in `Directory.Build.props`; package versions in `Directory.Packages.props` (central package management, warnings are errors).
- Backend: `src/backend/Libra.{Domain,Application,Infrastructure,Api}`. Tests: `tests/Libra.UnitTests`, `tests/Libra.IntegrationTests` (Testcontainers, needs Docker).
- Mobile: `src/mobile` (Expo SDK 57, npm). Routes only in `src/mobile/src/app`; screens, components, hooks, lib alongside.
- Local infra: `docker-compose.yml` (PostgreSQL on host port 5440 by default, see `.env.example`).
- Migrations: repo-local `dotnet-ef` (`dotnet tool restore`, then `dotnet tool run dotnet-ef ...` with `ASPNETCORE_ENVIRONMENT=Development`); see docs/DATABASE.md. Development and tests apply migrations at startup.
- Auth: JWT bearer (`Jwt:*`, `Auth:*` settings), rotating refresh tokens; `ClaimsPrincipal.GetUserId()` is the only source of the user id in endpoints.
- Finance: `Libra.Application/Finance/*` (one handler per aggregate, `AccountBalanceCalculator`, `BudgetUsageCalculator`, `LocalCalendar`). Read endpoints project into init-only records; creates take `clientRequestId`. Formulas in docs/DOMAIN.md.
- Mobile finance: `lib/api/finance.ts` (Zod-validated client), `hooks/use-finance.ts` (query keys under `['finance']`), `screens/finance/*`, `constants/tabs.ts`. Use `createTestQueryClient()` in tests.
- Mobile design system: tokens in `src/mobile/src/constants/theme.ts` (read via `useTheme()`), components in `src/mobile/src/components/*`, rules in `docs/DESIGN-SYSTEM.md`. Native headers are off (screens render `ScreenHeader`); phones use the floating `TabBar`, desktop web the `Sidebar`. Jest needs `jest.setup.ts` (Reanimated `setUpTests`, gesture-handler and safe-area mocks) plus the `react-native-worklets/jest/resolver.js` resolver.

```bash
dotnet format Libra.slnx --verify-no-changes
dotnet build Libra.slnx
dotnet test Libra.slnx
cd src/mobile && npm run lint && npm run typecheck && npm test
docker build -f src/backend/Dockerfile -t libra-api .
```
