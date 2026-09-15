# Implementation Plan

Phases are sequential. A phase is complete only when every gate command passes and the checklist is verified, not when code exists.

## Phase 0 — Product docs and skeleton

Outcome: repository structure, documented domain and decisions, backend + mobile + PostgreSQL running, CI building. No business functionality.

- [x] Repository initialized with `.editorconfig`, `.gitignore`, `.gitattributes`, `.env.example`
- [x] CLAUDE.md and README.md
- [x] docs: PRODUCT, DOMAIN, ARCHITECTURE, DATABASE, API, MOBILE-UX, AI-SAFETY, DECISIONS, IMPLEMENTATION-PLAN
- [x] Backend solution: Domain, Application, Infrastructure, Api with central package management
- [x] `LibraDbContext` wired to PostgreSQL (no entities, no migrations)
- [x] Health endpoints `/health/live` and `/health/ready`, Problem Details, Serilog, OpenAPI (dev)
- [x] Unit test project with dependency-direction tests
- [x] Integration test project with Testcontainers PostgreSQL hitting health endpoints
- [x] Backend Dockerfile builds
- [x] Docker Compose starts PostgreSQL (API optional profile)
- [x] Expo app (SDK 57, Expo Router, strict TS) with env config, TanStack Query, design tokens, Home readiness screen
- [x] Mobile lint, typecheck, Jest + RNTL tests
- [x] GitHub Actions CI: backend format/build/test/docker, mobile lint/typecheck/test
- [x] Development-only CORS policy for Expo Web (`Cors:AllowedOrigins`), covered by integration tests

Gates: `dotnet format --verify-no-changes`, `dotnet build`, `dotnet test`, mobile `lint`/`typecheck`/`test`, `docker compose up -d` healthy, `docker build` of the API image.

## Phase 1 — Authentication and user isolation

- [x] Register, login, refresh (rotating, hashed, reuse-protected), logout, current profile + preferences
- [x] Password hashing with ASP.NET Core primitives; rate limiting on auth endpoints
- [x] First migration (`InitialIdentity`, snake_case) after settling D-010
- [x] Mobile auth screens, SecureStore session, refresh-and-retry path, auth-aware routing
- [x] Tests: success/invalid credentials, duplicate normalized email, refresh rotation, replay, logout revocation, unauthenticated access, cross-user isolation, rate limiting
- [x] Tokens and passwords never logged (verified by log inspection in the smoke test; responses asserted in tests)

Gates run on 2026-09-05 (post-review): `dotnet format --verify-no-changes`, `dotnet build -c Release`, `dotnet test -c Release` (36 unit, 25 integration incl. concurrent refresh and schema-length parity), mobile lint/typecheck/jest (13, no open handles), `expo-doctor` 18/18, live smoke test against Compose PostgreSQL.
Deferred to later phases: email verification, password reset, email/password change, refresh-token cleanup job, account deletion.

## Phase 2 — Finance core

- [x] Financial accounts (types, immutable currency and opening balance after activity, include-in-total, archive/restore, delete only without activity)
- [x] Categories with idempotent Azerbaijani defaults through `POST /api/finance/setup`, archive rules, unique names per kind
- [x] Income/expense transactions with `clientRequestId` idempotency, filters, `pageNumber`/`pageSize` pagination, stable ordering
- [x] Transfers between own accounts (same-currency equality, cross-currency amounts with informational rate), excluded from cash flow and budgets
- [x] Monthly budgets (overall and per expense category, unique scope, usage/remaining/percent/over-budget)
- [x] Dashboard per currency with grouped other currencies, local-month boundaries (Asia/Baku), daily average, category breakdown, recent transactions, negative accounts
- [x] Migration `AddFinanceCore` (snake_case, check constraints, filtered unique indexes, NULLS NOT DISTINCT budget scope)
- [x] Mobile five-tab shell with placeholders, finance onboarding, overview, transactions list, income/expense, transfer, account, budget, and category flows, quick-add modal, confirmations, pull-to-refresh
- [x] Loading/empty/error/retry/submitting/validation states; Azerbaijani copy; keyboard-safe accessible forms
- [x] Backend tests: authentication on every endpoint, cross-user 404s, balance formulas, transfer effects and exclusions, archive/immutability rules, invalid amounts, idempotency incl. concurrency, pagination/filters, budgets, dashboard currency grouping, Asia/Baku month boundaries, schema constraints
- [x] Mobile tests: tab shell and guards, placeholders without actions, overview states, quick-add navigation, form validation, Problem Details mapping, shared refresh, idempotent request id reuse

Gates run on 2026-09-06: `dotnet format --verify-no-changes`, `dotnet build -c Release`, `dotnet test -c Release` (72 unit, 82 integration), migration applied to a clean Testcontainers database and to the Compose database, mobile lint/typecheck/jest (54), `expo-doctor` 18/18, `expo export --platform web`, live smoke script against Docker PostgreSQL.
Deferred: recurring transactions and debts (Phase 3), balance adjustments, exchange rates, profile-time-zone-aware date picker, native date picker component.

## Phase 2.5A — Mobile UI/UX redesign prototyping (Design Lab)

Outcome: three complete, working design directions for the Finance dashboard and add-expense form, comparable side by side in a development-only route, so one can be selected before production screens are redesigned. No backend, API, schema, or calculation changes.

- [x] Hidden, auth-protected, development-only route `/design-lab` (redirects outside development; not a tab; no production navigation to it)
- [x] Isolated fixture with a complete month plus a real-API toggle through the production TanStack hooks; production code never imports the lab (test-enforced)
- [x] Semantic dark-first prototype tokens (surfaces, brand, income/expense/warning, text levels, states, spacing, radius, type, shadows, motion, categorical colours)
- [x] Direction A Quiet Premium, B Smart Bento, C Insight First: dashboard, add-expense form, tab bar, quick-add, loading/empty/error, animated value/progress/list changes
- [x] Redesigned add-expense hierarchy: segmented type, amount hero, account, category (wrap / grid / sheet), date, note, sticky primary action; no clipped categories; centred max-width on web
- [x] Reanimated motion system with reduced-motion support; responsive layouts from 360 px phones to 1440 px web
- [x] Tests: model formulas, token contrast and motion budgets, fixture isolation, dev-only route, lab interactions; headless-browser verification with screenshots in `docs/design-lab/screenshots/`

Gates run on 2026-09-06: mobile lint/typecheck/jest (75), `expo-doctor` 18/18, `expo export --platform web`, headless Chrome pass over all three directions (0 console errors, no horizontal overflow, quick-add and add-expense interactions, reduced motion). Backend untouched.
Next: the owner selects a direction; Phase 2.5B rebuilds the production finance screens and theme on that direction and removes the lab.

## Phase 2.5B — Production UI/UX rebuild

Outcome: every production screen rebuilt on one light-first design system with an adaptive shell, production motion, and the Design Lab removed. Backend, API contracts, persistence and formulas untouched.

- [x] Semantic light + dark tokens, type ramp, spacing, radii, shadows, motion constants (`constants/theme.ts`); Ionicons as the single icon family
- [x] Component library: text/money, buttons, screen + header, sheet, selection sheet, form fields, amount input, segmented control, category picker, localised date field, balance hero, metrics, quick actions + origin-aware menu, section header, transaction row (swipe / overflow delete), account item, budget progress, insight card, spending bars, category breakdown, skeleton/empty/error states, toast, confirm dialog, tab bar, sidebar, brand mark
- [x] Adaptive shell: floating tab bar with Quick Add on phones/tablets, sidebar on desktop web, custom headers everywhere, brand session-restore moment
- [x] Flagship screens: login/register, Finance dashboard, create/edit transaction (amount hero, category grid, localised date, budget impact, success flow)
- [x] Remaining screens: Home, Profile (+ app status), Finance setup, accounts, transactions list with filters, transfers, budgets, categories, placeholders
- [x] Motion: entrances with stagger, tab indicator + icon scale, segmented pill, animated values, progress and bar reveals, list insert/remove transitions, amount shake, success check + haptic, skeleton-to-content; reduced motion everywhere
- [x] Accessibility: roles/labels, 48 pt targets, no colour-only status, AA contrast (tested), focus restoration for sheets, validation and success announcements
- [x] Tests: flagship screen behaviour (quick add menu, transfer gate, validation + shake, localised date, budget impact, idempotent retry), helper formulas; Design Lab tests removed with the lab
- [x] Design Lab, A/B/C picker, fixture and prototype primitives removed; minimal before/after record in `docs/design-history/`

Gates run on 2026-09-07: mobile `lint`, `typecheck`, `jest`, `expo-doctor`, `expo export --platform web`, `git diff --check`, headless-Chrome walkthrough against the live API (see the Phase 2.5B report). Screenshots in `docs/screenshots-2.5b/`.

### Phase 2.5B refinement — production UI correction pass

Outcome: the accepted direction kept; contrast, navigation geometry, hierarchy, transaction entry, feedback, data completeness and formatting corrected and verified in the running app (D-044).

- [x] Semantic text foregrounds (`incomeText`, `expenseText`, `warningText`, `transferText`, `primaryText`), darker `textMuted`, placeholder token, lighter shadows; measured contrast pairs in `docs/DESIGN-SYSTEM.md`
- [x] In-flow tab bar region (opaque, owns the bottom safe area); Quick Add in Home/Finance headers (sheet on phones, popover on wide); no floating button; single Quick Add on desktop; sheets with Escape, focus containment and restoration
- [x] Home: account balance separated from monthly cash flow, compact module rows, honest "Tezliklə", long names wrap; stale notice over cached data
- [x] Finance: compact header + ~150-unit hero, grouped summary, pill action row, compact budget, recent transactions above navigation at 390 × 844, "Gündəlik xərc" with real dates/values, limit vs pace vs labelled estimate, "Tam ay" expander, accessible values; balanced 1280/1440 columns
- [x] Transaction entry: tighter amount, category field + ≤ 6 shortcuts (real usage first) + searchable "Hamısı" sheet, date/note/budget impact in flow, scroll-to-first-error, alert + hint validation, selection distinct from error, duplicate-submit guard, edit-aware budget impact
- [x] Feedback: readable success state (never dimmed), one toast on the destination screen above the navigation region, timers cleared on unmount; reduced motion removes shake/travel/counting/shimmer/stagger; announcements once per change
- [x] Remaining screens: auth spacing and copy, compact transaction filters, no "Market · Market", reserved amount width, identified delete confirmations, compact archive chip, budget pace line, profile selectors with readable labels + collapsible diagnostics, error kinds (offline only when known), skeleton geometry
- [x] Data: complete month pagination (`fetchAllPages`), abort on scope change, unavailable state on later-page failure, profile time-zone bucketing, cents arithmetic, one locale-aware display formatter, edit-aware budget impact
- [x] Tests: >100-row pagination with a large expense beyond the first page, later-page failure, abort on scope change, incomplete totals, edit budget impact, pace, insights, formatter locales, required-category alert + duplicate submit, sheet/quick-add dismissal, Home hierarchy, dashboard unavailable series

Gates run on 2026-09-07 (refinement): mobile `typecheck`, `lint`, `jest` (18 suites / 90 tests), `expo-doctor` 18/18, `expo export --platform web`, `git diff --check`, headless-Chrome walkthrough against the live API with screenshots and two recordings in `docs/screenshots-2.5b-refinement/`. Native gestures, pickers and haptics remain unverified on a device.

## Phase 3A — Nutrition tracking

- [x] Domain: `NutritionEntry` with 1–20 owned `NutritionEntryItem` snapshots (entered inputs + computed
      contribution), `NutritionGoal` with an effective date; decimal precision and non-negative constraints
- [x] Per-portion and per-100-g quantity modes; totals computed from unrounded inputs and rounded once; entered
      kcal never derived from macros
- [x] `/api/nutrition/day|entries|goals` with owner scoping, `clientRequestId` idempotency, Problem Details, and
      day totals aggregated in SQL independently of list pagination
- [x] Profile-time-zone day boundaries (`LocalCalendar.Day`); moving an entry updates both days
- [x] Migration `AddNutrition` (3 tables, check constraints, unique indexes) applied to the development database
- [x] Mobile: Qidalanma diary (date navigation, compact summary, four meal groups), add/edit form with live
      calculation and progressive disclosure, goals screen with history, copy-into-another-day draft
- [x] Home nutrition summary and a "Yemək" action in the global Quick Add; nutrition works without Finance setup
- [x] Tests: 33 backend (domain, schema, entries, day, goals, authorization) and 25 mobile (calculations,
      validation, diary, form, goals, cache invalidation)
- [x] Photo-based AI analysis (Phase 3B)

Gates run on 2026-09-07: `dotnet format --verify-no-changes`, `dotnet build`, `dotnet test` (108 unit +
115 integration), mobile `lint`, `typecheck`, `jest`, `expo-doctor`, `expo export --platform web`,
`git diff --check`, and a headless-Chrome walkthrough against the live API (40/40 checks, 0 console errors) with
screenshots and two recordings in `docs/screenshots-3a/`. Native keyboard, dynamic type, gestures and haptics
remain unverified on a device.

## Phase 3B — Food-photo analysis

- [x] `IAiFoodAnalyzer` with one real adapter (`OpenAiFoodAnalyzer`: Responses API, image input, strict
      Structured Outputs, `store: false`); provider, model, credentials and limits in backend configuration only
- [x] Versioned bounded result (`food-analysis.v1`): outcome, foods, portion description, estimated grams, the
      four nutrients, per-item and overall confidence, note; refusals, truncation and out-of-range values are
      named failures instead of repaired values, and an unknown nutrient stays null
- [x] Owner-scoped `FoodAnalysisDraft` / `FoodAnalysisItem` / `FoodAnalysisImage`; analyze, get, image, confirm
      and discard endpoints with Problem Details and distinct 400/413/429/503/504 statuses
- [x] Confirmation creates one entry through the existing nutrition path in a single `xmin`-guarded transaction;
      repeated, retried and concurrent confirmations return the first meal, even under a different retry key
- [x] Normalization that never applies the estimated weight and the portion count as two multipliers; conservation
      between the two representations; missing values block confirmation with field-level guidance
- [x] Image validation on real bytes (type, size, decoded dimensions, pixel bound), orientation baked in, resize
      and metadata-free JPEG re-encode (SkiaSharp); owner-checked storage; draft expiry, discard and cleanup that
      never touch a nutrition entry
- [x] Limits: upload size, output tokens, timeout, concurrency, per-user hourly ceiling, duplicate-submission and
      obsolete-response guards; raw images, credentials and prompt content kept out of the logs
- [x] Migration `AddFoodAnalysis` (3 tables, check constraints, unique filtered indexes) applied to the
      development database
- [x] Mobile "Şəkildən əlavə et" inside Qidalanma (manual "Yemək" and Finance's money actions untouched):
      choose → preview → analyze → editable review → confirm, reusing the manual food editor and calculator
- [x] States for unclear, non-food, unavailable, timeout, rate-limited, rejected image and lost connection; no
      fabricated progress; one destination toast; diary and Home refresh only after a confirmed write
- [x] Tests: 43 new backend unit (provider schema/refusal/ranges, normalization, image processing, analyzer
      registration) and 32 new integration — 31 that run plus the opt-in live-provider check that skips with a
      reason — covering the draft boundary, owner isolation, confirmation idempotency and concurrency, expiry and
      cleanup, failure mapping, the rate limit and time-zone placement; and 15 new mobile tests for the
      review/confirm flow, missing values, failure states and obsolete responses
- [ ] Live provider call verified with real credentials (blocked: no API key available — see the phase report)

Gates run on 2026-09-07: `dotnet format --verify-no-changes`, `dotnet build` (0 warnings), `dotnet test`
(151 unit + 146 integration, 1 skipped live-provider check), mobile `lint`, `typecheck`, `jest` (27 suites /
182 tests), `expo-doctor` 18/18, `expo export --platform web`, `git diff --check`, and a headless-Chrome
walkthrough against the live API (51/51 checks) with screenshots and two inspected recordings in
`docs/screenshots-3b/`. The walkthrough ran against the explicitly configured development fixture because no
provider key was available; native camera capture, permission dialogs, keyboard, dynamic type and haptics remain
unverified on a device.

## Phase 3 — Recurring transactions and debts

- [x] Domain: `RecurringTransaction` (monthly plan, day clamped to the last valid day and back to the original
      day next month, inclusive start/end on the resolved due date), `RecurringOccurrence` (`Recorded`/`Skipped`
      rows with a snapshot; `Pending` computed on read, never stored), `Debt` and `DebtMovement` (principal only,
      opening/payment, soft reversal)
- [x] Recurring: month view that posts nothing; explicit "Gəliri qeyd et"/"Ödənişi qeyd et" with reviewed amount,
      account and actual date → one ordinary transaction + occurrence in one save; DB-unique `(template, year,
      month)` so concurrent/retried confirmations (any key) return the same transaction; skip, undo (transaction
      deleted, month `Skipped`, never regenerated); generic transaction delete refuses a linked transaction;
      edits/deactivation apply to unrecorded months only; templates with history deactivate, never delete
- [x] Debts: receivable/payable with counterparty, principal, currency, opening/due dates, note; creation explicit
      about cash (existing obligation vs money moving now through an account, atomic); partial/full payments with
      account, actual date and readable history; remaining/status/overdue derived (profile time zone, settled
      never overdue); overpayment under concurrency blocked by the debt's row version inside the payment
      transaction; retry-safe undo restoring remaining and balance together; structural edits and deletion locked
      once movements exist
- [x] Financial consistency: movements extend `AccountBalanceCalculator` (no parallel balance); income, expense
      and budgets never see principal; dashboard `debts` with `monthlyPrincipalNet` apart from `monthlyNet`,
      `monthlyCashChange`, per-currency outstanding/overdue and a labelled `netPosition`; summary aggregated in
      SQL independent of paging
- [x] API: `/api/finance/recurring/*` and `/api/finance/debts/*` — owner-scoped, Problem Details, validation of
      related ids, stale-edit 409, `clientRequestId` replay with 409 on conflicting reuse
- [x] Mobile: "Təkrarlananlar" and "Borclar" soft buttons inside Finance (first fold and five tabs unchanged);
      month list with pending/recorded/skipped states, totals, record sheet with `AccountEffect`, skip/undo, link
      to the transaction; template form with deactivate/delete; debts list with the two direction views and a
      per-currency remaining strip, due/overdue rows; debt form explicit about cash with the opening effect; debt
      detail with history, payment sheet (account effect + remaining preview), undo; dashboard debt line
- [x] Tests: 22 unit (clamping incl. leap years, boundaries, cash effects, remaining/status/overdue), 19
      integration (acceptance numbers, 8 concurrent confirmations, retries with fresh keys, key reuse conflicts,
      currency/archive/category validation, missed-month edits, stale edits, deactivation history, undo + generic
      delete refusal, concurrent payments, overdue in profile time zone incl. a time-zone switch, totals beyond
      one page, cross-user 404, future-month actual date), 23 mobile (lists, forms, confirm/payment/undo flows,
      failed-submit preservation, refreshed totals, dark mode, roles)
- [x] Evidence: `docs/screenshots-recurring-debts/` (21 screenshots, `results.json` 41/41, normal and
      reduced-motion MP4s); device checklist in `docs/DEVICE-CHECKS.md`

## Phase 4A — Plan / tasks

- [x] Domain: `TaskItem` (one task on one local day, standalone or one occurrence of a schedule), `TaskSeries`
      (the rule), `TaskCompletionEvent` (append-only history); calendar dates kept apart from UTC instants
- [x] Profile-time-zone "today" and overdue from an injectable clock: a date-only task is late once its day ends,
      a timed one once its local minute passes; completing an overdue task never moves its planned date
- [x] Completion as an explicit desired state — no toggle endpoint; repeating it changes nothing and records no
      second event, and reopening keeps the history it undid
- [x] Minimal recurrence (none / daily / weekly-on-weekdays, start and optional end) with one row per scheduled
      date, missed dates materialized, `(series_id, planned_date)` unique so concurrent generation cannot
      duplicate, tombstones so a deleted occurrence cannot reappear, and series edit / stop that never rewrite
      past or completed occurrences
- [x] `/api/tasks` with owner scoping, three disjoint views, `clientRequestId` idempotency, Problem Details,
      stale-edit 409 (echoed `updatedAtUtc` plus the `xmin` row version), and counts aggregated over the whole
      matching set rather than one page
- [x] Migration `AddTasks` (3 tables, check constraints, unique filtered indexes) applied to the development
      database
- [x] Mobile Plan screen: Bu gün / Qarşıdakı / Tamamlananlar, compact "n / N tamamlanıb" summary, a labelled
      overdue section keeping original dates, wrapping task rows with a 48 pt completion control and labelled
      priority, and create / edit / complete / reopen / delete flows
- [x] Fast creation: title focused first, today's date and Normal priority by default, with time, note and
      recurrence as disclosures; unrestricted task dates without touching Nutrition's restriction
- [x] Home's Plan row shows today's real summary and "Tapşırıq" joins Quick Add; both work before Finance or
      Nutrition is set up, and Finance's three money actions are unchanged
- [x] Tests: 29 backend unit (title/priority bounds, overdue boundaries, completion idempotence, recurrence dates
      and windows, stale detection) and 46 integration (CRUD, views, ordering, paging counts, retry-safe and
      concurrent creation, repeated and concurrent completion, history, stale edits, daily/weekly independence,
      concurrent generation, series edit/stop, deleted-occurrence regeneration, cross-user isolation, profile
      time zone and timed-overdue boundaries); 35 new mobile tests for the Plan screen, the form and the helpers

Gates run on 2026-09-08: `dotnet format --verify-no-changes`, `dotnet build` (0 warnings), `dotnet test`
(180 unit + 192 integration, 1 skipped — Phase 3B's deliberately deferred live-provider check), mobile `lint`,
`typecheck`, `jest` (30 suites / 217 tests), `expo-doctor` 18/18, `expo export --platform web`,
`git diff --check`, and a headless-Chrome walkthrough against the live API (52/52 checks) with 31 screenshots and
two inspected recordings in `docs/screenshots-4a/`. Native date/time pickers, keyboard, dynamic type, gestures
and haptics remain unverified on a device.

## Phase 4B — Sleep and reminders

- [x] Domain: `SleepSession` as two UTC instants plus an optional 1–5 quality and note; every duration derived
      from those instants, never from a timer, and every instant rounded to the precision PostgreSQL stores
- [x] One open session per user at the application level **and** in the database (`ix_sleep_sessions_open`,
      partial unique where `ended_at_utc is null`), so two concurrent starts leave one session and one 409
- [x] Non-overlap of completed sessions through a `btree_gist` EXCLUDE constraint over the half-open
      `tstzrange(started_at_utc, ended_at_utc, '[)')` — adjacent sessions may meet at an endpoint
- [x] Idempotent start (`clientRequestId`), a stop that names its session and its instant, repeated stops
      returning the same completed session without moving its end, and a documented 24-hour limit that applies
      only to completed intervals — an open one is never clipped or auto-closed
- [x] `/api/sleep/*` with owner scoping, Problem Details, stale-edit 409 (echoed `updatedAtUtc` plus the `xmin`
      row version), and a seven-day summary attributing each session to its local wake date, averaging only over
      the days that hold a record, aggregated over the whole data set rather than one page
- [x] Migration `AddSleep` (table, check constraints, partial unique index, `btree_gist` exclusion) applied to
      the development database
- [x] Mobile sleep screen: no-session / running / recorded states, a seven-day strip where an empty date reads
      "Qeyd yoxdur", history, correction and manual entry with live duration and field-level validation
- [x] "Oyandım" captures the wake instant once, persists it scoped to the user and session, cancels that
      session's reminder and retries with the same instant, so reconnecting later cannot lengthen the night —
      reusing the existing request path rather than adding an offline queue
- [x] Optional local reminder (`expo-notifications` date trigger) scheduled only after a confirmed start, stored
      with its id and trigger time, reconciled on resume without duplicates or expired firings, cleared for the
      signed-out user only, honest browser fallback, and a tap that opens the session without recording waking
- [x] Home's compact sleep card and a global Quick Add "Yuxu" that opens the screen without starting or stopping
      a session; both work before Finance or Nutrition is set up, and Finance's three money actions are unchanged
- [x] Tests: 16 backend unit (interval, quality and note bounds, future tolerance, duration limit, idempotent
      stop, elapsed time) and 44 integration (concurrent starts, idempotent retries, stop targeting, ownership,
      stale edits, interval validation, overlap and adjacency, time-zone and DST boundaries, wake-date
      attribution, pagination-independent aggregates); 55 new mobile tests across the screen, the form, the
      helpers, the validation schema and the reminder lifecycle, all on controlled clocks

Gates run on 2026-09-10: `dotnet format --verify-no-changes`, `dotnet build` (0 warnings), `dotnet test`
(196 unit + 236 integration, 1 skipped — Phase 3B's deliberately deferred live-provider check), mobile `lint`,
`typecheck`, `jest` (35 suites / 272 tests), `expo-doctor` 18/18, `expo export --platform web`,
`git diff --check`, and a headless-Chrome walkthrough against the live API (49/49 checks) with 22 screenshots and
two inspected recordings in `docs/screenshots-4b/`. Local notifications, native pickers, keyboard, dynamic type,
gestures and haptics remain unverified on a device.

Device preparation (2026-09-10): `scripts/start-api-lan.ps1` binds the development API to every interface,
picks the phone-reachable address, keeps a stable `Jwt:SigningKey` in user-secrets and writes the ignored
`src/mobile/.env.local`; the notification-tap handler is now scoped to the signed-in account, and the Android
permission prompt is asked only after the channel exists. `docs/DEVICE-CHECKS.md` holds the native-configuration
analysis and the iPhone/Android checklists that still need a person and a phone.

## Phase 5 — Manual nutrition and combined dashboard

- [ ] Goals, meals, meal items, daily totals in user timezone
- [ ] Home dashboard with finance/nutrition/sleep/task summaries, quick-add
- [ ] Purpose-built dashboard DTOs and tests

## Phase 6 — AI food-photo analysis

Delivered early as Phase 3B (see above): `IAiFoodAnalyzer`, the versioned schema, the storage and retention
policy, the limits, the draft → review → confirm flow, the fixture-based provider tests and the opt-in live smoke
test all ship there.

## Phase 7 — AI chat and insights

- [ ] Least-privilege tool catalog, proposal previews with scoped single-use confirmation tokens
- [ ] Streaming chat, audit, limits, prompt-injection defenses
- [ ] Weekly insights from deterministic metrics

## Phase 8 — Stabilization and private beta

- [ ] Authorization matrix audit, rate limits, request limits, health/readiness, logging redaction
- [ ] Backup/restore runbook, account export/deletion, release builds, 30-day usage measurement
