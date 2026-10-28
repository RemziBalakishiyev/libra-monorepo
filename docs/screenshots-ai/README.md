# Libra AI — evidence (Phase 7A)

Captured 3 October 2026 from the real app against the real API. **Every answer here comes from the
development fixture provider** (`Ai:Assistant:UseDevelopmentFixture=true`, Development only), which describes
the snapshot it was handed and cannot invent a figure. **No API key is configured and no paid call was made.**
Answers produced this way carry `isFixture: true` and the app labels them "Nümunə cavab (fixture)" — the badge
is visible in every populated shot below.

## How this was produced

- **Browser, not a device.** Headless Chrome at 390 × 844 (dsf 2) over the Expo web build, plus one desktop
  width. This verifies layout, copy, states, roles and the request/response contract. It does **not** verify
  the native keyboard, native Reduce Motion, haptics or real device performance — those are device checks and
  are listed in `docs/DEVICE-CHECKS.md`. Shot 16 shortens the viewport as a proxy for an open keyboard; it is
  not a native keyboard.
- Two seeded users, created through the public API: one with records in all five modules (including an overdue
  task whose title carries an injection attempt, and a second currency), one with no records at all.
- Shots 20–21 were taken from a second run of the same build with the fixture **off** and no provider key, so
  the unavailable state is the real one rather than a simulated one.
- Shot 10 holds the real `/ask` request open on the wire for four seconds; shot 11 answers it with a real 503.
  Neither fabricates a response body.
- The Expo dev-tools badge visible at the bottom-left of a few shots belongs to the web dev server, not to the
  app.

## The walkthrough

| # | Shot | What it shows |
|---|---|---|
| 01 | `01-landing-light-390x844` | The landing composition: header with history, the orb, "Bu gün nəyə diqqət edək?", four prompt cards, the context control stating the period, the modules and the resolved date, and the composer above the navigation |
| 02 | `02-landing-dark-390x844` | The same in dark |
| 03 | `03-landing-reduced-motion-light-390x844` | Reduce Motion: the orb holds still and the entrances do not travel |
| 04 | `04-context-sheet-light-390x844` | Period and modules, with the note that applying starts a new conversation |
| 05 | `05-answer-finance-light-390x844` | **Prompt → grounded answer.** The intro has collapsed. The fixture badge, the summary, metric cards rendered from the cited facts (money to both decimals, as the server computed it), the observations, "Təkliflər" kept apart, "Mənbələr (7)" and a follow-up |
| 06 | `06-sources-light-390x844` | **Source details.** The period and the collection time, then every fact with its figure, what it refers to, its window and its caveat, each openable in its own module |
| 07 | `07-follow-up-answer-light-390x844` | **Follow-up** asked from the chip, continuing the same conversation |
| 08–09 | `08-answer-nutrition-dark`, `09-sources-dark` | An answer and its sources in dark |
| 10 | `10-loading-light-390x844` | **Loading.** The question stays on screen and the card says only that the records are being read — no percentage, no simulated streaming |
| 11 | `11-failed-retry-light-390x844` | **Failed.** The question is kept in a retry strip rather than lost |
| 12 | `12-retry-recovered-light-390x844` | After retrying under the same client request id: one question in the conversation, not two |
| 13 | `13-landing-no-records-light-390x844` | A user with no records at all |
| 14 | `14-insufficient-data-light-390x844` | **Insufficient data.** Scoped to Finance, where this user has no account: the outcome is named instead of answered around |
| 15 | `15-sources-no-records-light-390x844` | The same question's sources: "Qeyd yoxdur" throughout — missing records, not zeros |
| 16 | `16-composer-keyboard-inset-light-390x460` | The composer with the keyboard region removed from the viewport (web proxy), send enabled once there is text |
| 17 | `17-history-light-390x844` | Conversation history, each row stating its period and modules |
| 18–19 | `18-landing-desktop`, `19-answer-desktop` | Desktop web at 1280 × 900, where the sidebar replaces the tab bar |
| 20–21 | `20-unavailable-light`, `21-unavailable-dark` | **Unavailable, for real.** No provider key: "AI köməkçi hələ aktiv deyil", composer disabled, prompt cards withheld, and nothing canned offered in place of an answer |

## Measured in the run

`results.json` and `unavailable-results.json` hold the probe output. Of note:

- No console errors and no horizontal overflow in any shot (the two `clipped` flags on the desktop shots are
  the sidebar's own name and email, which predate this work).
- The orb reports `aria-hidden="true"`: it is decoration and stays out of the accessibility tree.
- After the retry, one question bubble exists — the server returned the stored turn rather than asking twice.
- After the follow-up, two questions exist in one conversation.
- In the unavailable run the send control is disabled and the prompt cards are not rendered, in both
  appearances.
