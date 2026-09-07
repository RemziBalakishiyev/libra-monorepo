# Product

## Purpose

Libra measures and manages one person's daily life in four areas:

1. **Finance** — income, expenses, recurring payments, budgets, receivables and payables.
2. **Nutrition** — meals, calories, protein, carbohydrates, fat, fiber.
3. **Sleep** — bed/wake times, duration, quality, reminders.
4. **Tasks** — simple daily tasks, priorities, recurrence, completion statistics.

AI has two jobs, both gated by user confirmation:

- Estimate food and macros from a meal photo; the user corrects and confirms before anything is stored as a meal.
- Chat and weekly insights that analyze only the user's own permitted data and give concrete suggestions.

## Strategy

The first goal is a stable personal MVP that one person uses every day, not an App Store-scale product.

### In the MVP

- Email/password account and profile
- Income and expense CRUD with categories
- Monthly budget and finance dashboard
- Recurring income/expenses
- Receivables and payables with partial payments
- Manual meal and macro entry
- AI food analysis from photo with user confirmation
- Start sleep / woke up flow
- Simple daily task manager
- Local notifications
- Weekly and monthly results
- AI chat grounded in the user's data

### Out of the MVP

- Automatic bank integrations
- Apple Health / Health Connect
- Social features
- Paid subscriptions
- Web admin panel
- Microservices
- AI creating finance or health records without confirmation
- Full offline-first synchronization

These are considered only after the personal MVP survives daily use.

## User defaults

Locale `az-AZ`, timezone `Asia/Baku`, currency `AZN`. These are user preferences with defaults, never domain constants.

## Navigation

Bottom tabs: Home, Finance, Nutrition, Plan (tasks), AI. The sleep card lives on Home. A universal quick-add button covers expense, income, meal, task, and start sleep. Every core record must be creatable in at most 2–3 steps. Details in [MOBILE-UX.md](MOBILE-UX.md).

## Delivery phases

See [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md). Phases are strictly sequential; a phase is done only when its gates pass.
