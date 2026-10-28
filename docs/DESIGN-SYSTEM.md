# Design system (Phase 2.5B, refined)

One coherent, light-first system for every production screen. Tokens live in `src/mobile/src/constants/theme.ts`;
components in `src/mobile/src/components/`. Screens never use raw colours, sizes, or spacing.

## Direction

"Quiet Premium", in a warm green system (2026-09-18): an off-white canvas `#F5F3EE` with `#FFFEFA` surfaces,
deep-green primary `#1E5345` and hero `#102F28`, a sage soft surface `#E4EADF`, and one pistachio accent
`#D8EB86` that is always paired with dark text (`onAccent`). Income/expense/transfer keep their own
green/red/blue, amber stays for warnings. Shadows are light (borders and tonal surfaces do the grouping); related
content is grouped on one surface instead of one raised card per action. Dark mode is a complete matching palette
(`palettes.dark`: canvas `#0E1713`, surface `#18251F`, primary `#C9DD95` with dark `onPrimary`). The hero
background is the same `#102F28` in both palettes and `onHero` stays white — it is never `onPrimary`.

## Tokens (`constants/theme.ts`)

Which palette is in use is decided in one place: `useTheme()` combines the stored choice in
`lib/appearance-store.ts` (`light | dark | system`, default `light`) with the OS scheme, and every screen,
sheet, toast, the navigation theme and the status bar read the result through it. Nothing reads
`useColorScheme()` on its own. `onHero` is `#FFFFFF` in both palettes on purpose.

| Group | Keys |
|---|---|
| Surfaces | `canvas`, `surface`, `surfaceSubtle`, `surfaceRaised`, `surfaceInteractive`, `border`, `borderStrong`, `navSurface` (opaque), `navBorder`, `scrim`, `skeleton` |
| Text | `textPrimary`, `textSecondary`, `textMuted`, `textPlaceholder`, `textDisabled` (disabled controls only), `onPrimary` (primary button), `onHero` / `onHeroMuted` (hero gradient) |
| Brand | `primary`, `primaryPressed`, `primarySoft`, `primaryAccent`, `primaryText`, `heroGradientStart`, `heroGradientEnd`, `heroGlow` (one low-alpha layer of the Home hero's tonal wash), `accent` / `onAccent` (pistachio chip or figure, dark text) |
| Finance accents (fills, icons, bars) | `income`, `expense`, `transfer`, `warning`, `error` + `*Soft` surfaces |
| Finance foregrounds (meaningful text) | `incomeText`, `expenseText`, `transferText`, `warningText` |
| Modules | `moduleFinance`, `moduleNutrition`, `modulePlan`, `moduleSleep`, `moduleAi` |
| Scales | `Spacing` (4-pt: xxs 2 … huge 40), `Radius` (xs 6 … xl 22, full), `Type` (hero 40, display 32, title 26, heading 20, subheading 17, body 15, bodyStrong, meta 13, caption 12, overline 11), `Shadows` (card, raised, overlay, hero, nav, fab), `Motion` (press 110, quick 160, base 220, move 240, sheet 260, data 400, stagger 32 × cap 5), `Layout` (phonePadding 20, maxContent 1120, maxForm 560, maxFormWide 960, sidebarWidth 248, tabBarHeight 60, tabBarGutter 8, breakpoints 640/1024), `MinTouchTarget` 48, `CategoryColors` |

`useTheme()` returns `{ colors, scheme, shadows, reducedMotion, layout: 'compact' | 'medium' | 'wide', width, height, pagePadding }`.

### Accent versus text colour

Accent tokens (`income #109B72`, `expense #DC5656`, `transfer #3978E8`, `warning #D68A17`, `accent #D8EB86`)
are for fills, icons, bars and chips. Meaningful text — amounts, status labels, links, validation — uses the
`*Text` foreground, which clears 4.5:1 on white, on the canvas and on its soft surface. `textMuted` (`#56645B`)
is real text (captions, metadata) and passes on every light surface; `textDisabled` is reserved for disabled
controls. Placeholders use `textPlaceholder`. The pistachio `accent` is never a text colour and always carries
`onAccent` (`#182A23`) on top. The hero has its own foregrounds: `onHero` (white in both palettes) and
`onHeroMuted` (white at 84 %); `onPrimary` belongs to the primary button and is deliberately dark in the dark
palette, so it must never be used on the hero.

Measured pairs (WCAG 2.x contrast, light palette, 2026-09-18):

| Foreground | On surface `#FFFEFA` | On canvas `#F5F3EE` | On soft / subtle surface |
|---|---|---|---|
| `textPrimary #182A23` | 14.9 | 13.6 | 12.3 (`primarySoft`) |
| `textSecondary #5E6C63` | 5.5 | 5.0 | 4.8 (`surfaceSubtle`), 4.5 (`primarySoft`) |
| `textMuted #56645B` | 6.2 | 5.6 | 5.4 (`surfaceSubtle`), 5.2 (`surfaceInteractive`) |
| `incomeText #087A58` | 5.3 | 4.8 | 4.7 (`incomeSoft`) |
| `expenseText #B83F4A` (also `error`) | 5.4 | 4.9 | 4.7 (`expenseSoft` / `errorSoft`) |
| `warningText #8A5A0A` | 5.9 | 5.3 | 5.3 (`warningSoft`) |
| `transferText #2B5FC0` | 5.9 | — | 5.2 (`transferSoft`) |
| `primaryText #1E5345` | 8.8 | 8.0 | 7.2 (`primarySoft`), 7.6 (`surfaceSubtle`) |
| white on `primary #1E5345` | 8.8 | | |
| `onAccent #182A23` on `accent #D8EB86` | 11.6 | | |
| white on hero `#102F28` / `#1A473B` | 14.4 / 10.5 | `onHeroMuted` on `#1A473B`: 7.9 | |

Dark palette foregrounds: `incomeText #4ADBA8` (9.1 on surface, 7.6 on soft), `expenseText #FF8A8D` (7.0 / 6.3),
`warningText #F6C363` (9.8 / 8.0), `transferText #8FA8FF` (7.0 / 6.0), `primaryText #C9DD95` (10.8 / 8.3 on
`primarySoft`), `textMuted #A3AEA4` (6.9 on surface, 6.3 on raised), `onPrimary #15231A` on `primary` 11.1,
`onAccent #15231A` on `accent` 12.5, `onHeroMuted` on `#1A473B`: 7.9.

Category icons/colours: `categoryVisual(name, kind)`, `categoryColor(name, scheme, kind)`, `accountVisual(type)` in
`constants/categories.ts`. Readable preference labels: `constants/preferences.ts`.

## Components

| Component | File | Notes |
|---|---|---|
| `AppText`, `MoneyText`, `formatAmount`, `spokenMoney` | `text.tsx` | `variant` from `Type`, `color` from the text colours; money uses tabular numerals, `*Text` colours and a spoken label |
| `Button`, `IconButton` | `button.tsx` | variants primary/secondary/soft/ghost/danger, sizes md/sm, `loading`, `success` + `successTitle` (never dimmed), `icon` |
| `PressableScale` | `pressable-scale.tsx` | 110 ms press feedback; `style` = visual, `containerStyle` = layout, `dimWhenDisabled` |
| `Entrance` | `entrance.tsx` | mount fade + 8 px rise, `index` stagger capped at 5 slots, `from` below/above/scale/fade, `duration` override (Home uses 320 ms and 10 px), `disabled` for refetch re-renders |
| `Screen` | `screen.tsx` | canvas, safe areas, keyboard avoidance, `maxWidth`, `footer`, `scrollRef` (scroll to the first invalid field), `tabInset` for tab screens, `scroll={false}` for lists |
| `ScreenHeader` | `screen-header.tsx` | `title`, `eyebrow`, `subtitle`, `back`, `trailing`, `size` (`compact` on dense screens) |
| `Sheet` | `sheet.tsx` | bottom sheet on phones (max height = window − top inset − 20, recomputed on rotation; the body shrinks and scrolls inside it so the header and footer stay reachable), centred dialog or anchored `popover` on wider layouts; web: focus in, Tab contained, Escape closes, focus restored |
| `SelectionSheet` | `selection-sheet.tsx` | radio rows with icon/hint/trailing, `footer` |
| `TextField`, `SelectRow` (+ `compact` filter chip), `SwitchRow`, `FieldGroup`, `FieldMessage` | `form-field.tsx` | validation renders only when present (no reserved rows); errors are alerts and field hints |
| `FilterToggle` | `filter-toggle.tsx` | compact checkable chip for secondary filters (archived items) |
| `AmountInput`, `sanitizeAmount` | `amount-input.tsx` | hero (40 px) or field layout, comma or point, `shakeKey` for invalid submits |
| `SegmentedControl` | `segmented-control.tsx` | sliding tonal pill with optional icons; selection never looks like an error outline; `aria-checked` is set explicitly (react-native-web does not derive it), and `accessibilityLabel` per option carries the full name when the visible label is abbreviated |
| `CategoryField`, `CategorySheet`, `orderCategories` | `category-field.tsx` | labelled field with the current choice, ≤ 6 shortcut chips (`shortcutLimit`; the transaction form uses 4; real recent usage first) that wrap inside the row at 44-unit height, "Hamısı" searchable sheet |
| `DateField` | `date-field.tsx` | localised "18 sentyabr 2026"; dismisses the keyboard, then opens the shared calendar on every platform; `minimumDate` / `maximumDate` are the caller's own policy |
| `CalendarSheet`, `monthCells`, `isPermitted` | `calendar-sheet.tsx` | the date-only calendar: "Tarix seç" sheet, month heading with previous/next, Monday-first seven columns with Azerbaijani weekday labels, a labelled radio per day (today `aria-current="date"` with a ring and dot, blocked days `aria-disabled` and struck), "Bu gün" / "Dünən" shortcuts when permitted, the selected-date summary and a "Təsdiqlə" footer. A tap, a shortcut or an arrow key changes the **pending** date; only Təsdiqlə commits; close, backdrop, Escape and Android Back discard; the body mounts per opening so reopening restores the committed day and month. Today comes from `todayInProfileZone` |
| `TimeField`, `sanitizeTime` | `time-field.tsx` | 24-hour local time; native pickers on iOS/Android, masked input elsewhere |
| `DateNav` | `date-nav.tsx` | previous / next day with a calendar in the middle ("Bu gün", "Dünən", or the long date); future days are blocked where the screen asks for it |
| `BalanceHero` | `balance-hero.tsx` | ~150-unit deep-green hero: "Hesab balansı", currency chips, other currencies listed, never summed |
| `HomeHero`, `OverviewCard`, `HomeTaskList` | `screens/home/*` | Home only: the 28 px deep-green hero with the stacked-disc glow, the reserved 124 px illustration slot (`assets/images/libra-balance-hero.png`, a 420 px derivative of the supplied source) and the pistachio Quick Add; the 22 px overview card (tonal icon tile, one figure, caption, optional `ProgressTrack`, separately labelled aside, "Qeyd yoxdur" + action) whose module link and empty-state action are sibling controls, never nested; the compact task rows with the same checkbox semantics as `TaskRow` |
| `MetricItem` | `metric-item.tsx` | label + animated value with income/expense arrows |
| `QuickAction`, `QuickAddMenu`, `quickActionDefinitions`, `globalQuickActionDefinitions` | `quick-action.tsx`, `quick-add-menu.tsx` | 52-unit pills for the dashboard row, rows for menus; Quick Add = sheet on phones, anchored popover on wide layouts. Finance offers its own three money actions; Home and the Quick Add modal offer the global set (Xərc, Gəlir, Yemək, Tapşırıq, Yuxu, Köçürmə), filtered to what the user can actually do. "Yuxu" opens the sleep screen; it never starts or ends a session |
| `SectionHeader` | `section-header.tsx` | subheading + optional action link or caption |
| `TransactionRow`, `TransactionList`, `describeTransaction`, `transactionMeta` | `transaction-row.tsx` | category title, note/account/day metadata (no "Market · Market"), reserved amount + overflow width; swipe on native, overflow menu on web |
| `AccountItem` | `account-item.tsx` | icon tile, name, type metadata, balance |
| `BudgetProgress`, `ProgressTrack`, `budgetHealth`, `paceLabel` | `budget-progress.tsx` | limit status (Büdcə daxilində / Limitə yaxın / Büdcə aşılıb) separate from the pace comparison; elapsed-month marker on the track |
| `InsightCard`, `buildInsights`, `projectMonthEnd`, `compactAmount` | `insight-card.tsx` | "Gündəlik xərc": last 7 days with dates and values, limit / pace sentences, month-end estimate from the unrounded monthly total, "Tam ay" expander, unavailable + retry state |
| `SpendingBars`, `CategoryBreakdown` | `spending-bars.tsx`, `category-breakdown.tsx` | code-native charts; every elapsed day is an accessible element with date and value |
| `NutritionSummary` | `nutrition-summary.tsx` | compact day card: energy line with the remaining/exceeded difference, then protein / carbohydrate / fat side by side; with no target it shows the consumed amount and a "Hədəf təyin et" action instead of a percentage |
| `MealGroup` | `meal-group.tsx` | one meal of the day: icon, name, energy total, add control; an empty group keeps a single compact "add" row |
| `TaskRow` | `task-row.tsx` | one task: a 48 pt completion checkbox, a title that wraps to three lines, the day/time, a repeat marker, a labelled priority chip (glyph + word, never colour alone) and a separate 48 pt overflow control |
| `AccountEffect` | `account-effect.tsx` | what confirming will do to one account before it is done: name, balance → balance after (or "Balans dəyişmir" for an existing obligation), one spoken label; used by the recurring record sheet, the debt form and the payment sheet |
| `SleepStrip` | `sleep-strip.tsx` | seven local dates scaled to the tallest bar; a date with nothing recorded is a hollow slot that reads "Qeyd yoxdur", never a zero-height bar |
| `NutritionEntryRow` | `nutrition-entry-row.tsx` | food name (+ n), time and quantities, macros, energy; a separate 48 pt overflow control for copy and delete |
| `NutritionItemEditor`, `sanitizeDecimal` | `nutrition-item-editor.tsx` | one food: name, "Porsiya üzrə" / "100 q üzrə", quantity and the four nutrients per unit, with a live line showing what the item contributes |
| `FoodPhotoScreen` | `screens/nutrition/photo-analysis.tsx` | choose → preview → analyze → review → confirm; reuses `NutritionItemEditor`, `SegmentedControl`, `DateField`/`TimeField` and the totals card, so a reviewed estimate is edited with exactly the manual form's controls |
| `Skeleton`, `ListSkeleton`, `FormSkeleton`, `LoadingState`, `EmptyState`, `ErrorState`, `InlineError`, `StaleNotice` | `states.tsx` | skeletons mirror the final layout; errors distinguish offline (only when known), connection, server, validation; stale notice over cached data |
| `ToastProvider`, `useToast`, `showToast` | `toast.tsx` | one toast at a time, anchored above the navigation region, duplicates extend instead of stacking |
| `ConfirmProvider` + `confirmAsync` | `confirm-dialog.tsx`, `lib/confirm.ts` | accessible confirmation dialog for destructive actions |
| `TabBar`, `Sidebar` | `tab-bar.tsx`, `sidebar.tsx` | in-flow tab bar region (opaque canvas, owns the bottom safe area) with a floating pill inside; desktop sidebar with Quick Add |
| `BrandMark` | `brand-mark.tsx` | code-native Libra mark and wordmark |
| `AnimatedNumber` | `animated-number.tsx` | 400 ms ticker; accessible name is always the final value |

### Nutrition macros

`protein` / `carb` / `fat` are the muted bar and dot fills — three of them sit next to each other, so none of
them shouts. `proteinText` / `carbText` / `fatText` are the readable foregrounds for the figures beside those
bars (measured ≥ 4.5:1 on `surface`, `canvas` and the tinted summary; 4.79:1 light and 7.74:1 dark in the
captured run). `nutritionTint` and `nutritionTintBorder` are the summary's own surface. Nothing else may reuse
these: they name a nutrient, not a state.

### ProgressRing

A ring drawn with views, because the app has no SVG dependency: two half-discs rotate inside half-width clips
(`halfAngles` computes the two rotations, and is unit-tested). It takes a clamped 0–100 percentage, so an
exceeded target fills the circle instead of wrapping it, and the exact figures live beside it — the ring itself
is decorative with one accessible sentence. Reduced motion jumps to the final angle.

### Plan

`modulePlan` used to be `#3978E8` — the same value as `transfer`, a blue left over from before the green
rebuild and the only accent in the app that belonged to no palette. It is now the primary green (`#1E5345`
light, `#C9DD95` dark), so the Plan screen, the Quick Add "Tapşırıq" pill and the placeholder default align at
once instead of each gaining its own tint. A filled checkbox pairs it with `onPrimary`, never `onHero`, which
would be invisible on the dark palette's pistachio.

`DaySummary` (`screens/plan/day-summary.tsx`) is the daily-progress surface: the open count as a title, the
completed fraction as a caption, one `ProgressTrack` drawn only when there is something to be a share of, and
the overdue line kept separate. `TaskRow` carries a `RowContext` — `day`, `overdue` or `completed` — which
decides what its metadata may leave out, so no row prints a day its heading already names.

### The Fokus scene

`FocusScene` (`screens/plan/focus-scene.tsx`) is one deep forest surface (`heroGradientEnd`, 32 px continuous
radius) holding the hourglass, the ring, the countdown and the cycle markers as a single composition. The
countdown is 64 px tabular `onHero`; secondary labels are `onHeroMuted`; the ring and the active marker are
`accent`. Nothing new was added to the palette — it is the same hero vocabulary Home uses.

**Ambient light** is three drifting layers, each built from eight concentric discs of `heroGlow` at about a
fifth of its alpha. A flat circle reads as a disc and three stacked circles read as a bullseye; eight faint
steps read as light. Gradients are not guaranteed on every platform this app runs on, which is why the falloff
is built from views. The hourglass's shadow uses the same stepped trick, for the same reason.

**Motion** is decoration only: the lights drift over 11–13 s, the hourglass floats 5 px with a 1.5° tilt over
7 s and its shadow shrinks with it, and a completed run pulses the ring once. Every loop stops under Reduce
Motion, when the screen is not focused, and when the app is backgrounded. No animation callback advances the
timer or records anything — the worst a frozen scene can do is look still.

**Figure sizing.** A countdown ("24:59") and a result ("25 dəqiqə") cannot share a type size: the duration
set at 64 px overflows the ring. `describeFocus` therefore reports a `figureKind`, and the scene renders a
clock at 64 px and a duration at 30 px within the ring's width.

### The Fokus hourglass

`assets/images/focus-hourglass.png` is the supplied source and stays untouched; `focus-hourglass-card.png` is
the shipped derivative — cropped to the drawn content with a 3 % margin and resized to **169 × 264**, which is
3× its 88-unit display height and 61 KB instead of 1 MB. Unlike the square nutrition bowl this illustration is
**portrait**, so the derivative keeps its own 169 : 264 proportions and the slot is sized to match (56 × 88);
`contain` then has nothing to letterbox and the artwork can neither stretch nor clip.

`focus-hourglass-scene.png` (276 × 432) is the larger derivative the scene uses at 144 units;
`focus-hourglass-card.png` remains for anything needing the compact 88-unit size. Same conventions as the
other bundled illustrations: `require` the derivative, reserve the slot with fixed width and height,
`resizeMode="contain"`, `fadeDuration={0}`, `accessible={false}` inside an `aria-hidden` /
`importantForAccessibility="no-hide-descendants"` wrapper. Its alpha edge was measured before use — of 1 124
semi-transparent pixels none is near-white — so it sits cleanly on `canvas` in both palettes.

It appears in exactly two states, **ready** and **completed**, and the slot is reserved in *every* state, so
starting or finishing a phase does not move the dial beneath it (measured: the countdown stays at y 364 in all
three). A running or paused phase shows no illustration at all. The entrance is the shared `Entrance` with
`from="fade"` — a fade Reduce Motion keeps as-is — and the hourglass itself never moves: no rotation, no
bounce, no simulated sand. The countdown and the ring are drawn in code, never by the image.

### The empty-diary illustration

`assets/images/nutrition-empty-bowl.png` is the supplied source and stays untouched;
`nutrition-empty-bowl-card.png` is the shipped derivative — cropped square around the drawn content (the source
carries ~14 % transparent padding on each side) and resized to 264 px, which is 3× its 88-unit display size and
83 KB instead of 1 MB. Same convention as Home's `libra-balance-hero.png`: `require` the derivative, reserve the
slot with fixed width and height so nothing shifts while the bitmap decodes, `resizeMode="contain"`,
`fadeDuration={0}`, and `accessible={false}` inside an `aria-hidden` /
`importantForAccessibility="no-hide-descendants"` wrapper. Its alpha edge is clean — no light matte — so it sits
on `surfaceSubtle` in both palettes; its drop shadow simply disappears in the dark one. It appears in exactly one
place: the diary of a day that **loaded** with no entries. Never on loading, never on an error, never as a
thumbnail for a logged meal, and never repeated per empty meal group. The entrance is the shared `Entrance`
(`from="scale"`, mount only, fade-only under Reduce Motion); there is no idle float.

### WeekStrip

Seven day cells around the selected day with the shared `CalendarSheet` behind a calendar button. The window
slides so it never runs past today, which puts today last whenever the selection is inside the current week.
Selected and today are separate states (today keeps a 1.5 px ring when another day is chosen). It is a
`radiogroup` with `aria-checked` and roving arrow keys, and no cell claims to know whether a day holds entries:
the day endpoint is fetched one day at a time, so a "has entries" dot would be invented rather than read.

## Accessibility semantics

**Selection state travels on `aria-*` props, never on `accessibilityState`.** react-native-web 0.21 removed
`accessibilityState` from its supported props: only the individual `aria-*` attributes (and their deprecated
singular `accessibility<State>` forms) reach the DOM, so `accessibilityState={{ checked }}` renders no state at
all on the web. React Native merges `aria-checked` / `aria-selected` / `aria-disabled` back into
`accessibilityState` (`Pressable.js`, `View.js`), so the aria prop is the single form that is correct on both
platforms. `src/mobile/src/lib/a11y.ts` documents this and holds the keyboard helpers.

Each control follows the WAI-ARIA pattern that matches what it does
([APG](https://www.w3.org/WAI/ARIA/apg/patterns/)):

| Control | Pattern | Web semantics | Keyboard |
|---|---|---|---|
| `SegmentedControl`, `CategoryField` chips, `BalanceHero` currency chips | Radio group | labelled `radiogroup`; items `radio` + `aria-checked`; roving `tabIndex` | Tab in / out once, arrows move focus **and** the selection, Space checks |
| `SelectionSheet`, `CategorySheet` | Radio group in a dialog, with a pending selection | labelled `radiogroup`; rows `radio` + `aria-checked` on the **pending** row | arrows move focus and the checked row, Space / Enter commits to the field, Escape discards |
| `CalendarSheet` | Date picker in a dialog, with a pending day | `radiogroup`; days `radio` + `aria-checked`; today `aria-current="date"` | ±1 day with left/right, ±1 week with up/down, Home/End ends of the week, Space / Enter commits |
| `FilterToggle` | Checkbox | `checkbox` + `aria-checked` | Space and Enter toggle |
| `TabBar`, `Sidebar` | Navigation | `<nav>` landmark of `link`s with `aria-current="page"` | each destination is its own tab stop |

Rules that follow from the table:

- A radio group is **one** tab stop: only the checked item has `tabIndex={0}`.
- The checked radio always follows focus, as the pattern requires. In the dialog pickers what follows focus is a
  **pending** selection: the owning form field changes only on commit (Space, Enter or a tap), Escape discards the
  pending value and leaves the field alone. Each dialog mounts its body only while open, so the pending value —
  and the calendar's displayed month — reset to the committed value on every open, without a state-syncing effect.
- `CalendarSheet` is a radio group, not an ARIA grid: its DOM holds `radiogroup` + `radio` day cells with no
  `row`, `gridcell` or table ancestors, and `grid`/`row`/`gridcell` are missing from React Native's
  `accessibilityRole` union, so a grid would exist on the web only.
- Space is wired explicitly. react-native-web's `PressResponder` accepts Space only for `<button>` and
  `role="button"`, so `radio` and `checkbox` controls would otherwise answer to Enter alone.
- Route navigation never uses `tab` semantics on the web: a `tab` without a `tabpanel` is a promise the app does
  not keep. Native keeps `tablist` / `tab` for the bottom bar, which is the iOS and Android convention — a
  deliberate platform mapping, not two contradictory states.
- Disabled choices carry `aria-disabled`, are not focusable (`tabIndex={-1}`), and the arrow keys skip them.
- A group contains only its own members: the "Hamısı" sheet trigger sits beside the category chips, not inside
  their radio group.

## Formatting

`lib/money.ts` is the single display formatter: `formatNumber` / `formatMoney` use the interface language's
separators (`UI_LOCALE = 'az-AZ'` → `1.234,56`; the table also pins tr/de/ru/en because ICU data is incomplete),
always two decimals, ISO code after the number, on native and on web alike. The signed-in layout sets
`setDisplayLocale(UI_LOCALE)`; the stored "Dil" preference no longer switches separators on its own, so the
dashboard, rows, chart labels and the amount field's `0,00` placeholder (built from `separatorsFor()`) always
agree. The layout also stores the profile time zone (`setProfileTimeZone`) for `todayInProfileZone`.
Input parsing (`parseAmount`, `sanitizeAmount`, `parseDecimalInput`) accepts both separators and stays separate from
display. Nutrition figures use the same locale separators through `lib/nutrition.ts`: energy as whole `kkal`
(`formatKcal`), macros with one decimal and the `q` unit (`formatGrams`), quantities as entered
("2 porsiya", "150 q"). Stored values keep their two decimals; only the display is rounded.

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
