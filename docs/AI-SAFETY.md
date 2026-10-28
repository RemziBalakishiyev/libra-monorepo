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

## The assistant as built (Phase 7, first usable version)

`question → owner-scoped snapshot → provider call → strict structured answer → fact-id validation →
stored turn with its snapshot`

**Read-only, by construction.** This version answers questions about Finance, Nutrition, Tasks, Sleep and
Focus and writes nothing to any of them. No endpoint in `/api/assistant` creates a record, completes a task,
changes a goal, starts a timer or schedules a notification, and the model is given no tools at all — so the
read-only promise is a property of what the provider can reach, not a rule it is asked to obey. A plan the
assistant proposes is text in a conversation and stays a proposal.

**What the model receives.** One snapshot and the question, plus at most `MaxHistoryTurns` earlier
question/summary pairs. The snapshot holds the profile's IANA time zone, the resolved date range, the
collection timestamp, the selected modules and a bounded list of facts, each with a stable id, a label, a
value and unit, the period it covers, its caveat and its source route. It is built from the same aggregates
the module screens use — complete aggregates, never a total summed from a page of a list — through the
caller's own queries. No credentials, no SQL, no database handle, no tools, no network access. Nothing else
about the user travels with the request: no email, no identifiers, no raw meal photos, and no free-text notes
or task titles unless a fact's own `text` needs them, in which case that text is clipped and is data.

**Availability is explicit, and that is the point.** `NoRecords` means nothing was logged and is never a zero
the user achieved; `Partial` means the period is only partly covered; `Unavailable` means that module could
not be read for this request, which degrades one module instead of failing the answer. The domain rules
travel as caveats and are preserved verbatim: currencies stay separate and are never combined, transfers are
not expenses, nutrition figures describe logged intake only, sleep keeps its existing attribution and
duration rules and an open session is not a completed night, today's tasks and overdue tasks stay distinct,
and focused duration excludes breaks and paused time.

**What the model returns.** A strict structured output (`text.format.type = "json_schema"`, `strict: true`,
schema `libra_assistant_answer`) with one of four outcomes — `Answer`, `InsufficientData`,
`ClarificationNeeded`, `Refusal` — a short summary, bounded observations each carrying the fact ids it rests
on, suggestions kept in their own list, optional follow-up questions, and a clarification when one is needed.

**Grounding is verified, not requested.** `AssistantHandler.IsGrounded` walks every observation's fact ids
against the snapshot that was just built. One id the snapshot does not contain invalidates the whole answer:
it is returned as 503 and nothing is stored. There is no partial credit and no repair. Displayed figures are
rendered by the client from the snapshot, so the model cannot supply a replacement financial total or
nutrition calculation even in an answer that is otherwise accepted.

**Untrusted content.** Task titles, notes, meal names, the user's own messages and every string inside the
snapshot are data. The instruction says so, and nothing in the pipeline executes, follows or re-dispatches on
them. An injected "ignore previous instructions" stored in a task title travels as a quoted fact value and
changes nothing; the integration tests assert exactly that.

**Conversations and scope.** Each answer is stored with the snapshot it was based on, so an older turn keeps
the figures it actually used and never appears to cite today's numbers. Changing the selected modules or the
period starts a new conversation rather than re-scoping an old one, so an earlier turn cannot reintroduce
data that is now excluded. Every read and delete resolves the conversation id together with the caller's user
id, so another account's conversation behaves exactly like one that does not exist.

**Idempotency.** `clientRequestId` is generated on the device before the send and the database holds one row
per `(user, clientRequestId)`. A retry after an uncertain answer returns the stored turn; the provider is not
asked, and not paid, twice.

**Unavailable, never substituted.** With no key the provider reports `IsConfigured` false, `/ask` answers 503
with `"AI köməkçi hələ aktiv deyil."`, and the app shows that sentence with the composer disabled. No canned
advice is ever presented as an answer. A deterministic fixture (`DevelopmentFixtureAssistant`) exists only in
tests and in Development behind `Ai:Assistant:UseDevelopmentFixture`; every answer it produces carries
`isFixture: true`, the app labels it "Nümunə cavab (fixture)", and evidence captured from it is marked as
fixture evidence.

**Retention — Libra's, separately from the provider's.**

| | Libra | OpenAI |
|---|---|---|
| Question and answer | Stored as conversation turns until the user deletes the conversation | `store: false` is sent on every call, so responses are not retained for the account. Abuse monitoring may still hold data for up to 30 days ([data controls](https://developers.openai.com/api/docs/guides/your-data)) |
| Snapshot | Stored as `jsonb` beside the answer it grounded, and deleted with the conversation | Sent inline with the request; not retained under `store: false` beyond that window |

`store: false` is a provider setting, not a blanket zero-retention guarantee: the abuse-monitoring window
above still applies, and Libra's own retention is the row lifetime in the table on the left.

**Limits.** `MaxQuestionsPerHour` (30) per user, process-wide concurrency of 8 with a `QueueSeconds` (5) wait
before 429, `TimeoutSeconds` (40) per call and `MaxOutputTokens` (900) per answer, all under `Ai:Assistant`
and deliberately separate from `Ai:FoodAnalysis` so neither feature can exhaust the other's budget. API-key
setup and live-provider verification are deferred: no paid call has been made, and CI makes none.

**Logs.** A failed provider call logs the status code or the failure kind and nothing else. Prompt bodies,
snapshots, questions, answers and the API key never reach the log.
