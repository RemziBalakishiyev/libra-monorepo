# Home redesign evidence

Captured with headless Chrome (CDP) against the running Expo web app (Metro on 8081) and the live API on
`0.0.0.0:5134` with a real PostgreSQL database on 2026-09-18. Two users were created by the scripts themselves:

- **A — the current screenshot's data shape**: "Rəmzi Balakişiyev", one cash account of 5 000 AZN, nothing this
  month, no meals, no tasks, and one recorded night of forty seconds.
- **B — a busier day**: "Məhəmmədəli Ağabəyzadə-Qarabağlı", 1 250 000,50 AZN minus an 84,20 expense plus a USD
  card, two meals against a 2 200 kkal target, three tasks for today (one done) and one overdue from yesterday,
  a 7 h 30 night.

`results.json` holds the automated checks (**39 of 39 true**), the measured rectangles and labels, the
accessibility roles inspected, and the console output of the run (empty). Phone captures are 390 × 844 logical
units at 2× unless the name says otherwise.

This is **browser** evidence. Native haptics, the real keyboard, dynamic type as iOS/Android scale it, the
gradient layer of the hero (`experimental_backgroundImage` renders only natively) and the splash have not been
exercised on a device — see "Remaining device checks" in the report.

## Before

`before/` holds the previous Home (indigo palette, "Bu ay" card, module directory) at 390, 360, 430 and 1440
units and in dark mode, captured from user A before any change.

## After

| # | File | What it shows |
|---|---|---|
| 01 | `01-home-empty-light-390x844.png` | User A: "Cümə, 18 sentyabr", "Salam, Rəmzi", the hero with the neutral line, 5 000,00 AZN with the month's net flow labelled, "Qeyd yoxdur" + actions for Qidalanma and Plan, **"1 dəq-dən az"** for the forty-second night, the task section's create action |
| 02 | `02-home-quick-add-390x844.png` | "Qeyd əlavə et" opens the existing global Quick Add sheet with all six actions; Escape closes it |
| 03 | `03-home-empty-dark-390x844.png` | The same in Tünd |
| 04 | `04-home-data-light-390x844.png` | User B: first name only in the greeting, the full name on the avatar; "Bu gün 2 tapşırıq qalıb · 1 gecikib"; the long balance gets full-width cards; "960 / 2.200 kkal" with its bar; "1 / 3" with "1 gecikib" as a separate chip; "7 s 30 d · Dünən"; the overdue task first with "Gecikib · 17 sen" |
| 05 | `05-home-task-completed-390x844.png` | After completing a task from Home through the real endpoint: the Plan card, its bar and the hero line follow the server ("2 / 3", "Bu gün 1 tapşırıq qalıb · 1 gecikib") |
| 06 | `06-home-data-dark-390x844.png` | User B in Tünd |
| 07 | `07-home-data-360x800.png` | 360 units, no horizontal overflow |
| 08 | `08-home-data-430x932.png` | 430 units |
| 09 | `09-home-empty-360x800.png` | User A at 360: a normal balance keeps two columns |
| 10 | `10-home-data-1440x900.png` | Desktop shell: the sidebar keeps Quick Add, so the hero has no duplicate button; tasks in the side column |
| 11 | `11-home-relative-large-text-289x625.png` | Enlarged text approximated by a 289-unit logical width: one column, the hero action drops under the row, nothing clips |
| 12 | `12-home-reduced-motion-390x844.png` | Reduced motion: same layout, no drift and no entrance travel |

## Videos

`walkthrough-normal.mp4` (17.8 s, 430 source frames) and `walkthrough-reduced-motion.mp4` (16.2 s, 12 source
frames — the page repaints only on state changes) were recorded as CDP screencasts with real timing and inspected
after encoding. Both show: Finance → Ana səhifə (the staggered entrance), "Qeyd əlavə et" → the Quick Add sheet →
Escape, completing today's first pending task (the checkbox, the Plan bar and the hero line update from the
server), Maliyyə and back to Ana səhifə with the cards keeping their values and no replayed entrance.

## Accessibility, as inspected

"Gününə bir baxış" is a heading; the four cards are labelled buttons of at least 131 units with their whole
sentence as the name ("Maliyyə, hesab balansı 1.249.916,30 AZN, bu ayın xalis axını −84,20 AZN, ayrıca 340,00
USD"); task rows are checkboxes with `aria-checked` and 48-unit targets; the avatar is "Profil: <full name>" at 48
units; the hero action is a 44-unit button; the tab bar marks "Ana səhifə" as `aria-current="page"`; both
progress bars carry labels; the illustration and the glow are `aria-hidden`. Tab order: profile → Qeyd əlavə et →
the cards.
