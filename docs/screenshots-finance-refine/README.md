# Finance refinement and custom calendar — evidence

Captured with headless Chrome (CDP) against the running Expo web app (Metro on 8081) and the live API on
`0.0.0.0:5134` with a real PostgreSQL database on 2026-09-18. Two script-created users: **A** with one cash
account of 5 000 AZN and nothing else this month (the scenario in the reported screenshots), and **B** with
1 250 000,50 AZN minus an 84,20 expense, a USD card, meals, tasks and a night of sleep. Phone captures are
390 × 844 logical units at 2× unless the name says otherwise.

`results.json` holds the automated checks (**39 of 39 true**), the measured rectangles, labels and roles, and the
console output of the run (empty).

**This is browser evidence.** The browser has no status bar, no home indicator and no soft keyboard, so the three
device-only behaviours — the header clearing the status bar, the keyboard-to-calendar transition, and the full
sheet being visible above a keyboard — are *not* proven here. No physical phone was available to this session;
those checks are listed in `docs/DEVICE-CHECKS.md` ("Finance safe areas, keyboard and the calendar").

## Before

`before/` holds the previous dashboard (light and dark, 390 and 1440), the previous transaction form, and the
previous date sheet on the web build (the old iOS branch used the native inline picker and cannot be rendered in
a browser).

## After

| # | File | What it shows |
|---|---|---|
| 01 | `01-finance-empty-390x844.png` | User A: "Hesab balansı 5.000,00 AZN"; the cash-flow block with Gəlir 0,00, Xərc 0,00 and the labelled "Xalis axın (gəlir − xərc) 0,00 AZN"; the three actions; the compact budget row |
| 02 | `02-finance-empty-full-390x2300.png` | The whole empty dashboard: "Hələ əməliyyat yoxdur" with an add action, "Gündəlik xərc" as a one-line explanation with "Xərc əlavə et" (no bars, no 0,00 forecast), Hesablar, "Bu ay xərc yoxdur", the İdarəetmə list with all six destinations |
| 03 | `03-finance-data-390x844.png` | User B: 1.249.916,30 AZN with "Ayrıca 340,00 USD · 1 hesab" kept separate; Xərc 84,20; net flow −84,20 AZN; recent rows under **BU GÜN** with the overflow control |
| 04 | `04-finance-data-full-390x2300.png` | The whole populated dashboard including the daily series with actual values |
| 05 | `05-finance-data-usd-390x844.png` | The currency switch: the USD view with AZN listed separately, never converted |
| 06 | `06-finance-data-dark-390x844.png` | Tünd |
| 07 | `07-finance-data-360x800.png` | 360 units, no horizontal overflow |
| 08 | `08-finance-data-430x932.png` | 430 units |
| 09 | `09-finance-data-1440x900.png` | Desktop shell: sidebar, main and side columns, management in the side column |
| 10 | `10-finance-relative-large-text-289x625.png` | Enlarged text approximated by a 289-unit logical width: nothing clips or overflows |
| 11 | `11-transaction-form-390x844.png` | Yeni xərc: amount, the four category chips wrapping inside the row with "Hamısı", the TƏFƏRRÜATLAR section (Hesab, Tarix, Qeyd), the sticky save |
| 12 | `12-transaction-form-failed-submit-390x844.png` | With the create endpoint blocked: the error banner, and 12,50 / Abunəliklər / "Netflix" all still entered |
| 13 | `13-calendar-390x844.png` | The calendar from the date field: "Tarix seç", close, Sentyabr 2026 with previous/next, B.e.–B. columns, today marked and checked, "Bu gün"/"Dünən", the summary and "Təsdiqlə" — the grid ends above the footer and the footer above the viewport edge |
| 14 | `14-calendar-previous-month-390x844.png` | After "Dünən" + Təsdiqlə the field reads 17 sentyabr 2026; reopened, that day is checked; navigating to Avqust changes nothing in the field |
| 15 | `15-calendar-six-rows-360x640.png` | Mart 2026 (six rows) on a 360 × 640 screen: the whole grid, shortcuts and Təsdiqlə fit |
| 16 | `16-calendar-dark-390x844.png` | The calendar in Tünd |
| 17 | `17-calendar-desktop-1440x900.png` | The same sheet as a centred dialog on the desktop shell |

## Videos

`calendar-normal.mp4` (14.6 s) and `calendar-reduced-motion.mp4` (14.3 s): the date field → the sheet slides up →
previous month → 21 avqust chosen (pending only) → "Bu gün" → back to Avqust, 21 chosen again → Təsdiqlə → the
field reads 21 avqust 2026. Reduced motion presents the sheet without travel. Frames were inspected after encoding.

## Checks worth naming

- `balanceUsesAzerbaijaniSeparators`, `largeBalanceFormatted`, `rowAmountFormatted`, `amountPlaceholderUsesComma`
  — one convention on every surface.
- `insightEmptyExplainsInsteadOfBars`, `seriesChartsRealValues` — loaded-empty versus populated.
- `calendarFullyOnScreen`, `sixRowMonthFitsShortScreen`, `calendarSevenColumnsMondayFirst`,
  `calendarDaysAreLabelledRadios`, `todayIsMarkedNotSelected` — sizing and semantics.
- `arrowKeysMovePendingDay`, `escapeDiscardsPendingDate`, `focusReturnsToDateField`, `shortcutOnlyChangesPending`,
  `confirmCommitsYesterday`, `reopenRestoresCommitted`, `monthNavigationDoesNotWrite` — the confirmation model.
- `failedSubmitKeepsValues`, `categoryShortcutsCompactAndInside`, `noHorizontalOverflow*`.
