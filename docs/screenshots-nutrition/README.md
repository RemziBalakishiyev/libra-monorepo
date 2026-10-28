# Nutrition redesign — evidence

Captured with headless Chrome (CDP) against the running Expo web app (Metro on 8081) and the live API on
`0.0.0.0:5134` with a real PostgreSQL database, re-captured in full on 2026-09-30 after the empty-diary
illustration landed. Phone captures are 390 × 844 logical units at 2× unless the file name says otherwise.

## Fixtures

Five users created by script through the public API (`scratchpad/seed-nutrition.mjs`,
`seed-nutrition-cases.mjs`, `seed-nutrition-rec.mjs`). They exist only in the local development database; no
demo values were added to production state or to any shipped fixture.

| Fixture | Goals | Day |
|---|---|---|
| **full** | 2 200 kkal · 130 / 250 / 70 q | Breakfast, Lunch (two foods) and a Snack — 1 055 kkal |
| **empty** | none | nothing recorded |
| **goals-empty** | 2 200 kkal · 130 / 250 / 70 q | nothing recorded |
| **partial** | 2 200 kkal · 130 q protein; carbohydrate and fat deliberately untracked | one breakfast |
| **over** | 1 800 kkal · 110 / 200 / 60 q | 2 506 kkal across two meals |

## What the machine checked

`after/results.json` holds every automated check, the measured geometry of each shot, and the contrast figures.
All ten checks are true:

- the summary and the first meal group are both visible without scrolling on 390 × 844 (the group's add control
  sits at y = 432 of 844);
- a populated day shows no "nothing recorded" note;
- an empty day with no goals offers "Hədəf təyin et", draws **no** ring, and explains the zero;
- with the illustration in place, an empty day still keeps its first meal group on screen (measured: the bowl
  occupies y 471–559, the first group's add control sits at y 591 of 844);
- the illustration's nearest `aria-hidden="true"` ancestor exists, so it is outside the accessibility tree;
- a blank form's live total reads "—", never 0;
- "Karbohidrat" is not clipped in the macro row;
- a rejected submit keeps the typed name.

Measured values worth naming: the ring reads `48%` of a real 2 200 kkal target on the populated day and `139%`
on the exceeded one while its arc is clamped to a full circle; the exceeded figure stays exact
("2.506" / "706 kkal artıq"); the partial fixture speaks `Zülal: 21,0 q / 130,0 q, 109,0 q qalıb` beside
`Karbohidrat: 18,0 q, hədəf təyin edilməyib`; the week strip renders exactly the seven days ending on today.

Macro label contrast against the tinted summary: **4.79:1** light, **7.74:1** dark (≥ 4.5 in both).

## The illustration

`assets/images/nutrition-empty-bowl.png` (1254 px, RGBA, 1 MB) is the supplied source and is untouched. The
shipped file is `nutrition-empty-bowl-card.png`: cropped square around the drawn content — the source carries
~14 % transparent padding on each side — and resized to 264 px, 83 KB, which is 3× the 88-unit display size.
Its alpha edge was measured before use: of 2 992 sampled semi-transparent pixels, **none** is near-white (the
average edge pixel is `rgba(19, 24, 20, 48)`, the drop shadow), so there is no light matte to show up against
the dark palette. Shots 10 and 10b are the same empty diary in both appearances.

## Before

`before/` and `wip/` hold the diary and form as they were before this task (light, dark, empty, and the full
page), captured the same way.

## After

| # | File | What it shows |
|---|---|---|
| 01 | `after/01-diary-full-390x844.png` | Title + a single "Hədəflər" action, the seven-day strip with today selected, the tinted summary (1.055 kkal, "1.145 kkal qalıb", "hədəf 2.200 kkal", a 48 % ring), the three macro rows, then the meal groups with real totals |
| 02 | `after/02-diary-full-390x1900.png` | The whole day: four groups, one compact "Qeyd yoxdur — əlavə edin" row per empty group, and the bottom "Yemək əlavə et" / "Şəkildən" pair |
| 03–04 | `after/03-diary-dark-390x844.png`, `after/04-diary-dark-full-390x1900.png` | Tünd |
| 05–06 | `after/05-diary-360x800.png`, `after/06-diary-430x932.png` | 360 and 430 units, no horizontal overflow |
| 07–08 | `after/07-diary-large-text-390x844.png`, `after/08-diary-large-text-390x1900.png` | Browser-scaled text (see the caveat below) |
| 09 | `after/09-diary-reduced-motion-390x844.png` | The same day under `prefers-reduced-motion: reduce` |
| 10–11 | `after/10-diary-empty-no-goals-390x844.png`, `after/11-diary-empty-no-goals-390x1500.png` | Empty day, no goals: 0 kkal with "Sıfır — hələ heç nə qeyd olunmayıb.", "Hədəf təyin et", no ring, macros as "0,0 q · hədəf yoxdur", then the bowl illustration with one sentence, then the four groups |
| 10b | `after/10b-diary-empty-no-goals-dark-390x844.png` | The same empty diary in Tünd: the illustration's alpha edge is clean against the dark tonal row, and its drop shadow simply vanishes |
| 12 | `after/12-diary-empty-with-goals-390x844.png` | Empty day **with** goals: the same zero, but the targets and a 0 % ring are shown |
| 12b | `after/12b-diary-empty-with-goals-dark-390x844.png` | The same, Tünd |
| 13 | `after/13-diary-partial-goals-390x844.png` | Protein tracked, carbohydrate and fat not: the untracked ones still report their grams |
| 14–15 | `after/14-diary-exceeded-390x844.png`, `after/15-diary-exceeded-390x1700.png` | Exceeded target: "706 kkal artıq" in the warning colour, the arc clamped at a full circle labelled 139 %, macro bars clamped — no completion state |
| 16 | `after/16-calendar-from-strip-390x844.png` | The shared `CalendarSheet` opened from the strip, with today marked and no future day selectable |
| 17 | `after/17-form-blank-390x844.png` | Yeni yemək: meal type, date and time, then name → basis → quantity → "Dəyərlər 1 porsiya üçündür" → kalori → the three macros under one "Makrolar (q)" caption |
| 18–19 | `after/18-form-filled-390x844.png`, `after/19-form-filled-390x1500.png` | One food: a single live total (320 kkal and the three macros), no duplicated per-item line |
| 20–21 | `after/20-form-second-food-incomplete-390x844.png`, `after/21-form-two-foods-390x1900.png` | A second, half-filled food: it keeps its own "Bu yemək: — (dəyərlər tam deyil)" line, the total stays 320 and says "1 yeməyin dəyərləri tam deyil; cəmə daxil edilməyib." |
| 22–23 | `after/22-form-large-text-390x844.png`, `after/23-form-large-text-390x1900.png` | The form with browser-scaled text |
| 24 | `after/24-form-validation-390x844.png` | A rejected submit: the errors appear and every typed value is still there |

## Videos

| File | What it shows |
|---|---|
| `after/add-meal-walkthrough.mp4` | 13 s: the diary → "Axşam yeməyi" add → the form opens with Axşam preset → typing name, portion, kalori and macros while the live total follows → save → back on the diary with the new 430 kkal row under Axşam yeməyi and a confirmation toast |
| `after/add-meal-walkthrough-reduced-motion.mp4` | The same flow under reduced motion. The screencast emitted 48 painted frames instead of 84 for the same ten seconds of interaction, which is the animation actually not running |

## Browser checks versus device checks

**Everything above is browser evidence.** Three things it cannot establish, and did not:

1. **Enlarged text.** The browser has no Dynamic Type. Shots 07–08 and 22–23 multiply the inline font sizes by
   1.35, which grows the glyphs but leaves `PixelRatio.getFontScale()` at 1 — so the reflows that key off it
   (the entry row stacking its energy figure, the macro fields stacking, the meal segments dropping their
   icons, the summary stacking its ring) **do not engage in these screenshots**. The flags left in
   `results.json` for those four shots ("Toyuq döşü", "Qoz-fındıq qarışığı", "Axşam" clipped) are that
   artefact, not the device behaviour. Those reflows are covered by Jest instead, with
   `PixelRatio.getFontScale` mocked: `components/nutrition-entry-row.test.tsx` and
   `screens/nutrition/entry-form.test.tsx`.
2. **The native keyboard.** No soft keyboard exists in the browser, so "the focused field and the save button
   stay reachable above the keyboard" is unproven here.
3. **VoiceOver / TalkBack.** The accessible names and roles were read from the DOM; no screen reader was run.

No physical phone was available to this session. These are listed in `docs/DEVICE-CHECKS.md` under
"Nutrition diary, summary and food editor".
