*Claude's short design of how long byway waits for each model's answer (block 2), as sent to the owner as a file on 2026-10-22 at 17:41 local and unchanged since 17:41:39, copied from the session's scratchpad below the line (`block2-plan/waits-design-v2.md`, of which `waits-design-approved.md`, saved at 18:55, is a copy). The owner asked for it at 14:07, choosing "Short design of the waits first (Recommended)". Its four questions (17:41) and the owner's answers (18:53) are in [conversation-continued.md](../conversation-continued.md): the owner chose the option the design recommended in each, "Relay from your video wait, 24 h elsewhere (Recommended)", "Ask for summaries (Recommended)", "Give up and end the call plainly (Recommended)" and "Keep today's behaviour (Recommended)", and the backlog and block 2's build map record the design as approved on those answers. What it marks "(Claude)" is Claude's choice, not the owner's. Its local test of Node's limits, which it says "stays as evidence", is the probe kept in [probes/node-fetch-limits-2026-10-22/](../probes/node-fetch-limits-2026-10-22/), and the research it builds on is [reports/answer-waits-research-2026-10-22.md](../reports/answer-waits-research-2026-10-22.md).*

---

# Block 2: how long byway waits for each model (short design, v2)

*Read against main at 37a4104 on 2026-10-22; nothing was changed. It applies a first critic's 19 corrections and a second critic's 9, each checked in the code. **(Claude)** marks my proposals; the technical choices so marked are mine and will be recorded as mine. Four choices are yours, at the end.*

## Already decided (the options you chose, word for word, and your own answers)

- Text: "Build selectable limits for every model/provider: 15, 30, 45, and 60 minutes", "Per model (Recommended)", default "15 minutes (Recommended)".
- Images: "5, 10, 15, 20; default 15 (Recommended)": "Block 2 also lifts today's caps (OpenAI's SDK stops an image at 10 minutes, Google's fetch at about 5) so the chosen wait governs."
- Video: 30, 45, 60, 75, "30 minutes (Recommended)": "Block 2 sizes the relay step to the chosen wait (today's 45-minute media step also holds the link call and the frame extraction, so 45 or more would not fit one attempt)."
- When: "In Block 2, 15 meanwhile (Recommended)": "Build the setting with Block 2's workflow change, which also raises the steps' own limits so 30-60 take full effect, before your first live run."
- Meanwhile: "45 minutes for calls in media steps (Recommended)", ending "Block 2's per-model waits replace both."

## What the defaults change on day one

Today's limit, then block 2's:
- Streamed text calls inside image and video steps (asset briefs, placing, the relay link's call): 45 minutes, then their model's wait (15 by default).
- Google text and images: about 5 minutes a send, sent once more (Node's fetch gives up), then 15.
- OpenAI images: 5 to 10 minutes a send, sent once more, then 15.
- OpenAI and OpenRouter streams that send nothing: closed by Node at 5 minutes unless they send keep-alives (not known), then 15.
- fal clips: no deadline of their own (the 45-minute media step, and its second try resumes the clip), then 30 minutes from fal's acceptance.
- A clip's frame extraction: only the media step today, then the time left on its clip's wait plus 2 minutes.
- Text in model steps, compose and intake: 15 before and after.

## 1. Settings

- **(Claude)** A section "How long to wait for an answer", below "Model profile", one row per model, grouped by provider.
- **(Claude)** Rows are keyed by provider and model: claude-opus-5-5 (Anthropic) and anthropic/claude-opus-5.5 (OpenRouter) are separate.
- **(Claude)** Every profile's models are listed, key or no key: 14 today. Mock models get none. Each model's kind (text, image, video) comes from the profiles.
- **(Claude)** The web API checks each choice against its model's set, from the gateway's profiles; the store accepts only the union (5, 10, 15, 20, 30, 45, 60, 75). Why: the store depends only on contracts and zod, so it cannot know the models.
- **(Claude)** A new store table, one row per workspace, provider and model. A row whose model no profile uses is kept but not shown. A replacement model starts at its kind's default, and Settings says so. Why: gemini-3.1-pro-preview is a preview, so swaps will come.
- **(Claude)** A change applies from the next call, except within a relay step (section 4). Help text: "For text that streams in, this is how long the model may send nothing." Under choice 3's resend, it adds that a call may be sent twice.

## 2. How each wait is kept

**One fetch for the text and image providers (Claude).**
- Node's fetch gives up after 5 minutes without headers, or 5 minutes between body bytes (my local test: both failed at 304 s).
- Every SDK client byway makes for text and images (Anthropic, OpenAI, OpenRouter, Google) gets a fetch on an undici Agent (undici is the library inside Node's fetch; an Agent, its connection pool), at 7.18.2, Node 24.13.1's bundled version.
- fal keeps Node's default fetch: its requests are short (a poll every 2 s), and its upload and result reads have no deadline of their own, so Node's 5-minute limits are what bound them.
- Its headers and body timeouts are 80 minutes, above the longest choice; byway's own deadlines do the timing. Why: Node's own code, used without reaching into Node's internals.

**Streamed text (Anthropic, OpenAI, OpenRouter).** The stall bound becomes the model's wait. It restarts at each chunk, so it limits silence, not the whole answer. Before the response begins, the SDKs' own 10-minute request timeout still governs (openai 7.28.0, @anthropic-ai/sdk 0.131.0).

**Google text, OpenAI and Google images (one piece). (Claude)** The wait covers the whole answer: a deadline handed to the call (Google's `config.abortSignal`; OpenAI's `signal`, with the SDK's 10-minute timeout raised above the wait). It never carries the run's stop (section 5).

**fal clips (Claude).**
- The wait counts from fal's acceptance. That time is stored with the job in the spend book (byway's record of paid calls in flight): a store migration, tested. Why: otherwise a resumed job's clock restarts (paid.ts:55-56).
- When the wait runs out, byway cancels the job. Removed before it ran: nothing billed. Running, or the cancel failed: "may have been billed", with the job's id. Already done: kept, since it is paid for.
- The job is never sent again.

**fal's start deadline (Claude).** fal can drop a job not started by a deadline, unbilled. byway sends both names, `X-Fal-Request-Start-Timeout` (fal's docs) and `x-fal-request-timeout` (@fal-ai/client 1.10.1), set to the wait minus about one clip's generation time: 5 minutes for a clip up to 5 seconds (Kling 3 Pro's p95), 10 up to 10 seconds, and 15 above that (the report's scaled figure for 15 seconds, which it says overstates). Why: a late-starting job still has room to finish, so byway rarely pays for a clip it throws away.

**Frame extraction (Claude).** Bounded by the time left on its clip's wait, plus 2 minutes. Why: the research puts it under its clip's wait; the floor saves a late clip's frame.

## 3. How long a call can take at wait W

| Call | Wait counts | When it runs out | Longest |
|---|---|---|---|
| Streamed text | silence | sent once more | 2W of silence, plus streaming |
| Google text | whole answer | choice 3 | W or 2W |
| OpenAI or Google image | whole image | choice 3 | W or 2W, per try |
| fal clip | from acceptance | cancelled, never resent | W, then its frame |

- For text and images, a declined answer is asked once more, as a call of its own (askOnceMore, gateway.ts:463); a fal clip is not.
- For every kind, a provider's own error answer is sent again, up to 4 sends, not counted as a stall (retry.ts:14-20, errors.ts:120-138).

## 4. Steps

**Today** (acts.ts): model steps 15 minutes, 3 tries; image and video steps 45 minutes, 2 tries; heartbeat (the "still alive" signal) 30 s.

**Stall arithmetic at wait W.** A call that stalls twice fails its step for good. With the decline retry counted:
- a builder, 2 asks (call.ts:77): 3W, or 5W with declines;
- a GREAT critic with 4 shuffles (critic.ts:57-59): 9W, or 17W (17 hours at 60);
- compose, 3 calls (compose.ts:22): 4W, or 7W; intake, 2 calls (ask.ts:40): 3W, or 5W. Both run in the web app's request, with no step limit.

These leave out streaming time, the time before each response, and error resends, so no fixed limit is provably above the worst case. A step limit is a backstop.

**What a timeout does.**
- byway's no-retry list (acts.ts:12) holds step and budget failures, and every gateway failure travels as one of them (failures.ts:58-63). So Temporal never retries a call that stalled twice. It does retry a step that timed out or lost its worker, and an error byway did not expect (failures.ts:66): model steps up to 3 tries, image and video steps 2.
- On that retry, paid answers come back from the memo (byway's store of paid answers). The call still under way is not cut off (liveness.ts:11-12). About a minute later (one lease) the new try takes it over. A text or image call is sent again, so if both answer, both are paid (ADR-0099:66). A fal clip is only polled again by its job id, never sent again, and keeps its clock (section 2). The new try waits up to 5 minutes (memo.ts:101) only while the other try still holds the call.
- The run fails only when the last try times out. Then streamed text and fal calls still running are cut off as "may have been billed". Google and image calls finish, paid in full, and their answers go unused.

**Build order (Claude).** The gateway stops reading operation.stepLimitMs (gateway.ts:264 and :504; contracts/src/gateway.ts:99; activities/index.ts:64) before or with the new limits; otherwise every stream's stall bound becomes its step's limit. operation.stepLimitMs is replaced, not just removed, by operation.waitMs: the wait a relay step read before it began. The relay step passes it to its link call and its clip, and the gateway uses it instead of reading Settings; every other call leaves it out. Tests check that a call in a 24-hour step stalls at its model's wait, and that a wait raised during a relay step does not change that step's calls.

**Relay sizing (Claude, under choice 1's first option).** Limit = 5 × the link model's wait (its two asks, as a builder's) + the video wait + 15 minutes (frame, upload, downloads): about 2 hours at the defaults, 6.5 at the longest. A quick step reads your waits just before each relay step; the step's limit and its calls use that one reading, so they always fit.

Step limits land in W's single bundle change (the frozen workflow code), with P2 and VOICE-RETRY.

## 5. Cancel and the steps' cancellation type

- ADR-0111 left to block 2 whether the step proxies (how the workflow calls its steps) wait for their steps on Cancel (ADR-0111:73).
- Today: TRY_CANCEL, Temporal's default. The run shows Cancelled at once. Each step hears at its next heartbeat (about 2 s) and cuts off streamed text and fal jobs. Google and image calls finish in the background, are paid, and their cost is added to the run (ADR-0111:77). Nothing is sent again.
- With longer waits, such a call can run on for its whole wait: up to 60 minutes for Google text, 20 for an image. The other type, WAIT_CANCELLATION_COMPLETED, shows "stopping" until those calls end. Either way the one cancellation scope stays (run.ts:39).
- **The Google and OpenAI-image deadlines never carry the run's stop**: they are not joined with it, as the stream bound joins its signals (stream.ts:42). Why: ADR-0111 hands these calls no stop, since a cut-off call is still billed. A test checks that a Cancel leaves them running.

## 6. Anthropic's thinking display

- byway sends no thinking setting. Per the claude-api reference (read 2026-10-22), Opus 5.5, Sonnet 5.5 and Fable 5.1 then think adaptively with display "omitted": only pings arrive, which the SDK drops.
- `thinking: { type: "adaptive", display: "summarized" }` keeps the same thinking and streams a summary; display "controls visibility only - thinking happens and is billed the same under every setting" (the reference).
- The SDK's type docs (@anthropic-ai/sdk 0.131.0, messages.d.ts:2468-2471) say "Defaults to `summarized`": stale.
- Answers are unchanged. A test checks the body carries display "summarized".

## 7. Records, money and tests

**When a chosen wait ends a call (Claude).** A new recorded reason, "waited". Without it, a fal deadline reads as a Cancel and a stall as "before the connection failed". Settings' records and the step's failure say, for a stall: "{Model} sent nothing for {N} minutes, the wait chosen in Settings, so byway stopped waiting. It may have billed the work. To wait longer, change 'How long to wait for an answer' in Settings." A Google or image deadline says "did not answer within {N} minutes"; fal says "did not finish clip job {id} within {N} minutes", plus fal's answer to the cancel. The store allows two reasons today (migrations.ts:228), so this joins the fal migration. One test each.

**Money.** A longer wait holds a call's estimate against the budget longer. Of an aborted call, Google's SDK says "You will still be charged usage" (genai.d.ts:6128-6133, GenerateContentConfig.abortSignal).

**Tests** use fake timers. Beside those named above, they cover each kind's wait, fal's three cancel answers, the start headers, the frame bound, each text and image client's fetch and fal's left on Node's default, the store's union, Settings' rows, and build.test.ts's fingerprint. My slow local test of Node's limits stays as evidence.

**Who tests it live first (Claude).**
- fal's headers: your own first C5 run ("C5 is held out of the first live runs and only you run it."). In fal's dashboard, find each clip by the id byway records: completed, billed once, no request refused. That shows fal accepts the headers, not that it honours them.
- Image caps: the first image-making run, C3 on Balanced (one Gemini image); OpenAI images first on Best or OpenAI. An image takes about a minute, so this shows the fetch works; the local test shows the cap is gone.

## Choices for you

**1. Step limits.** A stuck step (byway's own code hung; each call has its own wait) holds its run as Running until Cancel or its limit. The heartbeat catches a dead worker, not a hung live one.
- **Relay from your video wait, 24 hours elsewhere (Recommended):** the relay step is sized from your video wait, as your video choice said. Model and image steps get a 24-hour backstop that the waits and heartbeat normally make unnecessary. A stuck step can hold its run up to 24 hours a try: 72 hours for a model step (3 tries), 48 for an image step (2). Why: no healthy model or image step is timed out. A relay step that runs past its limit is tried again with its link answer from the memo and its clip polled by its id, so no clip is bought twice.
- **Every limit worked out per run:** each step's limit is computed from its waits. A stuck step holds its run less (hours at the defaults), but each kind of step needs its own formula. One that undercounts times a healthy step out, and the call it had under way is sent again about a minute later and can be paid twice.

**2. Anthropic's thinking display.**
- **Ask for summaries (Recommended):** one field, billed the same (the claude-api reference, read 2026-10-22; the SDK 0.131.0's type docs are stale on the default). Why: your waits then measure true silence, so a long think is not cut off and paid twice.
- **Leave it hidden:** no change; your Anthropic waits measure thinking time.

**3. After a call uses its whole wait** (Google text, OpenAI and Google images; not streams, which restart at each chunk).
- **Give up and end the call plainly (Recommended):** it ends at W, with words naming the wait and Settings; other connection failures are still sent once more. Why: a call that used a whole wait, set well above typical times, is most likely stuck; Google charges for an aborted call, so a resend mostly pays twice.
- **Send it once more, as today:** ADR-0091's "maybe billed" resend: up to twice the wait, probably two charges.

**4. Cancel.**
- **Keep today's TRY_CANCEL (Recommended):** the run shows Cancelled at once; uncut Google and image calls finish in the background, are paid, and their cost is added to the run. Why: waiting saves no money, since those calls are paid either way.
- **Wait for the steps to end:** the run shows "stopping" until they do, up to a Google call's or an image's chosen wait (60 or 20 minutes), shown as a new Run screen state.
