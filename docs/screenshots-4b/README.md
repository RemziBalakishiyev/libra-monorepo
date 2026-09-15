# Phase 4B — Sleep evidence

Captured with headless Chrome (CDP) against the running Expo web app, the live API and a real PostgreSQL
database on 2026-09-10. Every session in these captures was created by the walkthrough itself, through the app
or the API. Phone captures are 390 × 844 logical units at 2× density unless the name says otherwise.

`results.json` holds the automated checks (**49 of 49 true**), the measurements quoted below, and the console
output of the run.

The API ran in Development with the photo-analysis development fixture **off**, which is the normal
configuration. Phase 3B's deferred live-provider check is untouched and still skips.

This is **browser** evidence. Local notifications, native pickers, keyboard behaviour, dynamic type, gestures
and haptics were not exercised on a device and remain unverified — see "What this cannot show" below.

## The flow

| # | File | What it shows |
|---|---|---|
| 01 | `01-sleep-empty-390x844.png` | Nothing recorded yet: an honest empty state with "Yatmağa başla", seven dates that all read "Qeyd yoxdur", and the browser's reminder fallback |
| 02 | `02-sleep-active-390x844.png` | A running night: its start time, the elapsed figure derived from that instant, and a prominent "Oyandım" |
| 03 | `03-sleep-restored-390x844.png` | After leaving the app and coming back, the running session is restored from the server |
| 04 | `04-sleep-wake-failed-390x844.png` | "Oyandım" with the stop endpoint blocked: the captured moment is named in a banner and nothing is recorded |
| 05 | `05-sleep-recorded-390x844.png` | Reconnected and re-sent: the night is closed at the moment the user pressed, not at the moment the network returned |
| 06 | `06-sleep-rating-390x844.png` | The optional rating, applied after the fact and named in words |
| 07 | `07-sleep-history-390x844.png` | The recorded night in the history |
| 08 | `08-sleep-correction-390x844.png` | A correction to the start, with the length recomputed live |
| 09 | `09-sleep-manual-390x844.png` | Manual entry: the eight hours before now, its length shown before saving, the rating explicitly optional |
| 10 | `10-sleep-validation-390x844.png` | Waking before falling asleep is reported at its own field, and nothing is written |
| 11 | `11-sleep-week-390x844.png` | The seven days, the average labelled with the days it averages, and the history |
| 12 | `12-home-sleep-390x844.png` | Home's compact sleep card with the real last night |
| 13 | `13-home-quick-add-390x844.png` | Quick Add before Finance exists: "Yemək", "Tapşırıq" and "Yuxu" |
| 14 | `14-sleep-forgotten-390x844.png` | A session left open for 60 hours: still open, never clipped, correctable or discardable |
| 15–17 | `15-sleep-360x800.png`, `16-sleep-768x1024.png`, `17-sleep-1440x900.png` | Every reviewed width |
| 18 | `18-sleep-dark-390x844.png` | Dark theme |
| 19 | `19-sleep-relative-large-text-289x625.png` | The same phone with the viewport narrowed by 1.35× (see the note below) |
| 20 | `20-sleep-reduced-motion-390x844.png` | Reduced motion: final values, no travel |
| 21 | `21-sleep-first-fold-390x844.png` | "Oyandım" reachable without scrolling at 390 × 844 |
| 22 | `22-sleep-form-keyboard-height-390x520.png` | A keyboard-height viewport with "Yuxunu əlavə et" still reachable |

`walkthrough-normal.mp4` and `walkthrough-reduced-motion.mp4` record the same flow end to end: start → leave and
return with the session restored → "Oyandım" while the network refuses → retry → rating → history. Both are
390 × 844, ~30 s, H.264; they were re-decoded after encoding and frames extracted from the encoded files were
inspected, not just the source PNGs.

## Measurements

- **The running figure** (`measurements.restored`, `elapsedAria`): the elapsed display is recomputed from the
  session's stored start instant. It carries a spoken name ("Keçən vaxt: …") but **no** `aria-live`, so a value
  that changes every half minute never interrupts a screen reader.
- **One open session** (`measurements.secondStartStatus`): a second start while one is running returns **409**.
  The database enforces it too — `ix_sleep_sessions_open` is a partial unique index over `user_id` where
  `ended_at_utc IS NULL`.
- **The captured wake-up** (`measurements.pending`, `recorded`): with `*/api/sleep/sessions/*/stop` blocked, the
  wake instant is written to device storage scoped to the user and that session, the server still reports the
  night as open, and the banner names the moment. Eight seconds later the retry sends
  `2026-09-09T21:49:04.685Z` — the instant of the press, not `21:49:13` when the connection returned.
- **Repeated stop** (`measurements.repeatedStop`): stopping the same session again returns **200** with the same
  `endedAtUtc`; the end never moves and no newer session is touched.
- **The rating** (`measurements.rated`): quality 4 is stored while `startedAtUtc` and `endedAtUtc` stay exactly
  as recorded — the form re-sends the stored instants when the minute on screen has not changed.
- **Stale correction** (`measurements.staleEditStatus`): a second save built on the version the form read before
  someone else changed it returns **409**.
- **Validation** (`measurements.validation`): an inverted pair reports "Oyanma vaxtı yuxu başlanğıcından sonra
  olmalıdır." at the wake field, and the session count is still 1 — nothing was written.
- **Midnight crossing** (`measurements.manual`): 23:20 on 7 September until 06:50 on 8 September, local, is
  stored as one 450-minute session with `wakeDate` **2026-09-08**. It is counted once, on the date of waking.
- **The week** (`measurements.week`, `summary`): five of the seven dates read "Qeyd yoxdur" rather than a zero,
  and the average reads `3 s 48 d · 2 gün üzrə` — 456 minutes over the **2** recorded days, not over seven.
- **Aggregates and paging** (`measurements.pagination`): a page of size 1 returns 1 item out of 2, while the
  summary still counts both sessions. The totals are computed over the data, not over a page of it.
- **A forgotten night** (`measurements.forgotten`): a session open for 60 hours still reports
  `durationMinutes: null` and `isOpen: true`. Nothing clipped it, nothing closed it, and the screen offers both
  a correction and an explicit discard.
- **Home and Quick Add** (`measurements.homeCard`, `quickAdd`, `afterQuickAdd`): the card reads "Son yuxu Bu
  gün, 6 dəqiqə"; Quick Add offers "Yuxu" before Finance is configured, and opening it leaves the server with
  no active session — it neither starts nor stops one.
- **Reach** (`measurements.firstFold`, `footerVisible`): at 390 × 844 "Oyandım" ends 259 px down a 844 px
  viewport. Sleep is a pushed screen rather than a tab, so the floating tab bar is not on it. At a
  keyboard-height 390 × 520 viewport the form's submit still ends at 508 px.
- **Console** (`measurements.unexpectedConsoleErrors`): empty. The only logged failures are the deliberately
  blocked stop requests.

## Notes on method

- **Enlarged text.** Current Chrome no longer exposes `Page.setFontSizeOverride`, which Phase 4A used. Capture
  19 is the nearest honest substitute: the same content in a viewport narrowed by the same 1.35× factor, so
  every element keeps its size while the space around it shrinks. Real dynamic type on iOS and Android is
  **not** verified here.
- **Sub-minute sessions.** The tracked night in these captures lasts seconds, so it reads "0 d". That is the
  walkthrough being quick, not a rounding rule: the stored interval keeps full precision, which is why the
  rating did not move it.

## What this cannot show

- **Local notifications.** `expo-notifications` has no web implementation, so the reminder is reported on the
  browser as unavailable (visible in captures 01–02) and its scheduling, cancellation and reconciliation are
  covered by unit tests (`src/mobile/src/lib/sleep-reminder.test.ts`) rather than by a device.
- Native date and time pickers, the real keyboard, dynamic type, gestures and haptics.
- The behaviour of a device that is off, in Doze, or has notifications disabled at the system level.
