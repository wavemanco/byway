# ADR-0102: One refusal rule for every provider: no model substitution, and a decline gets one logged retry on the same model, then a plain failure

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User (the owner chose option 2b on 2026-10-16 from the options in the D1 brief and its challenge) |
| **Date (local, UTC−7)** | 2026-10-16 20:45 |
| **Track** | Product |
| **Related** | [ADR-0091](0091-provider-edge-billing-fixes.md), [ADR-0095](0095-paid-calls-have-a-durable-spend-book.md), [ADR-0099](0099-paid-operations-keyed-to-their-caller.md), [ADR-0090](0090-execution-contracts-for-revising-humans-and-media-steps.md), [ADR-0038](0038-model-selection-pinning-and-routing.md), [ADR-0041](0041-shared-engine-pinned-research-versions.md), [ADR-0043](0043-research-credibility-without-compromise.md), [ADR-0059](0059-engine-requirements-for-composition-and-credibility.md), [ADR-0081](0081-voice-writes-the-persons-copy-exactly.md) |

## Context

Decision D1 was the last part of the external review's finding F04 that waited on the owner. Every direct Claude call carried Anthropic's server-side refusal fallback: the beta header and `fallbacks: "default"` (`packages/gateway/src/providers/anthropic.ts`), on by default through `GatewayOptions.anthropicRefusalFallback`, which no production root set. When Anthropic's classifier declined a request, Anthropic re-ran it inside the same call on a backup Claude model it chose by refusal category (Sonnet 5.5 to Sonnet 5; Opus 5.5 and Fable 5.1 to Opus 5 or Opus 4.8), and for about an hour afterwards sent requests with the same content straight to the backup. Admission reserved one attempt on the requested model, so a rescued call could settle at up to about 2× its reservation on Sonnet 5.5, 2.25× on Opus 5.5 and 1.5× on Fable 5.1. The final re-check reproduced it at `1ba72f5` ($0.025009 settled under a $0.023 cap). The screens and the README said so: "a single call can cost twice its estimate or more". [ADR-0091](0091-provider-edge-billing-fixes.md) decision 7 and [ADR-0095](0095-paid-calls-have-a-durable-spend-book.md) decision 10 left the setting "unchanged, pending D1", and ADR-0091 decision 4 asked for the budget wording to be revisited once D1 was decided.

A decline that was not rescued raised a 'refused' error with the gateway's raw text ("anthropic declined (cyber)"), and the run ended with it. The Recommendation screen said "The model declined to answer this request…". No layer asked again.

The Study 1 protocol, which runs on this same engine, requires the opposite of what the product did: "server-side fallbacks are off" and the gateway halts a run if the returned model differs from the profile (§5.1), and "a refusal stop reason gets one logged automatic retry; a second refusal is Class Q 'provider refusal'" (§5.2, `docs/study1/protocol-v1.1-draft.md`).

The D1 brief offered five options and recommended option 4 (rescue on in the product, off by default in the engine). Its challenge kept option 4 but added option 2b as the form of "one rule everywhere": off everywhere, plus the protocol's own refusal rule, one logged retry on the same model, then a plain failure. The brief then recommended 2b. The owner answered: "go with your recommendation 2b for now. … If this were just about the product, then too the user would pick a particular model and might insist on using that. So the option makes general sense." A person chooses a model, and no provider may answer with another. The owner named one later add-on: choosing a provider and model in byway's UI from the keys the person has provided (backlog).

## Decision

### 1. No model substitution, anywhere

- **Anthropic.** The adapter takes a client and nothing else (`AnthropicAdapterOptions { client }`). `anthropicParams` sends no beta header and no `fallbacks` field, and the `REFUSAL_FALLBACK_BETA` constant is gone. `GatewayOptions.anthropicRefusalFallback` is removed, so no entry point (the web services, the worker, a future study root) can turn a fallback back on: the option does not type-check. A guard test reads every product source (`packages/*/src`, `apps/web/src`, `apps/web/app`, `scripts`) and fails on the fallback beta's name, a `fallbacks:` field, `allow_fallbacks: true`, or either option name.
- **OpenRouter** stays pinned: `provider: { only: [pin], allow_fallbacks: false }`, and it never sends OpenRouter's model fallbacks (`models`, `route`); a test pins both.
- **OpenAI, Google and fal have no equivalent**, as read in the adapters: OpenAI's Chat Completions and Images requests carry the model, the messages or prompt, the output limit, the format, and for images size, quality and count, and nothing that names another model; it reports a dated snapshot of the model asked for. Google's `generateContent` carries the model, the contents and the config, and nothing else; it reports the version it served. fal's job is submitted to the endpoint the profile names, and the adapter records that endpoint as the served model (fal reports none).
- The price rows for `claude-opus-5` and `claude-opus-4-8` stay, no longer as fallback prices: no profile names them and none should answer, and if one ever does, the call is priced at its own row and the ledger shows the model that answered. Settlement still prices every billed attempt an answer lists at its own model's rates (ADR-0091 decision 3). `claude-sonnet-5` needs no price row.

### 2. A decline gets one retry on the same model, then a plain failure

- **What a decline is.** The provider saying no: Anthropic's `refusal` stop (its category, when given, is the stated reason); OpenAI's refusal (its words are the reason) or `content_filter` stop; Google's blocked prompt or safety stop (`SAFETY`, `PROHIBITED_CONTENT`, `BLOCKLIST`, `SPII`, `IMAGE_SAFETY`, `IMAGE_PROHIBITED_CONTENT`); OpenRouter as OpenAI; and OpenAI's image moderation block, an HTTP 400 with the code `moderation_blocked` (or `content_policy_violation`), which used to be an 'invalid-request' and is now read as a decline with no image, recorded at no cost because OpenAI reports no usage with it. The adapters mark each with `declined: { reason? }` beside the refusal text. An image model's answer with no image that is not a decline (a text-only answer) is not one: it is refused as before, not asked again (ENG-5), and the image step's tries decide.
- **Where it lives: the gateway** (`askOnceMore` in `packages/gateway/src/gateway.ts`), for completions and images, so every caller gets the rule once: a run's steps, the advisor's recommending and composing, and anything later.
- **The retry is a paid call of its own.** It sends the same request to the same model. It is admitted in the spend book against both caps at the call's estimate ([ADR-0095](0095-paid-calls-have-a-durable-spend-book.md)), sent with the gateway's transport retries, settled, and ledgered. A step's retry has an operation key of its own (ADR-0099): `<the step call's key>/after-decline/<the declined call's ledger entry id>`, with the caller's `until` and `cancel`, never `rebuy`. The key names the one declined purchase it retries, so it never meets another attempt's retry; two attempts of one step are already kept apart at the first call's key. A call without a key (the advisor's) retries without one. A caller already cancelled gets no retry.
- **The ledger shows it.** The declined call's entry carries `declined: { reason? }`; the retry's entry carries `retryOf: <the declined entry's id>` (and `declined` too if it declined). Both fields are optional and inside the hash chain, so older entries verify unchanged.
- **The outcome.** If the retry answers, its answer is the call's: `CompletionResult.declined` and `ImageResult.declined` (a `DeclineRecord`) say what happened, and `costUsd` includes the declined attempt, which was billed too. Otherwise the call ends with a 'refused' `GatewayError`, never retryable, carrying `declined` with the retry's outcome: `declined` (it declined too), `not-made` (its admission was refused: a budget had no room for it, paid calls were paused, or another attempt held it; or byway was stopping, or the step was stopped), or `failed` (it was sent and brought no usable answer).
- **A budget with no room for the retry ends the call; it does not ask to raise the budget.** Raising it would run the step again from its start, and the declined call, which the memo does not keep, would be bought again: a decline would be asked three times. The message says the budget was the reason and what to do.
- **Not twice by two layers.** The gateway asks once more and nothing else asks again. The runner's image step no longer tries a declined image (ADR-0090 tried "a refusal … once more"); the slot is not made and the step goes on. The advisor passes gateway errors through; its parse retry and the runner's `askModel` repair only a missed or cut-off answer. The memo layer waits only on 'in-flight'. Temporal does not retry the step, because the failure is not retryable.

### 3. One plain message, on the Run screen and in the advisor's flows

The gateway writes it (`declineStory` and `declineAdvice` in `packages/gateway/src/declines.ts`): who declined what, with the reason given; what became of the second ask; what was billed; and what to do. For example:

> Anthropic’s model claude-opus-5-5 declined this request (reason given: cyber). byway asked it once more, and it declined again. Both attempts were billed: $0.0080 in all. Rephrase the request, or choose another model profile in Settings, then try again.

With no reason: "(no reason given)". When the retry was not made: "byway did not ask it again: another attempt (estimated at $0.0201) would take the run over its budget of $0.03. The declined attempt was billed: $0.0240." and "…then start again with a larger budget." (for the workspace budget: "…or raise the workspace budget in Settings, then try again."). When it failed: "byway asked it once more, but that attempt failed: <why>." A cost of nothing reads "byway recorded no cost for either attempt." For an image, "this image". The Run screen shows it as the step's failure (the activity's message, as for every step failure); the advisor's flows show it in place of the general "The model declined to answer this request…", which stays for refusals that are not declines.

### 4. Logged

- **The run's events.** A step's calls write one `model-declined` event per decline once the retry has an outcome (`packages/runner/src/activities/declines.ts`): the `DeclineRecord` (provider, model, purpose, kind, reason, both entries and their costs, the retry's outcome and why) and `note`, the story in plain words. It wraps the invocation's gateway outside the memo layer and is deduplicated by the step call's key and the declined entry, so a step that runs again and gets its kept answer writes nothing new. Writing it after an answer is part of the step (a failure there is retried, and the answer is kept by then); after a final decline it is best effort, so a lost event never turns the decline into a retryable error that would buy the declined call again.
- **The Run screen** shows the note in the step's row when the retry answered (the declined attempt's cost is in the step's cost). When it did not, the step's failure says it; an image step says it in its note ("Google’s model gemini-nano-banana-2.1 declined the image for shot 2 (reason given: IMAGE_SAFETY). byway asked it once more, and it declined again. Both attempts were billed: $0.0672 in all."), and counts both attempts in the step's cost.
- **The ledger** has both entries, linked by `retryOf`.

### 5. Video

Video gets no decline retry. byway's video adapter (fal) reads no decline from fal: a clip fal does not make is a failed job or a refused submission like any other, and byway cannot tell a safety decline from other failures without guessing. A clip submitted again is a second paid job, which byway never sends after a failure that may have been billed (ADR-0091 decision 2), and the relay step already ends a failed link plainly (ADR-0090). If a video provider's answers are ever seen to state a decline, the same rule applies to them (backlog).

### 6. The budget wording, revisited (ADR-0091 decision 4)

With no fallback, a call is one attempt on the model asked for, and the retry is a call of its own, admitted against the budgets, so the fallback overrun is gone. What is left is the estimate's own error: a prompt's tokens are counted without the provider's tokenizer, and an image model's output per image is a planning figure; the output allowance is reserved whole. The Recommendation screen, Settings and the README now say: "Estimates can be low, so a call can cost more than its estimate, and a run can end over this budget." (Settings: "…spending can end over this amount."; README: "…over a budget."). The guard test pins the new words, keeps out "twice its estimate", "routed to another model" and "refusal fallback", and still keeps out calling the overrun slight, since nothing bounds the estimate's error. Settings' note on calls counted on an assumption never named fallbacks and is unchanged. This closes F04's fallback overrun.

### 7. Product and study follow the same rule

The engine's only behaviour is now the protocol's §5.1 (no fallbacks) and §5.2 (one logged retry on a refusal). Nothing in the study engine can inherit a rescue, because none exists to inherit, and product runs match the studied condition on fallback policy, which the planned evidence labels key on (backlog, "Before the study registry's first entry"). Two protocol requirements are study-engine work that this does not build: counting a second refusal as Class Q "provider refusal", and the served-model check that halts a run when the returned model differs from the profile.

## Alternatives considered

- **1. Keep the fallback on, one attempt reserved.** Rejected by the owner's choice: another model answers a person who chose a model, the overrun stays, and the engine's default contradicts the protocol.
- **2. Off everywhere, with no retry.** The verification's original recommendation. 2b is its stronger form: the same exact budgets and one rule, and a decline in mid-answer may be answered on a second ask.
- **3. On, with the backup's worst case reserved.** Rejected in the brief: every call would hold 1.5 to 2.25 times its estimate while it runs, and parallel stages would meet the budget question for money almost never spent.
- **4. On for the product, off for the study engine.** The brief's first recommendation. Not chosen: two policies in one engine, the product unlike the studied condition, and a model swap the person did not ask for.
- **5. On, with the budget checked again when Anthropic switches models.** Rejected in the brief: streaming machinery in the money path for a rare event.
- **A person-approved rescue** (the challenge's: "Anthropic declined this step (cyber). Retry it on Claude Opus 4.8 for about $X, or stop?"). Not chosen: the owner's rule is that no provider answers with another model. The owner's add-on (choosing a provider and model in the UI) is the way a person changes models.
- **The retry in the runner and the advisor separately** (`askModel`, `askParsed`). Rejected: two places to keep in step, and every new caller would have to remember it. The gateway is the one path out (ADR-0030).
- **The retry inside the first call's spend-book row.** Rejected: the retry is a separate paid call and must be admitted, counted and ledgered as one.
- **The retry keyed by the step's key alone** (`<key>/after-decline`). Rejected: after a worker died between the two calls, the next attempt's retry could find the dead attempt's row still live and be told 'in-flight', and the memo layer, asking the whole call again, would meet its own settled first call, held, until it gave up five minutes later. Keyed by the declined entry, each retry is one purchase's own.
- **Asking to raise the budget when the retry does not fit.** Rejected for now: the step's next attempt would buy the declined call again. Doing it right needs the next attempt to skip straight to the retry (a request field naming the declined entry, and the memo keeping the decline); backlog.

## Consequences

**Positive**

- The model a profile names is the only one that answers, in the product and in a study alike, with nothing to remember at a root.
- Budgets hold to the estimate's own error: no fallback overrun, no sticky routing, and the retry is admitted like any call. F04 is closed.
- A decline is no longer a dead end on first sight: one more ask may answer it, and when it does not, the person reads what happened, what it cost, and what to do, on the Run screen and in the advisor alike.
- The run's events and the ledger record every decline, the second ask and its outcome.
- An OpenAI image moderation block is now in the ledger and the run's events, where before it was an invalid request recorded nowhere.

**Negative, and residuals named**

- **A false positive that repeats fails the step.** A decline on the input itself will likely repeat on the second ask, and the run then ends; its earlier spend is sunk, and a new run asks the person's questions again. Anthropic recommends the fallback so that a false positive does not become an outage; byway declines that rescue on the owner's rule. How often false positives happen cannot be measured here (no live data).
- **A decline costs up to two calls.** Both attempts are billed and counted; the retry is admitted at the call's estimate, so it can never pass a budget by more than the estimate's error.
- **No retry when a budget has no room for it, and no budget question** (Decision 2; backlog).
- **OpenAI's moderation block is recorded at no cost.** OpenAI reports no usage with it; whether a block at the output stage is billed is not documented in what byway has. The response body is kept as evidence.
- **No served-model check in the product.** The ledger records the requested and the served model; nothing stops an answer from another model. It is the protocol's §5.1 requirement and would make the owner's rule enforceable rather than requested (backlog).
- **Video has no decline retry** (Decision 5; backlog).
- **Contracts.** `DeclineRecord`, `CompletionResult.declined`, `ImageResult.declined`, `GatewayError.declined`, `LedgerEntry.declined` and `retryOf`, and the run event `model-declined` are new; all optional apart from the event type, which the store's list now names. `GatewayOptions.anthropicRefusalFallback`, `AnthropicAdapterOptions.refusalFallback` and `REFUSAL_FALLBACK_BETA` are removed. No migration: the spend book keeps a settled entry as JSON. No workflow code changed, so the pinned workflow bundle is unchanged (ADR-0078).

**How to change it.** A rescue, a person-approved switch, or the budget question for the retry would each be a new ADR that changes this one. The guard test and the removed option are the places that hold the rule.

## What this changes in earlier records

- [ADR-0091](0091-provider-edge-billing-fixes.md): decision 7 (fallbacks "unchanged … pending D1") is replaced by Decision 1 here; decision 4's revisit of the budget wording is Decision 6 here; its residual "server-side refusal fallbacks stay on (D1)" is closed.
- [ADR-0095](0095-paid-calls-have-a-durable-spend-book.md): decision 10 (fallbacks "unchanged … pending D1") is replaced by Decisions 1 and 2 here; the retry is admitted, settled and ledgered like any paid call.
- [ADR-0099](0099-paid-operations-keyed-to-their-caller.md): decision 1's operation keys gain one derived key, the retry's (Decision 2); its context's "Anthropic's server-side refusal fallbacks are on, as today (D1)" no longer holds.
- [ADR-0090](0090-execution-contracts-for-revising-humans-and-media-steps.md): the image step's tries no longer apply to a declined image, which the gateway has already asked once more (Decision 2); "a refusal is tried once more" holds for other refusals.

## Evidence

- The owner's decision brief and its challenge: `C:/Users/arvik/AppData/Local/Temp/byway-fixes/designs/owner-decisions.json` (`analyse:D1`, `challenge:D1`; outside the repository), and the owner's reply of 2026-10-16.
- [External-review verification](../reviews/2026-10-08-external-review-verification.md), cluster B, F04, and §4 decision 1 (D1); the final re-check's reproduction at `1ba72f5`.
- `docs/study1/protocol-v1.1-draft.md` §5.1 (Routing: model check, fallbacks off) and §5.2 (Refusals).
- Tests:
  - gateway: `packages/gateway/test/declines.test.ts` (no fallback asked for and no option to ask; the source guard; one retry for Anthropic, OpenAI, Google and OpenRouter completions and for Google and OpenAI images; the plain messages; the budget, cancel and failure outcomes; the retry's key; the reason redacted and well formed in the ledger), `providers.test.ts` (each adapter's decline and reason; OpenAI's moderation block; no fallback field on Anthropic or OpenRouter), `gateway.test.ts`, `pricing.test.ts`;
  - runner: `packages/runner/test/declines.test.ts` (the event, its dedupe, the step's plain failure, through a real gateway in demo mode with a declining responder), `asset-slots.test.ts` (a declined image is not tried again, even shot 1; its note and cost);
  - web: `apps/web/test/model-errors.test.ts`, `timeline.test.ts`, `guard-estimates.test.ts`.
