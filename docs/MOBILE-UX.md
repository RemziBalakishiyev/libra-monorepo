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

A personal daily overview (redesigned 2026-09-18), in this order:

- **Compact header**: today's date in the **profile time zone** ("Cümə, 18 sentyabr"), "Salam, Rəmzi" from the
  first word of the stored name (the e-mail's local part when there is none; long names wrap to two lines), and
  a 44-unit initials avatar that opens Profile and is labelled with the full stored name.
- **Hero** (28 px radius, 160–185 units at default text): the deep-green surface, a restrained pistachio glow
  behind the balance illustration on the right, "Gününə bir baxış", and **one line derived from real data** —
  today's remaining tasks with the overdue count kept apart ("Bu gün 2 tapşırıq qalıb · 1 gecikib"), "Bu günün
  N tapşırığının hamısı tamamlanıb", or the neutral "Bu gün üçün hələ qeyd yoxdur." No insight, score, streak or
  assessment is invented. "Qeyd əlavə et" opens the existing global Quick Add sheet and replaces the header's
  plus on phones; on the desktop shell the sidebar already offers Quick Add, so the hero has no button. Under
  ~340 logical units the action drops below the row so its label never wraps beside the picture.
- **Four overview cards** in two columns at normal phone widths, one column when the window is narrower than
  360, text is enlarged past 115 %, or the balance is 12 characters or longer (so a large amount gets a wider
  card rather than smaller text): **Maliyyə** — the account balance and its code, "Balans · bu ayın xalis
  axını …" as the one secondary figure, other currencies as a separate "Ayrıca …" chip, never summed;
  **Qidalanma** — today's energy against the target with a bar ("960 / 2.200 kkal", "1.240 kkal qalıb"), or
  the consumed energy alone with "hədəf təyin edilməyib"; **Plan** — completed / scheduled for today with a
  bar, the overdue count as its own warning chip; **Yuxu** — the last recorded night and its day, "Davam edir"
  with the elapsed time for a running one. A missing record reads **"Qeyd yoxdur"** with the relevant action
  (Maliyyəni quraşdır, Yemək əlavə et, Tapşırıq əlavə et, Yuxu əlavə et); a genuine zero is a number; a
  recorded night shorter than a minute reads "1 dəq-dən az", never "0 d" or "1 d". Each card opens its module;
  the card link and the empty-state action are sibling controls. Loading shows bones inside the card, a failed
  module shows "Yüklənmədi" with its own retry while the other cards keep their figures, and a failed refresh
  over cached data shows the stale notice.
- **Bu günün tapşırıqları**: up to three rows — overdue first with the day they were planned for, then today's
  pending, then completed — with the same checkbox semantics as Plan's rows and the same completion mutation;
  "Daha N tapşırıq" opens Plan; no tasks offers "Tapşırıq yarat".
- Nothing on Home advertises the AI assistant; it stays a tab with its placeholder.

Motion: the header, hero, cards and task list enter with a 320 ms fade and 10 px rise, staggered 32 ms; cards and
the hero action press to 0.98; the illustration drifts 3 px over seven seconds only while Home is focused and the
app is in the foreground; progress bars move only when committed data changes. Reduced motion keeps the fades and
removes the rise, the drift and the stagger. Money is never animated from zero and nothing replays on a refetch.

## Finance

- **Dashboard** (flagship, refined 2026-09-18), phone order: compact header with the reporting month and the
  add action; the ~150-unit balance hero with currency chips (other currencies listed as "Ayrıca …", never
  summed); the **cash-flow block** — "Bu ayın pul axını · Sentyabr 2026", Gəlir and Xərc side by side, then
  "Xalis axın (gəlir − xərc)" as its own labelled line and the daily average (a 5 000 AZN balance with 0,00 income
  is a valid, unremarkable state); the 52-unit row of Xərc / Gəlir / Köçürmə pills; the budget — a tonal row
  with "Büdcə yarat" when none exists, the existing progress, pace and over-budget treatment when one does;
  **recent transactions** grouped under BU GÜN / DÜNƏN / date headings (rows keep category, note, account and
  the signed amount, with an overflow control on every platform and swipe as a native shortcut), or a compact
  "Hələ əməliyyat yoxdur" line with an add action; then "Gündəlik xərc" — the last seven days with real dates
  and values, the month and currency stated, one sentence on **limit usage** and one on **pace versus the
  calendar** (a comparison, never a promise), a month-end estimate computed from the unrounded monthly total,
  and "Tam ay və ətraflı" for the whole-month strip. A loaded month with **no expense** shows a compact
  explanation with "Xərc əlavə et" instead of seven empty bars or a 0,00 forecast; loading shows bones; a failed
  series says so with a retry while the aggregate totals stay. Then accounts, the category breakdown and the
  **İdarəetmə** list (Hesablar, Köçürmələr, Büdcələr, Kateqoriyalar, Təkrarlananlar, Borclar) on one surface.
  Desktop: hero, flow, actions and recent transactions in the main column; budget, insight, accounts,
  categories and management in the side column. The top safe area is owned by the screen's opaque root, so the
  header never sits under the status bar and scrolled content never appears behind it.
- The daily series is built from **every** expense of the month (all API pages, cents arithmetic, days bucketed in
  the profile time zone). If any page fails, the monthly totals from the dashboard aggregate stay and the daily
  breakdown is marked unavailable with a retry; a partial first page is never shown as a complete month.
- **Create / edit transaction** (flagship): Xərc / Gəlir segmented control (tonal pill with icons, distinct from a
  validation outline), a 40 px amount with the decimal keyboard (comma or point, placeholder `0,00`) and a short
  shake on an invalid submit, the **category field** directly under it (current choice, up to four shortcut
  chips that wrap at 44 units — this month's most used first when known, otherwise the configured order — and an
  obvious "Hamısı" opening a searchable sheet), then a **TƏFƏRRÜATLAR** section with the account (selection
  sheet), the date (the shared calendar, which dismisses the keyboard before opening) and the optional note, and
  the budget-impact note in the normal flow. The save button lives in the sticky footer inside the keyboard-
  avoiding view, so it stays reachable above the keyboard; a failed request keeps every entered value. Editing removes the
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

- **Diary**, phone order: the "Qidalanma" header with a single "Hədəflər" action; the seven-day strip (the days
  around the selected one, never past today, with a calendar button for anything older); the tinted day summary;
  then the four meal groups — **Səhər yeməyi**, **Nahar**, **Axşam yeməyi**, **Ara yemək**. The summary and the
  first group are both visible at 390 × 844 with normal text. Populated groups show their real energy total and
  their entries; empty groups keep one compact "Qeyd yoxdur — əlavə edin" row; a day with nothing recorded adds
  one short line above the groups — the 88-unit bowl illustration and one sentence — rather than replacing them
  with an empty state. That line appears only once the day has *loaded* empty: loading is a skeleton and a failed
  request is an error, and neither shows the illustration. Manual entry is the primary bottom action
  ("Yemək əlavə et"); "Şəkildən" sits beside it as the quiet one.
- **Day summary**: one softly tinted surface. The consumed energy, the configured target and the labelled
  remaining or exceeded amount, with a modest ring beside them. The ring draws logged energy ÷ the actual
  target; past the target the arc is clamped to a full circle while the exact figure and "… artıq" stay
  readable — reaching a target is never a completion state. Without a target there is no ring and no
  percentage, only the consumed figure and a compact "Hədəf təyin et". Each macro is a row of name, grams,
  target when there is one, and a thin bar; each macro goal is independently optional and an untracked macro
  still reports its grams ("0,0 q · hədəf yoxdur"). A loaded-but-empty day keeps its real zero and says so
  ("Sıfır — hələ heç nə qeyd olunmayıb."), which is not the same as loading, an error, or a genuine zero.
- **Entry row**: the meal-type icon (a stored entry exposes no durable image, and a photo-analysis draft's
  temporary URL is not a thumbnail the diary may keep showing), the first food's name (+ n for the rest), the
  time and one portion summary, and the aligned energy. The three macro figures are spoken in the accessible
  name instead of being crammed into the line. The row opens the entry; a separate overflow control offers
  Düzəliş et / Başqa günə köçür / Sil. At enlarged text the energy figure moves onto its own line.
- **Add / edit**: meal type (preset from the group it was opened from, otherwise from the time of day), a
  compact date and time, then one food card — name, "Porsiya üzrə" or "100 q üzrə", quantity, the basis stated
  once ("Dəyərlər 1 porsiya üçündür" / "Dəyərlər 100 q üçündür"), kalori, and the three macros in one row under
  a "Makrolar (q)" caption that stacks at enlarged text. A single food has one live total; per-item
  contribution lines appear only once the meal holds several. A blank field stays blank: the total reads "—"
  and names how many foods are incomplete, so an unfinished form never looks like a finished zero-calorie meal,
  while an explicitly typed 0 counts. Extra foods and the note are progressive disclosure ("Başqa yemək",
  "Qeyd əlavə et"). Validation sits under its field, an invalid submit scrolls to the block that failed, and a
  failed request keeps everything typed.
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
- **Header**: "Plan" over the weekday and date the API resolved in the profile time zone
  ("Çərşənbə, 30 sentyabr"), a labelled **Yuxu** chip (a bare moon read as an appearance switch; the
  destination is unchanged) and one primary add button.
- **Daily summary**: one tonal surface that leads with the figure a person actually wants — the number of
  tasks still open — with "c / n tamamlanıb" as quiet support and a thin track beneath. The share is drawn
  once and never repeated as a number, a ring and a counter. Its four states are distinct: an empty day offers
  planning instead of "0 / 0" or a fabricated 100 %; a day with nothing scheduled but earlier work owed leads
  with the overdue count; a part-finished day reads "3 tapşırıq qalıb"; a finished one reads "Bu günün hamısı
  tamamlandı" — scoped to today, with the overdue line still shown, because finishing today says nothing about
  what is owed from before. Loading is a skeleton and a failed load is an error, never a zero.
- **Bu gün**, in order: the summary; then the labelled **Gecikmiş** section, each row showing the day it was
  actually planned for ("Gecikib · 27 sen"); then today's own tasks. The "Bu gün" heading appears only when the
  overdue section is above it — otherwise the header already names the day. A day with nothing at all shows one
  explanation and "İlk tapşırığı əlavə et". At 390 × 844 the summary and the first task are both on screen
  (measured: the row ends at 333 of 844).
- **Qarşıdakı** groups by the day a task is planned for; **Tamamlananlar** groups by the day it was finished —
  which is also the field the API pages by, so the grouping stays consistent across pages — and each completed
  row keeps the day it had been planned for ("Plan: 5 sen"). Both page with "Daha çox".
- **Task row**: a 48 pt completion checkbox, the title as the strongest element (wrapping to three lines rather
  than being cut to a stub), one metadata line, an optional one-line note preview, and a separate 48 pt overflow
  control. The metadata line is whatever the heading has not already said: a clock for a timed task,
  "Gün ərzində" for a date-only one — `TaskItem` carries an optional time, not a duration, and an untimed task
  is never treated as midnight — or the original date in the overdue section. Priority is drawn only when it is
  not the default: "Yüksək" gets a rule beside the title and a tonal chip, "Aşağı" a quiet word, Normal nothing.
  All three words stay in the accessible name, so priority never depends on colour. A timed task whose time has
  passed says so in the warning colour on its own line; the amber checkbox is reserved for the overdue section,
  so one signal keeps one meaning.
- **Creation is fast**: "Yeni tapşırıq" opens with the title focused, today's date and Normal priority already
  chosen, and **Bu gün** / **Sabah** shortcuts above the date field — anything else goes through the shared
  calendar. **Saat**, **Qeyd** and **Təkrarlanma** are disclosures, so the first screen is one field long.
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

## Fokus (Pomodoro)

Fokus lives **inside Plan**, not in a tab of its own; the five-tab shell is unchanged.

- **Entry card** in Plan, one compact row, never a dashboard above the task list. Idle it shows the configured
  length, today's recorded focus and "Başla"; running or paused it shows what is left, the phase, the linked
  task and "Aç". The row and its action are siblings, so neither nests inside the other.
- **"Bu işə fokuslan"** in the task overflow sheet prepares a run linked to that task and opens the screen —
  the run itself is always started by the user, never out of sight. A session can equally run with no task.
- **The screen** (`/plan/focus`) is deliberately quiet: minimise and settings at the top, the phase selector
  (**Fokus / Qısa fasilə / Uzun fasilə**), the linked task or "Tapşırıqsız fokus", a large tabular countdown
  inside a restrained ring, the labelled cycle progress, one primary action and a quieter "Bitir". Leaving the
  screen does not stop the timer.
- **Durations**: 25 / 5 / 15 minutes by default with a long break after four completed focus runs. Compact
  15 / 25 / 50 presets sit under a ready focus phase; everything else is in the settings sheet, in whole
  minutes, clamped to 1–240. A change applies to the phases after the current one — a running phase keeps the
  duration it started with, and the sheet says so.
- **Actions**: **Başla**, **Pauza**, **Davam et**, **Bitir**, **Fasiləyə başla**. Pause and resume are
  immediate; only ending early is confirmed, and that confirmation is not a deletion — it says the time will
  be kept but will not count as a completed focus. Changing phase mid-run is refused with a message rather
  than silently discarding the run.
- **After a phase** a compact result appears — "Fokus tamamlandı" or "Vaxtından əvvəl bitirildi", with the
  focus time — and the next phase is *offered*, never started automatically. Completing the linked task is a
  separate button, because finishing a run never completes a task.
- **The scene** is one deep forest surface holding the hourglass (144 units), the 64-unit tabular countdown,
  a thin ring with a luminous endpoint and four cycle markers with their count. Three soft light layers drift
  behind it and the hourglass floats a few pixels; text and controls never move. Pausing freezes the drift and
  dims the illumination, and every loop stops under Reduce Motion, off-screen or in the background.
- **Six presentations**, each with its own words and its own headline figure:
  **Fokusa hazır** (the configured length), **Fokus** (counting down), **Pauzadadır** (frozen remainder),
  **Fokus tamamlandı** (the completed duration, one more cycle marker, a single ring pulse, "Fasiləyə başla"),
  **Sessiya dayandırıldı** (the time actually focused as the headline, "Planlaşdırılan: 25 dəqiqə" beneath,
  no marker, no celebration, "Yenidən fokuslan"), and **Qısa/Uzun fasilə**. A finished session never shows the
  time that was left as its headline.
- **Offline** the whole timer works. A finished focus run is written to a durable, account-scoped outbox
  before anything is sent, and retried later; the screen says how many records are waiting.
- **Notifications**: one local alarm for the running phase, cancelled or replaced on pause, resume, end and
  phase change. Permission is asked when a phase is first started, never at launch, and a refusal changes
  nothing about the timer. Fokus and Yuxu own separate channels and identifiers; neither cancels the other's.

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

## Libra AI (assistant)

The tab opens on a landing composition and gives way to the conversation on the first question.

**Landing.** A "Libra AI" header with a history control (and, once a conversation exists, "new conversation");
a compact animated orb of soft light layers; the heading "Bu gün nəyə diqqət edək?"; four prompt cards —
"Günümü təhlil et", "Pul hara gedir?", "Qidalanmam necədir?", "Günümü planlaşdır" — each carrying its own
module scope; a context control stating the period and the modules in words *and* the resolved dates beneath
them; and a composer pinned above the navigation region. The introduction collapses on the first message,
including while that first answer is still in flight, so the conversation gets the space.

**An answered turn.** The question as a trailing bubble, then a card holding: the outcome when it is not a
plain answer ("Kifayət qədər məlumat yoxdur", "Dəqiqləşdirmə lazımdır", "Bu suala cavab verilmir"); a fixture
badge when the answer came from the development fixture; a short summary; metric cards built **only** from the
facts the answer cited, rendered from the stored snapshot rather than from the assistant's prose; the
observations; suggestions under their own "Təkliflər" heading so a proposal never reads as a finding; a
"Mənbələr (n)" control; and follow-up questions as chips.

**Mənbələr.** A sheet listing every fact the snapshot carried — label, figure, the period it covers, its
caveat — with the range and the collection time at the top and an "Aç" button that opens the module screen the
figure came from. A day with no entries reads "Qeyd yoxdur", never a zero; a module that could not be read
reads "Oxuna bilmədi".

**Scope.** The context sheet selects the period (Bu gün / Son 7 gün) and the modules. Applying it starts a new
conversation, and the sheet says so, because an earlier turn must not reintroduce data that is now excluded.

**States.** Loading is the real request and nothing more: "Qeydləriniz oxunur…" beside a still orb — no
percentage, no invented reasoning transcript, no simulated streaming. A failed send keeps the question in a
retry strip and resends it under the same request id, so a retry is the same turn. With no provider key the
screen says "AI köməkçi hələ aktiv deyil", the composer is disabled and nothing canned stands in for an
answer. History shows loading, an empty line, pagination and a confirmed delete.

**Motion.** The orb drifts three light layers slowly and carries no state — it never indicates progress or
thinking. It stops under Reduce Motion, when the tab is not in view, and when the app is backgrounded.

This version is read-only: nothing on this screen creates a record, completes a task, changes a goal, starts a
timer or schedules a notification.

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
