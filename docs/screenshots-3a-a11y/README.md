# Phase 3A accessibility follow-up — rendered-state evidence

Captured with headless Chrome (CDP) against the running Expo **web** build and the live API on 2026-09-07. Every
figure below was read out of the real DOM — `role`, `aria-checked`, `aria-selected`, `aria-current`,
`aria-disabled`, `tabindex` and `document.activeElement` — before and after real keyboard and pointer
interaction. Checking the props handed to a component would not have proved anything here, because the defect was
that react-native-web dropped them.

`results.json` holds the automated checks (**63 of 63 true**, 0 console errors), the per-component records, and
the react-native-web version the run was made against (0.21.2).

## Root cause

`node_modules/react-native-web/dist/modules/forwardedProps/index.js` and `createDOMProps/index.js` accept only
the individual `aria-*` attributes (plus deprecated singular `accessibilityChecked` / `accessibilitySelected`
forms). `accessibilityState` survives only in the legacy `TouchableWithoutFeedback` export and in
`AccessibilityUtil/isDisabled`, so `accessibilityState={{ checked, selected }}` reached the DOM as nothing at all.
A second defect sat next to it: `PressResponder.isValidKeyPress` accepts Space only for `<button>` and
`role="button"`, so `radio` and `checkbox` controls answered to Enter alone.

## Per-component evidence

| Component | Screen | Rendered role | State before → after | Keyboard | Focus | Disabled |
|---|---|---|---|---|---|---|
| SegmentedControl | Finance · Yeni xərc | `radio` in `radiogroup` "Növ" | `Xərc=true, Gəlir=false` → `Xərc=false, Gəlir=true` | Tab enters the checked segment; arrows move focus and selection and wrap; Space checks | follows the selection | `aria-disabled` on every radio while saving |
| CategoryField chips | Finance · Yeni xərc | `radio` in `radiogroup` "Tez seçim" | all `false` → `Digər xərc=true`, one checked | arrows within the chips; "Hamısı" is a sibling button, not a group member | follows the selection | whole field disabled during submit |
| SelectionSheet | Finance · Hesab | `radio` in `radiogroup` "Hesab" | `Nağd=true, USD kart=false` → after ArrowDown `Nağd=false, USD kart=true` **while the field still reads "Hesab: Nağd"** | arrows move focus and the pending checked row; Space/Enter commits; Escape discards | stays inside the modal, returns to the trigger on Escape | disabled options carry `aria-disabled` and are skipped |
| SelectionSheet commit | Finance · Hesab | same group | pending moved to `USD kart` → Escape left the field at `Hesab: Nağd`; a later Space commit set it to `Hesab: USD kart` and closed the dialog once | Space commits the pending row; Enter does the same through the row | returns to the trigger after both Escape and commit | n/a |
| CalendarSheet | Finance · Tarix | `radio` in `radiogroup`, today `aria-current="date"` | ArrowRight moved the pending day to `8 sentyabr` **while the field still read `Tarix: 7 sentyabr 2026`**; Escape discarded it; a later Enter committed exactly `8 sentyabr` | ±1 day, ±1 week, Home/End, Space/Enter commit the pending day and close | pending follows focus; tab stop is pending → today → first open day | days past the maximum are `aria-disabled` and skipped |
| BalanceHero currency chips | Finance · Maliyyə | `radio` in `radiogroup` "Valyuta" | `AZN=true, USD=false` → `AZN=false, USD=true` | arrows switch the displayed currency | stays on the chip that became checked | n/a |
| FilterToggle | Finance · Hesablar | `checkbox` | `Arxivdəkilər=false` → `true` | Space toggles it (Enter already worked) | stays on the chip | n/a |
| Sidebar | Desktop 1440 × 900 | `link` inside `<nav>` | previously `role="tab"` in a `tablist` with no panel, container `role="menu"` → now `Maliyyə (aria-current=page)` | each destination is a tab stop | unchanged by navigation | n/a |
| TabBar | Nutrition 390 × 844 | `link` inside `<nav>` | previously `role="tab"` with state that rendered as nothing → now `Qidalanma (aria-current=page)` | each destination is a tab stop | moves to the new screen | n/a |
| SegmentedControl (meal) | Nutrition · Yeni yemək | `radio` in `radiogroup` "Öyün" | `Axşam yeməyi=true` → `Ara yemək=true` | arrows through the four meals; Space checks | follows the selection | all four `aria-disabled` while saving |
| Radio group tab order | Nutrition · Yeni yemək | `radiogroup` | previously every chip was its own tab stop → now one tab stop (`Ara yemək`), Tab moves out to `Tarix: …` | Tab in, arrows within, Tab out | the checked item is the entry point | disabled items are never the tab stop |
| DateNav | Nutrition · Qidalanma | `button` | `Növbəti gün` `aria-disabled=true`, `tabindex=-1` | skipped by Tab, cannot be activated | never lands on the unavailable day | future days blocked at the maximum date |

Checks that back the table include `segmentedOnlyOneChecked`, `selectionSheetArrowMovesChecked`,
`selectionSheetArrowDoesNotCommit`, `sheetEscapeDiscardsPending`, `sheetReopenRestoresCommitted`,
`sheetSpaceCommitsPendingOnce`, `calendarArrowMovesPendingChecked`, `calendarArrowDoesNotCommit`,
`calendarEscapeDiscardsPending`, `calendarReopenRestoresCommitted`, `calendarCommitsExactlyThePendingDay`,
`calendarSelectedDiffersFromToday`, `calendarTodayNotChecked`, `calendarTabStopIsSelectedDay`,
`calendarMonthChangeKeepsFocusAlive`, `radioGroupTabLeavesGroup`, `noOrphanTabRoles` and
`tabBarHasNoOrphanTabRoles` — see `results.json` for the full list.

## Pending versus committed selection

Both selection sheets and the calendar keep a **pending** choice while they are open. Arrow keys move focus and
the checked radio together, as the radio pattern requires, but the owning form field is untouched until the user
commits with Space, Enter or a tap. Escape discards the pending value and restores focus to the trigger. The
reset is a remount — each dialog renders its body only while open — so reopening always starts from the committed
value, and the calendar also returns to the committed date's month. `calendarCommitsExactlyThePendingDay`
compares the field after Enter against the day that had focus, which is what proves a single coherent commit
rather than a stale or doubled one.

## Calendar role hierarchy (inspected, not changed)

The calendar was read out of the DOM before any change in this pass:

```
div[role="radiogroup"][aria-label="Tarix"]
├─ 5 × div                      (leading placeholders, no role)
└─ 30 × div[role="radio"]       (one per day; aria-checked, aria-current="date" on today, aria-disabled on blocked days)
```

Element counts from that inspection: `radio` × 30, `row` × 0, `gridcell` × 0, `table`/`tr`/`td` ancestors × 0 —
so there are no explicit or implicit grid roles, and no `grid → row → gridcell` ownership to verify. Days are
mutually exclusive choices and React Native's `accessibilityRole` union has no `grid`, `row` or `gridcell`, so a
grid would have existed on the web only. The existing radio group is coherent — labelled container, exactly one
`aria-checked`, one tab stop, today marked independently — and was kept; only the pending-selection behaviour
above was added.

## Screenshots

Appearance is unchanged; these also show the focus ring the keyboard path depends on.

| File | What it shows |
|---|---|
| `01-finance-segmented-focus-1440x900.png` | The Xərc / Gəlir segments with a focused segment |
| `02-finance-selection-sheet-1440x900.png` | The account picker as a labelled radio group |
| `03-finance-calendar-1440x900.png` | The calendar grid with today outlined and the selected day filled |
| `04-finance-dashboard-1440x900.png` | The dashboard, currency chips unchanged visually |
| `05-sidebar-current-page-1440x900.png` | The desktop sidebar with the current destination highlighted |
| `06-nutrition-tabbar-390x844.png` | The phone tab bar on the nutrition diary |
| `07-nutrition-meal-segments-390x844.png` | The meal segments with a visible focus ring on "Ara" |

## What this run does not cover

VoiceOver and TalkBack were not exercised: this is the web build. The native side is covered by the Jest suite
(`src/components/a11y.test.tsx`), which asserts that React Native still receives the state through
`accessibilityState` after the aria props are merged — but announcement order, the native rotor, native focus
order and haptics remain unverified on a device.
