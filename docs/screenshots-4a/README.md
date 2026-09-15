# Phase 4A — Plan / tasks evidence

Captured with headless Chrome (CDP) against the running Expo web app, the live API and a real PostgreSQL
database on 2026-09-08. Every task in these captures was created by the walkthrough itself, through the form or
the API. Phone captures are 390 × 844 logical units at 2× density unless the name says otherwise.

`results.json` holds the automated checks (**52 of 52 true**), the measurements quoted below, and the console
output of the run.

The API ran in Development with the photo-analysis development fixture **off**, which is the normal
configuration. Phase 3B's deferred live-provider check is untouched and still skips.

This is **browser** evidence. Native pickers (the iOS/Android date and time dialogs), keyboard behaviour,
dynamic type, gestures and haptics were not exercised on a device and remain unverified.

## The flow

| # | File | What it shows |
|---|---|---|
| 01 | `01-plan-empty-390x844.png` | A day with nothing on it: one explanation and "İlk tapşırığı əlavə et" |
| 02 | `02-task-new-390x844.png` | Creation is one field long — the title is empty and focused, the date is today, priority is Normal, and time / note / recurrence are disclosures |
| 03 | `03-task-validation-390x844.png` | An empty submit reports the missing title at its own field, focuses it, and writes nothing |
| 04–05 | `04-plan-one-task-390x844.png`, `05-plan-populated-390x844.png` | The first task, then a populated day including a long title that wraps |
| 06–07 | `06-plan-completed-390x844.png`, `07-plan-reopened-390x844.png` | Completion moves the summary to 1 / 3, and reopening moves it back |
| 08 | `08-plan-completion-failed-390x844.png` | A blocked completion endpoint: the failure is reported and the row stays exactly as it was |
| 09 | `09-plan-stale-390x844.png` | A failed refresh keeps the figures on screen behind an honest notice |
| 10 | `10-plan-overdue-390x844.png` | The labelled "Gecikmiş" section with each task's original date, counted apart from today's n / N |
| 11 | `11-plan-upcoming-390x844.png` | "Qarşıdakı", grouped by day and excluding today |
| 12–13 | `12-plan-recurring-390x844.png`, `13-plan-recurring-upcoming-390x844.png` | A daily task: completing today leaves tomorrow's own occurrence untouched |
| 14–15 | `14-task-edit-390x844.png`, `15-plan-after-edit-390x844.png` | Editing one task's title and priority |
| 16 | `16-plan-completed-view-390x844.png` | "Tamamlananlar" |
| 17–19 | `17-task-actions-390x844.png`, `18-task-delete-confirm-390x844.png`, `19-plan-after-delete-390x844.png` | The overflow actions, a confirmation that names the task, and the day after it is gone |
| 20–21 | `20-home-plan-390x844.png`, `21-home-quick-add-390x844.png` | Home's Plan row with today's real figure, and Quick Add with all five actions |
| 22–23 | `22-home-quick-add-no-finance-390x844.png`, `23-task-from-quick-add-390x844.png` | Before Finance exists: Quick Add offers only the meal and the task, and the task action opens the form |
| 24–26 | `24-plan-360x800.png`, `25-plan-768x1024.png`, `26-plan-1440x900.png` | Every reviewed width |
| 27 | `27-plan-dark-390x844.png` | Dark theme |
| 28 | `28-plan-large-text-390x844.png` | Enlarged text (see the note below) |
| 29 | `29-plan-reduced-motion-390x844.png` | Reduced motion: final values, no travel |
| 30 | `30-plan-first-fold-390x844.png` | The first fold at 390 × 844 |
| 31 | `31-task-form-keyboard-height-390x520.png` | A keyboard-height viewport with "Tapşırıq əlavə et" still reachable |

## Measurements

- **Creation defaults** (`measurements.newFormDefaults`): the title is `""`, the date field reads
  `Tarix: 8 sentyabr 2026`, the checked priority is `Normal`, and the time field is absent until asked for.
- **Invalid submit** (`measurements.focusAfterInvalidSubmit`): focus lands on `task-title`, and the day still
  reports 0 scheduled tasks.
- **Summary** (`measurements.day` → `afterComplete`): 3 scheduled, 0 completed → 1 completed after one tap, with
  the completed task's `plannedDate` unchanged.
- **History** (`measurements.history`): `["Reopened", "Completed"]` — reopening added an event rather than
  erasing one.
- **Failed completion**: with `*/api/tasks/*/completion` blocked, the day still reports 0 completed and the row's
  `aria-checked` is still `false`. Nothing was assumed locally, so there was nothing to roll back.
- **Overdue** (`measurements.overdue`): 3 scheduled for today and **2** overdue, counted separately; the rows
  read "Gecikib · 3 sen" and "Gecikib · 7 sen".
- **Recurrence** (`measurements.tomorrow`): after completing today's occurrence of a daily task, tomorrow reports
  1 scheduled and **0** completed.
- **Home** (`measurements.homeSummary`): `1 / 3 tamamlanıb`, and exactly one "Tezliklə" chip remains (AI).
- **Quick Add before Finance** (`measurements.quickAddBeforeSetup`): `["Yemək", "Tapşırıq"]` — the task action is
  available from the first day, and the money actions stay gated until an account exists. With an account, all
  five appear again.
- **First fold** (`measurements.firstFold`, 390 × 844): summary at 152, first task row at 303, navigation region
  at 766 — real task rows are well inside the first viewport.
- **Keyboard height** (`measurements.footerVisible`): at 390 × 520 the submit button's bottom edge is at 508 of 520.
- **Enlarged text**: this Chrome build has no `Page.setFontSizeOverride`, so the capture scales the computed font
  size and line height of every rendered element by 1.35 (`measurements.enlargedElements` = 201 elements) and
  then checks the layout. No horizontal overflow at 360, 390, 768 or 1440, in either theme or at that text size.
- **Console**: no errors beyond the resource failures the two blocked-endpoint captures deliberately provoke
  (`measurements.unexpectedConsoleErrors` is empty).

## Recordings

Both are 390 × 844 H.264 MP4s of the same flow — plan → create → complete → overdue → upcoming — and were
inspected after encoding:

| File | Source frames | Dimensions | Duration | Decoded frames | Bytes |
|---|---|---|---|---|---|
| `walkthrough-normal.mp4` | 97 | 390 × 844 | 00:00:16.50 | 330 | 125 539 |
| `walkthrough-reduced-motion.mp4` | 19 | 390 × 844 | 00:00:15.95 | 319 | 107 482 |

The reduced-motion capture needed **19** frames for the same 13 seconds of interaction against **97**: with
`prefers-reduced-motion: reduce` the screen changes state without animating between states, so far fewer frames
differ.
