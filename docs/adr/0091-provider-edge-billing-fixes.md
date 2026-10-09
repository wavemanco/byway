# ADR-0091: Provider-edge billing fixes: one billing classification, fal jobs submitted once, served-model pricing, the estimate contract, torn-tail quarantine, one first-recommendation call per intake

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude implemented the verified recommendation from the 2026-10-08 external-review verification under the user's goal "complete implementation of all fixes that can be implemented independent of the four decisions"; not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-08 20:05 |
| **Track** | Product |

## Context

The external review's findings F03 and F04 were both accepted in part (P2) by the verification. Its recommendation for their cluster (B, option C) is a durable spend book in `byway.sqlite` that becomes the cap authority, staged in three parts. Stage 1 is a set of fixes at the provider edge that need no book. This ADR records stage 1, without its "fallbacks off" step, which waits on the owner (decision D1).

What the verifiers reproduced at the provider edge:

- **Blind re-sends of paid work (F03).** `@fal-ai/client` 1.10.1 re-sends `queue.submit` up to three times on 429, 502, 503, 504 and network errors. Its per-request `QUEUE_RETRY_CONFIG` overrides the client's `{ maxRetries: 0 }`, so the comment saying the client's retries were off was wrong. A probe against the SDK made 4 POSTs on one 502, and an accepted-then-reset submit bought a second clip that was never ledgered. Separately, `toGatewayError` read network codes only at the top level. A reset that undici wraps in `TypeError('fetch failed')` was therefore non-retryable, while a bare 502 was retried four times. Nothing decided whether a failed attempt might have been billed.
- **Accepted fal jobs lost.** The request id of a job fal had accepted lived only on the stack. A job whose status could not be read failed with a retryable error that named nothing.
- **Torn ledger tail (F03).** A partial last line, left by an OS crash, power loss or a full disk mid-append, made `lastEntry()` throw. Every later billed call was then billed, failed with "could not be written to the ledger", and went uncounted by the caps until someone repaired the file by hand. `verify()` had no on-demand caller, and it threw on a `.head` file that was not JSON or held a `seq` below 1 (a gap [ADR-0083](0083-hashed-text-is-well-formed-unicode.md) left open).
- **Served-model pricing (F04).** A served model with no price row was settled silently at the requested model's rates. For example, `claude-opus-4-8-20261001` serving an Opus 5.5 request was under-recorded by 20%.
- **Estimates described as bounds (F04).** `estimate.ts` said estimates "err high". Text was counted at one token per three characters: 3,000 CJK characters became 1,008 tokens, about a third of their UTF-8 bytes. An image of unknown size (any WebP) was estimated at 5,000 tokens, below the code's own 6,400 maximum. The screens promised "The run stops and asks before it would spend more" and called the workspace budget "The most all runs together may spend".
- **Duplicate first recommendations (F03, P3).** The Recommendation page's server render asks the advisor while no recommendation is stored, and so does Try again (`{ ensure: true }`, [ADR-0082](0082-web-client-state-ownership.md)). Two tabs, a reload, or a render and Try again together each made a paid `advisor.intake` call.

## Decision

1. **One billing classification.** `billingOf(err)` (`packages/gateway/src/errors.ts`) answers `none` or `maybe`, and walks the cause chain.
   - `none`: an answer carrying the provider's own error body (429, 500, 503, 529, any 4xx), an error event in a stream (`overloaded_error`, `api_error`), or a connection that failed before the request was written (`ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`, `UND_ERR_CONNECT_TIMEOUT`).
   - `maybe`: no answer after the request may have been written (`ECONNRESET`, `EPIPE`, `UND_ERR_SOCKET`, timeouts, aborts); 408, 502 and 504, or any 5xx without a provider body; a stream that ended without its terminal event; and anything else it cannot read.
   - How a provider body is recognised: the Anthropic, OpenAI and OpenRouter SDKs' parsed `error`, fal's `body`, and Google's canonical status in its JSON message.
   - An error may state its billing outright, as the fal client does for an answer that carries no request id.
   - `toGatewayError` derives retryability from the same reading, so wrapped resets are now retried. Every `withRetries` call site states its policy: a completion or an image is sent once more after a `maybe` (`BILLABLE_CALL`), a queue job submission never is (`BILLABLE_JOB`), and a free read (a poll, a result, an upload, a download) is retried whatever its billing (`FREE_READ`). `none` failures keep today's backoff.
2. **fal jobs are submitted once.**
   - Every queue job, the clip and the last-frame extraction alike, is one direct `POST https://queue.fal.run/<endpoint>` with the key header (`submitJob`, `createFalClient(key, fetch)`). It goes through the gateway's submit rule (`ProviderVideoRequest.submit`), and a redirect is refused rather than followed with the key.
   - A `none` failure, such as fal's own 503 body, is re-sent with backoff. A `maybe` failure is not re-sent: the call fails, not retryable, saying fal may have accepted the clip and asking the person to check fal's dashboard.
   - Status, result and the start-frame upload stay on the SDK. They are free reads, and the SDK's own retries of them cost nothing.
   - A job fal accepted whose status or result cannot be read fails, not retryable, naming its request id. The error carries the ids (`falRequests`) for a later resume.
   - The stored evidence records the ids fal gave at submission. The result's own id comes from a header and may be missing.
3. **Served-model pricing.** `servedPrice()` settles a served model in this order:
   - its own row;
   - then a dated or versioned snapshot (`-YYYY-MM-DD`, `-YYYYMMDD`, `-NNN`, `@<version>`) of any priced model of that provider, at that model's row;
   - otherwise the requested row, with the ledger entry flagged `priceBasis: 'assumed'`.

   The suffix forms are narrow, so `claude-opus-5-5` can never read as a snapshot of `claude-opus-5`. `LedgerEntry.priceBasis` is optional and covered by the hash chain, so old entries verify unchanged. Images settle the same way. `SpendSummary.assumedPricing` counts the flagged calls, and Settings says so in words.
4. **The estimate contract.** Admission reserves planning estimates, not bounds. `estimate.ts`, `reserve()`, the budget message and spec §3.4 say this. A call can settle above its reservation; the true cost is recorded and later calls are refused against it. Where a cheap true bound exists, it is used:
   - ASCII text stays at a third of a token per character;
   - any other character counts at its UTF-8 bytes, a bound for byte-level tokenizers;
   - an image whose size cannot be read counts at the 6,400-token maximum.

   The Recommendation screen labels its range "Estimated cost". The run-budget sentence now reads "asks before starting a call whose estimated cost would take it over this budget". The Settings sentence now reads "does not start a call whose estimated cost would take your spending past this amount". Both add that estimates can be low. A guard test keeps bound claims out of the app.
5. **Torn-tail quarantine and verify.**
   - Under the lock, before each append, a file that does not end in a newline has its torn last line copied to `ledger.jsonl.damaged-<yyyyMMddTHHmmssSSSZ>-<pid>`. The name has no colons, which Windows refuses. Only once that copy is written is the file cut back to its last newline, and the chain continues.
   - A last line that is a whole entry and only lost its newline (an editor strips it) is ended with a newline instead, and kept.
   - `lastEntry()` continues from the last line that is an entry.
   - `verify()` reports a head record that is not one (not JSON, a `seq` below 1, a field missing) as `head`, and the start-up report words it.
   - `verify()` is cached by the size and modification time of the ledger and its head, and Settings runs it on demand ("Check the spend ledger", `GET /api/ledger`).
6. **One first-recommendation call per intake.** `firstRecommendation()` (`apps/web/src/server/first-recommendation.ts`) shares one advisor call among concurrent first asks for an intake.
   - What shares a call: page renders and Try again alike.
   - Where it lives: a map on `globalThis` keyed by the host's store, kept the way the service host is.
   - When the entry goes: it is dropped when the call settles, so a failure is never kept.
   - Inside the shared call the intake is read again, so an ask that arrives just after a call stored its answer gets that answer.
7. **Anthropic server-side refusal fallbacks are unchanged.** They stay on by default, pending the owner's decision D1. Admission still reserves one attempt on the requested model, so a refusal Anthropic routes to another model, or a sticky-routed call, can settle above its reservation (F04). The gateway option's doc comment says so. Such a call is now priced per served model: Opus 4.8 and Opus 5 at their own rows, and Sonnet 5.5's fallback `claude-sonnet-5` (which has no row) at Sonnet 5.5's rates, flagged `assumed`.

## Alternatives considered

- **The whole of option C now (the spend book, leases and absorb).** Deferred to the next work packages, stage 2 and stage 3. None of the fixes above needs the book, and each closes a reproduced loss on its own.
- **Keeping the fal SDK's submit with its retries patched.** Rejected. The SDK sets the retry policy per request in code we do not own, and a version bump could restore it silently. One `fetch` POST is small and fully under test.
- **Treating any 5xx as `maybe`.** Rejected. Anthropic's 529 and 503 overloaded answers and fal's 503 carry the provider's own body and mean nothing was done. Making them `maybe` would turn common overloads into failed steps.
- **Refusing paid admission while the ledger has a damaged line (fail closed).** Left to stage 2, where the book, not the audit file, is the authority. In stage 1 it would make any ledger damage stop all paid work.
- **Pricing only snapshots of the requested id (the design's literal rule).** Widened to snapshots of any priced model of the provider. The suffix forms are as narrow, and a dated Opus 4.8 snapshot serving an Opus 5.5 request is then priced at Opus 4.8's rates, not under-recorded.
- **Holding one Map per module (not on globalThis), or a claim column and a POST.** Rejected. Next.js builds pages and route handlers into separate bundles with separate module scope, and only the web process calls the advisor, so one in-process map is enough (the design's own choice).

## Consequences

**Positive**

- A fal submission that may have reached fal is never sent again by the SDK or by the gateway (4 POSTs on a 502 before, 1 now). The same holds for the last-frame job.
- A completion whose stream is reset is retried once instead of failing the step, and a wrapped connection refusal is retried like any unbilled failure.
- After a torn tail, the next billed call is ledgered and counted, the torn bytes are kept, and `verify()` is clean.
- A served model with no price is visible in the ledger and in Settings instead of silent. Known snapshots are priced at their own model's rate.
- Dense non-Latin text and WebP images are estimated at least at their bound, and the screens no longer promise more than admission does.
- One advisor call per intake's first recommendation in this process, whatever the number of tabs and reloads.
- `readCapped` (F17 follow-up) copies each chunk into one resizable buffer that grows in place, so a download near the 200 MiB cap holds about the cap instead of about twice it.

**Negative, and residuals named**

- Server-side refusal fallbacks stay on (D1), so F04's fallback overrun and sticky routing remain. A routed refusal can settle at up to about 2× its reservation on Sonnet 5.5, 2.25× on Opus 5.5 and 1.5× on Fable 5.1.
- **Assumptions in the classification.**
  - A provider-bodied 5xx and a mid-stream error event are treated as unbilled. This is not backed by provider billing documentation; it is today's behaviour, and it costs at most one attempt.
  - An unknown failure is treated as `maybe`, which is conservative.
  - A completion reset after the provider did the work is re-sent once and may be paid twice. The first attempt's usage is not ledgered, because no answer arrived. Stage 2 counts such an attempt as "may have been billed".
- **CJK briefs reserve about three times more input** than before (3 bytes per character instead of a third of a token). Concurrency for non-Latin briefs therefore drops: about 8 of 12 C2 seeds for a 2,000-character Japanese brief instead of 9. ASCII briefs are unchanged.
- **Estimates remain estimates.** Settlement can exceed a cap by the estimate error of the calls in flight. gpt-image's 8,000-token output figure is a planning number. Gemini image thinking tokens are not counted (`google.ts` ignores `thoughtsTokenCount` for images); a backlog row will verify billing first.
- **Still open, for stages 2 and 3.**
  - Cross-process reservations: the web and the worker do not see each other's calls in flight.
  - Calls interrupted by a crash or a stop.
  - A worker restart during a clip, which re-submits it, because the request ids are carried on the error but not stored durably.
  - The memo-save window.
  - Run-start identity (P3).
  - Fail-closed admission on ledger damage.
  - Finite usage values before the ledger draft (backlog).
- **Limits of the quarantine and the cache.**
  - A failed quarantine copy (a full disk) still fails the billed call, as before, rather than destroy the torn bytes.
  - The `verify()` cache misses an edit that keeps both a file's size and its modification time, until the next append.
- **The single flight is per process.** A second web process, which v1 does not run, would not share it. A Settings switch of demo mode during a shared call serves the first caller's mode to both.

## Evidence

- [External-review verification](../reviews/2026-10-08-external-review-verification.md), cluster B (F03 and F04: both "accept, partly", P2), recommendation C, stage 1, and §4 decision 1 (D1).
- The original review: `C:/Users/arvik/code/byway_review/byway-review.md` (outside the repository).
- Probe in this change: `@fal-ai/client` 1.10.1's `queue.submit` made 4 POSTs on one 502, against a stubbed fetch with no network.
- Memory: reading 180 MiB without a declared length peaked at +361 MB RSS when chunks were joined at the end, and +211 MB with the resizable buffer.
- Tests:
  - gateway: `packages/gateway/test/billing.test.ts`, `fal-submit.test.ts`, `pricing.test.ts`, `estimate.test.ts`, `ledger.test.ts`, `billed.test.ts`, `video.test.ts`, `gateway.test.ts` and `errors.test.ts`;
  - runner: `packages/runner/test/restore.test.ts`;
  - web: `apps/web/test/api.test.ts`, `history.test.ts` and `guard-estimates.test.ts`.
- It supersedes no ADR. It narrows ADR-0079's "Retries never buy the same thing twice" at the provider edge only. The memo-save and crash windows stay open until stage 3.
