# AI Safety

These rules bind every AI feature (food-photo analysis in Phase 3B, chat and insights in Phase 7). They are restated here so that no phase can quietly relax them.

## Principles

1. **Estimates stay drafts.** AI food analysis is stored as `PendingConfirmation`. Only the user's explicit confirmation, after editing portions/items, creates a meal. Unconfirmed drafts never affect totals.
2. **No mutation without preview and confirmation.** AI may propose a transaction, task, or meal. A proposal returns a preview and a confirmation token that is scoped to the user and exact payload, short-lived, and single-use. Mutation happens only through a separate confirmation endpoint/UI action. Destructive actions require a distinct confirmation.
3. **Least privilege tools.** The model calls application-level tools with strict schemas. It never has SQL, database credentials, network access, or a raw entity graph. The backend executes tools and enforces `UserId` on every call.
4. **Minimum data.** Tools return purpose-built read models with the minimum fields, bounded date ranges, and bounded result sizes. The full database is never serialized into a prompt.
5. **Untrusted content.** Notes, task titles, meal names, counterparty names, and any text derived from images are data, never instructions. Model output is untrusted data and is schema-validated and bounded before use.
6. **Informational only.** System instructions state that food estimates are approximate and that financial/health responses are informational, not professional diagnosis or advice. Answers based on analytics state the analyzed date range and distinguish facts from suggestions.
7. **Cost and abuse limits.** Per-user rate limits, model iteration limits, token limits, request size/type limits, and timeouts are configured and tested. CI never makes paid live calls; providers are mocked.
8. **Privacy.** API keys live only on the backend. Raw image bytes, secrets, and unnecessary personal prompt content are never logged. Image metadata is stripped where feasible. Retention of images and drafts is time-limited and documented.
9. **Audit.** Every tool call records tool name, user, time, outcome, and safe metadata.
10. **Provider neutrality.** AI providers sit behind an adapter (`IAiFoodAnalyzer`, assistant provider) with a deterministic fake for development and tests.

## Required tests (per feature phase)

- Cross-user isolation through tools and drafts
- Malformed or absurd model output rejected
- Forged, expired, and replayed confirmation tokens rejected
- Unauthorized tool attempts blocked
- Prompt injection stored in user content does not change behavior
- Provider timeout/failure handled and surfaced clearly
- Cost/iteration limits enforced

## Photo analysis as built (Phase 3B)

`photo → normalized image → provider call → versioned estimate → owner-scoped draft → editable review →
explicit confirmation → nutrition entry`

**Provider.** One adapter, `OpenAiFoodAnalyzer`, calls the OpenAI Responses API with an image input and strict
Structured Outputs (`text.format.type = "json_schema"`, `strict: true`). Model, base URL, key and every limit
come from backend configuration (`Ai:OpenAi`, `Ai:FoodAnalysis`). The key is read through user-secrets or an
environment variable, is never written to source, and never reaches the mobile bundle or an `EXPO_PUBLIC_`
variable — the app only ever talks to Libra's own API. The adapter is registered unconditionally: with no key it
answers `NotConfigured`, which surfaces as an honest 503, and never as a fabricated estimate. Deterministic
fixtures exist only in the test host (`FakeFoodAnalyzer`).

**What the model receives.** One normalized JPEG and one fixed instruction. No tools, no database access, no
user data beyond the picture. Text visible inside the photo, and every string the model returns, is data: it is
schema-validated, range-checked and stored as content, never executed or followed.

**What the model returns.** A bounded, versioned result (`food-analysis.v1`): outcome (`success`,
`insufficient_information`, `no_food_detected`), up to 20 foods with a name, portion description, estimated
grams, a basis (`pictured_portion` or `per_100g`), the four nutrients, per-item and overall confidence, and one
note. Confidence is the model's own assessment, labelled as such, and is never presented as measured accuracy.
A nutrient the model cannot judge is `null` and stays missing all the way to the review form — it never becomes
a zero. Refusals, truncated answers, unknown enum values and out-of-range numbers are named failures; nothing is
clamped or repaired into something plausible.

**Retention — Libra's, separately from the provider's.**

| | Libra | OpenAI |
|---|---|---|
| Request/response | Draft rows keep the estimate; the request body is never logged | `store: false` is sent on every call, so responses are not retained for the account. Abuse monitoring may still hold data for up to 30 days ([data controls](https://developers.openai.com/api/docs/guides/your-data)) |
| Image bytes | Deleted as soon as the draft is confirmed or discarded, and in any case after `Ai:FoodAnalysis:ImageRetentionMinutes` (default 120) | Sent inline with the request; not retained under `store: false` beyond that window |
| Drafts | Pending drafts expire after `DraftLifetimeMinutes` (default 120) and are swept by `FoodAnalysisCleanupService`; confirmed drafts keep their original estimates as a record | — |

Cleanup removes drafts and pictures only. A confirmed nutrition entry is never touched by any sweep.

**Limits.** Upload size (8 MB), decoded pixel count (50 M), minimum dimension, output tokens (1200), request
timeout (45 s), process-wide concurrency (4) and per-user frequency (20 analyses/hour) are all configured and
enforced, and each has a test. CI makes no paid calls: the live-provider check is skipped unless `LIBRA_LIVE_AI=1`
and a key are both set, and it says in its output whether it ran.

**Logs.** Raw image bytes, the API key and provider response bodies never reach the log. A failed call logs the
status code and the failure kind, nothing else.

Consequences that follow from the rules above and from D-045:

- A draft is not an entry. Drafts are stored separately and never counted in any day total, goal progress, or
  Home summary; only `POST /confirm` writes a meal.
- The confirmation step edits the same fields as the manual form and goes through the ordinary create path, so a
  confirmed draft gets its own item snapshots and the estimate stays untouched next to it.
- Confirmation is idempotent per draft: repeated, retried or concurrent confirmations return the first meal, even
  under a different `clientRequestId`.
- Estimates are labelled as estimates in the UI up to the moment the user confirms them.
