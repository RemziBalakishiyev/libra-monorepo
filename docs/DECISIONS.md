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

### D-045 · 2026-09-07 · Nutrition stores entered inputs and computed contributions as per-item snapshots
A meal (`NutritionEntry`) owns 1–20 `NutritionEntryItem` rows. Each row keeps both what the user entered — name,
`QuantityMode` (`PerPortion` or `Per100Grams`), quantity, and the four nutrients for that unit — and what it
contributed, computed from the unrounded inputs and rounded once (`numeric(12,2)`; quantities `numeric(12,3)`).
Editing an entry replaces its rows with fresh ones and ignores any item ids in the request, so an edit cannot
adopt another user's item and a copy can never change its source. Copying is an ordinary create built from the
source's inputs. An entered kcal value is never recomputed from the macros. Day totals are summed in SQL over
every item of the day, so they never depend on list pagination. Alternative considered and rejected: recomputing
totals from a shared food catalogue, which would rewrite history whenever a catalogue entry changed.

### D-046 · 2026-09-07 · Nutrition goals are dated records; nothing is ever recommended
`NutritionGoal` is unique per user and `EffectiveFrom` date, and a day resolves to the newest goal effective on or
before it. Changing today's targets therefore leaves earlier days measured against the targets they used. Every
target (kcal, protein, carbohydrate, fat) is individually optional: an unset target means "not tracked", the UI
shows the consumed amount plus an action to configure one, and no percentage is derived from an absent target.
Clearing all four targets deletes that record (`204`) instead of storing zeros. The app never fills in a
personalised or medical recommendation.

### D-047 · 2026-09-07 · Quick Add is global on Home and finance-scoped inside Finance
`quickActionDefinitions` (Xərc, Gəlir, Köçürmə) stays Finance's own set. Home, the desktop sidebar and the
`/quick-add` modal use `globalQuickActionDefinitions`, which adds Yemək, and filter out the actions the user
cannot perform yet — money actions need a financial account, a meal needs nothing — so Quick Add is available
from the first day instead of being hidden until Finance is set up.

### D-048 · 2026-09-07 · Selection state uses `aria-*` props, and each control follows its own ARIA pattern
react-native-web 0.21 does not support `accessibilityState`, so every control now carries `aria-checked` /
`aria-selected` / `aria-disabled` directly; React Native merges those back into `accessibilityState`, so one prop
serves both platforms. Controls follow the WAI-ARIA pattern for what they actually do: radio groups for mutually
exclusive choices (segments, chips, sheet lists, calendar days), a checkbox for filters, and `<nav>` landmarks of
links with `aria-current="page"` for route navigation — the bottom bar is not a `tablist` on the web, because no
`tabpanel` exists, while native keeps the platform-conventional `tab` role. Each group is one tab stop with roving
`tabIndex`. Space activation is added in `lib/a11y.ts` because react-native-web accepts it only for buttons.
Alternative considered and rejected: `listbox`/`option` for the sheets, which React Native's `accessibilityRole`
union does not include and would have split native and web semantics.

**Selection follows focus everywhere, but a dialog commits separately.** Inline groups (segments, chips, currency)
commit as the arrows move. The dialog pickers — `SelectionSheet`, `CategorySheet` and `CalendarSheet` — keep a
*pending* selection instead: arrows move focus **and** the checked radio inside the dialog, while the owning form
field only changes on commit (Space, Enter or a tap). Escape discards the pending value, leaves the field
untouched and restores focus to the trigger. The reset is a remount rather than a state-syncing effect: each
dialog renders its body only while open, so the pending value — and the calendar's displayed month — start from
the committed value every time it opens, which also satisfies the React Compiler's no-`setState`-in-effect rule.

**The calendar stays a radio group, not an ARIA grid.** Its rendered markup was inspected before any change: the
container is `div role="radiogroup" aria-label="Tarix"` holding 30 `role="radio"` day cells, with no `row`, no
`gridcell`, no `table`/`tr`/`td` ancestors and therefore no implicit grid roles to verify. Days are a set of
mutually exclusive choices, and `grid` / `row` / `gridcell` are absent from React Native's `accessibilityRole`
union, so a grid would have existed on the web only. The three states stay independent: `aria-checked` for the
chosen day, `aria-current="date"` for today, and the roving `tabIndex` for focus.

### D-049 · 2026-09-07 · Photo analysis is OpenAI Responses behind one adapter, and a draft is never a meal
`IAiFoodAnalyzer` has exactly one production implementation, `OpenAiFoodAnalyzer`, calling the OpenAI Responses
API (`POST /v1/responses`) with an `input_image` part and strict Structured Outputs
(`text.format = { type: "json_schema", strict: true }`). Model, base URL, key and every limit come from
`Ai:OpenAi` / `Ai:FoodAnalysis`; the key is backend-only and never reaches the mobile bundle. The default model is
**`gpt-5.6-luna`**, verified against the current model reference as supporting image input *and* structured
outputs, and chosen as the cheapest that does: **$0.20 / 1M input tokens, $1.20 / 1M output tokens**
(cached input $0.02). One analysis sends a single ≤1024 px JPEG and caps the answer at 1200 output tokens, so a
call costs a fraction of a cent; the per-user ceiling of 20 analyses/hour bounds the rest. Alternatives rejected:
a larger multimodal model (same schema support at several times the price for a task that is an estimate anyway)
and Chat Completions (no first-class `text.format`, and the Responses API is where structured outputs are
current). `store: false` is sent on every call; docs/AI-SAFETY.md documents Libra's retention separately from the
provider's.

**The adapter is always registered, even with no credentials.** Without a key it answers `NotConfigured`, which
the API reports as a 503 with an honest message. Deterministic estimates exist in exactly two places: the test
host's `FakeFoodAnalyzer`, and `DevelopmentFixtureFoodAnalyzer`, which needs *both* a Development host and an
explicit `Ai:FoodAnalysis:UseDevelopmentFixture=true` and stamps `development-fixture` on every draft it produces
(`FoodAnalysisRegistrationTests` covers each combination). A missing key can never silently produce a fake result.

**A draft is a separate aggregate.** `FoodAnalysisDraft` + `FoodAnalysisItem` + `FoodAnalysisImage` hold the
estimate; nothing about them touches a total. The confirm endpoint takes items the user reviewed, builds a
`NutritionEntry` through the ordinary domain path, and saves the entry insert and the draft transition in one
transaction guarded by PostgreSQL's `xmin`. The **draft** is therefore the idempotency key, not the client request
id: a repeated, retried or concurrent confirmation returns the first meal even under a new id. Rejected
alternative: reusing the nutrition `clientRequestId` alone, which a client could vary on retry and get two meals.

**Estimates normalize once.** `FoodAnalysisNormalization` maps a `PicturedPortion` estimate to `PerPortion` with
quantity 1 (its estimated weight stays metadata) and a `Per100Grams` estimate to `Per100Grams` with the weight as
the quantity. The weight and the portion count are never both applied to the same food, and a nutrient the model
did not judge stays `null` through normalization, the API and the form, where the existing "Dəyər daxil edin"
validation asks for it.

**Images.** SkiaSharp (MIT) decodes the actual bytes — so a renamed file or a wrong content type is caught by what
the file is — bakes the EXIF orientation into the pixels, bounds the longest edge at 1024 px and re-encodes JPEG
from raw pixels, which leaves every metadata block behind. ImageSharp was rejected: version 4 requires a paid
licence. Bytes live behind `IImageStore` (file system today, one owner-checked read path) and are deleted when the
draft is confirmed or discarded, and in any case at the retention deadline.

### D-050 · 2026-09-08 · A task is one day, and one occurrence of a schedule is a task
A repeating task is not a special kind of row. `TaskItem` carries `SeriesId`, and every scheduled local date gets
its own row with its own title, time, priority and completion state; `TaskSeries` holds only the rule. That is
what makes "completing today" mean nothing about tomorrow without any extra machinery, and it lets one occurrence
be edited or deleted without a per-occurrence override table. Alternative rejected: deriving occurrences on the
fly and storing only exceptions — it makes a completion state per date, ordering, paging and the n / N count all
special cases of the same query.

**Generation is materialization with the database as the referee.** A read that reports counts first brings every
active series up to date: each scheduled date from the series start through `today + 30` becomes a row, missed
past dates included, so a skipped day surfaces as overdue instead of quietly leaving the numbers. A unique index
on `(series_id, planned_date)` is the authority, so two requests generating at the same moment produce one row —
the loser detaches its inserts and re-reads. A date that already has a row is never touched, which is what keeps
a completed occurrence completed, an edited one edited, and a **deleted one deleted**: deleting an occurrence of
a series leaves a `Removed` tombstone that occupies the date, so regeneration cannot resurrect it. A standalone
task, having nothing to regenerate it, is deleted outright.

**Completion is a state, not a toggle.** `POST /{id}/completion` takes `{ completed }`. Setting the state a task
is already in is a no-op that records no second history event, so a retry after a lost response is safe and there
is no request whose meaning depends on what the server currently holds. `TaskCompletionEvent` rows are append-only:
reopening clears the completed state and adds a `Reopened` event beside the `Completed` one it undid.

**Stale edits are refused, not merged.** A `PUT` may echo the `updatedAtUtc` it read; a stored row that has moved
on answers 409. That reuses a field the response already carried rather than inventing an ETag, and it composes
with the `xmin` row version, which catches two writes racing inside the database and reports the same conflict.

**Priority is ranked, not sorted.** It is stored as its name for readability, so ordering by the column would put
"Normal" before "Low" before "High"; the query ranks it explicitly (High 2, Normal 1, Low 0). Found by the
ordering test, which is why that test asserts the whole sequence rather than a single row.

**Calendar labels, not instants.** `PlannedDate` is a `date` and `PlannedTime` a `time`; only created, updated and
completed moments are UTC. A profile that changes time zone therefore keeps every task on the day and minute it
was planned for — only which day is "today", and so what is overdue, follows the new zone — and a daylight-saving
jump cannot shift a task into another day.

### D-051 · 2026-09-10 · A sleep session is two stored instants, and the wake-up belongs to the user's press

**Context.** Sleep is the first feature whose value spans a device being asleep, offline or restarted, and whose
core number — how long you slept — is the sort of thing an app is tempted to count with a timer.

**Decision.** A session is `(StartedAtUtc, EndedAtUtc)`. Every duration, including the one ticking on screen, is
computed from those instants against the current clock; nothing accumulates. The UI timer is a rendering, never a
source. Both ends are rounded on write to the microsecond PostgreSQL stores, so an in-memory session and one read
back are the same moment — without that, a retried stop compared unequal to the end already on disk.

**One open session, enforced three times.** The aggregate refuses it, the handler checks for it, and
`ix_sleep_sessions_open` — a partial unique index on `user_id where ended_at_utc is null` — decides it under
concurrency. Two simultaneous starts leave one session and one 409. Non-overlap of completed sessions is a
`btree_gist` EXCLUDE constraint over `tstzrange(start, end, '[)')`: half-open on purpose, so a night ending at
07:00 and a nap starting at 07:00 both stand, while anything that genuinely crosses is refused by the database
rather than by a check-then-write race.

**Diagnosing that took a detour worth recording.** EF Core classifies an exclusion violation and a deadlock as
transient, so without `EnableRetryOnFailure` it rethrows the `DbUpdateException` wrapped in an
`InvalidOperationException` suggesting retries be enabled — and the PostgreSQL error sits two levels down. The
typed `catch (DbUpdateException)` never matched and concurrent overlaps surfaced as 500s. The handler now walks
the whole inner-exception chain for SqlStates `23P01`, `23505`, `40P01` and `40001`.

**The wake-up is the moment of the press.** "Oyandım" captures one instant, writes it to device storage scoped to
the user and that exact session, cancels the session's reminder, and only then calls the API. If the call fails,
that instant stays on the device and the screen says so with the time it holds; the retry sends the same instant.
Reconnecting an hour later therefore cannot lengthen the recorded night. This is one record, not a queue: a user
has one running session, and the existing request path does the sending — no general offline layer was added.

**A forgotten night is never tidied up.** An open session has no upper bound: it is not clipped at 24 hours, not
closed automatically, and not silently shortened. The 24-hour limit applies only to a completed interval. The
correction screen for an open session offers exactly three honest moves — write a real wake-up time, fix the start
and leave it running, or discard it — and says so in words.

**Attribution is computed, not stored.** A completed session belongs to the local date it *ended* on in the
profile time zone, so a night across midnight is counted once, on the day the user woke. Changing the profile
zone re-groups history rather than rewriting it, and durations are untouched by DST because they are distances
between instants. The weekly average is over the days that hold a record and is always shown with that
denominator; a date with nothing recorded reads "Qeyd yoxdur", never a zero-height bar.

**Reminders are a local convenience, and are treated as one.** One `expo-notifications` date trigger per running
session, scheduled only after the server confirms the session exists, with its id and trigger time stored under
the user and session. Resuming reconciles the record with the operating system: kept if still scheduled,
re-scheduled once if the system lost it, dropped if its moment has passed — a reminder about a moment that is
over is not a reminder. Logout cancels this user's own alarm and nothing else, and never touches the server
session. A denied permission leaves tracking fully usable and the switch reports itself off. Tapping a
notification opens the session; it never records waking, because a tap says the user looked at their phone, not
when they woke up. The browser has no equivalent, so on web the row says so instead of pretending — and the
library is behind `lib/notifications.ts` / `notifications.web.ts` so the web bundle never loads it at all.
Cross-device cancellation is not possible: an alarm lives on the device that scheduled it.

**Rejected.** Background polling, inactivity-based sleep detection, remote push, and health-platform integration:
each would trade a large amount of trust and complexity for a guess, when a session the user starts and ends is
exact.

**Native configuration is left as autolinking leaves it.** Checked against the installed SDK 57 package and
`npx expo config --type introspect`: the Android permissions, the boot receiver and the forwarder activity merge
in from the library's own manifest at Gradle build time, and `@expo/prebuild-config` applies the
`expo-notifications` config plugin automatically for autolinked packages — which is why `aps-environment` is
already in the introspected entitlements although `app.json` names no notifications plugin. Nothing is added on
top: `icon`/`color` are cosmetic, `defaultChannel` and `enableBackgroundRemoteNotifications` are remote-only, and
`SCHEDULE_EXACT_ALARM` buys exact Android timing we deliberately never promise — the library already falls back
from `setExactAndAllowWhileIdle` to `setAndAllowWhileIdle` when it is absent, and the permission is restricted on
Google Play. The consequences and the device checks live in `docs/DEVICE-CHECKS.md`.

### D-052 · 2026-09-15 · Appearance is an explicit device choice, light by default

**Context.** On a physical iPhone in dark mode the app was dark with no way to make it light. The cause was not
a forced theme: `userInterfaceStyle` is `automatic` on both platforms (checked with `npx expo config --type
introspect`: iOS `UIUserInterfaceStyle: Automatic`; Android `expo_system_ui_user_interface_style = automatic`
written by the autolinked `expo-system-ui` plugin, with `uiMode` in `configChanges`). The app simply followed
the OS — `useTheme()` read `useColorScheme()` directly in 70 places — and offered no selector.

**Decision.** One stored preference, `light | dark | system`, in `lib/appearance-store.ts`, persisted through
the existing `secureStorage` under `libra.appearance`. `useTheme()` is the only place it is combined with the OS
scheme, so a change repaints everything at once without remounting anything. The root layout keeps the native
splash up until the choice is read, so the first frame is already in the user's palette.

**Light by default.** A fresh install is light regardless of the phone (D-044 made the design light-first);
`system` is a choice, not the starting point. A stored value that is not one of the three falls back to the
default rather than to the OS.

**The native override, and its trap.** The choice is pushed to the platform with `Appearance.setColorScheme` so
the keyboard, system pickers and alerts match. In React Native 0.86 the way to *clear* that override is the
string `'unspecified'`; writing the current OS value instead would freeze the app on today's OS theme and stop
`system` from following the phone. The store therefore never writes an OS reading as a preference. On web,
where react-native-web has no `setColorScheme`, the document's `color-scheme` is set the same way and cleared
for `system`, so scrollbars and native form controls follow the choice too.

**Nothing native changed.** Both appearances were already supported in the resolved configuration; Expo Go
proves the JavaScript behaviour, not our build's `Info.plist` or manifest.

### D-053 · 2026-09-15 · A recurring month is recorded only by hand, and a debt movement is not a transaction

**Context.** Phase 3 adds monthly recurring plans and receivables/payables. Both are easy to get subtly wrong:
a scheduler that "helpfully" posts rent would move money nobody confirmed, and a receivable that shows up as
income would inflate the month and the budgets.

**Recurring.** A template is a plan. The month view computes `Pending` rows on read and stores nothing, so
listing, refreshing, restarting the API or computing due dates can never post money. The only write is the
user's explicit "Gəliri qeyd et" / "Ödənişi qeyd et" after reviewing amount, account and actual date; it creates
one ordinary `FinancialTransaction` and the `Recorded` row in one database transaction. A unique
`(template_id, year, month)` index — not the client request id — is what makes concurrent and retried
confirmations converge on that one transaction, so a retry with a different key is equally harmless. The row
keeps a snapshot; editing or deactivating the template touches only unrecorded months (missed past months
included) and never marks a month paid. Undo deletes the transaction and leaves the month `Skipped`, so it is
never regenerated; the generic transaction delete refuses a linked transaction and points at Təkrarlananlar.
The default actual date is the due date once it has passed and today while it is still ahead, because a
confirmation says the money moved and future-dated activity stays out of balances.
Day 29–31 clamps to the last valid day and returns to the original day the month after.

**Debts.** A `DebtMovement` (opening or payment) is the smallest coherent extension of the Finance model: it
changes cash through the existing `AccountBalanceCalculator` (one more grouped query) and the obligation, and
nothing else — income, expense, category totals and budgets never see principal because it is not a
`FinancialTransaction`. Remaining, status and overdue are derived, never stored. Overpayment under concurrency
is prevented in the database transaction itself: recording a payment also bumps the debt's row (`xmin`), so the
second of two racing payments gets a 409 rather than a second success — a preceding read alone would not do.
Undo is a soft reversal that keeps the history readable and restores remaining and cash together. Creation is
explicit about cash: an existing obligation changes no balance; money lent or borrowed now needs an account and
moves the principal in the same request.

**Consequences.** No parallel balance and no scheduler. The dashboard gains `debts` with `monthlyPrincipalNet`
kept apart from `monthlyNet`, a labelled `netPosition = cash + receivables − payables`, and per-currency
outstanding/overdue figures aggregated in SQL. Mobile adds "Təkrarlananlar" and "Borclar" as small soft
buttons inside Finance, keeping the first fold and the five tabs unchanged, and every money-moving sheet shows
the effect on the chosen account before confirmation (`AccountEffect`).

**Known gaps.** No interest, amortisation, invoices or currency conversion; a receivable is only ever repaid in
its own currency. Expo's typed-routes watcher mis-normalises Windows paths for files added while Metro runs,
so `npm run typecheck` needs the declarations regenerated (or Metro restarted) after adding files.

## Open (non-blocking)

### D-011 · Mobile API contract workflow
Phase 0 validates responses with hand-written Zod schemas. When endpoints multiply (Phase 2), choose between generating TypeScript types from the OpenAPI document (`openapi-typescript`) or keeping Zod schemas as the single source. Recommendation: generate types from OpenAPI, keep Zod only for runtime validation of a few critical responses.
