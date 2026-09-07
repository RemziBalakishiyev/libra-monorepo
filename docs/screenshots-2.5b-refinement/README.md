# Phase 2.5B refinement — browser evidence

Captured with headless Chrome (CDP) against the running Expo web app and the live API with a real PostgreSQL
database on 2026-09-07 (correction pass). Phone captures are 390 × 844 logical units at 2× density unless the
name says otherwise. `results.json` holds the automated checks (51 of 51 true), the measurements quoted below and
the console output of the run (0 errors; the only warning is Reanimated's development-mode notice under emulated
reduced motion). This is **browser** evidence only: native swipe-to-delete, the native date pickers, haptics,
on-device dynamic type and the on-device keyboard were not exercised on a device.

## Before → after

| Screen | Before (`docs/screenshots-2.5b/`) | After (this folder) |
|---|---|---|
| Login | `01-login-390x844.png` | `01-login-390x844.png`, `01b-login-validation-390x844.png` |
| Home | `02-home-390x844.png` | `02-home-390x844.png`, `02b-home-quick-add-sheet-390x844.png` |
| Finance dashboard | `03-finance-dashboard-390x844.png` | `03-finance-dashboard-390x844.png`, `03b-…-bottom`, `03c-…-insight-expanded`, `03d-…-keyboard-focus`, `03e-finance-estimate-390x844.png` |
| Quick Add | `04-quick-add-390x844.png` | `04-quick-add-390x844.png` (sheet), `21b-finance-quick-add-popover-1440x900.png` (popover) |
| Create expense | `05-…-empty`, `06-…-validation`, `07-…-filled`, `08-…-success` | same names, plus `06b-category-sheet-search-390x844.png`, `07b-create-expense-saving-390x844.png` |
| After insert (toast) | `08b-finance-after-insert-390x844.png` | `08b-finance-after-insert-390x844.png` |
| Transactions | `09-transactions-390x844.png`, `09b-…-confirm-delete` | same names |
| Accounts / Budgets | `10-accounts-390x844.png`, `11-budgets-390x844.png` | same names |
| Profile | `12-profile-390x844.png` | `12-profile-390x844.png`, `12b-profile-diagnostics-390x844.png`, `12c-profile-language-sheet-390x844.png` |
| Empty / loading / error | `13-…`, `13b-…`, `14-…`, `15-…` | same names, plus `15b-finance-stale-390x844.png`, `15c-finance-stale-recovered-390x844.png` |
| Reduced motion | `16-finance-reduced-motion-390x844.png` | same name |
| Other widths | `17-finance-dashboard-{360x800,430x932,768x1024}.png` | same names, plus `17b-create-expense-360x800.png` |
| Enlarged text (1.3×) | — | `18-finance-large-text-390x844.png`, `18b-create-expense-large-text-390x844.png` |
| Keyboard-height viewport | — | `18c-create-expense-keyboard-height-390x520.png` |
| Long name + large value | — | `19-home-long-name-large-value-390x844.png`, `19b-finance-large-value-390x844.png` |
| Desktop | `20-home-1440x900.png`, `21-…`, `22-…`, `23-…`, `24-…-1280x800` | same names, plus `24b-home-1280x800.png`, `25-profile-1440x900.png` |
| Dark | `30-finance-dashboard-dark-390x844.png` | same name (corrected white balance), plus `30b-…-dark-usd`, `30c-…-dark-reduced-motion`, `31-create-expense-dark`, `32-home-dark` |

## Correction-pass evidence

- **Dark hero foreground** — `30-finance-dashboard-dark-390x844.png`, `30b-finance-dashboard-dark-usd-390x844.png`,
  `30c-finance-dashboard-dark-reduced-motion-390x844.png`. `results.json → measurements.darkHero` records the
  computed colour of the rendered amount as `rgb(255, 255, 255)` on a cold dark load (early and settled), after
  light → dark → light, during and after the currency switch (`3.126,41 AZN` → `300,00 USD`), during and after a
  numeric ticker (an inserted 5,25 expense: `3.126,41` → `3.121,16`) and under reduced motion.
- **Budget impact through a save** — `07-create-expense-filled-390x844.png` (preview), `07b-create-expense-saving-390x844.png`
  (request in flight), `08-create-expense-success-390x844.png` (success state), `08b-finance-after-insert-390x844.png`
  (destination). `measurements.impactBefore / impactDuringSave / impactAtSuccess` all read
  `Market büdcəsi: qalıq 25,90 → 12,50 AZN`; the recordings show the same stability for a 24,50 expense
  (`25,90 → 1,40 AZN`, never negative).
- **Month-end estimate** — `03e-finance-estimate-390x844.png`. `measurements.estimate`: expense `693,59`, elapsed
  `7` of 30 days, displayed `2.972,53`, expected `2972.53` from the unrounded total; the check compares the two.
- **Stale data** — `15b-finance-stale-390x844.png` (cached figures + notice after a failed remount refetch past the
  10-second stale time) and `15c-finance-stale-recovered-390x844.png` (endpoint restored, notice gone, same
  figures). Checks: `staleNoticeShown`, `staleKeepsCachedFigures`, `staleRecovers`.
- **Modal focus** — `measurements.modalTabCycle`: eight Tab presses while the Quick Add sheet is open all keep
  `document.activeElement` inside the `aria-modal` container (`modalContainsFocus`).
- **First fold** — `measurements.financeFirstFold` now locates every section by its heading or control: hero 96,
  summary 250, actions 368, budget 457, recent-transactions heading 563, first row 598, tab bar top 766.

## Recordings

Both files are H.264 MP4 (yuv420p) at the original 390 × 844 logical size, encoded from CDP screencast frames
with their real timestamps at a constant 20 fps (decoded frame counts therefore reflect the encoder rate, not the
app's frame rate; source frame counts are the screencast's change-driven frames).

| File | Source frames | Dimensions | Duration | Decoded frames | Size |
|---|---|---|---|---|---|
| `walkthrough-normal.mp4` | 84 | 390 × 844 | 9.25 s | 185 | 206 KB |
| `walkthrough-reduced-motion.mp4` | 28 | 390 × 844 | 8.85 s | 177 | 155 KB |

Flow in both: Finance dashboard → Quick Add sheet → expense form → amount typed (2 → 24,50) → category chip →
budget preview (25,90 → 1,40 AZN) → save → "Əlavə olundu" success state → updated dashboard (3.126,41 →
3.101,91 AZN) with the toast. One-frame-per-second contact sheets were inspected to confirm the distinct screens and
the save transition are present in the encoded files. The recorded 24,50 transaction is deleted through the API
after each recording.

## Notes on the automated checks

- The single "behindBar" flag belongs to the open Quick Add sheet: a modal sheet legitimately covers the
  navigation region while it is the active layer (focus containment is verified separately, see above).
- The "wide" entries in `results.json` are the hero's decorative orbit circles, which extend past the viewport
  by design and are clipped by the hero's `overflow: hidden`; the page never scrolls horizontally.
- The stale-data scenario uses the application's real refetch policy (`staleTime` 10 s, no refetch on window
  focus): the tab is remounted after the stale time with the dashboard endpoint blocked, then recovered through
  the notice's own "Yenidən yüklə" action.
