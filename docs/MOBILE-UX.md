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
module list: Maliyyə and Qidalanma with their own row — Qidalanma shows today's real figure ("445 / 2.200 kkal",
or the consumed energy when no target is set, or "Bu gün qeyd yoxdur") — and the upcoming modules as small rows
marked "Tezliklə", consistent with their placeholder screens. Under the module list sits a compact **Yuxu**
card: the running night's elapsed time, or the last recorded night, or "Hələ qeyd yoxdur". It reports and opens
the sleep screen — it never starts or ends a session, and it does not tick, so nothing on Home announces itself. Before Finance exists the card becomes the setup
invitation, while Quick Add stays available and offers only what the user can do (a meal needs no account). A
failed refresh over cached data shows a stale notice instead of hiding the numbers.

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
- **Təkrarlananlar** and **Borclar** are two more soft buttons in the dashboard's links row (with Köçürmələr,
  Büdcələr, Kateqoriyalar), so the first fold and the five tabs do not change. When the month holds principal
  movements or open debts, the summary card gains one or two caption rows under the daily average: "Borc
  hərəkətləri (gəlir/xərc deyil)" with the month's cash change, and "Alacaq · Borc · gecikib" with the labelled
  "Xalis mövqe (nağd + alacaq − borc)". "Xalis axın" stays income − expense.
- **Təkrarlananlar**: month navigation (previous / next, "Bu ay"), a two-column totals card (Gözləyir / Qeyd
  olunub per currency), then one row per plan with its due day, account, a status chip (Gözləyir / Qeyd olunub /
  Buraxılıb) and the actions that fit the state: "Ödənişi qeyd et" or "Gəliri qeyd et" and "Burax" while
  pending; "Əməliyyata bax" and "Geri al" once recorded; record again once skipped. Nothing on the screen moves
  money except the sheet's "Təsdiqlə və qeyd et". The **record sheet** pre-fills the plan's amount and account
  and the actual date (the due date once passed, otherwise today), limits accounts to the plan's currency,
  shows `AccountEffect` (balance → after) and states that one ordinary transaction will be created; a failed or
  conflicting submit keeps the sheet open with the typed values. The **template form** is compact: Xərc / Gəlir,
  name, monthly amount, account (the currency comes from it), category, day of month via a selection sheet (days
  29–31 explain the short-month rule), start and optional end date, note, an explainer that nothing is automatic,
  and — when editing — "Şablonu dayandır" (confirmed; history kept, unrecorded months never marked paid) and
  "Şablonu sil" (refused with an explanation once the plan has history).
- **Borclar**: a segmented control for "Mənə borcludurlar" / "Mən borcluyam", a "Bağlananlar da" chip, a compact
  strip with the remaining balance per currency and an overdue chip — from the server summary, never a sum of
  the rows on screen — and counterparty rows with the remaining amount over the principal, "Son tarix: …" or
  "Gecikib · N gün" (overdue is the server's verdict), and "Qismən ödənilib" progress. The **debt form** is
  explicit about cash: "Artıq mövcuddur" records an obligation and changes no balance; "İndi verirəm / İndi
  alıram" requires an account, takes the currency from it and shows the opening effect. Principal and opening
  date lock once a movement exists (explained inline); name, due date and note stay editable; deletion is offered
  only while nothing has moved. The **debt detail** shows the remaining balance, status and due chips, principal /
  paid / opened facts, a sentence that a receivable is not cash, the payment action (hidden once settled) and the
  history with reversed rows struck through. The **payment sheet** defaults to the full remaining amount, limits
  accounts to the debt's currency, shows `AccountEffect` and "Qalıq: X → Y", refuses more than the remaining
  balance before sending, and keeps its values on a conflict. Undo asks for confirmation naming the amount and the
  account, then restores the remaining balance and the account balance together.

## Profile

Identity, then "Seçimlər": name, and readable selectors for language ("Azərbaycan dili"), currency ("Azərbaycan
manatı (AZN)") and time zone ("Bakı (UTC+4)"). The underlying codes stay exactly what the API validates; a value
outside the presets is kept and shown as "Cari dəyər". The API URL and technical status sit in a collapsible
"Diaqnostika" section. The save footer never covers the last field.

**Görünüş** sits below the preferences as its own section: one segmented control with **Açıq**, **Tünd** and
**Sistem** (icon and word each), and a caption that says what the choice means — for Sistem, also what it
resolves to right now ("Hazırda: tünd"). It is a device setting, not a profile field: it applies the moment it
is tapped, needs no "Yadda saxla", is stored on the phone rather than the account, and changing it never remounts
the form — a half-typed name and a pending save survive it. A fresh install is light whatever the phone is set
to; an explicit choice stays put while the OS changes; Sistem follows the OS, including after returning from
the background.

## Qidalanma (nutrition)

- **Diary**, phone order: "Qidalanma" header with the goals and add controls; day navigation (previous / next
  plus a calendar, future days blocked); the compact day summary (energy with the remaining or exceeded
  difference, then protein / carbohydrate / fat); then the four meal groups — **Səhər yeməyi**, **Nahar**,
  **Axşam yeməyi**, **Ara yemək**. The first meal row is visible above the tab bar at 390 × 844 with normal text.
  Populated groups show their energy total and their entries; empty groups keep one compact "add" row; a day with
  nothing recorded shows a single explanation with "İlk yeməyi əlavə et" instead of four empty cards.
- **Entry row**: the first food's name (+ n for the rest), time and quantities, the macros, and the energy. The
  row opens the entry; a separate overflow control offers Düzəliş et / Başqa günə köçür / Sil.
- **Add / edit**: meal type (preset from the group it was opened from, otherwise from the time of day), date and
  time, then one food card — name, "Porsiya üzrə" or "100 q üzrə", quantity and the four nutrients for that unit —
  with a live line for the item and a "Cəmi" card for the meal. Extra foods and the note are progressive
  disclosure ("Başqa yemək əlavə et", "Qeyd əlavə et"). Validation sits under its field, an invalid submit scrolls
  to the block that failed, and a failed request keeps everything typed.
- **Copying** a meal opens an editable draft on the chosen day; nothing is written until it is saved, the copy is
  a new entry with its own ids, and the source is never modified.
- **Goals**: kcal and macro targets, each of which may be left empty ("İzlənmir"). The screen states that a change
  applies from today onwards and lists the history, so earlier days visibly keep the targets they used.
- **Şəkildən əlavə et** (photo analysis) sits beside the manual actions — in the diary header and in the empty
  state — and never replaces them. Finance's three money actions and the global Quick Add's "Yemək" are
  untouched. The sequence is short and each step is reversible: **choose → preview → analyze → review → confirm**.
  - Before anything is sent, one sentence says the photo goes to Libra's server for AI evaluation and that the
    result is an estimate until it is confirmed. The camera button appears only where there is a camera; the web
    offers "Şəkil seç". A denied permission is explained, with the manual form one tap away.
  - The preview is the picked picture, replaceable at any time — including while an analysis is running, which
    aborts the old request. Progress is an indeterminate "Şəkil təhlil edilir…"; no percentage is invented.
  - The review is the manual form with the estimate filled in: a modest thumbnail, an "AI təxmini" badge, the
    model's own confidence stated as its own assessment, its note, the same food editor, live totals, and
    add/remove. A nutrient the model could not judge is **empty**, so the ordinary "Dəyər daxil edin" validation
    asks for it instead of confirming a zero.
  - Only **"Təsdiqlə və əlavə et"** writes a meal. A successful analysis alone saves nothing, cancelling discards
    the draft and its picture, a failed confirmation keeps every edit and can be retried safely, and success shows
    exactly one toast on the diary.
  - Each failure says what happened: unavailable, timed out, too many analyses, picture rejected, no food in the
    picture, not clear enough, no connection. Every one of them keeps "Əl ilə əlavə et" in reach.

## Plan (tasks)

- **Three views** behind one segmented control: **Bu gün**, **Qarşıdakı** and **Tamamlananlar**. They are
  disjoint, so a task is in exactly one of them and never appears twice in a view.
- **Bu gün**, in order: the compact summary ("2 / 5 tamamlanıb" with a quiet progress bar and, when there is one,
  "n gecikmiş tapşırıq"); then the labelled **Gecikmiş** section, each row showing the day it was actually
  planned for ("Gecikib · 5 sen"); then today's own tasks. A day with nothing on it shows one explanation and
  "İlk tapşırığı əlavə et" instead of empty sections. At 390 × 844 the first real task row sits at 303 pt, well
  above the navigation region at 766.
- **Qarşıdakı** groups by day under a heading that names it twice over ("Sabah · 9 sentyabr 2026");
  **Tamamlananlar** lists finished work newest first. Both page with "Daha çox".
- **Task row**: a 48 pt completion checkbox, the title (wrapping to three lines rather than being cut to a stub),
  the day and time, a "Təkrarlanan" marker when it belongs to a schedule, a labelled priority chip, and a
  separate 48 pt overflow control. Priority is a glyph **and** a word — never colour alone.
- **Creation is fast**: "Yeni tapşırıq" opens with the title focused, today's date and Normal priority already
  chosen. **Saat**, **Qeyd** and **Təkrarlanma** are disclosures, so the first screen is one field long.
  Recurrence offers only "Təkrarlanmır", "Hər gün" and "Həftəlik" (with weekday chips and an optional end date).
  Task dates are unrestricted — a plan is about the future — while Nutrition keeps its own "not after today" rule.
- **Editing** a task edits that one day. An occurrence of a schedule says so plainly and points at the Plan
  screen's own "Təkrarlanmanı dayandır" for the series, so "change this day" and "change every day" are never
  confused. Validation sits under its field, an invalid submit reveals **and focuses** the first invalid one, and
  a failed request keeps everything typed.
- **Completion** sends the state the control moved to, never a toggle, and the row is disabled until the answer
  arrives so a double tap cannot send twice. Nothing is assumed locally: a failure shows a message and the row
  stays exactly as it was. Deletion asks first, naming the task.
- **States**: loading skeletons, the empty day, an all-done day, an error with retry, and a stale notice that
  keeps the cached figures on screen after a failed refresh.

## Yuxu (sleep)

- **One screen, three states.** *Nothing running*: the last recorded night (or a short empty state) with
  "Yatmağa başla". *Running*: the start time, the elapsed figure, a line saying the length is computed from the
  start time and continues while the app is closed, and a prominent "Oyandım". *Just recorded*: the night's
  length, its optional rating, and a way into the correction form. At 390 × 844 "Oyandım" ends 259 pt down an
  844 pt viewport, well within the first fold.
- **The elapsed figure is plain text.** It is recomputed from the stored start instant every half minute and
  carries a spoken name ("Keçən vaxt: 7 saat 30 dəqiqə"), but deliberately **no** live region — a number that
  changes on its own must not interrupt a screen reader. Only lifecycle changes ("Yuxu başladı", "Yuxu qeyd
  olundu") are announced, once each.
- **"Oyandım" captures the moment, then sends it.** If the request fails, a banner names the captured time
  ("07:15 oyanışı hələ göndərilməyib") and offers "Yenidən göndər"; the retry sends that same instant, so a late
  reconnection cannot lengthen the night. Nothing is shown as recorded until the server agrees.
- **Son 7 gün** is a seven-bar strip in the module accent. A date with nothing recorded is a hollow slot that
  reads "Qeyd yoxdur" — never a zero-height bar, which would claim the user slept no minutes at all. The average
  underneath always names its denominator: "Orta: 7 s 30 d · 3 gün üzrə".
- **History rows** show the wake day, the length, the interval and the rating; each opens the correction form and
  carries its own 48 pt delete control. Deletion asks first, naming the interval.
- **Manual entry and correction** share one form: "Yatma tarixi" / "Yatma saatı" and "Oyanma tarixi" /
  "Oyanma saatı" (labelled apart so a screen reader can tell them from each other), a live "Müddət: 7 s 30 d",
  the optional 1–5 rating named in words beside the number, and a note. It opens on the eight hours before now,
  which are always in the past. Validation sits under its field, an invalid submit reveals the first bad one, and
  a failed request keeps everything typed.
- **A forgotten night** opens as still running, explains the three honest ways out — write a real wake-up time,
  fix the start and keep it running, or discard it — and states that the length is never shortened for the user.
- **Xatırlatma** is one optional local reminder. Permission is asked in the moment the switch is turned on; a
  denial turns the switch back off with a plain message and leaves tracking untouched. The row says what the
  reminder can and cannot do — one device, the system decides the exact moment, no cancelling from elsewhere —
  and on the web it says plainly that the browser has none.
- **Quick Add "Yuxu"** opens this screen and nothing else. Opening Quick Add never starts or stops a session.
  Finance's own Quick Add keeps exactly its three money actions.
- **States**: loading skeletons, the empty week, an error with retry, a stale notice that keeps cached figures on
  screen after a failed refresh, and the pending-wake banner.

## Placeholder modules

AI renders the shared placeholder composition (module accent, code-native illustration, "Tezliklə", an
honest description and an "upcoming" list). It contains no data and no actions.

## Copy and formatting

- UI copy is Azerbaijani (`az-AZ`); code identifiers stay English.
- Dates: `formatLongDate` ("6 sentyabr 2026"), `formatShortDate` ("6 sen"), `formatRelativeDay` ("Bu gün",
  "Dünən"); raw ISO dates never appear in the UI. Day bucketing for the daily series uses the profile time zone.
- Money: one locale-aware formatter (`lib/money.ts`), two decimals and an explicit code: "1.234,56 AZN" for az-AZ.
  Dashboard figures and form values agree.
- Nutrition: energy as whole `kkal` and macros with one decimal and the `q` unit ("445 kkal", "22,1 q"), using the
  same locale separators; quantities read the way they were entered ("2 porsiya", "150 q").

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
- Sheets and dialogs move focus in, contain Tab, close on Escape and restore focus to the trigger on close (web).
- Selection is exposed through the pattern that matches the control — radio groups for mutually exclusive choices
  (segments, chips, sheet lists, calendar days), a checkbox for filters, links with `aria-current="page"` for the
  navigation — and every group is a single tab stop traversed with the arrow keys. Inside a picker dialog the
  arrows move a pending choice: the field behind it changes only when the user commits, and Escape discards. See DESIGN-SYSTEM.md,
  "Accessibility semantics"; the rendered roles and states are verified in `docs/screenshots-3a-a11y/`.
- AA contrast for meaningful text on every surface in both palettes (measured pairs in DESIGN-SYSTEM.md); text
  scaling is supported (no fixed heights on text; the navigation region grows with its content).
