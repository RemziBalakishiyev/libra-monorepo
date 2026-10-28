# Plan redesign — evidence

Captured with headless Chrome (CDP) against the running Expo web app (Metro on 8081) and the live API on
`0.0.0.0:5134` with a real PostgreSQL database on 2026-09-30. Phone captures are 390 × 844 logical units at 2×
unless the file name says otherwise.

**No reference images arrived with the brief.** The three referenced designs and the "current Plan screen"
screenshot were described but not attached, so the work follows the written requirements and Libra's own
design system. The `before/` captures below are the real previous screen, taken by temporarily restoring the
pre-change files from `HEAD` (and the blue `modulePlan` value) in the working tree and putting them back
afterwards — nothing was committed, stashed or reset.

## Fixtures

Five users created by script through the public API (`scratchpad/seed-plan.mjs`). They exist only in the local
development database.

| Fixture | Today | Overdue | Other |
|---|---|---|---|
| **one** | the supplied single task, no time | — | — |
| **busy** | 7 tasks: four timed, two date-only, one already done, one recurring occurrence, one high-priority with a note, one very long title | 2, from 27 and 29 September | three upcoming days, three completed |
| **overdue** | nothing | 2 | — |
| **done** | 2, both completed | 1 | — |
| **empty** | nothing | nothing | — |

## What the machine checked

`after/after-results.json` holds every check, the geometry of each shot and the row metadata; `before/` has the
same file for the old screen. All three checks are true:

- **the summary and the first task are both visible at 390 × 844 with default text** — measured: the summary
  occupies y 152–250 and the first task row ends at y 333 of 844;
- **no row repeats "Bu gün"** — today's rows read `07:00`, `09:30`, `11:00`, `14:15`, `21:00`,
  `Gün ərzində`, `Gün ərzində`, and the overdue rows `Gecikib · 27 sen` / `Gecikib · 29 sen`;
- the create form offers the date shortcuts.

The four summary states, read from the running app: `1 tapşırıq qalıb` / `0 / 1 tamamlanıb` (one task);
`6 tapşırıq qalıb` / `1 / 7 tamamlanıb` / `2 gecikmiş tapşırıq` (busy); `2 gecikmiş tapşırıq` /
`Bu gün üçün yeni tapşırıq yoxdur.` (nothing today, work owed); `Bu günün hamısı tamamlandı` / `2 / 2 tamamlanıb`
with `1 gecikmiş tapşırıq` still shown (today finished); `Bu gün plan boşdur` /
`Bu gün üçün tapşırıq planlaşdırın.` (empty).

## Before and after

Every file exists in both `before/` and `after/` under the same number, so the two can be compared directly.

| # | File | What it shows |
|---|---|---|
| 01 | `01-plan-one-task-390x844.png` | The supplied state. **Before:** an eyebrow reading "Tapşırıqlar", a blue checkbox icon, "0 / 1 tamamlanıb" beside a "0%" and a bar. **After:** the localized date, a "Yuxu" chip, "1 tapşırıq qalıb" over "0 / 1 tamamlanıb", one track, no percentage |
| 02–03 | `02-plan-busy-390x844.png`, `03-plan-busy-full-390x2100.png` | The busy day: the overdue section with original dates, today's list with clocks and "Gün ərzində", the high-priority rule and chip, the quiet "Aşağı", the unmarked Normal, the recurring marker, the note preview, and the completed row still in place |
| 04–05 | `04-plan-busy-dark-390x844.png`, `05-plan-busy-dark-full-390x2100.png` | Tünd |
| 06–07 | `06-plan-busy-360x800.png`, `07-plan-busy-430x932.png` | 360 and 430 units, no horizontal overflow |
| 08 | `08-plan-busy-desktop-1440x900.png` | The desktop shell: the list in the main column, the summary in the side column |
| 09 | `09-plan-busy-large-text-390x844.png` | Browser-scaled text (see the caveat below) |
| 10 | `10-plan-busy-reduced-motion-390x844.png` | `prefers-reduced-motion: reduce` |
| 11 | `11-plan-overdue-only-390x844.png` | Nothing scheduled today, two tasks owed: the summary leads with the overdue count and does not draw a track |
| 12 | `12-plan-today-done-390x844.png` | Today finished with one task still overdue: "Bu günün hamısı tamamlandı" *and* "1 gecikmiş tapşırıq" |
| 13 | `13-plan-empty-390x844.png` | A genuinely empty plan: a planning message, not 0 / 0 |
| 14 | `14-plan-upcoming-390x1200.png`, `14b-…` | Qarşıdakı, grouped by the day a task is planned for |
| 15 | `15-plan-completed-390x1200.png` | Tamamlananlar, grouped by the day each task was finished, each row keeping the day it had been planned for |
| 16–17 | `16-task-form-390x844.png`, `17-task-form-full-390x1400.png` | Yeni tapşırıq: the title first, "Bu gün" / "Sabah" above the date field, then the disclosures |
| 18 | `18-task-form-validation-390x844.png` | An empty submit: the error under the title, nothing sent |

## Videos

| File | What it shows |
|---|---|
| `after/create-complete-upcoming.mp4` | 15 s: the one-task day → add → a title and "Sabah" → save → back on Plan with a toast → completing today's task in place (the row stays, struck through, and the summary flips to "Bu günün hamısı tamamlandı" / "1 / 1") → Qarşıdakı, where the new task sits under "Sabah · 1 oktyabr 2026" |
| `after/create-complete-upcoming-reduced-motion.mp4` | The same flow under reduced motion. The screencast emitted 34 painted frames instead of 144 for the same eleven seconds, which is the animation actually not running |

## Browser checks versus device checks

**Everything above is browser evidence.** Three things it cannot establish, and did not:

1. **Enlarged text.** The browser has no Dynamic Type; shot 09 multiplies inline font sizes by 1.35, which
   grows the glyphs but leaves `PixelRatio.getFontScale()` at 1 — so the view segments do **not** drop their
   icons there, and `after-results.json` still flags "Tamamlanan" as clipped in that shot. At 360 units, where
   the reflow keys off width rather than font scale, it does engage and the flag is gone.
2. **The native keyboard**, so "the title, its error and the save button stay reachable" is unproven here.
3. **VoiceOver / TalkBack**: the names and roles were read from the DOM; no screen reader was run.

One pre-existing flag is left alone: at 1440 the sidebar truncates the profile name and email with an ellipsis.
That is the shared `Sidebar`, outside this task.

These are listed in `docs/DEVICE-CHECKS.md` under "Plan".
