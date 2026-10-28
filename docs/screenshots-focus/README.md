# Fokus (Pomodoro) — evidence

Captured with headless Chrome (CDP) against the running Expo web app (Metro on 8081) and the live API on
`0.0.0.0:5134` with a real PostgreSQL database on 2026-09-30. Phone captures are 390 × 844 logical units at 2×
unless the file name says otherwise.

**No reference images arrived with the brief.** The three referenced designs were described but not attached,
so the screen follows the written requirements and Libra's own design system.

## The shortened demonstration duration

Shots 05–10 and the server figures below come from a **real, complete one-minute focus run**, not a mock: the
focus length was set to 1 minute in the settings sheet (shot 04), the phase was started, paused, resumed and
then allowed to expire on its own while the script waited out the clock.

**The production defaults are untouched** — 25 / 5 / 15 minutes with a long break after four runs — and shot
03 shows the screen at the default 25:00 before anything was changed. One minute is simply the smallest value
the domain accepts (`minPhaseSeconds`), which is what makes an end-to-end run observable in a capture.

## What the machine checked

`results.json` holds every check, the geometry of each shot, the measured countdown values and the summary
read back from the API. All three checks are true, and the run left **no console errors**:

- the Plan entry card is a single row (measured under 110 units tall), not a dashboard;
- **a paused countdown does not move**: `00:56` at the moment of pausing and `00:56` three seconds later;
- a completed phase offers the next one rather than starting it.

The countdown through the whole cycle, read from the running app: `25:00` (default) → `01:00` (configured) →
`00:56` running → `00:56` paused → `00:55` resumed → `Fokus tamamlandı` / `1 dəqiqə fokus` → `05:00`
`Qısa fasilə`.

**The record reached the database.** After the run, `GET /api/focus/summary` returned
`{ timeZone: "Asia/Baku", today: { activeSeconds: 60, completedSessions: 1, stoppedSessions: 0 } }` — written
through the outbox, with the server counting the session on its profile-local completion date.

## Screens

| # | File | What it shows |
|---|---|---|
| 01 | `01-plan-focus-card-idle-390x844.png` | The compact Fokus row in Plan, idle: the configured length, a hint and "Başla", above the task list rather than on top of it |
| 02 | `02-plan-task-focus-action-390x844.png` | "Bu işə fokuslan" in the task overflow sheet, beside the existing actions |
| 03 | `03-focus-ready-390x844.png` | The Focus screen at the production default: 25:00, phase selector, "Tapşırıqsız fokus", the 15 / 25 / 50 presets and the cycle line |
| 04 | `04-focus-settings-390x844.png` | The settings sheet: focus, short break, long break and runs-per-cycle, in whole minutes |
| 05 | `05-focus-ready-one-minute-390x844.png` | The same screen after configuring one minute for this capture |
| 06 | `06-focus-running-390x844.png` | Running: the arc is the real share spent, "Pauza" is primary, "Bitir" is quiet |
| 07 | `07-focus-paused-390x844.png` | Paused: the status says so and the countdown is frozen |
| 08 | `08-plan-focus-card-paused-390x844.png` | The Plan card while the phase is paused: what is left, the phase and "Pauzada" |
| 09 | `09-focus-completed-390x844.png` | Completed: a compact result, the cycle at 1 / 4, and "Fasiləyə başla" — offered, not started |
| 10 | `10-focus-break-ready-390x844.png` | The short break, prepared explicitly at 05:00 |
| 11 | `11-focus-dark-390x844.png` | Tünd |
| 12–13 | `12-focus-360x800.png`, `13-focus-430x932.png` | 360 and 430 units, no horizontal overflow |
| 14 | `14-focus-reduced-motion-390x844.png` | `prefers-reduced-motion: reduce` |
| 15 | `15-focus-large-text-390x844.png` | Browser-scaled text (see the caveat below) |
| 16 | `16-focus-desktop-1440x900.png` | The desktop shell |

## Videos

| File | What it shows |
|---|---|
| `start-pause-resume-finish.mp4` | 24 s: the Plan card → the Focus screen → Başla → running → Pauza (the countdown stops) → Davam et → Bitir, with the confirmation that says the time will be kept but will not count as a completed focus |
| `start-pause-resume-finish-reduced-motion.mp4` | The same flow under reduced motion. The screencast emitted 19 painted frames instead of 204 for the same twenty seconds, which is the animation actually not running |

## The hourglass (2026-10-01)

`hourglass/` holds the illustration pass, captured the same way.

**The asset.** `assets/images/focus-hourglass.png` (1254 px, RGBA, 1 MB) is the supplied source and is
untouched. The shipped file is `focus-hourglass-card.png`: cropped to the drawn content (656 × 1061) with a
3 % margin and resized to **169 × 264** — 3× the 88-unit display height, 61 KB. It is portrait, so the
derivative and the slot keep its own proportions (56 × 88) rather than forcing it into a square. Its alpha
edge was measured before use: of 1 124 sampled semi-transparent pixels, **none** is near-white, so there is
no matte against the dark palette, and the average edge pixel is `rgba(99, 108, 97, 138)`.

**All four machine checks are true**, and the run left no console errors:

- it is decorative — its nearest `aria-hidden="true"` ancestor exists;
- it keeps its aspect: rendered at 56 × 88, within 0.02 of the source's 169 : 264;
- it is compact: 88 units tall, inside the 80–96 band;
- **the slot is reserved** — the countdown sits at y 364 in ready, running *and* completed, so the
  illustration appearing and disappearing moves nothing.

| File | What it shows |
|---|---|
| `hourglass/01-light-ready-390x844.png` | Ready, light: the hourglass above the dial, the code-drawn ring at 25:00, the presets and "Başla" |
| `hourglass/01-light-running-390x844.png` | Running, light: no illustration — the countdown and controls have the screen |
| `hourglass/01-light-completed-390x844.png` | Completed, light: the hourglass returns beside the result |
| `hourglass/02-dark-ready-390x844.png` | Ready, Tünd |
| `hourglass/02-dark-running-390x844.png` | Running, Tünd |
| `hourglass/02-dark-completed-390x844.png` | Completed, Tünd |
| `hourglass/03-ready-360x800.png`, `hourglass/04-ready-430x932.png` | 360 and 430 units |
| `hourglass/05-ready-large-text-390x844.png` | Browser-scaled text |
| `hourglass/06-ready-reduced-motion-390x844.png` | `prefers-reduced-motion: reduce` |

The completed shots in both themes are again real one-minute expiries, configured through the settings sheet;
the production defaults are untouched and shot 01 shows 25:00 before anything was changed.

## The scene redesign (2026-10-01)

`scene/` holds the redesign pass: one forest scene instead of a pale circle beside a small illustration, six
distinct state presentations, and a real motion system.

**All six machine checks are true**, no shot flags overflow or clipped text, and the run left no console
errors:

- the scene's corner radius is **32** (the brief asked for 30–34);
- the hourglass renders at **146** units tall (120–150);
- the countdown is **64 px** (64–72);
- a stopped session leads with the time actually focused, never a clock;
- a stopped session does **not** advance the cycle (`0 / 4`);
- a completed one does (`1 / 4`).

The six presentations, read from the running app:

| State | Headline | Label | Title | Primary |
|---|---|---|---|---|
| Ready | `25:00` | qalıb | Fokusa hazır | Başla |
| Running | `00:56` | qalıb | Fokus | Pauza (+ Sessiyanı dayandır) |
| Paused | `00:56` frozen | qalıb | Pauzadadır | Davam et |
| Completed | `1 dəqiqə` | tamamlanmış fokus | Fokus tamamlandı | Fasiləyə başla |
| **Stopped** | `4 saniyə` | fokuslanmış vaxt | Sessiya dayandırıldı | Yenidən fokuslan |
| Break | `05:00` | qalıb | Qısa fasilə | Fasiləyə başla |

The stopped row is the defect this pass fixes: it used to read `24:59` / `Bitdi` / `Vaxtından əvvəl
bitirildi` / `2 saniyə fokus` all at once.

| File | What it shows |
|---|---|
| `scene/light-01-ready.png` … `scene/light-07-stopped.png` | Ready, settings, running, paused, completed, break and stopped — light |
| `scene/dark-01-ready.png` … `scene/dark-07-stopped.png` | The same seven in Tünd |
| `scene/07a-stop-confirmation.png` | The stop confirmation, which says the time is kept and is not styled as a deletion |
| `scene/08-ready-360x800.png`, `scene/09-ready-430x932.png` | 360 and 430 units |
| `scene/10-ready-large-text.png` | Browser-scaled text |
| `scene/11-ready-reduced-motion.png` | `prefers-reduced-motion: reduce` |

### Motion

| File | What it shows |
|---|---|
| `scene/focus-scene-motion.mp4` | 84 s: the entrance, the drifting light and floating hourglass while running, the pause (drift freezes, illumination dims), the resume, the settings sheet opening and closing mid-run, and the natural completion with its ring pulse |
| `scene/focus-scene-motion-reduced.mp4` | The same flow under Reduce Motion |

The screencast painted **3 357 frames** in 70 seconds normally and **74** for the same interaction under
Reduce Motion. That difference is the ambient system actually running, and actually stopping.

## Browser evidence versus device evidence

**Everything above is browser evidence.** It proves the state machine, the persistence, the API round trip and
the layout. It proves nothing about the operating system, and none of the following was tested on hardware,
because no physical device was available to this session:

- **local notification delivery**, including on a locked screen, and that pausing cancels the alarm;
- **force-close and reopen** across an expiry (the equivalent is covered by automated tests that restore from
  storage with a controlled clock, but not by a real process kill);
- **haptics**;
- **native accessibility** (VoiceOver / TalkBack announcements, focus order through the sheet and dialog);
- **Dynamic Type** — shot 15 scales CSS only and leaves `PixelRatio.getFontScale()` at 1, so the reflow that
  drops the ring at large text does not engage there;
- **that the sleep reminder survives** a focus run on a real device (the separation is covered by unit tests);
- **how the scene and its motion feel on a real screen** — the ambient drift, the float and the completion
  pulse were verified frame-by-frame in a browser screencast, but no device has rendered them, and neither
  60 fps smoothness nor battery cost can be judged from here;
- **how the hourglass renders on a real screen** — its colours were verified against both palettes by
  compositing the actual pixels, and its geometry was measured in the browser, but no device displayed it.

All of these are listed in `docs/DEVICE-CHECKS.md` under "Fokus".

One pre-existing flag is left alone: at 1440 the sidebar truncates the profile name and email with an
ellipsis. That is the shared `Sidebar`, outside this task.
