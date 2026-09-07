# Libra

**A production-minded personal life tracker — finance first, then debts, nutrition, sleep, tasks, and an AI assistant grounded in your own data.**

Libra is a mobile-first monorepo: a .NET 10 modular-monolith API with PostgreSQL, and an Expo (React Native) app in TypeScript strict mode. It is built the way a real product is built — one vertical slice at a time, every slice with authorization boundaries, migrations, tests, and a documented decision trail.

<p>
  <img alt=".NET 10" src="https://img.shields.io/badge/.NET-10.0-512BD4?logo=dotnet&logoColor=white">
  <img alt="ASP.NET Core" src="https://img.shields.io/badge/ASP.NET%20Core-Web%20API-512BD4">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white">
  <img alt="Expo SDK 57" src="https://img.shields.io/badge/Expo-SDK%2057-000020?logo=expo&logoColor=white">
  <img alt="React Native" src="https://img.shields.io/badge/React%20Native-0.86-61DAFB?logo=react&logoColor=black">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
</p>

**Default locale** az-AZ · **timezone** Asia/Baku · **currency** AZN — all three are user settings, never hardcoded in the domain.

---

## Screens

The production UI ("Quiet Premium") after the Phase 2.5B rebuild and its refinement pass. Captures are 390 × 844 from the automated walkthrough in [`docs/screenshots-2.5b-refinement/`](docs/screenshots-2.5b-refinement/README.md).

| Home | Finance dashboard | Add expense | Dark |
|---|---|---|---|
| <img src="docs/screenshots-2.5b-refinement/02-home-390x844.png" width="200" alt="Home"> | <img src="docs/screenshots-2.5b-refinement/03-finance-dashboard-390x844.png" width="200" alt="Finance dashboard"> | <img src="docs/screenshots-2.5b-refinement/07-create-expense-filled-390x844.png" width="200" alt="Create expense"> | <img src="docs/screenshots-2.5b-refinement/30-finance-dashboard-dark-390x844.png" width="200" alt="Dark dashboard"> |

| Quick Add sheet | Category search | Transactions | Budgets |
|---|---|---|---|
| <img src="docs/screenshots-2.5b-refinement/02b-home-quick-add-sheet-390x844.png" width="200" alt="Quick Add sheet"> | <img src="docs/screenshots-2.5b-refinement/06b-category-sheet-search-390x844.png" width="200" alt="Category search"> | <img src="docs/screenshots-2.5b-refinement/09-transactions-390x844.png" width="200" alt="Transactions"> | <img src="docs/screenshots-2.5b-refinement/11-budgets-390x844.png" width="200" alt="Budgets"> |

Recorded walkthroughs (normal and reduced motion), responsive widths up to desktop, empty/loading/error/stale states, enlarged type and the contrast evidence live in the same folder.

---

## What works today

| Area | Status | Notes |
|---|---|---|
| Authentication | ✅ | Register, login, rotating refresh tokens, logout, profile; tokens in SecureStore |
| User isolation | ✅ | Every query and mutation filters on the server-side `UserId`; integration-tested |
| Accounts & categories | ✅ | Multi-currency accounts, income/expense categories, archive semantics |
| Transactions | ✅ | Income, expense and transfers with idempotent creates (`clientRequestId`) |
| Budgets | ✅ | Monthly per-category and overall budgets, usage and pace |
| Dashboard | ✅ | Per-currency balances, month cash flow, daily spend series, insights |
| Production mobile UI | ✅ | Design tokens, light/dark, reduced motion, accessible contrast, phone → desktop web |
| Recurring & debts | 🔜 | Phase 3 |
| Tasks & sleep | 🔜 | Phase 4 |
| Nutrition & AI assistant | 🔜 | Phases 5–7, behind explicit confirmation gates |

Progress and per-phase checklists: [docs/IMPLEMENTATION-PLAN.md](docs/IMPLEMENTATION-PLAN.md).

---

## Architecture

```
┌──────────────────────────────┐        HTTPS / JWT        ┌────────────────────────────────┐
│  Expo app (iOS · Android ·   │  ───────────────────────► │  Libra.Api (ASP.NET Core)      │
│  web)                        │                           │  endpoints · validation ·      │
│  Expo Router · TanStack      │  ◄─────────────────────── │  Problem Details · health      │
│  Query · Zustand · RHF+Zod   │        JSON DTOs          └───────────────┬────────────────┘
└──────────────────────────────┘                                          │
                                                          ┌───────────────▼────────────────┐
                                                          │  Libra.Application             │
                                                          │  one handler per use case      │
                                                          └───────────────┬────────────────┘
                                            ┌─────────────────────────────┴───────────────┐
                                ┌───────────▼───────────┐                     ┌───────────▼───────────┐
                                │  Libra.Domain         │                     │  Libra.Infrastructure │
                                │  entities, invariants │                     │  EF Core · PostgreSQL │
                                │  (no dependencies)    │                     └───────────┬───────────┘
                                └───────────────────────┘                                 │
                                                                              ┌───────────▼───────────┐
                                                                              │   PostgreSQL 18       │
                                                                              └───────────────────────┘
```

Rules that hold everywhere (full text in [CLAUDE.md](CLAUDE.md)):

- **Domain never depends on Infrastructure or Api.** Use cases are organised per module, not in one service folder.
- **Money is `decimal` / `numeric(18,2)`** with ISO 4217 codes — never `float`/`double`.
- **UTC in persistence, `DateTimeOffset` at boundaries**, day/range bucketing through the user's IANA timezone.
- **EF entities never leave an endpoint**; reads project into init-only records.
- **Secrets come from environment variables or user-secrets** and never reach logs.
- **AI can never mutate data** without an explicit preview and user confirmation, and gets application tools rather than database access.

---

## Tech stack

| Layer | Choice |
|---|---|
| API | .NET 10 · ASP.NET Core Web API · Serilog · rate limiting · Problem Details · OpenAPI |
| Data | EF Core · PostgreSQL 18 · deterministic migrations (`dotnet-ef`, repo-local tool) |
| Auth | JWT bearer + rotating refresh tokens; `ClaimsPrincipal.GetUserId()` is the only user-id source |
| Mobile | Expo SDK 57 · React Native 0.86 · React 19 · Expo Router · TypeScript strict |
| Mobile state | TanStack Query (server state) · Zustand (UI state only) · React Hook Form + Zod |
| Mobile UI | Design tokens in `constants/theme.ts` · Reanimated 4 · reduced-motion aware · light/dark |
| Tests | xUnit · Testcontainers (real PostgreSQL) · Jest + React Native Testing Library |
| CI | GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) |

---

## Quick start

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| .NET SDK | 10.0.400+ (10.0.x) | pinned in `global.json` |
| Node.js | 22.13+ (LTS 22 or 24) | Metro declares `^22.13.0` |
| npm | 10+ | ships with Node |
| Docker Desktop / Engine | 27+ with Compose v2 | PostgreSQL and integration tests (Testcontainers) |

### 1. PostgreSQL

```bash
cp .env.example .env && docker compose up -d
```

PostgreSQL listens on `localhost:5440` (`POSTGRES_PORT` in `.env`). Verify with `docker compose ps`.

### 2. API

```bash
dotnet tool restore
dotnet run --project src/backend/Libra.Api
```

In Development the API applies pending migrations at startup and, when `Jwt:SigningKey` is unset, generates an ephemeral key (logged as a warning). For tokens that survive restarts:

```bash
dotnet user-secrets set "Jwt:SigningKey" "$(openssl rand -base64 48)" --project src/backend/Libra.Api
```

Override the connection string the same way when it differs from the Compose defaults:

```bash
dotnet user-secrets set "ConnectionStrings:Libra" "Host=localhost;Port=5440;Database=libra;Username=libra;Password=libra_dev" --project src/backend/Libra.Api
```

Endpoints:

- `GET /health/live` — process is up · `GET /health/ready` — PostgreSQL reachable (503 with details otherwise)
- `GET /openapi/v1.json` — OpenAPI document (Development only)
- `POST /api/auth/register|login|refresh|logout`, `GET|PUT /api/profile`
- `/api/finance/setup|accounts|categories|transactions|transfers|budgets|dashboard`

Contracts and conventions: [docs/API.md](docs/API.md). Base URL in development is `http://localhost:5134`.

`dotnet run` applies the `http` launch profile and forces `ASPNETCORE_ENVIRONMENT=Development`; add `--no-launch-profile` to test another environment. To reach the API from a phone, bind wide: `dotnet run --project src/backend/Libra.Api --urls http://0.0.0.0:5134`.

### 3. Mobile

```bash
cd src/mobile
cp .env.example .env
npm install
npx expo start
```

`EXPO_PUBLIC_API_URL` defaults to `http://localhost:5134`. Use `http://10.0.2.2:5134` on the Android emulator and `http://<your-lan-ip>:5134` on a device. Expo Web (`npm run web`, port 8081) is allowed by the Development CORS policy; add other origins to `Cors:AllowedOrigins`. Only `EXPO_PUBLIC_*` variables reach the bundle — never put secrets there.

The app opens on the login screen. After registering, the five-tab shell appears: **Ana səhifə** (month summary and quick add), **Maliyyə** (onboarding on first use, then dashboard, transactions, accounts, transfers, budgets, categories) and three "Tezliklə" placeholders. Sessions restore from SecureStore and access tokens refresh automatically.

### API in Docker (optional)

```bash
docker compose --profile api up --build
```

---

## Verification

Everything CI runs:

```bash
dotnet format Libra.slnx --verify-no-changes
```

```bash
dotnet build Libra.slnx
```

```bash
dotnet test Libra.slnx
```

```bash
cd src/mobile && npm run lint && npm run typecheck && npm test
```

```bash
docker build -f src/backend/Dockerfile -t libra-api .
```

Integration tests spin up a disposable `postgres:18-alpine` through Testcontainers, so Docker must be running. Tests cover authorization boundaries, money and budget calculations, database constraints, recurring idempotency and AI confirmation gates.

---

## Repository layout

```text
Libra/
├── CLAUDE.md                    # engineering rules for humans and AI agents
├── Libra.slnx                   # .NET solution
├── Directory.Build.props        # shared build settings (net10.0, nullable, warnings as errors)
├── Directory.Packages.props     # central NuGet versions
├── docker-compose.yml           # local PostgreSQL (+ optional API profile)
├── docs/                        # product, domain, architecture, API, UX, AI safety, decisions, plan
├── src/backend/
│   ├── Libra.Domain/            # entities, value objects, invariants (no dependencies)
│   ├── Libra.Application/       # use cases per module (depends on Domain)
│   ├── Libra.Infrastructure/    # EF Core, PostgreSQL, external adapters
│   ├── Libra.Api/               # ASP.NET Core host, endpoints, health, OpenAPI
│   └── Dockerfile
├── src/mobile/                  # Expo app (routes in src/app, screens/components/hooks/lib alongside)
└── tests/
    ├── Libra.UnitTests/
    └── Libra.IntegrationTests/  # WebApplicationFactory + Testcontainers PostgreSQL
```

---

## Documentation

| Document | What it answers |
|---|---|
| [docs/PRODUCT.md](docs/PRODUCT.md) | What Libra is — and deliberately is not |
| [docs/DOMAIN.md](docs/DOMAIN.md) | Terms, modules, invariants, formulas |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Backend and mobile structure |
| [docs/DATABASE.md](docs/DATABASE.md) | PostgreSQL conventions and migrations |
| [docs/API.md](docs/API.md) | API conventions and contracts |
| [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) | Tokens, components, contrast table, formatting |
| [docs/MOBILE-UX.md](docs/MOBILE-UX.md) | Navigation, states, accessibility |
| [docs/AI-SAFETY.md](docs/AI-SAFETY.md) | AI boundaries and confirmation gates |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decision log and open questions |
| [docs/IMPLEMENTATION-PLAN.md](docs/IMPLEMENTATION-PLAN.md) | Phases and checklists |

Visual evidence: [`docs/screenshots-2.5b/`](docs/screenshots-2.5b/) (Phase 2.5B walkthrough) and [`docs/screenshots-2.5b-refinement/`](docs/screenshots-2.5b-refinement/README.md) (refinement + correction pass, with `results.json` and the recorded walkthroughs).

---

## Contributing

Read [CLAUDE.md](CLAUDE.md) first — it is the engineering contract for this repository (module boundaries, money and time rules, authorization, testing gates). Work one phase and one vertical slice at a time, keep `docs/IMPLEMENTATION-PLAN.md` in sync, and do not mark anything complete until build, tests, lint and type checks pass.

## License

No license has been chosen yet; all rights reserved by the author until one is added.
