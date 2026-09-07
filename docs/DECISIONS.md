# Decisions

Format: ID, date, status (Accepted / Open), decision, rationale. Open items are non-blocking assumptions to confirm; anything that would change security, data ownership, or core domain behavior is asked before implementation.

## Accepted

### D-001 · 2026-09-04 · Solution and shared build files live at the repository root
`Libra.slnx`, `global.json`, `Directory.Build.props`, `Directory.Packages.props` are at the root so `dotnet build`/`dotnet test` work from the root and the `tests/` tree shares the same settings. Central package management with `TreatWarningsAsErrors` keeps versions in one place.

### D-002 · 2026-09-04 · Package set for Phase 0 is minimal
EF Core + Npgsql, Microsoft health checks for EF Core, Serilog.AspNetCore, Microsoft.AspNetCore.OpenApi; xunit 2.9 + Testcontainers + Mvc.Testing for tests. FluentValidation, JWT, rate limiting, and storage/AI packages are added by the phases that need them. Coverage collectors are not added until a report is consumed.

### D-003 · 2026-09-04 · Health endpoints are `/health/live` and `/health/ready`
Liveness runs no checks. Readiness runs checks tagged `ready` (PostgreSQL via EF Core). Both return a small JSON body. Readiness returns 503 with the same body shape when unhealthy, so the mobile app can display details.

### D-004 · 2026-09-04 · `LibraDbContext` exists in Phase 0 with no entities and no migrations
Needed for the readiness check and to fix the persistence wiring early. The first migration is created in Phase 1 after D-010 is settled.

### D-005 · 2026-09-04 · Development database credentials are not secrets
`libra` / `libra_dev` on `localhost:5440` appear in `.env.example`, `docker-compose.yml` defaults, and `appsettings.Development.json`. They only work against the local container. Every other environment must supply `ConnectionStrings__Libra` through the environment; the API fails fast without it.

### D-006 · 2026-09-04 · Docker Compose publishes PostgreSQL on host port 5440 by default
Ports 5432–5434 were occupied on the primary development machine. `POSTGRES_PORT` in `.env` overrides it. The API container talks to the `postgres` service on 5432 internally.

### D-007 · 2026-09-04 · No HTTPS redirection inside the API process
Mobile devices on a LAN talk to the API over plain HTTP during development, and production TLS terminates at a reverse proxy or platform ingress. HSTS/TLS policy is a Phase 8 deployment concern.

### D-008 · 2026-09-04 · Mobile uses npm and is a standalone package, not a root workspace
Expo tooling defaults to npm; a root workspace adds hoisting configuration without a current benefit. `src/mobile/package-lock.json` is committed; CI uses `npm ci`.

### D-009 · 2026-09-04 · Expo SDK 57 with the default `create-expo-app` template, trimmed
Template extras that Phase 0 does not use (`@expo/ui`, `expo-image`, `expo-symbols`, `expo-glass-effect`, `expo-device`, `expo-web-browser`, example screens, tab assets) were removed. Reanimated, Worklets, Gesture Handler, Screens, and Safe Area Context stay because Expo Router relies on them. Design tokens live in `src/constants/theme.ts`.

### D-012 · 2026-09-04 · Phase 0 mobile screen shows API readiness instead of empty tabs
One Home screen calls `/health/ready` through TanStack Query and shows loading/error-with-retry/success. It proves the full local stack and exercises the state conventions. Tabs arrive with Phase 2.

### D-013 · 2026-09-04 · Integration tests run against real PostgreSQL via Testcontainers
No in-memory provider. One container per test collection. Docker is required locally and is available on GitHub-hosted Ubuntu runners.

### D-014 · 2026-09-04 · Node.js requirement is 22.13+ even though 22.11 works for checks
Metro 0.84 declares `^20.19.4 || ^22.13.0 || ^24.3.0`. Lint, typecheck, and Jest passed on 22.11.0 with engine warnings. CI uses the latest Node 22 via `.nvmrc`. Upgrade the local Node before relying on the bundler.

### D-018 · 2026-09-05 · CORS is Development-only and configuration-driven
Expo Web runs on `http://localhost:8081` and needs CORS to call the API from the browser. A named policy reads `Cors:AllowedOrigins` (set in `appsettings.Development.json`), allows any header and method, and never allows credentials because auth will use `Authorization` headers. `UseCors` runs only when the environment is Development, before authentication/authorization and endpoints. Production never uses `AllowAnyOrigin`; if a browser client is ever deployed, its exact origin is added through configuration and the middleware is enabled per environment.

### D-010 · 2026-09-05 · snake_case naming for PostgreSQL
Tables, columns, indexes, and constraints are snake_case via `EFCore.NamingConventions`. Confirmed by the owner before the first migration.

### D-015 · 2026-09-05 · Offset pagination for the MVP
List endpoints use `pageNumber`/`pageSize` with a server-side cap. Cursor pagination can be introduced later for transaction lists if needed.

### D-016 · 2026-09-05 · ASP.NET Core `PasswordHasher<User>`
PBKDF2 through `Microsoft.Extensions.Identity.Core`. No custom hashing. Hashes are re-computed transparently when the hasher reports `SuccessRehashNeeded`.

### D-017 · 2026-09-05 · AI provider decision deferred to Phase 6
No AI package or configuration exists before Phase 6.

### D-019 · 2026-09-05 · JWT signing key comes from configuration; Development may use an ephemeral key
`Jwt:SigningKey` (at least 32 bytes) is required in every environment except Development. Nothing is committed. When the key is absent in Development the API generates a random key at startup and logs a warning; access tokens then stop validating after a restart, but refresh tokens live in the database so clients silently obtain new access tokens. Tests inject a fixed test key.

### D-020 · 2026-09-05 · Migrations apply automatically only where `Database:MigrateOnStartup` is true
True in `appsettings.Development.json` and in the integration test host; false by default. Other environments run `dotnet ef database update` as a deployment step.

### D-021 · 2026-09-05 · Register reveals whether an email exists (409)
Acceptable for a personal MVP with rate limiting; it avoids a confusing verification flow when there is no email delivery. Login never reveals it (identical 401 and a dummy hash verification for unknown emails).

### D-022 · 2026-09-05 · Refresh tokens: 30-day sliding lifetime, families, reuse revokes the family
Each login starts a family. Refresh rotates the token (old one revoked and linked to its successor) and issues a fresh 30-day token. Presenting a revoked token is treated as theft and revokes the whole family. `revoked_at_utc` is an EF concurrency token so a concurrent double rotation fails and is also treated as reuse. Logout revokes the family of the presented token.

### D-023 · 2026-09-05 · Application references Npgsql to detect unique violations
`RegisterHandler` catches `PostgresException` 23505 on save to turn a concurrent duplicate registration into 409. This ties Application to the chosen provider, which is acceptable for a single-database monolith and avoids an abstraction with one implementation.

### D-024 · 2026-09-05 · Mobile session storage; web fallback is development/testing only
Native builds keep tokens in expo-secure-store (OS keychain/keystore). Expo Web has no secure storage, so `lib/secure-storage.ts` falls back to localStorage. That fallback is **for development and testing only**: localStorage is readable by any script on the origin, so bearer tokens there are exposed to XSS. A production web application is out of the MVP scope; if one is ever released, browser authentication must move to a web-specific secure design (HttpOnly, Secure, SameSite cookies issued by the API, with CSRF protection and a cookie-aware refresh flow) rather than reusing the token-in-storage model. Tokens are the only client-held auth state; the profile is server state in TanStack Query.

### D-025 · 2026-09-06 · Finance domain model and naming
Entities are `FinancialAccount`, `FinanceCategory`, `FinancialTransaction`, `AccountTransfer`, `MonthlyBudget` (no clash with `System.Transactions`). Transactions and transfers inherit the account currency instead of storing their own, which makes conflicting currency data impossible. Enums are stored as text with check constraints and serialized by name.

### D-026 · 2026-09-06 · Balance versus cash flow
Account balance = opening balance + income − expense + incoming transfers − outgoing transfers as of the request instant. Monthly net cash flow = income − expense in the local month. They are always reported as separate numbers; transfers appear only in balances.

### D-027 · 2026-09-06 · Multi-currency without conversion
Totals are grouped by currency and never converted. The dashboard serves one currency (requested or the profile default) and lists other currencies separately. Cross-currency transfers take both amounts from the user and expose an informational `effectiveRate`. No exchange-rate service in Phase 2.

### D-028 · 2026-09-06 · Archive instead of delete once referenced
Accounts and categories with any transaction, transfer, or budget reference return 409 on delete and must be archived. Database foreign keys use `ON DELETE RESTRICT` as defense in depth. Archived accounts and categories reject new or edited activity but remain visible in history and can be restored.

### D-029 · 2026-09-06 · Immutability after activity
An account's currency and opening balance cannot change once it has a transaction or transfer (409). A category's kind never changes. A budget's period, currency, and scope never change; only its amount does. Balance adjustments are a future feature.

### D-030 · 2026-09-06 · Idempotent creates via `clientRequestId`
Transactions and transfers carry an optional client UUID with a filtered unique index per user. The handler returns the existing record (200) on replay and catches the unique violation for concurrent retries. The mobile forms generate one id per mount and reuse it until a create succeeds.

### D-031 · 2026-09-06 · Finance setup is explicit and serialized
`POST /api/finance/setup` creates missing default categories and, only when the user has no account and supplies one, the first account. Registration is not coupled to Finance and no GET has side effects. A per-user `pg_advisory_xact_lock` inside a transaction makes concurrent setup calls safe.

### D-032 · 2026-09-06 · Budget scope uniqueness uses NULLS NOT DISTINCT
The unique index on (user, year, month, currency, category) is declared `NULLS NOT DISTINCT` so a single overall budget (null category) per scope is enforced by PostgreSQL, not only by the application.

### D-033 · 2026-09-06 · Budgets consume only same-currency expenses in the local month
Income and transfers never consume a budget. Usage is computed from source transactions per request; no snapshot tables. Over-budget keeps the negative remaining amount.

### D-034 · 2026-09-06 · Mobile dates use the device time zone
Forms enter a local calendar date; today keeps the current time, other days use local noon, and the instant is sent in UTC. The MVP assumes the device time zone matches the profile time zone (Asia/Baku by default). A profile-aware date picker is deferred.

### D-035 · 2026-09-06 · Application references EF Core Relational for advisory locks
`ILibraDbContext` exposes `DatabaseFacade` so the setup handler can open a transaction and run `pg_advisory_xact_lock`. This is the only raw SQL in the application layer.

### D-036 · 2026-09-06 · Mobile redesign is prototyped in a development-only Design Lab before production screens change
Phase 2 shipped a functional but visually rejected finance UI. Instead of redesigning screens one by one, three complete directions (A Quiet Premium, B Smart Bento, C Insight First) are built behind a hidden route (`/design-lab`, inside the authenticated `(app)` group, redirecting to `/` when `__DEV__` is false) with an isolated fixture and an optional real-API mode. Production screens never import the lab or its fixture (enforced by a test). The production redesign starts only after one direction is selected; see [DESIGN-LAB.md](DESIGN-LAB.md).

### D-037 · 2026-09-06 · Prototype design tokens are a separate dark-first semantic set
`src/mobile/src/design-lab/tokens.ts` defines app/elevated/subtle surfaces (charcoal, never pure black), one brand accent (iris), income green, expense coral, warning amber, three text levels, disabled/pressed states, a 4-point spacing scale, radii, a type ramp, box shadows, motion durations/easings, and a fixed categorical palette assigned by category name. They deliberately do not replace `constants/theme.ts` yet; the selected direction promotes them into the production theme.

### D-038 · 2026-09-06 · Motion runs on Reanimated with predefined builders and shared-value entrances
React Native Reanimated (already a dependency) is the only animation library; no `framer-motion`, GSAP, or Lottie. Entrances are driven by `withTiming` on a shared value (`Entrance`) because Reanimated 4.5's web implementation of custom keyframes (`withInitialValues`, `Keyframe`) re-positions the element absolutely after its cleanup timer; exits and reflow use predefined `FadeOut`/`SlideOutDown`/`LinearTransition`. Durations: 110 ms press, 160 ms small state changes, 220 ms entrances, 240 ms indicator movement, 420 ms data progress. Reduced motion (system or lab override) keeps opacity changes only and preserves every interaction. `expo-haptics` gives one light success haptic on native after a submission.

### D-039 · 2026-09-07 · Production UI is light-first with one semantic token set
The Phase 2.5A directions were not shipped as-is; the production system (`src/mobile/src/constants/theme.ts`) is light-first (canvas `#F5F7FB`, white surfaces, indigo `#4F5FE7` primary, income `#109B72`, expense `#DC5656`, transfer `#3978E8`, warning `#D68A17`, module accents) with a complete matching dark palette. The deep-indigo gradient is reserved for the Finance balance hero. Every screen consumes tokens through `useTheme()`; the old `Colors`/`FontSize` tokens and the legacy components (card, list-row, select-field, text-field, themed-text/view, …) were removed. See [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).

### D-040 · 2026-09-07 · Icons stay on Ionicons; dates use the system pickers plus a code-native calendar
`@expo/vector-icons` Ionicons is the single production icon family (one stroke weight, filled variants for active tabs); no emoji, raster or per-category PNG icons. Dates are entered through `@react-native-community/datetimepicker` (inline picker in a sheet on iOS, system dialog on Android) and a code-native accessible month grid on web; they render as "6 sentyabr 2026". The time-zone rule from D-034 is unchanged.

### D-041 · 2026-09-07 · Adaptive shell: floating tab bar on phones and tablets, sidebar on desktop web
Native headers are disabled in favour of a shared `ScreenHeader`. Phones and tablets get a floating five-tab bar with a Quick Add button above its right end (hidden until Finance is set up); desktop web (≥ 1024 px) gets a persistent left sidebar and never shows the bottom bar. The `/quick-add` modal route remains for deep links; the primary Quick Add is an origin-aware menu.

### D-042 · 2026-09-07 · Motion runs on Reanimated with shared-value entrances and predefined exits
No `framer-motion`, GSAP, Lottie or Skia. Entrances use `Entrance` (shared value + `withTiming`) because Reanimated 4.5's web implementation of custom keyframes re-positions elements absolutely; exits and list reflow use predefined builders; value tickers use a short JS tween. Reduced motion keeps only opacity changes. Confirmation dialogs are in-app (`ConfirmProvider`) instead of native alerts so they look and behave the same on every platform. `expo-haptics` gives one light success haptic on native.

### D-043 · 2026-09-07 · Design Lab removed after production parity
The Phase 2.5A Design Lab (route, picker, three prototype directions, fixture and its tests) was deleted once the production screens passed the visual gate; the useful primitives were promoted into `src/mobile/src/components`. A minimal before/after record is kept in `docs/design-history/`.

### D-044 · 2026-09-07 · Refinement: text foregrounds, in-flow tab bar, complete month series, one display formatter
Accent colours stay for fills and icons; meaningful text uses separate foregrounds (`incomeText #087A58`, `expenseText #B83F4A`, `warningText #8A5A0A`, `transferText`, `primaryText`) that clear 4.5:1 on white, canvas and soft surfaces; `textMuted` was darkened to `#5F6A7D`. The phone tab bar is laid out in the normal flow (an opaque region that owns the bottom safe area) instead of an overlay, so no content or focused control can sit behind it; Quick Add moved into the Home and Finance headers (sheet on phones, anchored popover on wide layouts) and the floating button was removed. The daily spending series reads every page of the month (`fetchAllPages`), buckets days in the profile time zone and errors instead of truncating; monthly totals always come from the dashboard aggregate. `lib/money.ts` is the one display formatter (profile locale separators, pinned for az/tr/ru/de/en because ICU data is incomplete); parsing stays separate. Budget impact while editing removes the original contribution first and is frozen to a pre-submit baseline during a save. The hero uses its own `onHero` foreground (white in both palettes), separate from `onPrimary`. The month-end estimate is computed from the unrounded monthly total. Success toasts show once, on the destination screen, above the navigation region.

## Open (non-blocking)

### D-011 · Mobile API contract workflow
Phase 0 validates responses with hand-written Zod schemas. When endpoints multiply (Phase 2), choose between generating TypeScript types from the OpenAPI document (`openapi-typescript`) or keeping Zod schemas as the single source. Recommendation: generate types from OpenAPI, keep Zod only for runtime validation of a few critical responses.
