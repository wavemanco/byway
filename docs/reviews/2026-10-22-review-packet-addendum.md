*Why this exists: the playbook row "Review the 38 Delegated records" on main asks for a dated addendum to the review packet ([2026-10-21-review-packet.md](2026-10-21-review-packet.md)), because ADR-0111 and block 2's records change records the packet covers, so the packet no longer shows what is in force. Claude wrote it on 2026-10-22, in block 2's records pass, and left the packet as it was given. Claude brought it up to date on 2026-10-23, in the records pass of block 2's fix round, and the packet's header now points here.*

---

# Addendum to the review packet: what has changed since it was prepared

The packet was prepared from main at a002e60 and given to you on 2026-10-21 at 23:04. You chose it at 21:43, "Money and security packet, at your pace (Recommended)". Since then:

- **On main (90ac3c3):** [ADR-0110](../adr/0110-playwright-updated-within-two-weeks-of-each-release.md) (Playwright's cadence), [ADR-0111](../adr/0111-cancel-cuts-off-the-calls-byway-can-stop.md) (Cancel's true stop) and [ADR-0112](../adr/0112-a-placing-answer-that-misses-keeps-the-paid-images-beside-the-work.md) (paid images kept beside the work), and Later notes on the packet's records.
- **In block 2, not yet merged (branch fix/fx-block2):** [ADR-0113](../adr/0113-run-inputs-seeds-and-the-held-voice-travel-by-reference.md) (run inputs by reference), [ADR-0114](../adr/0114-each-models-answer-wait-is-chosen-in-settings.md) (each model's answer wait) and [ADR-0115](../adr/0115-the-price-table-kept-current-and-priced-by-tier.md) (the price table, priced by tier and kept current), and their Later notes. Until block 2 merges, these hold on its branch only.
- **Block 2's fix round (2026-10-23, on the same branch):** block 2's adversarial check found 20 issues and 14 notes, and at 01:41 you chose "Fix all, gate, small re-check, CI, merge (Recommended)". Some fixes change how a call is counted: an image whose wait ran out, a resumed clip past its wait, a stopped clip fal reported done, a send retained before a call is sent again, and a clip call taken over as it submits. ADR-0114 item 12 records them, and Later notes of 2026-10-23 on ADR-0091, 0095, 0099 and 0111 say what each changes there. The fixes are Claude's choices under your answer.
- **Block 2's second fix round (2026-10-23, on the same branch):** block 2's re-check of the fix round found 3 issues and 6 notes, and at 06:25 you chose "Fix all, raise the 5 s default, re-check, CI, merge (Recommended)". Two of its changes are about money: fal's own answer that a stopped clip's job failed now counts as "may have been billed" at its estimate, with nothing in the ledger (R-MONEY-1, 14749fc, as your option said; fal's own answer is a status that comes with fal's body, so a lost connection or a proxy's page still counts the clip as made), and a clip's status read and the look after a failed cancel now have 30 seconds each (R-MONEY-2, aed7b78, Claude's choice). ADR-0114 item 12 records them, and the Later notes of 2026-10-23 on ADR-0091 and 0111 say what they change there.

**How to read it.** Part 1 takes the packet's seven entries in the packet's order. For each it says what changed, whether that changes the decision you are asked to keep or change, and where it is recorded. It gives the missing "Since changed by" lines, corrects each quote or "What it means" sentence that no longer holds, and says where the cost of a change moves. Part 2 adds the records the packet does not cover that now govern money or keys, one short entry each. You still answer Keep or Change per record, at your pace. No run waits on it.

**How it was checked.** Claude read the records on main at 90ac3c3 and in block 2's worktree (its branch at 1c9c5e3, with the records pass's files not yet committed). On 2026-10-23 Claude read it again against block 2's branch at c126f43, with the fix round merged and that records pass's own files not yet committed, and corrected what no longer held (block 2's check found one such sentence, RECORDS-6). On 2026-10-23, in the records pass of block 2's second fix round, Claude added that round's money changes and corrected where the addendum placed ADR-0091's sentence on the last-frame job (block 2's re-check, R-RECORDS-5). Quotes from records are copied from them. Your answers are quoted from the conversation record. Each statement about what the code does was checked against block 2's code, and the file is named where it matters. Where Claude worked something out, it says so.

**Part 2 and the playbook row.** The playbook row says this addendum covers only the packet's entries, and that the Claude choices in ADR-0111, ADR-0112 and block 2's records stay in the row's own list. Part 2 does not replace that list. It puts the records that now govern money and keys beside the packet's, each with its main alternative and its cost, so you can answer them the same way. The full list of Claude's choices is still the row's.

## Words added

- **Stop:** the signal byway gives a call once its run is ending: you pressed Cancel, chose "Stop the run" at a loop's last round, or the run failed. A call that gets it is cut off where byway can cut it off (ADR-0111).
- **Answer wait:** how long byway waits for a model's answer before it gives up on the call. You choose it per model in Settings, "How long to wait for an answer" (ADR-0114). For a streamed answer it counts silence; for an answer that comes back whole, the whole answer; for a fal clip, the time from fal's acceptance.
- **Answered whole:** a call whose answer comes back in one piece: Google's text calls and images, and OpenAI's images.
- **Long-context tier:** the higher rates a provider charges for a prompt longer than a set number of tokens (ADR-0115).
- **Workflow bundle:** the run engine's code that waiting runs hold. A change to it ends every run waiting at that moment (ADR-0078).

## What the costs mean, since block 2

The packet says the money and key code is outside the workflow bundle, so none of its changes ends a waiting run. That still holds for the packet's seven entries. It does not hold for all of Part 2. Since block 2, the steps' time limits, the relay step's limit and how a step hears of Cancel are inside the bundle (ADR-0114 item 11). A change to them ends every run waiting at that moment and moves the bundle's pinned hash. Block 2's merge does this once: runs waiting under the older bundle end plainly when the engine changes (ADR-0078).

---

## Part 1: the packet's entries

### 1. ADR-0095: the spend book

**Since changed by (add):**
- ADR-0111 (main). A call cut off after it was sent, because its run was ending, is abandoned as "interrupted". It counts at its reservation, as "may have been billed", against the workspace budget until you clear it in Settings. A call stopped before anything billable was sent is released. A resend's retention (decision 4) now comes after the retry's wait, just before the resend, so a stop during the wait retains nothing.
- ADR-0114 (block 2). A call that used its model's whole wait is abandoned with a third reason, "waited", with how long and how it waited. The book also keeps when fal accepted each job, so a resumed clip keeps its clock. Both came with migration 10, which rebuilds the book's table.
- Block 2's fix round (ADR-0114 item 12). `retain` takes the wait of the send it retains, and migration 11 adds a column for it. So when a stream went silent for its whole wait, was sent once more and then answered, Spending records say the first send went unanswered and may have billed the work, where they read as a lost connection. A row that counts an earlier send beside its own says so. The amounts counted are unchanged.

**Does it change what you are asked to keep or change?** No. The book is still the authority, and both budgets count as the packet quotes. What is new is more ways a call ends as "may have been billed", and Spending records that say more about why.

**What no longer holds:** nothing quoted. "What it means" holds. The calls that keep counting until you clear them now include calls cut off by Cancel or by a failed run, and calls that used their whole wait. Settings names each by its reason.

**What changing it would cost:** Replacing the book is still large, and somewhat larger: ADR-0111's cut-off calls and ADR-0114's "waited" calls also go through it, and migrations 10 and 11 are built on its table. The lease and the ceiling are still one constant each (`DEFAULT_LEASE_MS` in `packages/gateway/src/paid.ts`, `MAX_PLAUSIBLE_CALL_USD` in `packages/contracts/src/spend.ts`).

**Where it is recorded:** ADR-0095's Later notes of 2026-10-21 (ADR-0111), and of 2026-10-22 and 2026-10-23 (ADR-0114); ADR-0111's and ADR-0114's "What this changes in earlier records" (ADR-0114 items 8 and 12); the index row's "changed by" links.

### 2. ADR-0099: paid calls keyed to their caller

**Since changed by (add):**
- ADR-0111 (main). Each step's call also carries a stop. When the run is ending, the call is cut off instead of being left for another try to take over. A timeout, a lost worker or a stopping worker, while the run goes on, still hands the call over, as decision 3 says. If the run then ends while that step lasts, its call is cut off then. Pause cuts nothing off. A stopped step ends as cancelled, so it is not tried again.
- ADR-0114 (block 2). The call's operation gains `waitMs`, the wait a relay step read before it began, and loses ADR-0111's `stepLimitMs`. A resumed fal clip keeps the time fal accepted it, so its wait keeps its clock. Model and image steps now run under a 24-hour backstop instead of 15 and 45 minutes, so a step times out far less often.
- Block 2's fix round (ADR-0114 item 12). A clip call whose lease ran out while it got its clip ready could be admitted again onto another attempt's row whose clip fal had already accepted. It then submitted a second clip, and one billed clip was recorded nowhere (the check's MONEY-3, in code from before block 2). Now such a call submits nothing and fails as "may have been billed", naming the other attempt's job, which Spending records list. Polling that job in the same call instead is left to a backlog row.

**Does it change what you are asked to keep or change?** No. The keys, the takeover within one lease and the runner's waits are as quoted. The stop is added beside them, and one takeover path is now closed.

**A correction of the packet's own sentence (Claude's; the behaviour did not change):** "What it means" says the new try "waits for the first try's answer instead of buying the same call again". That holds while the first try's call is still held. It leaves out a case the record already had, in its Positive consequences:
> A timed-out or dead attempt's call is taken over within one lease and counted once more only if it may have been billed.

ADR-0114 now says what that means: "a text or image call is sent again, so if both answer both are paid; a fal clip is only polled again by its job id, with its clock." Since block 2 a step times out only at its 24-hour backstop, so the case is rarer. Since the fix round a clip polled again after its wait has run out is first asked about, so a clip fal finished is kept rather than cancelled unseen.

**What changing it would cost:** Removing the keys is still large, and touches more: ADR-0111's stop and ADR-0114's wait and clip clock ride on the same operation. The waits are still constants in `packages/runner/src/activities/memo.ts` (`WAIT_LIMIT_MS`, `WAIT_POLL_MS`, `RECALL_EVERY_MS`).

**Where it is recorded:** ADR-0099's Later notes of 2026-10-21 (ADR-0111), and of 2026-10-22 and 2026-10-23 (ADR-0114); ADR-0114's "What this changes in earlier records"; the index row.

### 3. ADR-0091: provider-edge billing fixes

**Since changed by (add):**
- A Later note of 2026-10-21 (main). The Recommendation page no longer asks the advisor while it renders. The screen asks once it is shown, and `firstRecommendation()` still shares one advisor call among first asks (batch B of the first block).
- ADR-0111 (main). Once a call's run is ending, nothing is sent for it again, whatever the billing reading allows. OpenAI's and OpenRouter's chat calls are now streamed. In their streams, an error chunk after the 200, a last chunk that finishes with "error", or a stream with no finishing chunk is `maybe`: sent once more at most, with that attempt retained. A stream whose usage chunk never came is settled at its planning figures, marked as an assumed price.
- ADR-0114 (block 2). A stalled stream is read at its model's wait, not at fifteen minutes. A call answered whole whose wait runs out is not sent again: it fails as "may have been billed", recorded as waited. A fal clip whose wait runs out is cancelled, never ordered again. A clip fal drops at the start deadline byway sent counts nothing (Claude's reading of two fal pages).
- Block 2's fix round (ADR-0114 item 12). An image step no longer asks again for an image whose wait ran out, where its own tries per slot used to send it again. A clip resumed after its wait has run out is asked about once before it is cancelled, and a cancel that failed is followed by one more look, so a finished, paid clip is kept. A stopped clip fal reported done has its result read once before it is counted, so a clip fal dropped at its start deadline counts nothing when Cancel comes at the same moment too (it was counted at about $0.35). A clip call taken over as it submits does not submit a second clip. Since the second fix round, fal's own answer to that read that the job failed counts as "may have been billed" at its estimate, with nothing in the ledger, not as a clip made and paid (R-MONEY-1); and the status read and the look after a failed cancel have 30 seconds each (R-MONEY-2).
- ADR-0109's Later note of 2026-10-22, "Google's billing page" (block 2): Google's billing page says a request that fails with a 400 or 500 error is not charged.
- ADR-0091's Later note of 2026-10-23: under a takeover, two attempts can each submit a last-frame job for one clip (below).
- ADR-0115 (block 2) leaves it unchanged: decision 4's estimate contract holds at the long-context tier.

**Does it change what you are asked to keep or change?** The choices the entry asks about stand. An answer carrying the provider's own error body is still read as unbilled, and a text or image call is still sent once more after a `maybe`. Each now has exceptions, below. The main alternative, treating any 5xx as `maybe`, is unchanged.

**What no longer holds, with its correction:**
- The quote "`none`: … an error event in a stream (`overloaded_error`, `api_error`) …" now holds for Anthropic's streams only. In OpenAI's and OpenRouter's streams an error chunk is `maybe` (ADR-0111 item 8).
- "What it means", first bullet: byway "sends a text or image call once more" now has two exceptions. Nothing is sent again once the run is ending (ADR-0111). And a Google call or an image that used its whole wait is not sent again (ADR-0114 item 5): you pay for it once, not twice.
- "An error that carries the provider's own message is treated as free. Only fal's documentation backs that." This no longer holds as quoted. Google's billing page (ai.google.dev/gemini-api/docs/billing, read on 2026-10-22) says a request that fails with a 400 or 500 error is not charged, so the 5xx half is documented for fal and for Google (ADR-0109's Later note of 2026-10-22, "Google's billing page"; the comment in `packages/gateway/src/errors.ts`). For Anthropic, OpenAI and OpenRouter it is still an assumption, and so is Anthropic's mid-stream error event, which no provider documents. The first version of this addendum said "This holds"; block 2's check found it wrong (RECORDS-6). ADR-0114 adds one reading of the same kind, fal's start-deadline 504, which no single fal sentence states; the first live C5 run's fal dashboard can confirm it. The readings ADR-0111 adds (what a closed stream bills, fal's 200 to a cancel, the mid-stream error chunks, a missing usage chunk) joined the backlog row "Check the billing assumptions that no provider documentation backs".

**Also no longer true in the record, though the packet does not quote it:** its Consequences' "The same holds for the last-frame job" (the first Positive bullet, after "A fal submission that may have reached fal is never sent again by the SDK or by the gateway"), that the frame job is not submitted twice either. Decision 2's "fal jobs are submitted once" holds for each submission. Under a takeover, an attempt that heard a timeout keeps polling the clip, the next attempt resumes it a lease later, and when the clip finishes each submits its own extract-frame job. fal bills both, about $0.002 each, and byway counts one. The packet's "never re-sends a video clip" holds; this is the frame job only. It stays a backlog residual ("Paid-call residuals named only in ADRs"), and the first live C5 run's fal dashboard is checked for it.

**What changing it would cost:** Treating any 5xx as `maybe` is still one rule (`billingOf` in `packages/gateway/src/errors.ts`). Never re-sending is still one setting (`BILLABLE_CALL` in `packages/gateway/src/retry.ts`). Since ADR-0114 it would change streamed calls that stall or break, and other connection failures; a call answered whole whose wait ran out is already not re-sent.

**Where it is recorded:** ADR-0091's Later notes of 2026-10-21 (the first recommendation, and ADR-0111), of 2026-10-22 (ADR-0114) and of 2026-10-23 (the last-frame job, and the fix round); ADR-0109's Later note of 2026-10-22, "Google's billing page"; ADR-0114's "What this changes in earlier records"; ADR-0115's, which says it is unchanged; the index row.

### 4. ADR-0088: held keys and media admission

**Since changed by:** no new record. Two Later notes on ADR-0100 (main) change again the part the packet lists as "what a browser tab keeps after a refusal":
- 2026-10-21: Start's refusal names each attachment that held a key, by its number and name, and leaves the name out when the key was in it. Start keeps the attachments that held none.
- 2026-10-22: a held attachment is kept again only once byway's own check (`heldKeyIn`) finds no key in it, at Start's next request. So a fixed attachment comes back once Start accepts it, and a reload before that loses it. These are Claude's choices, not put to you.

Related, not a change to the record. ADR-0111's Later note (SEC-NOTE-1) passes fal's answer to a cancel through the redactor this record applies to provider text, and the gateway's `video()` redacts an adapter's own error before throwing it. Block 2's new Settings route for the waits (`PATCH /api/waits`) reads its body through `parseBody` with the key check, as every route must (Claude checked `apps/web/app/api/waits/route.ts`).

**Does it change what you are asked to keep or change?** No. Nothing quoted is untrue, and the costs are unchanged.

**Where it is recorded:** ADR-0100's Later notes of 2026-10-21 and 2026-10-22; ADR-0111's Later note "fal's cancel answer is redacted (SEC-NOTE-1)".

### 5. ADR-0074: local app security model

**Since changed by:** nothing.

Related, not a change to the record:
- Block 2 adds one route that changes state, `PATCH /api/waits`. The proxy checks every path (its matcher is `/:path*` in `apps/web/proxy.ts`), so the Host, Origin and Sec-Fetch checks cover it (Claude checked).
- Block 2's `AGENTS.md` tells every coding agent, whatever its provider, that the keys in `.env.agents` are for development only, never to read that file, and never to print, store, log, commit or render a key. ADR-0115's Consequences say this meets ADR-0009, which is not in the packet.

**Does it change what you are asked to keep or change?** No. The costs are unchanged.

### 6. ADR-0084: the renderer launches without secrets

**Since changed by:** nothing.

Related, not a change to the record:
- ADR-0110 (main). You chose "Within two weeks of each release (Recommended)": the renderer's pinned Chromium is updated within two weeks of each Playwright minor release. Each update re-checks this record's launch-failure texts (ADR-0110 item 5, Claude's). The first update comes after your first live run and the generators' baseline.
- ADR-0114 (block 2). Page renders run on the model steps' proxy, so they share its 24-hour backstop and three tries (Claude's reading of "Model and image steps"). The renderer keeps its own 30-second deadline (`packages/runner/src/pages.ts`).

**Does it change what you are asked to keep or change?** No. The costs are unchanged.

### 7. ADR-0109: the money path before the first live run (Claude's choices only)

**Since changed by (add):**
- A Later note of 2026-10-21 (main): the title now names OpenAI's cache writes. It reads "The money path before the first live run: prices and model ids read again, OpenAI's cache writes charged at their rate, a Gemini image's thinking charged, a failed run start asks Temporal first".
- ADR-0111 (main). Decision 7's assumption that a mid-stream error event is unbilled now covers Anthropic's streams only. Decision 1's reading of OpenAI's cached and written tokens holds for a streamed answer, which is joined and read by the same code.
- ADR-0115 (block 2). OpenAI's long-context rates (above 272,000 input tokens) and Google's (above 200,000) are recorded and charged, where decision 1 listed them as "Low, for requests byway does not make". The table was read again in full on 2026-10-22, every figure matched, and `PRICES_CHECKED` names that day. It is now kept current by a weekly CI report, a re-read due at 30 days, and the date shown in Settings, the estimate and, since the fix round, the Library.
- ADR-0109's Later note of 2026-10-22, "Google's billing page" (block 2). Decision 7's reading of a provider-bodied 5xx as unbilled is documented for Google too, as for fal; for Anthropic, OpenAI and OpenRouter it stays an assumption. The code is unchanged.

**Does it change what you are asked to keep or change?** No, for each of 7a to 7h:
- **7a, 7c, 7d, 7f:** no change.
- **7b:** unchanged; ADR-0115's Later note on this record says so. It is still `estimatedOutputTokensPerImage: 2000` in `packages/gateway/src/prices.ts`.
- **7e:** holds for streamed OpenAI answers. The long tiers record their own 30-minute write rates: $25, $5 and $0.25 per 1M tokens for `gpt-6-astra`, `gpt-6.1-sol` and `gpt-6-luna` above 272,000 input tokens. Undoing 7e would now touch those three as well. Still small.
- **7g:** holds at both tiers. A long prompt is planned at its tier's plain input rate, and each tier's write rate is 1.25 times its input rate, so the estimate can still be low by up to a quarter of its input cost (Claude's arithmetic). The Recommendation's estimate plans every brief at 1,500 tokens, so the tiers change no default budget (ADR-0115), and the budgets the packet lists for 7g are not moved by them. The change would now also plan writes at the tier's rate. Still medium.
- **7h:** holds. At the long tiers the ratios are the same: $2 read and $25 written against $20 input for `gpt-6-astra`, $0.20 and $5 against $4 for `gpt-6.1-sol`. So caching still costs less than none once each written token is read back more than about 0.26 to 0.28 times (Claude's arithmetic).

**What no longer holds, with its correction:**
- The entry's heading gives the old title. The current one is above.
- "The playbook's review row does not yet list the last choice (implicit caching). The 2026-10-22 audit filed that for the next records pass." The row on main now lists it.

**Where it is recorded:** ADR-0109's Later notes of 2026-10-21 (the title, and ADR-0111) and of 2026-10-22 (ADR-0115, and Google's billing page, in block 2); ADR-0115's "What this changes in earlier records"; the index row.

### The packet's last two sections

- **"The other Delegated records":** there are now 38. The 38th is ADR-0112 (main), entry B below.
- **"Not in this packet":** "The 2026-10-22 audit also found ADR-0108's reading missing from that row." The row on main now lists it. It also lists the Claude choices in ADR-0110, ADR-0111 and block 1's fix rounds, and, in block 2, those in ADR-0113, ADR-0114 and ADR-0115 and those of block 2's fix round.

---

## Part 2: records the packet does not cover that now govern money or keys

### A. ADR-0111: Cancel cuts off the AI calls byway can stop; the others finish and are paid for (main)

**Decided by:** User. On 2026-10-21 at 21:27 you chose "Build a true stop now" over Claude's recommendation, and at 23:05 "Approve, and stream OpenAI/OpenRouter too" over "Approve with all five recommendations (Recommended)". Its Decided by row names the choices that are Claude's, not put to you. Among them: reading Temporal's `CANCELLED` as the run ending; leaving Google's calls and every image call uncut; fal's 202 and failed cancel answers counted as "may have been billed"; and an answer that arrives as the stop comes settled, not thrown away.

**What it means for your money:** When a run ends with calls under way (you press Cancel or "Stop the run", or it fails), byway cuts off its Anthropic, OpenAI and OpenRouter text calls and its fal clips, about two seconds after the run stops. A cut-off call counts at its reservation, as "may have been billed", against the workspace budget until you clear it in Settings. A reservation plans the whole output allowance, so it can be well above the bill. A fal job removed before it ran counts nothing. Google's calls and every image call finish after the run stops, are paid for, and are added to the run. Since ADR-0114 that can take up to their wait: at the longest choices, 60 minutes for Google text and 20 for an image. Since block 2's fix round, a clip fal reported done when the stop comes has its result read once before it is counted, so a clip fal dropped at its start deadline counts nothing then too (ADR-0111's Later note of 2026-10-23).

**Main alternative (Claude's statement):** hand Google's calls and the image calls the stop too. The record's Context reads:
> Google's SDK abort is client-side only and still charged (the design's reading of the SDK).

So for Google a cut-off would lose the answer and save nothing. For the others, the option you chose said "for others an abort may not stop the bill and loses the result".

**What changing it would cost:** Small (a few hours), by Claude's estimate. The change is in the gateway's adapters (`providers/google.ts`, `providers/openai.ts`, `providers/types.ts`) and the whole-call deadline (`providers/deadline.ts`), with tests in `cut-off.test.ts`. Only a live run shows whether OpenAI bills a stopped image.

**Your answer, on Claude's choices:** Keep / Change: ______

### B. ADR-0112: A placing answer that misses keeps the paid images beside the work (main)

**Decided by:** Delegated, the 38th such record. Claude built the default it set out in its audit of 2026-10-21. Its row reads: "The owner did not answer the default itself; not explicitly approved; reversible." Where the build departs from the default, the record names the departure as Claude's.

**What it means for your money:** An image step buys its images before it asks the model to place them. Until this record, a placing answer that missed twice ended the run with the paid images outside the work. Now the step finishes. It uses an answer that placed at least one image, or keeps the work unchanged, and every image left out is kept beside the work with a note. The step's cost includes both placing answers. An image byway could not keep still stops the run, and now names its slot.

**Main alternative (its Alternatives section):**
> Keep failing the run, and record why. The backlog row offered this ("Fix it, or record that it stays"). It ends a paid run late over an optional enhancement, the class F11 removed.

**What changing it would cost:** Small (an hour or two). It is the placing answer's handling in `packages/runner/src/activities/asset.ts`, with its tests in `asset-slots.test.ts` and `held-voice-writers.test.ts`, outside the workflow bundle. It would bring back runs that end after their images were paid for.

**Your answer:** Keep / Change: ______

### C. ADR-0114: Each model's answer wait is chosen in Settings, and the steps are sized so the wait governs (block 2)

**Decided by:** User. On 2026-10-22 at 06:40 you wrote your own answer, "Build selectable limits for every model/provider: 15, 30, 45, and 60 minutes". You chose the choice sets at 09:50 and 12:10, and at 18:53 the design's four recommendations, among them "Give up and end the call plainly (Recommended)" and "Keep today's behaviour (Recommended)". Its Decided by row names the choices that are Claude's, not put to you. Among them: the relay step's limit formula, the margins of fal's start deadline, the last frame's bound, the reason "waited" and its words, and reading a 504 at fal's start deadline as nothing billed. On 2026-10-23 at 01:41 you chose "Fix all, gate, small re-check, CI, merge (Recommended)" for block 2's fix round, whose description said the fixes are made "as Claude's choices where the findings leave a choice". Among those: an image whose wait ran out ending its slot's tries, one status read for a resumed clip past its wait, one more look after a failed cancel, one result read (at most 30 seconds) of a stopped clip fal reported done, and a clip call taken over as it submits failing as "may have been billed" rather than polling the other attempt's job (item 12). On 2026-10-23 at 06:25 you chose "Fix all, raise the 5 s default, re-check, CI, merge (Recommended)" for block 2's second fix round, whose description said "fal's own failure answer to the look counts as 'may have been billed' at its estimate, nothing ledgered". How that answer is told apart from the others, and the 30-second bound on a clip's status read, are Claude's (item 12).

**What it means for your money:**
- Each model waits its chosen time: text 15 minutes by default, images 15, video clips 30. A longer wait holds a call's estimate against the budget longer.
- A Google text call or an image that uses its whole wait is not sent again. You pay for it once, not twice, and it counts as "may have been billed" until you clear it. Since the fix round an image step does not ask for such an image again either, and its note says the wait ran out and where to change it in Settings.
- A streamed answer that sends nothing for its whole wait is sent once more, as before.
- A fal clip waits from fal's acceptance. When the wait runs out, byway cancels it and counts it by fal's answer, as for Cancel. It is never ordered again. Since the fix round a clip resumed after its wait has run out is asked about once first, and a cancel that failed is followed by one more look; a clip fal finished is kept and used, not counted as "may have been billed" beside a clip bought again. Since the second fix round that status read and that look have 30 seconds each, and a look that gets no answer in time leaves the clip counted as "may have been billed".
- A clip fal drops at the start deadline byway sent counts nothing (Claude's reading), since the fix round when Cancel comes at the same moment too.
- Since the second fix round, a clip whose job fal answers as failed when Cancel comes as it finishes counts as "may have been billed" at its estimate until you clear it, with nothing in the ledger. Before, it was ledgered at its full price, about $0.35. fal's pricing page charges nothing for a request that fails with a status of 500 or more, so this leans high until you check it in fal's dashboard.
- Since the fix round, Settings' Spending records say when a row counts an earlier send that went unanswered for its wait, and a recommend or compose call whose wait ran out says on the screen that it may have been billed, and where to change the wait. The amounts counted are unchanged.
- Model and image steps run under a 24-hour backstop. In the option you chose: "No healthy step is ever cut short, and no clip is bought twice." A stuck step can hold its run "up to 24 hours a try (72 for a model step's 3 tries)".

**Main alternative (Claude's statement):** count a clip fal dropped at its start deadline as "may have been billed", as block 2 first built it (the closed backlog row "A clip fal drops at its start deadline is counted as "may have been billed""). That leans high: the clip's estimate would count against the workspace budget until you clear it. The first live C5 run's fal dashboard can show which reading is right.

**What changing it would cost:**
- **The start-deadline reading: small (an hour).** It is one reading in `packages/gateway/src/providers/fal.ts`, with its tests in `clip-wait.test.ts`.
- **The fix round's choices: small each, by Claude's estimate (an hour or two).** They are in `packages/gateway/src/providers/fal.ts`, `packages/gateway/src/gateway.ts` and `packages/runner/src/activities/asset.ts`, outside the workflow bundle, with their tests in `clip-wait.test.ts`, `operation-keys.test.ts` and `asset-slots.test.ts`. Undoing one brings back the case it closed: an image bought twice, a finished clip thrown away, a dropped clip counted at about $0.35, or a second clip bought under a takeover. The second fix round's two are the same size, in `fal.ts`, with their tests in `clip-wait.test.ts`; undoing R-MONEY-1 brings back a failed clip ledgered at about $0.35 when Cancel lands as it finishes.
- **The relay step's formula: a few hours, by Claude's estimate.** It is in `packages/runner/src/workflow/acts.ts`, inside the workflow bundle, so the change ends every run waiting at that moment (ADR-0078) and moves the bundle's pinned hash.

**Your answer, on Claude's choices:** Keep / Change: ______

### D. ADR-0115: The price table kept current and priced by tier (block 2)

**Decided by:** User. On 2026-10-21 at 23:05 you chose "Approve, and price long-context tiers in W" over Claude's recommendation, and at 23:15 "Weekly report + monthly re-read + date in the app (Recommended)". On 2026-10-22 at 18:54 you chose "Claude checks at each session's start (Recommended)", and at 18:55 you wrote "I can;t have this completely tethered to one provider". Its Decided by row names the choices that are Claude's, not put to you. Among them: the thresholds compared as ">", the prompt counted whole with its cached tokens, a reservation priced at its planning estimate's tier, "monthly" read as 30 days, the notice from the 46th day, and GPT Image 2.5's planning figure left at 8,000 output tokens.

**What it means for your money:**
- A call whose prompt is longer than 272,000 tokens (OpenAI's three GPT-6 text models) or 200,000 (Gemini 3.1 Pro) is reserved, recorded and estimated at the higher rates, every token of it. So the caps hold for a very large brief, which can run since block 2 (ADR-0113).
- Settings and the Recommendation show "Prices last checked Oct 22, 2026." From the 46th day they add a notice that estimates and recorded costs may differ from your provider's bill. The re-read is due from 2026-11-21, checked by whichever agent or person opens a session. Since the fix round the Library shows the same line, the weekly report warns when it cannot read a page, and any flag calls for every page to be read again.
- Each GPT Image 2.5 image is still planned at 8,000 output tokens: about $0.24 an image, against about $0.01 by OpenAI's calculator. So a run budget can refuse an OpenAI image it could pay for, and the estimate shown leans high.

**Main alternative (its Alternatives section):**
> Lowering the gpt-image planning figure to the calculator's counts (Claude's, not taken; item 6).

**What changing it would cost:** Very small (minutes). It is `estimatedOutputTokensPerImage: 8000` on the two gpt-image rows in `packages/gateway/src/prices.ts`, with its tests. The estimates and reservations for OpenAI images would fall, and so would the default budgets of recipes that make images on the Best and OpenAI profiles (Claude's expectation, not computed). It is best set from the first live run that makes an OpenAI image (backlog row "GPT Image 2.5's planning figure is about 20 times the output tokens an image takes").

**Your answer, on Claude's choices:** Keep / Change: ______

### Also since a002e60, not about money or keys

- **ADR-0110 (main):** Playwright's Chromium is updated within two weeks of each minor release, your choice. Its two Claude choices, what each update runs and the reading that each update takes two CI cycles, are in the playbook row.
- **ADR-0113 (block 2):** a run's brief and the person's words are stored once and passed by id; you chose "Now, before the first live run". On 2026-10-23 you chose "Only the lines you wrote (Recommended)" for the box VOICE-RETRY starts from. It touches money in two ways: a very large brief now runs and spends where it used to fail at its start with nothing spent, which is why ADR-0115 prices the tiers; and when block 2 merges, runs waiting under the older bundle end plainly (ADR-0078). Its Claude choices are in the playbook row.
