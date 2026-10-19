# ADR-0107: The money path before the first live run: prices and model ids read again, a Gemini image's thinking charged, a failed run start asks Temporal first

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude built backlog batch B1 ("Before the first live run: honest money path") from the coordinator's brief; none of its items needed an owner decision; not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-18 21:30 |
| **Track** | Product |
| **Related** | [ADR-0084](0084-renderer-launch-without-secrets.md), [ADR-0091](0091-provider-edge-billing-fixes.md), [ADR-0092](0092-recipe-semantics-derived-from-execution.md), [ADR-0099](0099-paid-operations-keyed-to-their-caller.md), [ADR-0100](0100-corrections-found-by-the-final-re-check.md), [ADR-0081](0081-voice-writes-the-persons-copy-exactly.md), [ADR-0095](0095-paid-calls-have-a-durable-spend-book.md), [ADR-0102](0102-one-refusal-rule-for-every-provider.md), [ADR-0103](0103-adr-log-rule-and-ci.md) |

## Context

The owner's first live run (backlog "First live run with real keys and real money") is the first time byway spends real money. Its row asks for the model ids and their price rows, last read on 2026-10-07, to be read again first. The backlog also named six places where what the person is told about money was not true, or where a paid run could fail after its earlier steps were paid for:

- **A Gemini image's thinking.** Balanced takes its images from `gemini-nano-banana-2.1`. `providers/google.ts` charged an image answer per image plus its prompt and ignored `thoughtsTokenCount` and the answer's text ([ADR-0091](0091-provider-edge-billing-fixes.md) Consequences: "Gemini image thinking tokens are not counted").
- **A run start that timed out.** `start-failure.ts` read gRPC 4 (DEADLINE_EXCEEDED) like 14 (UNAVAILABLE), as the engine being down. A Start whose reply timed out after Temporal accepted it was marked failed with "byway's run engine was not running, so this run did not start. Nothing was spent.", though its workflow could run, and a call already under way when the run read failed would still be charged. The same code holds [ADR-0099](0099-paid-operations-keyed-to-their-caller.md)'s second double fault: of two deliveries of one Start to a stopping engine, the one that wrote the run marked it failed when its own start failed, even if the other delivery's start went through.
- **The secrets file's names on a lowercase-drive start** ([ADR-0100](0100-corrections-found-by-the-final-re-check.md) item 6). The names `.env.agents` listed were kept in a map of the env module's own. A Windows start from a current directory whose drive letter is lowercase loads that module twice (`scripts/serve.ts` by path, `file:///c:/…`; `pages.ts` through `@byway/gateway`, `file:///C:/…`), so the renderer's copy knew no names and Chromium got the file's names that do not look secret. Provider keys and secret-looking names were still left out.
- **VOICE in the estimate.** `estimate.ts` counted one mid-tier `voice.apply` completion for each VOICE that writes the work, though VOICE makes no model call ([ADR-0081](0081-voice-writes-the-persons-copy-exactly.md)). That overcount would have gone into the first live run's comparison of estimates with the ledger.
- **A model RELAY step outside a media recipe.** The composed profile admitted one. It cannot run there (`storyboardShots` reads a storyboard, which only a media recipe's work is), so it fails when reached, after the steps before it were paid for, while its explainer promises "one clip of the last shot".
- **Billing assumptions no documentation backs.** `errors.ts` treats a provider-bodied 5xx and a mid-stream error event as unbilled, which permits one blind re-send ([ADR-0091](0091-provider-edge-billing-fixes.md), [ADR-0095](0095-paid-calls-have-a-durable-spend-book.md)). [ADR-0102](0102-one-refusal-rule-for-every-provider.md) records OpenAI's image moderation block at no cost. The block's error codes came from community reports.

What the providers' own documentation said on 2026-10-18, read with no keys and no paid calls (the pages are listed under Evidence):

- **Every model id the profiles name is listed.** Anthropic: `claude-fable-5-1`, `claude-opus-5-5` and `claude-sonnet-5-5`, current models, each retired not sooner than September 2027. OpenAI: `gpt-6-astra`, `gpt-6.1-sol`, `gpt-image-2.5-flare` and `gpt-image-2.5-sunburst`, none deprecated. Google: `gemini-3.8-flash` and `gemini-nano-banana-2.1` are stable; `gemini-3.1-pro-preview` is listed with no status, not among the deprecated models. OpenRouter: `anthropic/claude-fable-5.1`, `anthropic/claude-opus-5.5` and `anthropic/claude-sonnet-5.5`. fal: both Kling endpoints and `ffmpeg-api/extract-frame`.
- **Every price row matched its page but two.**
  - `claude-sonnet-5-5`'s cache hits are $0.10 per 1M tokens. On 2026-10-07 the table said $0.20 and its prose $0.10, and byway kept the higher figure; now the table, its footnote ("0.05x the base input price") and the prose agree.
  - `gemini-nano-banana-2.1`'s output is priced two ways: $7.50 per 1M tokens "for text and thinking" and $30 per 1M for images, which Google gives as $0.0336 for a 1K image (1,120 tokens). Google's image guide says thinking is on for its Gemini 3 image models and cannot be turned off (this model's default level is medium), that thinking tokens are billed by default for thinking models, and that the interim "thought images" are not charged. Neither page gives a count of thinking tokens per image.
- **Failed requests.** Only fal says: "Server errors (HTTP 500+) are never charged." Anthropic's errors page, OpenAI's error-code and pricing pages, Google's troubleshooting and pricing pages, and OpenRouter's errors page say nothing about whether a failed request is billed. OpenRouter says an answer with no content may still be charged for its prompt by the upstream provider; that answer is a 200 with its usage, which byway ledgers.
- **OpenAI's moderation block.** The image guide now documents `moderation_blocked`, with `error.type` "image_generation_user_error" and an optional `error.moderation_details` whose `moderation_stage` is `input`, `output` or `unknown`. It names neither `content_policy_violation` nor an HTTP status. Neither it nor the pricing and error-code pages say whether a block is billed.

## Decision

1. **Prices and ids, read again.** Every row in `packages/gateway/src/prices.ts` and the id list in `profiles.ts` name their 2026-10-18 reading. `claude-sonnet-5-5`'s cache hits are $0.10 per 1M tokens; every other figure is unchanged. Rates byway does not record (the cached input of `gpt-6-luna` and the gpt-image models, OpenRouter's cache rates) are named in the comments: a cached token is charged at the input rate, so the cost leans high.
2. **A Gemini image's text and thinking are charged.** `gemini-nano-banana-2.1`'s row charges $7.50 per 1M output tokens on top of $0.0336 an image. As an image answer's output tokens, `google.ts` reports its `thoughtsTokenCount` plus the answer's tokens of every modality but IMAGE (`candidatesTokensDetails`); the image's own tokens stay priced per image. An answer without that breakdown has every answer token counted at the text rate, the image's included, so its cost leans high. The pre-call estimate plans 2,000 such tokens an image (about $0.015): Claude's planning number, since Google gives no count.
3. **A failed run start asks Temporal before the run is marked failed.** When a new run's workflow start fails (a named run's "already started" is still the run's own workflow, as before), the Runner client describes the run's workflow first:
   - **Temporal has it.** The start reached Temporal after all, or another delivery's did. The run is left to its workflow, and the start returns the run.
   - **Temporal has none.** The run did not start. After a timeout its error is "byway's run engine did not answer in time, so this run did not start. Nothing was spent. Start it again."; after any other failure, the words it had before.
   - **byway could not ask.** The run is failed, so the gateway refuses its next calls. Its error says byway cannot tell whether it started, that it makes no new AI calls now, and that one already under way may still be charged and shows on the run; after a timeout it opens "byway's run engine did not answer in time".
   - gRPC 4 is no longer read as the engine being down. gRPC 14 and a refused or reset connection keep "byway's run engine was not running, so this run did not start. Nothing was spent. Restart byway and start it again." apps/web's 503, which a timeout of any engine call can cause, says the engine "is not running, or did not answer in time".
   - The describe is a second call to Temporal, made only after a start that failed.
4. **The secrets file's names are kept once per process.** `loadEnvFile`'s record of the names `.env.agents` listed lives on `globalThis` under a registered symbol (`Symbol.for('byway.gateway.env-file-names')`), so every copy of the gateway's env module reads the same names. [ADR-0084](0084-renderer-launch-without-secrets.md)'s sentences on the renderer's environment hold on every start again, whatever the drive letter's case.
5. **A VOICE in the estimate is the person's time only.** The `voice.apply` term and its token assumption are gone from `packages/advisor/src/estimate.ts`.
6. **COMPOSED-MEDIUM.** The composed profile refuses a model RELAY step, and a relay chain, in a recipe whose medium is not `media`, and says why. The composer gets it back as a violation to repair, and re-admission at start ([ADR-0092](0092-recipe-semantics-derived-from-execution.md) decision 5) refuses a stored one. A compositing step (RELAY by a tool), which v1 skips in any medium, stays allowed.
7. **The billing assumptions stay, and say so.** For Anthropic, OpenAI, Google and OpenRouter, treating a provider-bodied 5xx and a mid-stream error event as unbilled stays an assumption; fal documents it, and its queue jobs are never sent blind again anyway. OpenAI's moderation block stays recorded at no cost; its error body, stored as the decline's response and named by hash in its ledger entry, holds the documented `moderation_stage`, so a block at the output stage can be found. The comments in `errors.ts` and `providers/openai.ts` say what the documentation says and does not, with the pages and the date. The first live runs' ledger, against each provider's usage records, is what can settle them (backlog).

## Alternatives considered

- **Read gRPC 4 as "unknown" without asking Temporal** (the backlog's simpler form). Not taken: a run whose workflow Temporal had accepted would still be marked failed, and would then run with its calls refused. Describing first leaves it to its workflow, and closes ADR-0099's double fault with the same code.
- **Pass the names from the loader to the renderer explicitly** (the backlog's other form). Not taken: it changes the engine's start-up path in `serve.ts` and the runner, where the registered symbol changes one line in the module that already holds the names.
- **Leave the Gemini image price until the live run's ledger** (the backlog row's "verify how they are billed before changing the image price"). Not taken: Google's pricing page and image guide now say how they are billed, and the first live run's profile takes its images from this model, so charging nothing for them would make its budgets count low.

## Consequences

**Positive**

- Every price and model id was read on 2026-10-18, before the first live run, not eleven days earlier.
- Balanced's images are charged for their text and thinking, so its budgets do not count low there.
- A run whose start timed out after Temporal accepted it goes on. A run whose error says "Nothing was spent" did not start.
- Chromium gets no name from `.env.agents` on any start.
- Estimates with a VOICE lose one mid-tier call per VOICE (C3 one, C4 two); budgets derived from the high estimate drop a little.
- A composed web-page, prose or options recipe can no longer stop at a RELAY step after its earlier steps were paid for.

**Negative, and residuals named**

- **Estimates rise where images come from Gemini** (Balanced and the Google profile), by about $0.015 for each image planned. On Balanced, C3's default run budget goes from $2 to $2.50 by this alone, and C2's twelve mood boards cost about $0.60 rather than $0.40.
- **2,000 thinking tokens an image is a planning number.** The real count may be higher or lower; the first live run's ledger shows it (backlog "Gemini image thinking tokens"). If `thoughtsTokenCount` also counts the thought images Google does not charge for, byway's cost leans high.
- **A late start.** When Temporal says it has no workflow, the run is marked failed. A start Temporal was still handling that lands afterwards finds the run failed, so its activities change nothing and its calls are refused; between the describe and that store write, which follows it at once, a call could begin.
- **Code 14 and reset connections keep "Nothing was spent"** when byway cannot ask Temporal afterwards: an engine that is not there runs nothing. A connection reset after Temporal accepted the start is the exception; the backlog asked only about code 4, and this was judged too rare to word for (Claude's judgement).
- **Four providers' billing of failed requests, and OpenAI's of a moderation block, are still assumptions.** If any is billed, budgets count low.
- **Rates byway does not record** charge a cached token at the input rate, so those calls are recorded above their cost.

## What this changes in earlier records

- [ADR-0084](0084-renderer-launch-without-secrets.md): the Decision's "no name `.env.agents` listed (set or kept)" and the Positive consequence "Chromium no longer holds the provider keys or anything else from `.env.agents`" hold on every start (item 4).
- [ADR-0091](0091-provider-edge-billing-fixes.md): Consequences' "Gemini image thinking tokens are not counted" no longer holds (item 2). Decision 4's estimate contract is unchanged: the 2,000 tokens a Gemini image are a planning number like gpt-image's 8,000.
- [ADR-0092](0092-recipe-semantics-derived-from-execution.md): decision 4's composed profile gains COMPOSED-MEDIUM (item 6).
- [ADR-0099](0099-paid-operations-keyed-to-their-caller.md): Consequences' second double fault (two deliveries of one Start, the run marked failed under the other's workflow) is closed (item 3). The first (a refused Start pressed again gets that failed run back) is unchanged.
- [ADR-0100](0100-corrections-found-by-the-final-re-check.md): item 6's "Take as current" is replaced by item 4: the sentences hold for every start.
- [ADR-0102](0102-one-refusal-rule-for-every-provider.md) is unchanged: a moderation block recorded at no cost is still an assumption (item 7).

## Evidence

- Pages read on 2026-10-18, with no keys and no paid calls:
  - Anthropic: platform.claude.com/docs/en/about-claude/models/overview; platform.claude.com/docs/en/about-claude/pricing; platform.claude.com/docs/en/api/errors.
  - OpenAI: developers.openai.com/api/docs/models; developers.openai.com/api/docs/pricing; developers.openai.com/api/docs/guides/image-generation ("Handling blocked requests and other errors"); developers.openai.com/api/docs/guides/error-codes.
  - Google: ai.google.dev/gemini-api/docs/models (last updated 2026-10-13); ai.google.dev/gemini-api/docs/deprecations; ai.google.dev/gemini-api/docs/pricing (last updated 2026-10-16); ai.google.dev/gemini-api/docs/image-generation; ai.google.dev/gemini-api/docs/troubleshooting.
  - OpenRouter: openrouter.ai/api/v1/models (`pricing.prompt`, `pricing.completion`); openrouter.ai/docs/api-reference/errors; openrouter.ai/docs/guides/routing/provider-selection.
  - fal: fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video; fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video; fal.ai/models/fal-ai/ffmpeg-api/extract-frame; fal.ai/docs/documentation/model-apis/faq ("Do you charge for failed requests?").
- Commits on fix/fx-b1: 6e4eb65 (items 1, 2, 7), d4bd96b (item 4), 22f521b (item 3), afcc3fd (item 5), 2b1021a (item 6).
- Tests (the new ones were each shown to fail with the change they hold taken out):
  - gateway: `pricing.test.ts` (every row's figures as read on 2026-10-18; a Gemini image charged its text and thinking; the 2,000 planned tokens), `providers.test.ts` (the Gemini image's output tokens by modality, without the breakdown, and with a count that is not a number; the moderation stage kept in the stored body), `env.test.ts` (two copies of the env module share the names), `billed.test.ts`, `gateway.test.ts`;
  - runner: `start-failure.test.ts` (the messages), `start-describe.test.ts` (the describe-first paths with a stand-in Temporal client, the double fault included), `engine-state.test.ts` (against a real Temporal server: a start accepted, then timed out, goes on; one that never reached Temporal is failed as not started);
  - advisor: `estimate.test.ts` (a VOICE writing nothing back gives the same estimate), `profile.test.ts` (a RELAY step and a relay chain refused on C1, allowed on C5; a compositing step allowed anywhere);
  - scripts: `renderer-env.test.ts` (on Windows, a start from the lowercase spelling of the repository's directory loads two copies of the gateway, and Chromium's launch environment holds only the shell's variables);
  - web: `services.test.ts`, and `e2e/start-identity.spec.ts` (the 503's words).
