# Design system (Phase 2.5B, refined)

One coherent, light-first system for every production screen. Tokens live in `src/mobile/src/constants/theme.ts`;
components in `src/mobile/src/components/`. Screens never use raw colours, sizes, or spacing.

## Direction

"Quiet Premium": bright, calm, data-rich, tactile and human. Canvas `#F5F7FB` with white surfaces, one deep-indigo
brand moment (the Finance balance hero, `#30376F → #5159C6`), semantic green/red/blue for income/expense/transfer,
amber for warnings. Shadows are light (borders and tonal surfaces do the grouping); related content is grouped on one
surface instead of one raised card per action. Dark mode is a complete matching palette (`palettes.dark`).

## Tokens (`constants/theme.ts`)

| Group | Keys |
|---|---|
| Surfaces | `canvas`, `surface`, `surfaceSubtle`, `surfaceRaised`, `surfaceInteractive`, `border`, `borderStrong`, `navSurface` (opaque), `navBorder`, `scrim`, `skeleton` |
| Text | `textPrimary`, `textSecondary`, `textMuted`, `textPlaceholder`, `textDisabled` (disabled controls only), `onPrimary` (primary button), `onHero` / `onHeroMuted` (hero gradient) |
| Brand | `primary`, `primaryPressed`, `primarySoft`, `primaryAccent`, `primaryText`, `heroGradientStart`, `heroGradientEnd` |
| Finance accents (fills, icons, bars) | `income`, `expense`, `transfer`, `warning`, `error` + `*Soft` surfaces |
| Finance foregrounds (meaningful text) | `incomeText`, `expenseText`, `transferText`, `warningText` |
| Modules | `moduleFinance`, `moduleNutrition`, `modulePlan`, `moduleSleep`, `moduleAi` |
| Scales | `Spacing` (4-pt: xxs 2 … huge 40), `Radius` (xs 6 … xl 22, full), `Type` (hero 40, display 32, title 26, heading 20, subheading 17, body 15, bodyStrong, meta 13, caption 12, overline 11), `Shadows` (card, raised, overlay, hero, nav, fab), `Motion` (press 110, quick 160, base 220, move 240, sheet 260, data 400, stagger 32 × cap 5), `Layout` (phonePadding 20, maxContent 1120, maxForm 560, maxFormWide 960, sidebarWidth 248, tabBarHeight 60, tabBarGutter 8, breakpoints 640/1024), `MinTouchTarget` 48, `CategoryColors` |

`useTheme()` returns `{ colors, scheme, shadows, reducedMotion, layout: 'compact' | 'medium' | 'wide', width, height, pagePadding }`.

### Accent versus text colour

Accent tokens (`income #109B72`, `expense #DC5656`, `transfer #3978E8`, `warning #D68A17`) are for fills, icons,
bars and chips. Meaningful text — amounts, status labels, links, validation — uses the `*Text` foreground, which
clears 4.5:1 on white, on the canvas and on its soft surface. `textMuted` (`#5F6A7D`) is real text (captions,
metadata) and passes on every light surface; `textDisabled` is reserved for disabled controls. Placeholders use
`textPlaceholder`. The hero has its own foregrounds: `onHero` (white in both palettes) and `onHeroMuted` (white at
84 %); `onPrimary` belongs to the primary button and is deliberately dark in the dark palette, so it must never be
used on the hero.

Measured pairs (WCAG 2.x contrast, light palette):

| Foreground | On white | On canvas `#F5F7FB` | On soft / subtle surface |
|---|---|---|---|
| `textPrimary #111827` | 17.7 | 16.5 | — |
| `textSecondary #5C6878` | 5.7 | 5.3 | 5.1 (`surfaceSubtle`) |
| `textMuted #5F6A7D` | 5.5 | 5.1 | 4.9 (`surfaceSubtle`), 4.7 (`surfaceInteractive`) |
| `incomeText #087A58` | 5.3 | 5.0 | 4.8 (`incomeSoft`) |
| `expenseText #B83F4A` (also `error`) | 5.5 | 5.1 | 4.8 (`expenseSoft` / `errorSoft`) |
| `warningText #8A5A0A` | 5.9 | 5.5 | 5.4 (`warningSoft`) |
| `transferText #2B5FC0` | 6.0 | — | 5.3 (`transferSoft`) |
| `primaryText #3F4CC5` | 6.9 | — | 6.0 (`primarySoft`), 6.2 (`surfaceSubtle`) |
| white on `primary #4F5FE7` | 5.1 | | |
| white on success button `#087A58` | 5.3 | | |
| white on hero `#30376F` / `#5159C6` | 11.0 / 5.8 | `onHeroMuted` on `#5159C6`: 4.6 | |

Dark palette foregrounds: `incomeText #4ADBA8` (10.0 on surface, 7.5 on soft), `expenseText #FF8A8D` (7.7 / 6.5),
`warningText #F6C363` (10.7 / 8.1), `transferText #8FA8FF` (7.7 / 6.3), `primaryText #A3ABF8` (8.1 / 6.6 on
`primarySoft`), `textMuted #8B97AB` (5.9 on surface, 5.2 on raised), `onHeroMuted` on `#3E48A8`: 6.1.

Category icons/colours: `categoryVisual(name, kind)`, `categoryColor(name, scheme, kind)`, `accountVisual(type)` in
`constants/categories.ts`. Readable preference labels: `constants/preferences.ts`.

## Components

| Component | File | Notes |
|---|---|---|
| `AppText`, `MoneyText`, `formatAmount`, `spokenMoney` | `text.tsx` | `variant` from `Type`, `color` from the text colours; money uses tabular numerals, `*Text` colours and a spoken label |
| `Button`, `IconButton` | `button.tsx` | variants primary/secondary/soft/ghost/danger, sizes md/sm, `loading`, `success` + `successTitle` (never dimmed), `icon` |
| `PressableScale` | `pressable-scale.tsx` | 110 ms press feedback; `style` = visual, `containerStyle` = layout, `dimWhenDisabled` |
| `Entrance` | `entrance.tsx` | mount fade + 8 px rise, `index` stagger capped at 5 slots, `from` below/above/scale/fade, `disabled` for refetch re-renders |
| `Screen` | `screen.tsx` | canvas, safe areas, keyboard avoidance, `maxWidth`, `footer`, `scrollRef` (scroll to the first invalid field), `tabInset` for tab screens, `scroll={false}` for lists |
| `ScreenHeader` | `screen-header.tsx` | `title`, `eyebrow`, `subtitle`, `back`, `trailing`, `size` (`compact` on dense screens) |
| `Sheet` | `sheet.tsx` | bottom sheet on phones, centred dialog or anchored `popover` on wider layouts; web: focus in, Tab contained, Escape closes, focus restored |
| `SelectionSheet` | `selection-sheet.tsx` | radio rows with icon/hint/trailing, `footer` |
| `TextField`, `SelectRow` (+ `compact` filter chip), `SwitchRow`, `FieldGroup`, `FieldMessage` | `form-field.tsx` | validation renders only when present (no reserved rows); errors are alerts and field hints |
| `FilterToggle` | `filter-toggle.tsx` | compact checkable chip for secondary filters (archived items) |
| `AmountInput`, `sanitizeAmount` | `amount-input.tsx` | hero (40 px) or field layout, comma or point, `shakeKey` for invalid submits |
| `SegmentedControl` | `segmented-control.tsx` | sliding tonal pill with optional icons; selection never looks like an error outline |
| `CategoryField`, `CategorySheet`, `orderCategories` | `category-field.tsx` | labelled field with the current choice, ≤ 6 shortcut chips (real recent usage first), "Hamısı" searchable sheet |
| `DateField`, `CalendarSheet` | `date-field.tsx` | localised "6 sentyabr 2026", native pickers + accessible calendar on web |
| `BalanceHero` | `balance-hero.tsx` | ~150-unit indigo hero: "Hesab balansı", currency chips, other currencies listed, never summed |
| `MetricItem` | `metric-item.tsx` | label + animated value with income/expense arrows |
| `QuickAction`, `QuickAddMenu`, `quickActionDefinitions` | `quick-action.tsx`, `quick-add-menu.tsx` | 52-unit pills for the dashboard row, rows for menus; Quick Add = sheet on phones, anchored popover on wide layouts |
| `SectionHeader` | `section-header.tsx` | subheading + optional action link or caption |
| `TransactionRow`, `TransactionList`, `describeTransaction`, `transactionMeta` | `transaction-row.tsx` | category title, note/account/day metadata (no "Market · Market"), reserved amount + overflow width; swipe on native, overflow menu on web |
| `AccountItem` | `account-item.tsx` | icon tile, name, type metadata, balance |
| `BudgetProgress`, `ProgressTrack`, `budgetHealth`, `paceLabel` | `budget-progress.tsx` | limit status (Büdcə daxilində / Limitə yaxın / Büdcə aşılıb) separate from the pace comparison; elapsed-month marker on the track |
| `InsightCard`, `buildInsights`, `projectMonthEnd`, `compactAmount` | `insight-card.tsx` | "Gündəlik xərc": last 7 days with dates and values, limit / pace sentences, month-end estimate from the unrounded monthly total, "Tam ay" expander, unavailable + retry state |
| `SpendingBars`, `CategoryBreakdown` | `spending-bars.tsx`, `category-breakdown.tsx` | code-native charts; every elapsed day is an accessible element with date and value |
| `Skeleton`, `ListSkeleton`, `FormSkeleton`, `LoadingState`, `EmptyState`, `ErrorState`, `InlineError`, `StaleNotice` | `states.tsx` | skeletons mirror the final layout; errors distinguish offline (only when known), connection, server, validation; stale notice over cached data |
| `ToastProvider`, `useToast`, `showToast` | `toast.tsx` | one toast at a time, anchored above the navigation region, duplicates extend instead of stacking |
| `ConfirmProvider` + `confirmAsync` | `confirm-dialog.tsx`, `lib/confirm.ts` | accessible confirmation dialog for destructive actions |
| `TabBar`, `Sidebar` | `tab-bar.tsx`, `sidebar.tsx` | in-flow tab bar region (opaque canvas, owns the bottom safe area) with a floating pill inside; desktop sidebar with Quick Add |
| `BrandMark` | `brand-mark.tsx` | code-native Libra mark and wordmark |
| `AnimatedNumber` | `animated-number.tsx` | 400 ms ticker; accessible name is always the final value |

## Formatting

`lib/money.ts` is the single display formatter: `formatNumber` / `formatMoney` use the profile locale's separators
(az/tr/de `1.234,56`, ru `1 234,56`, en `1,234.56`; pinned because ICU data for az-AZ is incomplete), always two
decimals, ISO code after the number. `setDisplayLocale` is called from the signed-in layout when the profile loads.
Input parsing (`parseAmount`, `sanitizeAmount`) accepts both separators and stays separate from display.

## Screen conventions

- Every screen is `Screen` + `ScreenHeader` (native headers are off). Pushed screens use `back`; tab screens use `tabInset`.
- Forms: fields on the canvas, `FieldGroup` for settings-style groups, sticky `footer` with the primary action; one
  in-flight submit; invalid submit scrolls to the first invalid field; success → button success state (readable, not
  dimmed) + haptic (native) → back after ~550 ms → one toast on the destination screen.
- Lists: `Screen scroll={false}` + `FlatList` with `contentContainerStyle` padding; `ListSkeleton` while loading;
  `EmptyState` with the next useful action; `ErrorState` with retry; load-more footer.
- Destructive actions go through `confirmAsync` with the record identified (category · amount · account) and show
  a toast afterwards.
- Immutable fields render `SelectRow`/`TextField` disabled with `lockedReason`/`hint` explaining why.
- Money: `MoneyText`/`formatAmount`; dates: `formatLongDate` / `formatShortDate` / `formatRelativeDay`; never raw ISO.
- Accessibility: roles and labels on every control, 48 pt targets, no colour-only status, `accessibilityRole="alert"`
  for validation (also passed as the field's hint), `accessibilityLiveRegion` for success.
- Motion: `Entrance` for sections (stagger ≤ 5 slots, mount only), predefined exits/layout from `lib/motion.ts`;
  reduced motion removes shakes, travel, counting, shimmer and stagger and keeps a brief fade.
