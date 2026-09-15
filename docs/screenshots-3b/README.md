# Phase 3B — food-photo analysis evidence

Captured with headless Chrome (CDP) against the running Expo web app, the live API and a real PostgreSQL
database on 2026-09-07. Every draft and every meal in these captures was produced by the walkthrough itself
through the application or the API. Phone captures are 390 × 844 logical units at 2× density unless the name
says otherwise.

`results.json` holds the automated checks (**51 of 51 true**), the measurements quoted below, and the console
output of the run.

**The analyzer.** The API ran in Development with `Ai:FoodAnalysis:UseDevelopmentFixture=true`, so the estimates
come from `DevelopmentFixtureFoodAnalyzer` and every draft records `development-fixture` as its model. That
switch needs both the Development host and the explicit setting (`FoodAnalysisRegistrationTests` proves it), and
it exists because **no API key was available for this session**. Without the key the real adapter answers
`NotConfigured`, which is the 503 in capture 10 — it never invents a result. The provider request itself
(OpenAI Responses, image input, strict Structured Outputs) is therefore **not** verified live here; the schema,
refusal, truncation and range handling are covered by the unit fixtures, and an opt-in live check
(`LIBRA_LIVE_AI=1`) is ready to run once a key exists. See "Remaining setup" in the phase report.

This is **browser** evidence. Native camera capture, gallery permission dialogs, keyboard behaviour, dynamic type
and haptics were not exercised on a device and remain unverified.

## The flow

| # | File | What it shows |
|---|---|---|
| 01 | `01-diary-photo-action-390x844.png` | The diary offering "Şəkildən əlavə et" in the header and in the empty state, beside the manual actions |
| 02 | `02-photo-choose-390x844.png` | Before anything is picked: the sentence saying the photo will be sent for AI processing, and "Əl ilə əlavə et" |
| 03 | `03-photo-preview-390x844.png` | The chosen picture, still local — replacement is offered and nothing has been uploaded |
| 04 | `04-photo-review-390x844.png` | The estimate: "AI təxmini", the model's own 60 %, its note, and every value editable |
| 05 | `05-photo-review-missing-value-390x844.png` | The macro the model could not judge blocks the confirmation at its own field |
| 06 | `06-photo-review-complete-390x844.png` | The same review once the reviewer supplied it, with the live total |
| 07 | `07-diary-after-confirm-390x844.png` | The diary after "Təsdiqlə və əlavə et", with one toast |
| 08 | `08-home-after-confirm-390x844.png` | Home's nutrition summary following the confirmed meals |
| 09 | `09-photo-after-cancel-390x844.png` | Cancelling a review: the draft is discarded and the day is unchanged |
| 10–13 | `10-photo-unavailable`, `11-photo-timeout`, `12-photo-rate-limited`, `13-photo-rejected` | Analysis unavailable (503, the no-credentials answer), timeout (504), the hourly ceiling (429) and a rejected picture (400) |
| 14–15 | `14-photo-no-food-390x844.png`, `15-photo-unclear-390x844.png` | The two outcomes with nothing to estimate, each with the model's note and a way to try another photo |
| 16 | `16-photo-offline-390x844.png` | A blocked endpoint: a connection failure, not a pretend result |
| 17–19 | `17-review-360x800.png`, `18-review-768x1024.png`, `19-review-1440x900.png` | The review at every reviewed width |
| 20 | `20-review-dark-390x844.png` | Dark theme |
| 21 | `21-review-reduced-motion-390x844.png` | Reduced motion: final values, no travel |
| 22 | `22-review-keyboard-height-390x520.png` | A keyboard-height viewport with "Təsdiqlə və əlavə et" still reachable (bottom 508 of 520) |
| 23 | `23-diary-1440x900.png` | The diary on desktop with the confirmed meals in it |

## Measurements

- **The upload**: a 900 × 675 JPEG of 10 947 bytes, drawn in the page and handed to the picker, travels the real
  multipart path; the server normalizes and re-encodes it before the analyzer sees it.
- **Normalization** (`measurements.reviewFields`): the pictured-portion food arrives as **1 portion / 250 kcal**
  (its 180 g estimate stays metadata), the per-100 g food as **180 g / 130 kcal per 100 g**. The estimated weight
  and the portion count are never both applied.
- **Contribution** (`measurements.entryItems`): 250 kcal + 234 kcal → a day total of **484 kkal**, protein
  **22,86 q** after the reviewer supplied 2,7 g/100 g.
- **The draft boundary** (`measurements.confirmedDay`, `apiDraft`): while the review was open the day held
  **0 entries and 0 kcal**; a blocked confirmation left it at 0; confirming created exactly **one** meal.
- **Idempotency** (`measurements.confirmStatuses`): confirming the same draft twice under **two different**
  `clientRequestId` values answered **201 then 200** and returned the same entry id — one meal, not two.
- **After confirmation** (`measurements.confirmedDraft`): the draft reads `Confirmed`, still carries the model's
  original 250 kcal estimate, `hasImage` is false and the image endpoint answers **404**.
- **Isolation**: a second registered user asking for the draft by id gets **404**.
- **Console**: the only errors logged are the four HTTP failures the captures deliberately provoke
  (503, 504, 429, 400); `measurements.unexpectedConsoleErrors` is empty.
- **No horizontal overflow** at 360, 390, 768 or 1440, in either theme.

## Recordings

Both are 390 × 844 H.264 MP4s of the same flow — diary → photo → preview → analyze → review → confirm — and were
inspected after encoding:

| File | Source frames | Dimensions | Duration | Decoded frames | Bytes |
|---|---|---|---|---|---|
| `walkthrough-normal.mp4` | 77 | 390 × 844 | 00:00:16.35 | 327 | 214 794 |
| `walkthrough-reduced-motion.mp4` | 28 | 390 × 844 | 00:00:16.00 | 320 | 178 394 |

The reduced-motion capture needed **28** frames for the same 13 seconds of interaction against **77**: with
`prefers-reduced-motion: reduce` the screen changes state without animating between states, so far fewer frames
differ.
