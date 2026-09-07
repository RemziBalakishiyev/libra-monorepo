# Libra — AI ilə mobil tətbiq hazırlama planı

## 1. Məqsəd

Libra istifadəçinin gündəlik həyatını dörd əsas sahədə ölçən və idarə edən mobil tətbiqdir:

1. Maliyyə — gəlirlər, xərclər, sabit ödənişlər, büdcə, alacaqlar və borclar.
2. Qidalanma — yeməklər, kalori, protein, karbohidrat, yağ və lif.
3. Yuxu — yatma/oyanma vaxtları, müddət, keyfiyyət və bildirişlər.
4. Tapşırıqlar — gündəlik sadə tasklar, prioritetlər, təkrarlanma və tamamlanma statistikası.

AI iki funksiyanı yerinə yetirəcək:

- Yemək şəklindən təxmini qida və makro analizi hazırlayacaq; istifadəçi təsdiq etdikdən sonra məlumat bazasına yazılacaq.
- Yalnız istifadəçinin icazə verilmiş məlumatlarını analiz edib konkret məsləhətlər verən chat və həftəlik insight sistemi olacaq.

## 2. Real məhsul strategiyası

İlk məqsəd App Store səviyyəsində böyük məhsul yox, bir nəfərin hər gün istifadə edə bildiyi stabil şəxsi MVP-dir.

### MVP-yə daxildir

- Email/parol ilə hesab və profil
- Gəlir və xərc CRUD
- Maliyyə kateqoriyaları
- Aylıq büdcə və maliyyə dashboard-u
- Sabit gəlir/xərclər
- Alacaq və borclar, hissəvi ödənişlər
- Manual yemək və makro girişi
- Şəkildən AI qida analizi və istifadəçi təsdiqi
- Yuxuya başla / oyandım axını
- Sadə gündəlik task manager
- Local notification
- Həftəlik və aylıq nəticələr
- İstifadəçinin datasına əsaslanan AI chat

### MVP-yə daxil deyil

- Bank hesablarının avtomatik inteqrasiyası
- Apple Health və Health Connect
- Sosial şəbəkə və dost sistemi
- Ödənişli abunəlik
- Web admin panel
- Mikroservislər
- AI-nin təsdiqsiz maliyyə və ya sağlamlıq məlumatı yaratması
- Tam offline-first sinxronizasiya

Bu funksiyalar yalnız şəxsi MVP gündəlik istifadə sınağından keçdikdən sonra əlavə edilməlidir.

## 3. Texniki seçimlər

### Backend

- .NET 10 LTS, ASP.NET Core Web API
- Modular monolith və vertical-slice use-case strukturu
- Entity Framework Core
- PostgreSQL
- JWT access token + rotating refresh token
- FluentValidation
- OpenAPI
- Serilog structured logging
- xUnit integration və unit testləri
- Testcontainers ilə real PostgreSQL integration testləri
- AI provider abstraction: OpenAI və ya Anthropic adapteri
- Şəkillər üçün S3-compatible object storage abstraction

### Mobil

- React Native + Expo managed workflow
- TypeScript strict mode
- Expo Router
- TanStack Query
- Zustand yalnız client/UI state üçün
- React Hook Form + Zod
- Expo SecureStore tokenlər üçün
- Expo Notifications
- Expo ImagePicker/Camera
- Jest və React Native Testing Library

### DevOps

- Monorepo
- Docker Compose ilə lokal PostgreSQL
- GitHub Actions: backend build/test, mobile lint/typecheck/test
- Backend üçün Dockerfile
- Secretlər yalnız environment variable və development user-secrets ilə

## 4. Arxitektura

```text
libra/
├── CLAUDE.md
├── README.md
├── .editorconfig
├── .env.example
├── docker-compose.yml
├── docs/
│   ├── PRODUCT.md
│   ├── DOMAIN.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── API.md
│   ├── MOBILE-UX.md
│   ├── AI-SAFETY.md
│   ├── DECISIONS.md
│   └── IMPLEMENTATION-PLAN.md
├── src/
│   ├── backend/
│   │   ├── Libra.Api/
│   │   ├── Libra.Application/
│   │   ├── Libra.Domain/
│   │   └── Libra.Infrastructure/
│   └── mobile/
└── tests/
    ├── Libra.UnitTests/
    └── Libra.IntegrationTests/
```

Backend daxilində modullar:

```text
Identity
Finance
Debts
Nutrition
Sleep
Tasks
Analytics
Assistant
Notifications
```

Modular monolith o deməkdir ki, tətbiq bir API kimi deploy olunur, amma modulların domain və use-case sərhədləri qorunur. Modullar bir-birinin database cədvəllərinə birbaşa bağlanmamalıdır.

## 5. Dəyişməyən domain qaydaları

1. Bütün zamanlar database-də UTC saxlanılır, mobil tətbiqdə istifadəçinin timezone-u ilə göstərilir. İlkin timezone `Asia/Baku`, locale `az-AZ` olacaq.
2. Pul `decimal`/PostgreSQL `numeric(18,2)` ilə saxlanılır; `float` və `double` qadağandır.
3. Hər maliyyə qeydində ISO currency kodu saxlanılır; ilkin currency `AZN` olur.
4. `Alacaq` balansdakı real pul deyil. Dashboard `cash balance`, `receivables`, `payables` və `projected balance` göstəricilərini ayrı saxlayır.
5. Sabit əməliyyat template-dir. Ay üçün yaranan real əməliyyat ayrıca, idempotent şəkildə yaradılır.
6. Borc qismən ödənilə bilər. Qalıq məbləğ ödəniş tarixçəsindən hesablanır.
7. Eyni istifadəçinin eyni anda yalnız bir açıq yuxu sessiyası ola bilər.
8. Yuxu müddəti tətbiqin açıq qalmasına görə yox, `StartedAtUtc` və `EndedAtUtc` əsasında hesablanır.
9. AI-dən gələn yemək analizi əvvəl `Draft/PendingConfirmation` olur. İstifadəçi porsiyanı düzəldib təsdiqləyəndən sonra gündəlik nəticəyə daxil edilir.
10. AI təxminində `confidence`, istifadə olunan porsiya və istifadəçi düzəlişi saxlanır.
11. AI istifadəçi təsdiqi olmadan gəlir, xərc, borc, yemək və task yaratmır/dəyişmir/silmir.
12. Chat modelinə bütün database ötürülmür. Backend yalnız konkret read-model/tool nəticəsini minimum zəruri sahələrlə verir.
13. Maliyyə və sağlamlıq məsləhətləri məlumat xarakterlidir; diaqnoz və ya zəmanətli maliyyə qərarı kimi təqdim edilmir.
14. Bütün entity-lərdə `UserId` data sərhədidir. Endpoint başqa istifadəçinin obyektini nə oxuya, nə dəyişə bilər.
15. Hesabatlar ilkin mərhələdə source transaction-lardan hesablanır. Lazımsız erkən snapshot və cache cədvəlləri yaradılmır.

## 6. Əsas məlumat modeli

### Identity

- User
- RefreshToken
- UserPreference

### Finance

- Transaction (`Income` və ya `Expense`)
- FinanceCategory
- Budget
- RecurringTransaction
- RecurringTransactionOccurrence

### Debts

- Debt (`Receivable` və ya `Payable`)
- DebtPayment
- Person/Counterparty

### Nutrition

- Meal
- MealItem
- NutritionGoal
- FoodAnalysisDraft
- FoodAnalysisImage

### Sleep

- SleepSession
- SleepGoal

### Tasks

- TaskItem
- TaskRecurrence
- TaskCompletion

### Assistant

- Conversation
- Message
- AiToolCallAudit
- Insight

## 7. API istiqaməti

Tam contract implementasiyadan əvvəl `docs/API.md` daxilində yazılmalıdır. Minimum endpoint qrupları:

```text
/api/auth/*
/api/profile/*
/api/finance/transactions/*
/api/finance/categories/*
/api/finance/budgets/*
/api/finance/recurring/*
/api/debts/*
/api/nutrition/meals/*
/api/nutrition/goals/*
/api/nutrition/food-analysis/*
/api/sleep/sessions/*
/api/tasks/*
/api/analytics/dashboard/*
/api/assistant/conversations/*
```

List endpoint-lərində başlanğıcdan pagination, date range və category/status filterləri nəzərə alınmalıdır. API səhvləri RFC 9457 Problem Details formatında qaytarılmalıdır.

## 8. Mobil naviqasiya

Bottom tab-lar:

1. Ana səhifə
2. Maliyyə
3. Qidalanma
4. Plan
5. AI

Yuxu kartı Ana səhifədə olmalıdır. Tasklar `Plan` bölməsində yerləşir. Ən çox istifadə olunan əməliyyatlar üçün universal quick-add düyməsi olmalıdır:

- Xərc
- Gəlir
- Yemək
- Task
- Yatmağa başla

Hər əsas qeyd maksimum 2–3 addımda yaradıla bilməlidir.

## 9. Development mərhələləri

### Mərhələ 0 — Məhsul sənədləri və skeleton

Nəticə:

- Repo strukturu yaranır.
- Domain terminləri və qərarlar sənədləşir.
- Backend, mobile və PostgreSQL ayağa qalxır.
- CI build olunur.
- Heç bir biznes funksiyası yazılmır.

Keçid şərti:

- `dotnet build` və `dotnet test` uğurludur.
- Mobile lint/typecheck/test uğurludur.
- Docker Compose PostgreSQL başladır.
- README yeni developer üçün işləyir.

### Mərhələ 1 — Authentication və user isolation

Nəticə:

- Register, login, refresh, logout, current profile.
- Password hashing və refresh-token rotation.
- Mobil auth ekranları.
- SecureStore session saxlanması.
- Unauthorized refresh/retry axını.

Keçid şərti:

- İki istifadəçi bir-birinin məlumatını görə bilmir.
- Refresh token reuse ssenarisi test olunur.
- Token və parol loglara düşmür.

### Mərhələ 2 — Maliyyə əsasları

Nəticə:

- Gəlir/xərc və kateqoriya CRUD.
- Tarix və kateqoriya filterləri.
- Aylıq büdcə.
- Cari ay dashboard-u.
- Mobil quick-add və siyahı ekranları.

Keçid şərti:

- Məbləğ hesablamaları decimal ilə test olunur.
- Income, expense, remaining budget düzgün hesablanır.
- Empty/loading/error/offline UI halları var.

### Mərhələ 3 — Sabit əməliyyatlar və borclar

Nəticə:

- Recurring template-lər.
- Ay üçün əməliyyatların idempotent yaranması.
- Receivable/payable borclar.
- Qismən və tam ödəniş.
- Gecikmiş borc göstəricisi.

Keçid şərti:

- Eyni ay üçün duplicate recurring transaction yaranmır.
- Borc qalıqları payment tarixçəsi ilə uyğun gəlir.
- Alacaq cash balance-a əlavə edilmir.

### Mərhələ 4 — Task və yuxu

Nəticə:

- Task CRUD, today view, complete/reopen.
- Sadə daily/weekly recurrence.
- Sleep start/stop.
- Açıq sleep session bərpası.
- Sleep reminder local notification.

Keçid şərti:

- Eyni anda ikinci yuxu sessiyası açıla bilmir.
- App bağlanıb açılanda açıq sessiya düzgün görünür.
- Oyananda planlanmış notification ləğv edilir.

### Mərhələ 5 — Manual qidalanma və ümumi dashboard

Nəticə:

- Kalori və makro hədəfləri.
- Manual meal/meal item CRUD.
- Günlük progress bar-ları.
- Maliyyə, qidalanma, yuxu və task summary-ləri bir dashboard-da.

Keçid şərti:

- Meal dəyişəndə total-lar yenidən düzgün hesablanır.
- Gün sərhədi user timezone-u ilə hesablanır.

### Mərhələ 6 — Şəkildən AI qida analizi

Nəticə:

- Şəkil çək/yüklə.
- Backend signed upload və ya təhlükəsiz multipart qəbul edir.
- AI structured JSON qaytarır.
- Draft review ekranı.
- İstifadəçi porsiya və item-ləri dəyişib təsdiqləyir.

Keçid şərti:

- Qeyri-müəyyən analiz `confidence` göstərir.
- AI cavabı schema validation-dan keçməsə database-ə yazılmır.
- Təsdiqsiz draft günlük makroya daxil edilmir.
- Şəkil və model xətaları istifadəçiyə aydın göstərilir.

### Mərhələ 7 — AI chat və insight-lar

Nəticə:

- Streaming chat.
- Read-only analytics tool-ları.
- Yazma əməliyyatı üçün preview + explicit confirmation.
- Həftəlik maliyyə/qida/yuxu/task insight-ları.
- Tool-call audit.

Keçid şərti:

- Model başqa user-in datasını ala bilmir.
- Model uydurduğu ID ilə əməliyyat edə bilmir.
- Destructive action üçün ayrıca təsdiq lazımdır.
- AI cavabı hansı tarix aralığını analiz etdiyini göstərir.

### Mərhələ 8 — Stabilizasiya və şəxsi beta

Nəticə:

- Crash/error monitoring.
- Rate limiting.
- Backup və restore sınağı.
- Privacy/account deletion.
- Release build.
- 30 günlük real istifadə ölçümü.

Keçid şərti:

- Əsas flows real cihazda yoxlanılıb.
- Seed/demo data production-a düşmür.
- Secrets bundle-a daxil deyil.
- 30 gün ərzində hansı funksiyaların istifadə olunduğu ölçülür.

## 10. Claude Code üçün daimi iş qaydası

Bu mətn layihənin kökündəki `CLAUDE.md` faylına uyğunlaşdırılmalıdır:

```md
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
- Choose versions compatible with the current Expo SDK; verify using official Expo tooling before installing packages.
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
```

## 11. Claude Code master bootstrap prompt

Yeni boş repository-də Claude Code-a ilk veriləcək prompt:

```text
You are the senior product architect and implementation engineer for a new application named Libra.

Goal:
Build a production-minded but deliberately small personal mobile application. It tracks personal finance, debts/receivables, nutrition/macros, sleep, and daily tasks. It later provides AI food-photo estimation and an AI assistant grounded in the user's own data.

Primary user defaults:
- Locale: az-AZ
- Timezone: Asia/Baku
- Currency: AZN
These are defaults/preferences, not hardcoded domain limitations.

Required stack:
- Backend: .NET 10 LTS, ASP.NET Core Web API, EF Core, PostgreSQL
- Architecture: modular monolith with vertical-slice use cases
- Mobile: React Native, Expo managed workflow, TypeScript strict, Expo Router
- Mobile server state: TanStack Query
- Mobile local UI state: Zustand only where actually needed
- Forms: React Hook Form + Zod
- Tests: xUnit/Testcontainers backend, Jest/React Native Testing Library mobile
- Local infrastructure: Docker Compose PostgreSQL

Critical domain rules:
- Store timestamps in UTC and render dates using user timezone.
- Use decimal/numeric for all money. Never float/double.
- Receivables are not cash balance.
- Recurring records are templates; monthly occurrences must be idempotent.
- Debts support partial payments and direction Receivable/Payable.
- A user can have only one open sleep session.
- Sleep duration is timestamp-based, not dependent on the app remaining open.
- AI nutrition results are estimates and must remain drafts until user confirmation.
- AI receives least-privilege application tools and never direct database access.
- AI must preview any mutation and require explicit user confirmation.
- Every user-owned backend operation must enforce UserId server-side.

Task for this turn: Phase 0 only.

1. Inspect the existing repository and report what is already present.
2. Create or refine:
   - CLAUDE.md
   - README.md
   - docs/PRODUCT.md
   - docs/DOMAIN.md
   - docs/ARCHITECTURE.md
   - docs/DATABASE.md
   - docs/API.md
   - docs/MOBILE-UX.md
   - docs/AI-SAFETY.md
   - docs/DECISIONS.md
   - docs/IMPLEMENTATION-PLAN.md
3. Record unresolved but non-blocking assumptions in docs/DECISIONS.md. Ask me only if a decision materially changes security, data ownership, or core domain behavior.
4. Scaffold the monorepo with the smallest reasonable backend solution, test projects, and Expo mobile app.
5. Add Docker Compose for local PostgreSQL, safe .env.example files, .gitignore, .editorconfig, backend health endpoint, and a minimal mobile environment configuration.
6. Add CI that restores, formats/checks, builds, and tests backend; and installs, lints, typechecks, and tests mobile.
7. Do not implement authentication or any business module in this phase.
8. Use current stable mutually-compatible packages only. Inspect installed tool versions and official package compatibility; do not invent versions and do not use previews.
9. Run every relevant command and fix failures until Phase 0 gates pass.

Before modifying files, give a concise plan with the proposed tree and assumptions. Then implement. At the end provide:
- final tree summary
- files created/changed
- commands and exact results
- how to start PostgreSQL, API, and mobile app
- unresolved decisions
- the next single recommended prompt

Do not claim success if a command was not run or did not pass.
```

## 12. Mərhələlər üzrə copy-paste promptlar

### Prompt 1 — Authentication

```text
Read CLAUDE.md and all relevant docs first. Inspect the repository and current tests. Implement Phase 1 only: authentication and user isolation, as one complete vertical slice across backend and mobile.

Scope:
- Register with email/password
- Login
- Short-lived access token
- Rotating refresh token with secure hashed persistence and reuse protection
- Logout/current session revocation
- GET/PUT current profile and preferences
- Mobile register/login/session restore/logout flows
- SecureStore for tokens
- One controlled refresh-and-retry path for expired access tokens
- Auth-aware Expo Router navigation

Security and behavior:
- Normalize email and enforce uniqueness safely.
- Use ASP.NET Core's established password hashing primitives; never design custom cryptography.
- Never return or log password hashes or raw refresh tokens.
- Add rate limiting to sensitive auth endpoints.
- All future user-owned entities must derive UserId from authenticated claims, never a client-supplied UserId.
- Define consistent Problem Details errors.

Tests must cover:
- register/login success and invalid credentials
- duplicate normalized email
- refresh rotation
- replay/reuse of an old refresh token
- logout revocation
- protected endpoint without token
- two users cannot access each other's profile/resources

Before editing, report plan, migrations, API contracts, and assumptions. Implement only after inspection. Run format, build, backend tests, mobile lint/typecheck/tests. Update API, database, decisions, and implementation-plan docs. End with manual test steps and the next recommended prompt.
```

### Prompt 2 — Maliyyə core

```text
Read CLAUDE.md and relevant domain/API/database/UX docs. Inspect the completed authentication implementation. Implement Phase 2 only: finance categories, income/expense transactions, monthly budgets, and the current-month finance dashboard across backend and mobile.

Required behavior:
- User-owned finance categories with Income/Expense/Both applicability.
- Transaction fields: id, type Income|Expense, amount decimal, currency ISO code, category, occurredAt, optional note, createdAt, updatedAt.
- CRUD with server-side UserId isolation.
- Paginated transaction list with date-range, type, and category filters.
- Monthly category/overall budgets.
- Dashboard values: total income, total expense, current cash delta, budget used/remaining, daily spending average, and category breakdown.
- Default display currency AZN, while the model retains a currency code. Do not implement exchange-rate conversion yet.
- Mobile Finance home, transaction list/filter, add/edit transaction, budgets, and quick-add expense/income.
- Azerbaijani UI copy; implementation identifiers/code remain English.

Rules:
- Money must be decimal and PostgreSQL numeric(18,2).
- Reject zero/negative transaction amounts.
- Treat occurredAt according to the user's timezone when calculating month boundaries.
- Do not mix debts/receivables into this phase.
- Do not add charts that are not backed by a useful metric; start with clear cards and a category breakdown.

Tests must cover calculations, month/timezone boundaries, authorization isolation, filters/pagination, invalid amounts, and budget behavior.

First show the API contracts and calculation definitions you will implement. Then implement, run all gates, update docs, and provide exact manual mobile test steps. Stop after Phase 2.
```

### Prompt 3 — Sabit xərclər və borclar

```text
Read CLAUDE.md and inspect the verified Finance module. Implement Phase 3 only: recurring finance templates plus debts/receivables and payments, across backend and mobile.

Recurring requirements:
- Income/expense recurring template with amount, currency, category, cadence Monthly for MVP, day-of-month, optional start/end date, active flag.
- Generate a real transaction occurrence idempotently for a target month.
- A template is not automatically considered paid/spent; expose clear pending/generated state according to the documented decision.
- Handle day 29/30/31 deterministically for short months and document the rule.
- No duplicate occurrence under concurrent/retried requests.

Debt requirements:
- Direction Receivable|Payable.
- Counterparty name, principal, currency, opened date, optional due date and note.
- Partial payments with payment history.
- Status Open|PartiallyPaid|Paid|Overdue derived consistently.
- Remaining amount derived from principal minus valid payments.
- Prevent payments above remaining balance unless an explicit overpayment policy has been approved; default is reject.
- Dashboard separates cash, receivables, payables, overdue amounts, and projected net position.
- Receivables must never be added to available cash.

Mobile:
- Recurring list/create/edit/deactivate and month occurrence action/status.
- Debts overview separated as “Mənə borcludurlar” and “Mən borcluyam”.
- Debt detail/payment timeline and add-payment flow.

Add database constraints and integration tests for idempotency, concurrency/retry, partial/full payments, invalid overpayment, status, month boundary, and UserId isolation. Run all gates and update docs. Stop after this phase.
```

### Prompt 4 — Tasklar və yuxu

```text
Read CLAUDE.md and all relevant docs. Implement Phase 4 only: daily tasks and sleep sessions, with backend and mobile flows.

Tasks:
- CRUD with title, optional note, due local date/time, priority, category, status.
- Today/upcoming/completed filters.
- Complete and reopen actions with explicit CompletedAtUtc history.
- Minimal daily/weekly recurrence. Define occurrence semantics before coding and make generation idempotent.
- Do not build a full project-management system, subtasks, teams, kanban, or dependencies.

Sleep:
- Start sleep now and stop/wake now.
- Allow optional correction of start/end time with validation.
- At most one open sleep session per user, protected by a database-level strategy as well as application validation.
- Duration derived from timestamps.
- Restore and display an open session after app restart; the UI timer is presentation only.
- Sleep history, daily/weekly average, and optional 1–5 quality score after waking.
- Schedule a local wake/reminder notification based on the user's chosen duration when sleep starts; cancel it when sleep ends.
- Request notification permission in context, not blindly at first launch.
- Document OS limitations; do not claim that six hours of app inactivity proves the user is asleep.

Tests:
- double-start race/constraint
- stop without open session
- invalid/negative/excessive duration policy
- app/API restart-safe calculations
- timezone day grouping
- task recurrence idempotency and completion history
- UserId isolation

Implement the smallest coherent UX, run all gates, update docs, and provide real-device notification test steps. Stop after Phase 4.
```

### Prompt 5 — Manual qidalanma və ümumi dashboard

```text
Read CLAUDE.md and inspect existing modules. Implement Phase 5 only: manual nutrition tracking and a combined home dashboard.

Nutrition requirements:
- User nutrition goals: daily calories, protein, carbohydrates, fat, optional fiber.
- Meal with meal type/time/note and one or more meal items.
- Each item stores name, portion description, optional grams, calories, protein, carbohydrates, fat, fiber.
- Decimal values, non-negative validation, and documented reasonable upper bounds.
- Daily totals and remaining-to-goal values based on the user's timezone.
- Editing/deleting a meal immediately affects computed totals.
- No external food database and no AI image analysis in this phase.

Mobile:
- Today nutrition screen with macro progress.
- Fast manual meal entry, edit, delete, and recent meal history.
- Combined Home dashboard with Finance, Nutrition, Sleep, and Tasks summaries.
- Quick-add actions.
- Loading, empty, validation, error, retry, and accessible states.

Dashboard queries must be efficient and return purpose-built DTOs; do not return entire entity graphs. Add calculation/timezone/UserId tests. Run all gates, update docs, and stop after Phase 5.
```

### Prompt 6 — Şəkildən AI kalori analizi

```text
Read CLAUDE.md, docs/AI-SAFETY.md, and the current Nutrition implementation. Implement Phase 6 only: AI-assisted food-photo analysis as a draft-review-confirm workflow.

Before coding, propose and document:
- the provider-neutral IAiFoodAnalyzer contract
- the exact versioned JSON schema returned by the model
- image storage/privacy/retention policy
- timeout, retry, size/type limits, rate limit, and estimated per-request cost controls
- failure and low-confidence UX

Required flow:
1. User captures or selects an image.
2. Mobile compresses it to a documented safe size while preserving enough quality.
3. Backend validates ownership, MIME type, size, and upload authorization.
4. Backend sends the image to the configured vision-capable provider through an adapter.
5. Model returns only schema-constrained structured data: detected foods, estimated portion/grams, calories, protein, carbohydrates, fat, fiber, confidence, and clarification questions/warnings.
6. Backend validates and bounds every model value. Malformed output never becomes a confirmed meal.
7. Save as PendingConfirmation draft.
8. Mobile shows image plus editable detected items and clearly labels the result as an estimate.
9. User edits/removes/adds items and explicitly confirms.
10. Confirmation creates the meal once, idempotently; unconfirmed drafts do not affect totals.

Security:
- API keys are backend-only.
- Never log raw image bytes, secrets, or unnecessary personal prompt content.
- Prevent cross-user draft/image access.
- Strip unneeded image metadata where feasible.
- Protect against prompt text found inside an image; model output is untrusted data.
- Mock the AI provider in automated tests. Do not require paid live calls in CI.

Tests must cover malformed schema, timeout, provider error, absurd values, low confidence, unauthorized access, duplicate confirm, draft expiry/retention, and confirmed macro totals.

Implement one provider adapter behind the abstraction, with configuration and a deterministic fake for development/tests. Run all gates and provide one opt-in live smoke-test procedure. Stop after Phase 6.
```

### Prompt 7 — AI chat və şəxsi analiz

```text
Read CLAUDE.md, docs/AI-SAFETY.md, and all analytics contracts. Implement Phase 7 only: a grounded AI chat plus weekly insights.

First design a least-privilege tool catalog. Initial read tools:
- get_finance_summary(dateRange)
- get_expense_breakdown(dateRange, category?)
- get_debt_summary()
- get_nutrition_summary(dateRange)
- get_sleep_summary(dateRange)
- get_task_summary(dateRange)

Initial mutation proposals may include:
- propose_transaction
- propose_task
- propose_meal
They must return a preview object and confirmation token. No mutation occurs until the authenticated user explicitly confirms through a separate endpoint/UI action. Tokens must be scoped, short-lived, single-use, and bound to user + exact payload.

Requirements:
- Streaming assistant response where supported.
- Conversations/messages owned by UserId.
- Backend executes tools; model has no SQL/database/network credentials.
- Strict schemas and server-side authorization/validation for every tool call.
- Limit date ranges, result size, model iterations, tokens, and cost.
- Audit tool name, user, time, outcome, and safe metadata without leaking secrets or excessive private content.
- System instructions must say that food estimates are approximate and financial/health responses are informational, not professional diagnosis/advice.
- Answers based on analytics state the analyzed date range and distinguish facts from suggestions.
- Generate weekly insights from deterministic metrics first; use AI only to explain/prioritize them.
- Add prompt-injection defenses: database notes, task titles, meal names, and image-derived text are untrusted data, never instructions.

Tests:
- cross-user isolation
- invalid tool arguments
- excessive date range
- forged/expired/replayed confirmation token
- model attempts unauthorized tool
- prompt injection stored in user content
- provider timeout/failure
- cost/iteration limits

Build the mobile AI tab with conversation list/chat, streaming/error/retry states, tool result cards, and explicit proposal confirmation UI. Run all gates, update docs, and stop after Phase 7.
```

### Prompt 8 — Stabilizasiya və beta release

```text
Read CLAUDE.md and inspect every completed phase. Perform Phase 8 only: stabilization and private beta readiness. Do not add new product features.

Audit and improve:
- authorization matrix and UserId isolation tests for every module
- validation and Problem Details consistency
- database indexes and obvious N+1/query issues based on actual queries
- concurrency/idempotency paths
- API rate limits, request size limits, timeouts, cancellation, health/readiness checks
- secret handling and production configuration validation
- structured logging with private-data redaction
- image lifecycle/retention cleanup
- account data export and deletion behavior
- backup/restore runbook
- mobile crash boundaries, network retry policy, offline messaging, accessibility, and slow-loading states
- notification behavior on real Android/iOS development builds
- CI release gates and reproducible backend/mobile builds
- seed/demo data exclusion from production

Create a private-beta checklist and a 30-day usage-measurement plan focused on:
- daily active use
- input completion/friction
- quick-add usage
- AI estimate correction rate
- retention of finance/nutrition/sleep/task flows
- AI cost per active user
- errors/crashes

Run all automated gates. Clearly separate what was verified automatically, what was verified manually, and what still requires a physical device or deployed environment. Do not claim store readiness without those checks.
```

## 13. Hər Claude sessiyasının sonunda istifadə ediləcək review promptu

```text
Review the work from this phase as a skeptical senior engineer. Do not add new features.

1. Compare the implementation against the requested acceptance criteria and CLAUDE.md.
2. Inspect the actual diff and identify incomplete, dead, duplicated, insecure, or over-engineered code.
3. Check UserId isolation, decimal/timezone handling, validation, concurrency/idempotency, secret/privacy exposure, and mobile error states relevant to this phase.
4. Run the relevant format/build/test/lint/typecheck commands yourself.
5. Fix issues that are clearly within this phase. Do not weaken tests to make them pass.
6. List remaining risks with severity: blocker, high, medium, low.
7. Give exact manual test steps and state honestly what was not verified.

Do not respond with a generic approval. Base the review on inspected files, diffs, and command results.
```

## 14. Claude səhv istiqamətə gedəndə stop promptu

```text
Stop implementation. Do not modify more files yet.

Inspect the current git diff and compare it with the active phase only. Report:
- unrelated changes
- speculative abstractions/packages
- missing acceptance criteria
- broken tests/build/typecheck
- data-loss or migration risks
- security/privacy regressions

Propose the smallest safe correction plan that preserves valid existing work and user changes. Do not use git reset, checkout, force push, delete migrations/data, or other destructive commands. Wait for my approval after presenting the plan.
```

## 15. İstifadə qaydası

1. Boş Git repository aç.
2. Claude Code-u repo kökündə başlad.
3. Əvvəl yalnız `Master bootstrap prompt` göndər.
4. Claude-un yaratdığı sənədləri və qərarları yoxla.
5. Build/test nəticəsi yaşıl deyilsə növbəti mərhələyə keçmə.
6. Hər mərhələ promptunu ayrıca yeni kontekstdə və ya `/clear` etdikdən sonra göndər; Claude əvvəl `CLAUDE.md` və docs-u yenidən oxusun.
7. Hər mərhələdən sonra review promptunu işlət.
8. Özün manual test et və yalnız sonra commit et.
9. Bir promptda iki mərhələni birləşdirmə.
10. AI “bitdi” deyəndə onun sözünə yox, diff + build + test + real cihaz nəticəsinə inan.

## 16. Real vaxt gözləntisi

Senior backend təcrübəsi olan, amma React Native-də əlavə yoxlama aparan bir developer üçün:

- İşlək şəxsi MVP: təxminən 4–8 həftə part-time fokuslu iş.
- AI qida analizi və təhlükəsiz chat daxil stabil private beta: təxminən 8–12 həftə.
- App Store/Play Store üçün cilalanmış kommersiya məhsulu: çox vaxt 3–6 ay və real istifadəçi testləri.

AI kod yazma müddətini azaldacaq, amma domain qərarlarını, mobil real-device testini, təhlükəsizliyi və məhsul istifadəsini sənin əvəzinə doğrulamayacaq.

## 17. İlk konkret addım

Bu gün yalnız bunları et:

1. `libra` repository yarat.
2. Claude Code-u repo kökündə aç.
3. Master bootstrap promptunu göndər.
4. Phase 0 bitəndə yaranmış tree, `docs/DECISIONS.md`, command nəticələri və Claude-un cavabını review et.
5. Authentication promptuna keçməzdən əvvəl Phase 0 nəticəsini ayrıca yoxlat.

