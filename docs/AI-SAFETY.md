# AI Safety

These rules bind every AI feature (food-photo analysis in Phase 6, chat and insights in Phase 7). They are restated here so that no phase can quietly relax them.

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
