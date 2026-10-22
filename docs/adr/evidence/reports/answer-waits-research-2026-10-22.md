*Claude's research of 2026-10-22 on how long byway should wait for each model's answer (the owner's request of 09:50, "Can we do a deep dive internet research pass for all of these looking at providers as well as credible second party reviewers?"), as Claude sent it to the owner at 12:09 local and unchanged since 10:48, copied from the session's scratchpad below the line. It was read from fix/fx-block1 at 137bf75, which the history rewrite at the owner's answer of 10:35 made 886c211, with the same tree; its "conversation-continued.md:603" is the owner's answer of 06:40 there. The question on its choice sets and the owner's answers (12:09 and 12:10) are in [conversation-continued.md](../conversation-continued.md), and the [backlog](../../../backlog.md) row "Selectable answer waits per model (block 2)" carries the choices.*

---

# How long byway should wait for each model: evidence and recommendations (2026-10-22, corrected after critic review)

**Scope.** This synthesis feeds the second of block 1's four questions (the stall limit for Anthropic) and block 2's per-model waits in Settings. It does not answer the other three questions: how the fix round should go, the author email, and purging the pre-rewrite commits. Nothing in the repository was edited. Every number below comes from a cited source or is marked as arithmetic or judgement.

**What the owner has already decided** (ADR-0111 Later notes, 2026-10-22; docs/adr/evidence/conversation-continued.md:603):
- Selectable limits: "Build selectable limits for every model/provider: 15, 30, 45, and 60 minutes".
- When: "In Block 2, 15 meanwhile (Recommended)".
- How fine-grained: "Per model (Recommended)".
- The default for text and image models: "15 minutes (Recommended)".
- On video and images, in the owner's words: "shouldn't their limits be different: 30, 45, 60, 75? And for image generation also, may be not as long as video generators but surely longer compared to high reasoning text?"

## At a glance

| Kind | Choices (min) | Default | What the owner said | Does the evidence support it? |
|---|---|---|---|---|
| Text | 15, 30, 45, 60 | 15 (owner's choice) | "15, 30, 45, and 60 minutes"; default "15 minutes (Recommended)" | **Yes.** 15 and 30 each match a measured or worked-out case. 45 and 60 match no case at byway's settings. No source documents a cost for them beyond the time held. They stay because the owner chose them. |
| Image | 5, 10, 15, 20 (proposed) | 15 (owner's choice) | Default "15 minutes (Recommended)"; "may be not as long as video generators but surely longer compared to high reasoning text" | **Partly not.** Shorter than video: yes. Longer than reasoning text: no. At byway's settings an image takes about 1 min or less, and the slowest p95 at any quality is 2.8 min. A shorter set fits the evidence better. The evidence would also support a 10-minute default, but the owner chose 15. |
| Video | 30, 45, 60, 75 | 30 (my judgement) | "30, 45, 60, 75?" with no default | **Yes for 30.** 45-75 have no measured case for byway's models. On fal, waiting longer costs no money. |

## 1. What byway does today

Read from branch fix/fx-block1 at commit 137bf75. Nothing was changed.

**Stall limit**
- `STREAM_IDLE_MS = 900_000` (15 min) in `packages/gateway/src/providers/stream.ts:19`, chosen by the owner on 2026-10-22.
- The research shares quote 600,000 ms, and question 2 as relayed says "after 10 minutes". Both describe the value from before 137bf75.

**What a stall costs**
- A stalled stream counts as "maybe billed". byway sends the call once more and fails it if that stalls too (`errors.ts`; `retry.ts` `BILLABLE_CALL` maybeResends 1; `cut-off.test.ts:836`).
- The same holds for an image call that times out.
- So one stall can take up to twice the limit and pay for up to two generations.

**Where the step limits apply**
- Model step: 15 minutes, up to 3 attempts (`packages/runner/src/workflow/acts.ts:20`; retry policy at :12).
- Media step: 45 minutes, up to 2 attempts (`acts.ts:22`).
- Compose and intake are outside any step. They run in the web app's advisor (`packages/advisor`, called from `apps/web/src/services`), so no step limit bounds them. Only the stall limit (streamed calls) or the client's own limits (Google) do.

**Output allowances**
- `askModel` (`runner/src/activities/call.ts`) makes at most 2 attempts. A cut-off answer is asked again with twice the allowance, capped at 64,000. So 16k becomes 32k and 4k becomes 8k. No current step reaches 64k.
- Builders (build, seed, fix, voice): 16k, then 32k, on the mid model.
- Other model-step roles: 4k, then 8k (`model-step.ts` `JUDGE_MAX_OUTPUT`). Critic and judge default to the big model. Check, cut, tells-* and similar roles default to the mid model.
- A critic step can run up to 4 shuffles, each its own call (`critic.ts:57`).
- Compose: big model, 16k. It makes one call and up to two repairs, each at 16k (`advisor/src/compose.ts`, `MAX_REPAIRS = 2`). A cut-off answer gets a repair at 16k, not a 32k retry.
- Intake, asset briefs, relay links and lifecycle: 4k, then 8k. The gateway allows up to 128,000.

**Which model does what**
- Building (mid): Sonnet 5.5 (balanced), Opus 5.5 (best), GPT-6.1 Sol (openai), Gemini 3.8 Flash (google) and Sonnet 5.5 via OpenRouter (openrouter). The mid model also writes asset briefs, places images and writes relay links.
- Critic, judge and compose (big): Opus 5.5 (balanced), Fable 5.1 (best), GPT-6 Astra (openai), Gemini 3.1 Pro (google) and Opus 5.5 via OpenRouter (openrouter).
- Critic from another AI family, at 4k: Astra (balanced, best) and Opus 5.5 (openai, google).
- The demo profile's mock models make no AI calls and need no wait.

**Media steps**
- An asset step runs inside one 45-minute media attempt:
  1. A briefs call (mid, 4k, then 8k).
  2. Its images, one after another. Each gets up to `triesPerSlot` tries; the relay chain's first frame gets at least 2. Each try is sent once more after a "maybe billed" failure.
  3. On prose and web pages, an integrate call that places the images (mid, 16k, then 32k; `asset.ts:195`).
- A relay step makes a link call (mid, 4k, then 8k), one fal video job and an extract-frame job. byway polls the video job every 2 s and sets no deadline of its own on it.
- A second media attempt polls the jobs fal already accepted by their ids and never submits them again (`gateway.ts`, `resume`).

**Thinking effort.** byway sends no effort or thinking settings, so each model runs at its provider's default:
- Opus 5.5: medium. Sonnet 5.5 and Fable 5.1: high (Anthropic's models overview and effort page).
- GPT-6.1 Sol: medium (OpenAI's reasoning guide).
- GPT-6 Astra: OpenAI does not say. OpenRouter's config says medium; LLM Stats says low.
- Gemini 3.1 Pro: high. Gemini 3.8 Flash: medium (Google's thinking page, updated 2026-10-14).
- Nano Banana 2.1: medium (its model page, updated 2026-10-06).

## 2. Text models

### 2.1 Measured silence at byway's effort levels

Artificial Analysis (AA) publishes a time-to-first-token (TTFT) distribution. The independent research share read it from the data embedded in AA's pages. In that data, TTFT equals AA's time to first answer token in every row. The researcher inferred from this that no thinking reached AA's client before the answer, so AA's TTFT approximates the silence byway would see. That is an inference, not something AA states.

The figures below are medians and p95s over the 72 hours to 2026-10-22, with 10k input tokens and answers of at least 1,500 tokens ([AA method](https://artificialanalysis.ai/methodology/performance-benchmarking)).

| Model (effort) | Median | p95 | Source |
|---|---|---|---|
| Opus 5.5 (medium) | 20.3 s | 72.5 s | [AA](https://artificialanalysis.ai/models/claude-opus-5-5-medium/providers) |
| Sonnet 5.5 (high) | 11.0 s | 47.3 s | [AA](https://artificialanalysis.ai/models/claude-sonnet-5-5-high/providers) |
| Fable 5.1 (high) | 19.1 s | 59.7 s | [AA](https://artificialanalysis.ai/models/claude-fable-5-1-high/providers) |
| GPT-6 Astra (medium) | 4.6 s | 17.6 s | [AA](https://artificialanalysis.ai/models/gpt-6-astra-medium/providers) |
| GPT-6.1 Sol (medium) | 5.1 s | 21.1 s | [AA](https://artificialanalysis.ai/models/gpt-6-1-sol-medium/providers) |
| Gemini 3.1 Pro (high), AI Studio | 20.1 s | 52.8 s | [AA](https://artificialanalysis.ai/models/gemini-3-1-pro-preview/providers) |
| Gemini 3.8 Flash (AA measures high; byway runs medium) | 24.9 s | 56.3 s | [AA](https://artificialanalysis.ai/models/gemini-3-8-flash/providers) |

No measured p95 silence at byway's effort levels is above 73 s, and a 15-minute limit is 12.4 times the largest of them. OpenRouter's P99 first token for Sol at medium reached 79-95 s on some days, over OpenRouter's own traffic mix. That figure is a P99, not a p95.

### 2.2 Worst case at byway's allowances (my arithmetic, not measured)

Anthropic, OpenAI and Google all count thinking inside the output allowance, so the longest possible silence is the allowance divided by output speed. The speeds are AA's median and p5 output speeds. This assumes thinking runs at the same speed as the answer, which no provider documents.

For Google the figure covers the whole call, so it adds AA's median or p95 TTFT on AI Studio. byway calls the Gemini API with an API key (`google.ts`, `new GoogleGenAI({ apiKey })`), so AA's Vertex figures do not apply.

| Model | Role | Allowance | At median speed | At p5 speed |
|---|---|---|---|---|
| Opus 5.5 | builder (best) | 16k / 32k | 3.5 / 6.9 min (76.9 tok/s) | 4.2 / 8.5 min (62.8) |
| Sonnet 5.5 | builder (balanced) | 16k / 32k | 2.6 / 5.1 min (103.6) | 3.0 / 6.0 min (89.0) |
| Fable 5.1 | judge; compose | 4k / 8k; 16k | 1.2 / 2.4; 4.9 min (54.7) | 1.6 / 3.2; 6.5 min (41.1) |
| GPT-6 Astra | judge; compose | 4k / 8k; 16k | 1.3 / 2.6; 5.3 min (50.7) | 1.7 / 3.5; 6.9 min (38.6) |
| GPT-6.1 Sol | builder (openai) | 16k / 32k | 5.8 / 11.6 min (46.0) | 7.7 / **15.3** min (34.8) |
| Gemini 3.1 Pro (whole call) | compose | 16k | 2.5 min (122.5 tok/s plus median TTFT) | 3.4 min (104 tok/s plus p95 TTFT) |
| Gemini 3.8 Flash (whole call) | builder (google) | 16k / 32k | 2.4 / 4.3 min | 3.4 / **5.8** min |

Only one case passes 15 minutes: Sol's 32k retry at p5 speed. It happens only if all 32k tokens go to reasoning, and such a call would stop at the token limit with no answer anyway (OpenAI's [reasoning guide](https://developers.openai.com/api/docs/guides/reasoning)).

Two figures suggest this is rare:
- At medium effort, AA averages about 3k reasoning tokens per task for Sol ([AA](https://artificialanalysis.ai/models/comparisons/gpt-6-1-sol-medium-vs-gpt-6-1-sol)).
- OpenRouter's whole-call P99 for Sol at medium was 73-233 s per day, 2026-10-15 to 10-22 ([OpenRouter stats](https://openrouter.ai/api/frontend/v1/stats/latency-e2e-comparison?percentile=p99&perfWorkload=text_generation&permaslug=openai%2Fgpt-6.1-sol-20260929&timeRange=1w&variant=standard&reasoningEffort=medium)).

### 2.3 Stress cases outside byway's settings

**Max effort (byway does not send it).** p95 silence by model, from the AA providers pages above:

| Model | p95 silence at max effort |
|---|---|
| Opus 5.5 | 937 s (15.6 min) on Anthropic; 1,047.8 s (17.5 min) on Bedrock |
| Sonnet 5.5 | 613 s on Anthropic; 687.5 s on Azure |
| GPT-6 Astra | 493.8 s |
| GPT-6.1 Sol | 463.1 s |
| Fable 5.1 | 311 s |

Opus 5.5's median at max is 647.8 s (10.8 min). Separately, OpenRouter recorded a whole-call P99 of 843 s for Sol at xhigh on 2026-10-17.

**OpenRouter's slow tail.** OpenRouter's P99 throughput on its Anthropic endpoint is 15 tok/s for Opus, 17 for Fable and 23 for Sonnet. That traffic mixes all effort levels and is mostly short agentic turns. At those speeds a 16k think would take 17.8, 15.7 and 11.6 min (my arithmetic). On OpenRouter itself a think is not silent, because summarized reasoning streams by default ([OpenRouter reasoning](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)). So these figures only stress-test calls made to Anthropic directly.

**64k and 128k allowances.** These are the runner's cap and the gateway's limit; no current step reaches them. At p5 speed a 64k think would take 26 min on Fable, 27.6 on Astra and 30.6 on Sol. A 128k think on Fable would take 39-52 min (my arithmetic).

**Anthropic's own advice.** Requests whose thinking goes above about 32k tokens "can run long enough to hit system timeouts and open connection limits" and should use batches ([thinking docs](https://platform.claude.com/docs/en/build-with-claude/thinking)). Waits sized for 64k-token thinks on a streamed Anthropic call go beyond what Anthropic itself supports.

### 2.4 The owner's text choices, tested

- **15 as the default: supported.** It is at least 12 times every measured p95 silence at byway's effort levels. It also covers every worked-out worst case at byway's allowances except Sol's 32k retry at p5 speed (15.3 min).
- **30: the one meaningful step up.** It covers Sol's case, the OpenRouter slow-tail case and the max-effort p95 on every host.
- **45 and 60: no measured case at byway's settings.** They match only the 64k-128k worst cases, which for Anthropic are thinks it says to send as batches.
  - No source documents a charge for waiting longer on a silent stream (my reading). The money risk is on the other side: a think cut off too early is sent again and paid twice.
  - They cost time on a dead connection. In one report, a Claude Code stream stayed silent on a dead socket for over 30 minutes ([claude-code #61001](https://github.com/anthropics/claude-code/issues/61001), 2026-05-20).
  - The owner chose them, so they stay.
- **Anthropic's own client.** Claude Code accepts about 10 min of a stream carrying only keep-alive pings by default, and at most 30 min ([network-config](https://code.claude.com/docs/en/network-config)). It counts pings as signs of life. byway cannot, because the Anthropic SDK 0.131.0 drops ping events (`core/streaming.mjs:108`, checked). The OpenAI SDK 7.28.0 drops SSE comment lines in the same way.

### 2.5 Question 2: the stall limit for Anthropic

The evidence supports **15 minutes** for Anthropic at byway's settings:
- The largest measured p95 silence is 72.5 s.
- The worst worked-out case at byway's allowances is 8.5 min (Opus at 32k and p5 speed).

How the alternatives compare:
- **10 min** would also cover byway's settings at AA's p5 speeds. It would not cover OpenRouter's slow-tail case (11.6-17.8 min) or Opus's median silence at max effort (10.8 min).
- **15 min** covers Sonnet's slow-tail case (11.6 min). It does not cover Opus's (17.8 min) or Fable's (15.7 min).

Inside a model step, any value of 15 or more changes nothing today, because the 15-minute step ends first. Compose and intake run outside any step, so there the stall limit alone bounds a silent think. Block 2 changes the step limits.

**A documented alternative (not a decision).** Anthropic can stream thinking summaries while the model thinks (`thinking.display: "summarized"`). The thinking docs say this adds "minimal added latency" and is billed the same, for the full thinking tokens. OpenRouter already turns it on for Claude by default. With it, a think is no longer silent, so a much shorter stall limit could tell a dead connection from a model that is thinking.

### 2.6 Google text calls: effectively capped at about 5 minutes today

byway calls Gemini without streaming. On byway's Node 24.13.1, Node's built-in fetch (undici) gives up after 300,000 ms waiting for headers, and after 300,000 ms between body chunks.

The Google share's local test showed this. It ran @google/genai 2.27.0 against a 127.0.0.1 server (not Google's) that held its headers for 330 s. The call failed after 306 s with `UND_ERR_HEADERS_TIMEOUT`, both with no SDK timeout and with `httpOptions.timeout = 600000`. `errors.ts` treats that error as "maybe billed" and sends the call once more. So a call that legitimately needs more than 5 minutes fails twice, after about 10 minutes, possibly paying for two generations and getting no answer.

Whether Google's real server sends its headers early, which would change which timeout fires, was not tested. That would need a paid call.

What follows:
- byway cannot enforce any Google wait above about 5 minutes until it passes the SDK its own fetch or dispatcher. The SDK passes `httpOptions.fetch` through.
- It may already bite today. Gemini 3.8 Flash's 32k builder retry at p5 speed works out at 5.8 min for the whole call, past the limit. Gemini 3.1 Pro's 16k compose works out at 3.4 min at p5 speed on AI Studio, under it.
- Some Gemini calls never finish, and there a long wait only delays the failure:
  - A 14-hour incident on gemini-3.5-flash, a different model, held unstreamed calls with JSON output and an explicit thinkingConfig open with 0 bytes returned ([forum](https://discuss.ai.google.dev/t/sustained-outage-14h-gemini-3-5-flash-generatecontent-hangs-indefinitely-on-structured-output-thinkingconfig-returns-0-bytes/174959)). byway's JSON steps send JSON output but no thinkingConfig; thinking runs by default. So byway's request is similar, not identical.
  - In April 2026, gemini-3.1-pro-preview calls hung for "several minutes" and then returned 504 ([forum](https://discuss.ai.google.dev/t/gemini-3-1-pro-preview-started-failing-on-april-15-2026-with-503-504-after-2-months-of-stable-usage/141140)).

## 3. Image models

| Model (byway's setting) | At byway's setting | Slowest measured | Sources |
|---|---|---|---|
| gemini-nano-banana-2.1 (1K, medium thinking) | Whole call P50 18.69 s, P95 40.52 s, P99 57.64 s (OpenRouter, one week, mixed sizes) | 64.5 s (4K, one run in an app) | [OpenRouter](https://openrouter.ai/google/gemini-nano-banana-2.1?percentile=p99); [JXP](https://www.jxp.com/nano-banana/blog/nano-banana-2-1-review) (2026-10-09) |
| gpt-image-2.5-flare (medium, png) | 10 s and 14.0 s (single runs) | AA, max quality: p95 67.5 s | [Segmind](https://blog.segmind.com/gpt-image-2-5-api-the-ultimate-guide-to-flare-and-sunburst/) (2026-09-09); [flarevssunburst.com](https://flarevssunburst.com/) (2026-09-12, anonymous); [AA](https://artificialanalysis.ai/image/models/gpt-image-2.5-flare-2026-09-08) |
| gpt-image-2.5-sunburst (medium, png) | 16 s and 18.4 s (single runs) | AA, max quality: p95 167.0 s. Everypixel, high quality at 2K: up to 101 s | same sources; [Everypixel](https://research.everypixel.com/gpt-image-2-5-sunburst-vs-gpt-image-2/) (2026-10-06) |

OpenAI says "Complex prompts may take up to 2 minutes to process" ([image guide](https://developers.openai.com/api/docs/guides/image-generation)). The image incidents found were errors lasting 40 min to 7 h 27 min, not slow generations.

**The owner's suggestion, tested**
- "Not as long as video generators": supported.
- "Surely longer compared to high reasoning text": **not supported.**
  - At byway's settings an image takes under 20 s at the median. Nano Banana 2.1's P99 is about 1 min. OpenAI's images at medium quality have only single runs, all under 20 s. The slowest p95 at any quality is 2.8 min (Sunburst at max).
  - Text at high effort is as slow or slower. AA's p95 silence at high effort is 2.3-3.1 min for Sol, Opus and Astra, and 5-17.5 min at max effort.
  - byway's text builder calls would take 2.4-5.8 min end to end at median speed if they used their whole 16k allowance (my arithmetic).

**Recommendation: choices 5, 10, 15, 20, with the owner's default of 15**
- The owner chose "15 minutes (Recommended)" as the default for image models, and that stays.
- The shorter set answers the owner's question "shouldn't their limits be different". Images need less time than text, not more.
- 15 min is 5.4 times the slowest p95 at any quality and 7.5 times OpenAI's own "up to 2 minutes".
- The evidence would also support a 10-minute default, which loses less time on a hung image inside the asset step (below). That change is the owner's to make.
- 20 min allows for slowdowns during incidents, which nobody has measured.

**Ceilings today.** OpenAI image calls stop at 10 min, the SDK default; byway passes no timeout and sets maxRetries 0. Google image calls stop at about 5 min (undici). A 15-minute wait therefore needs block 2 to set the OpenAI SDK's timeout and give the Google SDK its own dispatcher.

**Fit inside the media step.** One asset step holds, in one 45-minute media attempt:
- The briefs call.
- Every image, one after another, with its tries.
- On prose and web pages, the integrate call (16k).

An image that times out is sent once more as "maybe billed", so one hung image can take twice the wait: 30 min at a 15-minute wait, or 20 min at 10. At 15 min a second hung image passes the step limit; at 10 min, two hung images use 40 of the 45 minutes.

**Billing.** OpenAI documents nothing about a timed-out image. Google says failed requests with a 400 or 500 error are not charged, and says nothing about timeouts ([billing](https://ai.google.dev/gemini-api/docs/billing)). byway sends a "maybe billed" image once more, so an image cut off too early may be paid for twice.

## 4. Video models

| Endpoint | Typical | Long tail | Sources |
|---|---|---|---|
| Kling 3 Pro image-to-video on fal (3-15 s clips, audio off) | AA, including queue wait: median 120 s in one read and 133 s in another, both 2026-10-22 | p75 210-214 s, p95 310 s. LTX reports 398 s for a 10 s clip at about 1080p (one figure; sample count not stated; LTX is a competitor) | [AA](https://artificialanalysis.ai/video/models/kling-3-0-pro); [LTX](https://ltx.io/blog/ai-video-model-speed-comparison) (2026-10-02) |
| Kling 2.5 Turbo Pro image-to-video (5 or 10 s) | Averages from other hosts, not fal: 75 s ([WaveSpeed](https://wavespeed.ai/models/kwaivgi/kling-v2.5-turbo-pro/image-to-video), undated) and 160 s at 1080p ([EachLabs](https://www.eachlabs.ai/blog/kling-2-5-turbo-fast-ai-video-generation-guide), 2026-03-18, method not given) | None published | — |
| Any video model on fal | — | Longest p95 found: 818 s (Wan 2.2 A14B) | [AA](https://artificialanalysis.ai/video/model-families/wan) |

**Caveats on AA's Kling 3 Pro figures**
- AA's page says its timings use "720p, 5s video", or the closest setting the model offers.
- It does not say whether audio was on, or whether the runs were text-to-video or image-to-video.
- One research share reports a listed price twice byway's audio-off rate. So AA's configuration may differ from byway's.

**Long clips.** No source times a 15 s Kling 3 Pro clip. Scaling the 5 s p95 up to 15 s gives about 15.5 min (my arithmetic). This overstates, because queue wait does not grow with clip length.

**Long waits.** The only reports of 30-60 minute waits are for Kling 3 Omni on Adobe Firefly ([Adobe Community](https://community.adobe.com/questions-404/kling-3-o-omni-video-generation-taking-about-an-hour-and-so-1632156), 2026-07-15). That is a different host and a sibling model, and those jobs ended with no video.

**What waiting costs on fal**
- fal bills only successful outputs. Queue wait is free, and 5xx errors are never billed ([fal pricing](https://fal.ai/docs/documentation/model-apis/pricing)).
- Cancelling a job that is still queued removes it, unbilled.
- Cancelling a job that has started returns 202, and the job "can still complete" unless the app implements a cancel endpoint. fal does not document this for Kling ([queue docs](https://fal.ai/docs/model-apis/model-endpoints/queue)).
- So waiting longer costs no money, while giving up after a job starts probably pays for a clip byway then throws away. The result stays readable by its request id for at least 7 days.

**The owner's choices, tested.** 30 min is well supported as the default:
- 5.8 times Kling 3 Pro's p95.
- 4.5 times the only 10 s figure.
- 2.2 times the longest p95 for any video model on fal.
- About twice the 15 s estimate.

45, 60 and 75 have no measured case for byway's models. Given fal's billing, they are cheap insurance against queue spikes: new accounts get 2 concurrent requests, and the queue has no maximum length ([concurrency](https://fal.ai/docs/documentation/model-apis/concurrency-limits)). Keep the set. The 30-minute default is my judgement, since the owner gave none.

**Fit inside the media step.** Today one media attempt allows 45 minutes, and it also holds the link call and the extract-frame job. So a wait of 45 or more does not fit one attempt. A second attempt resumes polling the same fal job, which stretches the wait across attempts but relies on a timeout and a retry. Block 2 should size the relay step to the chosen wait.

**fal's start deadline.** fal can drop a request that has not started by a deadline, answering 504 with nothing billed. fal's docs name the header `X-Fal-Request-Start-Timeout`, while `@fal-ai/client` 1.10.1 sends `x-fal-request-timeout`. Which one the server honours is untested. Setting it to the time byway has left to wait would stop fal from starting, and billing, a job after byway has given up.

**extract-frame.** No timing exists anywhere. It runs inside the clip's media step, so it should run under the clip's wait rather than have a Settings entry of its own.

## 5. How the step limits interact (for block 2)

**Today the step limits decide, not the waits**
- The 15-minute model step covers the whole step, so a text wait above 15 min has no effect there.
- A model step can hold several calls:
  - A builder's retry: an answer cut off at 16k and asked again at 32k must fit both calls in 15 min. Sol at median speed could need 5.8 + 11.6 = 17.4 min if both calls used their whole allowance (my arithmetic).
  - A critic's shuffles: up to 4 calls, each with its own retry.
- Compose and intake run outside any step, so the chosen wait will govern them directly.

**Sizing the steps so the chosen wait decides**
- One stalled call can take twice the wait: it stalls, byway sends it again, and it stalls again.
- A model step therefore needs at least twice the wait plus time to stream the answer, for example 35-40 min for a 15-minute wait. A step that makes several calls needs more (my judgement).
- **Timeouts are retried with new paid calls.** A model step that hits its overall limit is retried, up to 3 attempts, because timeouts are not on its list of failures that are never retried. Each retry sends new paid calls. This is my reading of `acts.ts`, not tested. While a step limit is lower than the chosen wait, the step's timeout decides, and its retries can pay again.
- **Media steps** need at least:
  - Image step: the briefs call, plus (number of images × tries × 2 × image wait), plus the integrate call on prose and web pages.
  - Relay step: the link call, plus the video wait, plus extract-frame.

## 6. Where sources disagree, and what is missing

**Disagreements**
- **AA headline cards against tables.**
  - The Opus 5.5 medium card shows time to first answer token. It read 12.99 s in the research pass and 11.60 s at this check, both on 2026-10-22.
  - The table's 20.26 s is labelled "First Chunk".
  - At max effort, the card read 608.68 s and the table 647.8 s.
  - The report uses the table and embedded-data values.
- **AA figures move between 72-hour windows.** Sol at high read 57.26 s in a search snippet and 30.9 s on the live page. Fable at xhigh read 102.80 s and 63.99 s. Kling 3 Pro's median read 120 s and 133 s.
- **Default effort.** Opus 5.5 medium and Fable 5.1 high come from Anthropic's own pages. The independent share found Opus's default only in a blog. OpenAI does not document GPT-6 Astra's default.
- **Gemini 3.8 Flash.** Its measured speed halved between launch week (305.1 tok/s, cited by eesel on 2026-09-08) and 2026-10-22 (136.6 tok/s), and AA's workload may also have changed. AA measures it at high effort, while byway runs it at medium.

**Missing**
- **Byway-sized requests.** No source measures silences at byway's request size: tens of thousands of input tokens with 16k-32k allowances.
- **Undocumented provider facts:**
  - Anthropic's ping interval (a community measurement saw about 30 s, [luthien-proxy #804](https://github.com/LuthienResearch/luthien-proxy/pull/804)).
  - Whether an aborted Anthropic or OpenAI stream bills the reasoning already done.
  - Google's server-side deadline.
  - Whether OpenAI or Google bill a timed-out image.
  - The time limit on fal's Kling app, and whether cancelling a running Kling job stops billing.
- **Image quality setting.** The image times at byway's medium quality are single runs; AA measures GPT Image 2.5 only at max quality.
- **Not researched:** claude-opus-5 and claude-opus-4-8, which are priced but in no profile.

## 7. Parked (outside this question)

- **fal fallbacks.** fal's reliability page says fallbacks, which reroute a request to "an equivalent endpoint", are on by default. The `x-app-fal-disable-fallback` header turns them off, and byway does not send it. This may bear on ADR-0102.
- **Image price estimate.** Pixmax reports about 367 output tokens per image for GPT Image 2.5 at medium quality and 2048x1152, while `prices.ts` plans 8,000. This is for the next price-table read.

## Recommended default per model

| Model | Kind | Default (min) |
|---|---|---|
| claude-opus-5-5, claude-sonnet-5-5, claude-fable-5-1 | text, streamed | 15 |
| anthropic/claude-opus-5.5, anthropic/claude-sonnet-5.5, anthropic/claude-fable-5.1 (OpenRouter) | text, streamed | 15 |
| gpt-6-astra, gpt-6.1-sol, gpt-6-luna | text, streamed | 15 |
| gemini-3.1-pro-preview, gemini-3.8-flash | text, not streamed (about 5 min is enforceable today) | 15 |
| claude-opus-5, claude-opus-4-8 (in no profile, not researched) | text | 15 |
| gpt-image-2.5-flare, gpt-image-2.5-sunburst, gemini-nano-banana-2.1 | image | 15 (owner's default; 10 also supported by the evidence) |
| fal-ai/kling-video/v2.5-turbo/pro/image-to-video, fal-ai/kling-video/v3/pro/image-to-video | video | 30 |
| fal-ai/ffmpeg-api/extract-frame | video helper | No setting of its own; runs under the clip's wait |
| mock-big, mock-mid, mock-other, mock-image, mock-video (demo profile) | none | No setting; they make no AI calls |