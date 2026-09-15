# Phase 3A — nutrition review evidence

Captured with headless Chrome (CDP) against the running Expo web app and the live API with a real PostgreSQL
database on 2026-09-07. Every record in these captures was created through the application or the API by the
walkthrough itself — no fixture data and no invented nutrient values are shipped in the app. Phone captures are
390 × 844 logical units at 2× density unless the name says otherwise.

`results.json` holds the automated checks (**40 of 40 true**), the measurements quoted below, and the console
output of the run (**0 errors**).

This is **browser** evidence. Native keyboard behaviour, dynamic type, gestures and haptics were not exercised on
a device and remain unverified.

## The flow

| # | File | What it shows |
|---|---|---|
| 01 | `01-diary-empty-390x844.png` | A day with nothing recorded: one explanation and "İlk yeməyi əlavə et", targets unset |
| 02 | `02-goals-empty-390x844.png`, `02b-goals-filled-390x844.png` | Goals: every target optional ("İzlənmir"), and the sentence stating when a change takes effect |
| 03 | `03-diary-goal-set-390x844.png` | The same day once targets exist |
| 04 | `04-entry-empty-390x844.png` | Add entry: meal type, date and time, one food card |
| 05 | `05-entry-validation-390x844.png` | A missing value reported next to its own field; nothing is submitted |
| 06 | `06-entry-two-items-390x844.png` | Two foods — one per portion, one per 100 g — with the live per-item and meal totals |
| 07 | `07-diary-populated-390x844.png` | The diary after saving, with the single success toast |
| 08 | `08-home-nutrition-390x844.png` | Home's nutrition module showing today's real figure against the target |
| 09 | `09-home-quick-add-390x844.png` | Home Quick Add for a user with no financial account: only "Yemək" |
| 10–11 | `10-entry-edit-390x844.png`, `11-diary-after-edit-390x844.png` | Editing a quantity and the day total following it |
| 11b | `11b-entry-preset-dinner-390x844.png` | Adding from a meal group presets that meal |
| 12–13 | `12-entry-actions-390x844.png`, `13-entry-copy-draft-390x844.png` | The overflow actions and the copy draft ("Nüsxə ayrıca qeyd kimi yaradılacaq") |
| 14 | `14-diary-history-390x844.png` | The historical day that received the copy |
| 15 | `15-diary-target-exceeded-390x844.png` | An exceeded target: the real figure stays, the difference is named "artıq" |
| 16–17 | `16-delete-confirm-390x844.png`, `17-diary-after-delete-390x844.png` | Deletion with confirmation and the recomputed day |
| 18–19 | `18-diary-error-390x844.png`, `19-diary-recovered-390x844.png` | A blocked endpoint, then recovery through "Yenidən cəhd et" |
| 20 | `20-diary-{360x800,430x932,768x1024,1280x800,1440x900}.png` | The diary at every reviewed width |
| 21–22 | `21-entry-1440x900.png`, `22-goals-1440x900.png` | The form and goals on desktop |
| 23–24 | `23-diary-dark-390x844.png`, `24-entry-dark-390x844.png` | Dark theme |
| 25–26 | `25-diary-large-text-390x844.png`, `26-entry-large-text-390x844.png` | Enlarged text (see the note below) |
| 27 | `27-diary-reduced-motion-390x844.png` | Reduced motion: final values, no travel or counting |
| 28 | `28-entry-keyboard-height-390x520.png` | A keyboard-height viewport with the save footer still reachable |

## Measurements

- **First fold at 390 × 844** (`measurements.firstFold`, fresh load): header 32, date navigation 88, summary 160,
  first meal group 357, first entry row 412, second group 505, tab bar region 766 — meal content starts well
  inside the first viewport.
- **Calculations**: one portion of 250 kcal → `250 kkal`; 150 g of a 130 kcal/100 g food → `195 kkal`; the meal
  → `445 kkal`. Editing the weight to 200 g → `510 kkal`, and the day total follows.
- **Targets**: 2 200 kcal target with 445 kcal eaten → `1.755 kkal qalıb`; with 2 410 kcal eaten → `210 kkal artıq`
  and the real total stays on screen.
- **Copy** (`measurements.copy`): the copy is a different entry id, shares **no** item ids with its source, and the
  source still reads 510 kcal afterwards.
- **Dark theme** (`measurements.darkSummary`): the energy figure renders `rgb(247, 249, 252)` on the
  `rgb(20, 26, 36)` card.
- **Modal focus** (`measurements.modalTabCycle`): eight Tab presses inside the entry actions sheet all keep focus
  within the `aria-modal` container.
- **Save footer** (`measurements.footerVisible`): at 390 × 520 the submit button's bottom edge is at 508 of 520.
- **No horizontal overflow** at 360, 430, 768, 1280, 1440, or with enlarged text.

## Recordings

Both files are H.264 MP4 (yuv420p) at the original 390 × 844 logical size, encoded from CDP screencast frames with
their real timestamps at a constant 20 fps. Decoded frame counts therefore reflect the encoder rate, not the app's
frame rate; the source frame counts are the screencast's change-driven frames.

| File | Source frames | Dimensions | Duration | Decoded frames | Size |
|---|---|---|---|---|---|
| `walkthrough-normal.mp4` | 199 | 390 × 844 | 20.90 s | 418 | 457 KB |
| `walkthrough-reduced-motion.mp4` | 50 | 390 × 844 | 20.10 s | 402 | 299 KB |

Flow in both: empty diary → add a meal → type the values → the per-item and meal totals follow the quantity
(2 portions → 500 kcal) → save → success state → diary with the toast → edit the quantity back to 1 portion
(250 kcal) → save → overflow actions → copy into yesterday → the draft opens → save. One-frame-per-second contact
sheets were inspected to confirm the distinct screens and the save transitions are present in the encoded files.
The reduced-motion recording produces a quarter of the source frames over the same duration and shows final values
directly, which is the difference the motion settings are supposed to make.

## Notes

- **Enlarged text** is approximated with a 130 % page zoom: react-native-web renders fixed pixel font sizes, so the
  capture shows the same pressure on the layout, not the platform's dynamic type. Real dynamic type is a native
  behaviour and is listed as unverified.
- The stale-data notice, offline wording and skeletons come from the shared components already covered by the
  Phase 2.5B evidence; the error state here is a controlled endpoint failure on `/api/nutrition/day`.
- The walkthrough registers a fresh user per run, so the figures above are reproducible from an empty account.
