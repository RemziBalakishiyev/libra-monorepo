# Mobile UX

Libra is one calm application with several life modules. The production interface (Phase 2.5B, refined) is
light-first, data-rich and tactile: canvas `#F5F7FB`, white surfaces where grouping needs them, one deep-indigo
brand moment (the Finance balance hero), and semantic green / red / blue for income / expense / transfer. Tokens
and components are documented in [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).

## Adaptive shell

- **Phone (compact) and tablet (medium)**: a five-destination tab bar (Ana səhifə, Maliyyə, Qidalanma, Plan, AI)
  laid out in the normal flow under the scene. Its region is an opaque canvas-coloured band that owns the bottom
  safe area; the floating pill with the sliding indicator sits inside it. Because the region reserves its own
  space, scrolled content and focused controls can never sit behind the bar, including with enlarged text.
- **Quick Add** lives in the screen headers: a primary "+" on Home (once Finance is set up) and on the Finance
  dashboard, plus the three pills (Xərc, Gəlir, Köçürmə) on the dashboard itself. On phones it opens a bottom
  sheet; on tablet/desktop an anchored popover next to its trigger. Transfer with fewer than two accounts explains
  the prerequisite and offers "Hesab yarat".
- **Desktop web (wide, ≥ 1024 px)**: a persistent left sidebar with the brand, the five destinations, the one Quick
  Add button (the header "+" is not rendered), and profile / sign-out. The bottom bar is never shown on desktop.
  Content is centred at a readable maximum width; dashboard and form screens use two-column compositions.
- Native headers are disabled: every screen renders its own `ScreenHeader` (dense screens use the compact size).
- Overlays (sheets, dialogs, popovers) dismiss from the scrim, the close control and Escape; on web focus moves in,
  Tab stays inside, and focus returns to the trigger on close.

## Authentication

- Session restoration shows a short brand moment while stored tokens are read; the root layout then renders
  exactly one route group through `Stack.Protected`.
- Login and registration share `AuthFrame`: brand mark and wordmark, the value statement ("Maliyyə, qidalanma,
  yuxu və planlar — hamısı bir sakit tətbiqdə."), a subtle tinted wash, and a focused white form card. Fields sit
  12 units apart; validation grows the card naturally instead of reserving empty rows. Password fields have a
  show/hide control; server Problem Details render in an alert banner; the primary button shows a loading state.
- On Expo Web the tokens fall back to localStorage, which is acceptable for development and testing only (D-024).

## Home

Greeting with the current date (long names wrap to two lines), Quick Add and profile in the header, a "Bu ay"
card that keeps **account balance** ("Hesab balansı", all included accounts in the dashboard currency, other
currencies listed separately) apart from **this month's cash flow** (Gəlir / Xərc / Xalis axın), and a quiet
module list: Maliyyə with a chevron, the upcoming modules as small rows marked "Tezliklə" — consistent with their
placeholder screens. Before Finance exists the card becomes the setup invitation and Quick Add is hidden. A failed
refresh over cached data shows a stale notice instead of hiding the numbers.

## Finance

- **Dashboard** (flagship), phone order: compact header with the month; the ~150-unit balance hero with currency
  chips; income / expense / net cash flow with the daily average; a 52-unit row of Xərc / Gəlir / Köçürmə pills;
  the compact overall budget (limit status label + bar + remaining); **recent transactions** (their first row is
  visible above the tab bar at 390 × 844 with normal text); then "Gündəlik xərc" — the last seven days with real
  dates and values, the month and currency stated, one sentence on **limit usage** and one on **pace versus the
  calendar** (a comparison, never a promise), a month-end estimate computed from the unrounded monthly total
  ("Bu orta davam etsə, ay sonu xərc təxminən … olar."), and "Tam ay və ətraflı" for the whole-month
  strip; then accounts, category breakdown and links. Desktop: hero, summary, actions and recent transactions in
  the main column; budget (with the pace line), insight, accounts and categories in the side column.
- The daily series is built from **every** expense of the month (all API pages, cents arithmetic, days bucketed in
  the profile time zone). If any page fails, the monthly totals from the dashboard aggregate stay and the daily
  breakdown is marked unavailable with a retry; a partial first page is never shown as a complete month.
- **Create / edit transaction** (flagship): Xərc / Gəlir segmented control (tonal pill with icons, distinct from a
  validation outline), a 40 px amount with the decimal keyboard (comma or point) and a short shake on an invalid
  submit, account through a selection sheet, the **category field** (current choice, up to six shortcut chips —
  this month's most used first when known, otherwise the configured order — and "Hamısı" opening a searchable
  sheet), the localised date, an optional note, and the budget-impact note in the normal flow. Editing removes the
  original amount's contribution before comparing (same category / overall budget, same month) and shows no impact
  outside the dashboard month. The comparison baseline is frozen when a submission starts, so the save's own cache
  invalidation never makes the preview count the committed amount twice. An invalid submit scrolls to the first invalid field and announces the message.
  Success: readable check + label in the submit control (never dimmed), one haptic on native, navigation back
  after ~550 ms, and **one** toast on the destination screen, above the navigation region. Leaving the screen
  clears the timer.
- **Lists** (transactions with a compact filter row and load-more, accounts with a compact archive chip,
  transfers, budgets with the pace line for the current month, categories) use list-shaped skeletons, empty
  states with the next useful action, error states with retry, and pull to refresh. Transaction rows show the
  category as the title and the note (when it adds information), account and day underneath; the amount column
  and the overflow control have reserved width. Delete confirmations name the record: "Market · 24,50 AZN · Nağd".
- **Forms** (setup, account, transfer, budget, category) share the same field components and the same success /
  toast timing; immutable fields are shown locked with an explanation; deletion always asks for confirmation.
- Multi-currency: amounts always carry their currency; nothing is summed across currencies; net cash flow is never
  presented as a balance.

## Profile

Identity, then "Seçimlər": name, and readable selectors for language ("Azərbaycan dili"), currency ("Azərbaycan
manatı (AZN)") and time zone ("Bakı (UTC+4)"). The underlying codes stay exactly what the API validates; a value
outside the presets is kept and shown as "Cari dəyər". The API URL and technical status sit in a collapsible
"Diaqnostika" section. The save footer never covers the last field.

## Placeholder modules

Qidalanma, Plan and AI render the shared placeholder composition (module accent, code-native illustration,
"Tezliklə", an honest description and an "upcoming" list). They contain no data and no actions.

## Copy and formatting

- UI copy is Azerbaijani (`az-AZ`); code identifiers stay English.
- Dates: `formatLongDate` ("6 sentyabr 2026"), `formatShortDate` ("6 sen"), `formatRelativeDay` ("Bu gün",
  "Dünən"); raw ISO dates never appear in the UI. Day bucketing for the daily series uses the profile time zone.
- Money: one locale-aware formatter (`lib/money.ts`), two decimals and an explicit code: "1.234,56 AZN" for az-AZ.
  Dashboard figures and form values agree.

## Required states

Every data-backed screen implements loading (skeleton shaped like the final layout), empty, error with retry,
validation, submitting and success, with keyboard-safe layouts for forms. Errors distinguish "no internet" (only
when the platform reports being offline), "could not reach the server", server errors and rejected requests. A
failed refresh over cached data keeps the data and shows a stale notice. Reduced motion is respected everywhere.

## Motion

Reanimated on the UI thread: 110 ms press feedback (3 % scale), 160 ms selection changes, 220 ms section
entrances with a short stagger (≤ 5 slots, mount only — never replayed by refetches), 240 ms indicator movement,
260 ms sheets and popovers, 400 ms value tickers / progress fills / bar reveals, layout transitions for list
insertions and removals, an amount shake on invalid submits and a success check state. Reduced motion removes
shakes, travel, counting, shimmer and stagger; final values show directly with at most a brief fade. Screen
readers hear one announcement per value change, not every animated frame. Haptics: one success notification on
native after a confirmed save.

## Accessibility

- Roles and labels on every control; 48 pt touch targets; hit slop on small icon buttons.
- Income / expense / transfer are readable by sign and icon, never colour alone; budget status carries an icon
  and a label; validation messages are alerts and the field's hint; success is announced politely.
- Sheets and dialogs move focus in, contain Tab, close on Escape and restore focus on close (web).
- AA contrast for meaningful text on every surface in both palettes (measured pairs in DESIGN-SYSTEM.md); text
  scaling is supported (no fixed heights on text; the navigation region grows with its content).
