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

## Phase 3 — Recurring transactions and debts

- [ ] Recurring templates, idempotent monthly occurrences, short-month day rule
- [ ] Debts (receivable/payable), partial payments, derived status, overdue
- [ ] Dashboard separates cash, receivables, payables, projected position
- [ ] Concurrency/idempotency/constraint tests

## Phase 4 — Tasks and sleep

- [ ] Task CRUD, today/upcoming/completed, complete/reopen history, minimal recurrence
- [ ] Sleep start/stop, single open session (DB + app), timestamp-based duration, restore after restart
- [ ] Local reminder notifications with contextual permission
- [ ] Race/constraint/timezone tests

## Phase 5 — Manual nutrition and combined dashboard

- [ ] Goals, meals, meal items, daily totals in user timezone
- [ ] Home dashboard with finance/nutrition/sleep/task summaries, quick-add
- [ ] Purpose-built dashboard DTOs and tests

## Phase 6 — AI food-photo analysis

- [ ] `IAiFoodAnalyzer` contract, versioned JSON schema, storage/retention policy, limits
- [ ] Draft → review → confirm flow; malformed output never persisted as a meal
- [ ] Mocked provider tests; opt-in live smoke test

## Phase 7 — AI chat and insights

- [ ] Least-privilege tool catalog, proposal previews with scoped single-use confirmation tokens
- [ ] Streaming chat, audit, limits, prompt-injection defenses
- [ ] Weekly insights from deterministic metrics

## Phase 8 — Stabilization and private beta

- [ ] Authorization matrix audit, rate limits, request limits, health/readiness, logging redaction
- [ ] Backup/restore runbook, account export/deletion, release builds, 30-day usage measurement
