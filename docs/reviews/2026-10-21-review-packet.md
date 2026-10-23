*Claude's review packet for D5, as given to the owner on 2026-10-21 at 23:04 local (2026-10-22T06:04:10Z) and unchanged since it was saved at 23:03, copied on 2026-10-22 from the session's scratchpad (`review-packet.md`) below the line. The owner's choice it answers, "Money and security packet, at your pace (Recommended)" (2026-10-21 21:43), is in [the conversation record](../adr/evidence/conversation-continued.md); the playbook's row "Review the 38 Delegated records" tracks the review. Where it says 2026-10-22, that is the UTC date. It was prepared from main at a002e60, which holds neither [ADR-0111](../adr/0111-cancel-cuts-off-the-calls-byway-can-stop.md) nor ADR-0112, so its "Since changed by" lines do not name ADR-0111, which changes four of the records it covers (ADR-0091, ADR-0095, ADR-0099 and ADR-0109). Claude's scans for the organisation's details, email addresses and key-shaped strings found nothing in it. The owner answers keep or change per record at the owner's pace; no run waits on it. What has changed since it was prepared is in its dated addendum, [2026-10-22-review-packet-addendum.md](2026-10-22-review-packet-addendum.md), written in block 2's records pass and brought up to date on 2026-10-23; the packet below the line stays as it was given.*

---

# Review packet: the records that govern money and keys

This answers D5. On 2026-10-22 you chose "Money and security packet, at your pace (Recommended)". The packet covers ADR-0095, 0099, 0091, 0088, 0074 and 0084, all **Delegated**: Claude decided them under authority you delegated, they can be reversed, and they were flagged for your review. It also covers the choices inside ADR-0109 that its Decided by row names as Claude's. ADR-0109 itself is User-approved, so only those choices are listed. You answer Keep or Change for each record whenever you like. No run waits on your answers.

**How it was checked.** Claude prepared the packet read-only from main at a002e60, after your answers of 2026-10-22. Every quote is copied from the record on main. Every statement about what the code does was checked against the code at a002e60, and the file is named where it matters. Each record's "Since changed by" line names the later records that already changed part of it, so what you review is what is in force. Claude found no quoted statement that the code contradicts, beyond what those later records already correct.

**What an answer does.** The playbook row says: "Each stands until reviewed; a change is recorded in a new ADR." Claude's proposal, not yet decided: a record you keep gets a dated line saying you reviewed and kept it.

**What the costs mean.** They are Claude's estimates. Before landing, every change would also need Claude's adversarial check and one CI run on Windows and Linux (the 2026-10-22 audit puts the Windows job at 28 to 40 minutes). The money and key code (gateway, store, advisor, web app and the runner's step code) is outside the workflow bundle, the code that waiting runs hold. So none of these changes ends a waiting run (ADR-0078). A change to the shared contracts package is caught by the bundle's pinned-hash test, which shows whether it would. None of the changes needs a paid call to make. Where a live run would show which way is better, the entry says so.

## Words used

- **Run budget, workspace budget (the caps):** the most one run may spend, and the most all runs together may spend. byway refuses a paid call whose estimate would take spending past either one.
- **Estimate:** the cost byway plans for a call before sending it. The estimate counts against the budgets until the true cost comes back.
- **Spend book:** the spending tables in byway.sqlite, byway's database in its data folder. The budgets count what the book holds.
- **Ledger (ledger.jsonl):** a file with one line per paid call. Each line is tied to the one before it by a hash (a fingerprint of its contents), so a changed or missing line shows.
- **May have been billed:** a call that was sent but never answered, so byway cannot tell whether the provider charged for it. It counts against the workspace budget until you clear it in Settings ("Spending records").
- **Gateway:** byway's one path to the model providers. Every paid call goes through it.
- **Run engine (Temporal):** the program that runs a run's steps and tries a failed step again. A "workflow" is one run inside it. byway talks to it over gRPC. Code 4 means a call to the engine ran out of time; code 14 means the engine was not there.
- **Worker:** the byway process that carries out a run's steps.
- **Lease:** a 60-second hold that a byway process renews while its call is under way. When the process stops renewing it (for example because it crashed), the others can tell.
- **fal:** the video provider (fal.ai). A "job" is one clip, or one frame taken from a clip, ordered from fal.
- **Renderer (Chromium):** the hidden browser byway uses to draw generated web pages and image cards. Playwright is the library that drives it.
- **Provider key:** your API key for Anthropic, OpenAI, Google (Gemini), OpenRouter or fal, kept in the secrets file `.env.agents`.
- **Token:** the unit providers charge by, about four characters of English text.

---

### 1. ADR-0095: Paid calls have a durable spend book: the book in byway.sqlite is the cap authority, ledger.jsonl its hash-chained audit record

**Decided by:** Delegated: Claude implemented the verified recommendation from the 2026-10-08 external-review verification under the user's goal "complete implementation of all fixes that can be implemented independent of the four decisions"; not explicitly approved; reversible.

**Since changed by:**
- ADR-0099: a clean stop now hands back the web process's calls too.
- ADR-0102, your D1 choice: Anthropic's refusal fallbacks (its own swap to a backup model when a model declines) are gone. This replaces decision 10.

**The decision, quoted:**
> The spend book in `byway.sqlite` is the authority for spend and the caps

> Run cap: the run's settled cost, plus the estimates of its live open, sent and accepted calls.

> Workspace cap: all settled cost, plus the estimates of live calls, plus the estimates of calls that may have been billed (`uncertain`, or sent or accepted and no longer live) and every retained amount, until the person clears them.

> `ledger.jsonl` stays the hash-chained audit record, written from the book.

> Accounting faults fail closed for paid calls. … While a fault is unacknowledged, every paid call is refused with the new code `accounting-fault`; free demo calls go on.

> A call estimated above that ceiling is refused (`invalid-request`) before anything is reserved.

The ceiling is $1,000 a call (`MAX_PLAUSIBLE_CALL_USD` in `packages/contracts/src/spend.ts`).

**What it means for your money:** Every paid call is written into byway's database at its estimate before it is sent, so both budgets count it from that moment, whichever byway process makes it. A call that may have been billed keeps counting against the workspace budget until you clear it in Settings. A ledger line byway cannot read stops all paid calls until you acknowledge it there.

**Main alternative (its Alternatives section):**
> Reservations in a SQLite table, with settled spend still read from the ledger (option B). Rejected: keeping the two in step needs a handshake, calls interrupted by a crash stay uncounted, and any ledger damage must then block all paid work.

**What changing it would cost:**
- **Replacing the book: large (several days).** The later money records are built on it: ADR-0099's keys, ADR-0102's decline retry and ADR-0109's fixes all go through the book. Replacing it means rewriting the gateway's paid-call path (`packages/gateway/src/paid.ts`) and the store's book (`packages/store/src/spend-book.ts`). It also needs a new store migration, which older builds then refuse, and new spend tests in the contracts, store, gateway, runner and web packages.
- **Changing the 60 s lease or the $1,000 ceiling: small (an hour or two).** The lease is in `packages/gateway/src/paid.ts`, the ceiling in `packages/contracts/src/spend.ts`. Each change is one constant and its tests.

**Your answer:** Keep / Change: ______

---

### 2. ADR-0099: A step's paid call is keyed to its caller across retries; byway's own failures say so; byway's stop reaches the web process

**Decided by:** Delegated: Claude implemented the verified recommendation from the 2026-10-08 external-review verification under the user's goal "complete implementation of all fixes that can be implemented independent of the four decisions"; not explicitly approved; reversible.

**Since changed by:**
- ADR-0102: the decline retry gets a key of its own, made from the step's key.
- ADR-0109: a failed start asks the run engine first. This narrows the second "double fault" under Run starts.

**The decision, quoted:**
> A step's paid call has an operation key

> A live row in any state but released and uncertain holds the key: the new attempt is refused `in-flight` (retryable, nothing billed).

> A row whose provider accepted queue jobs and whose holder is gone … is resumed: the new caller takes its owner and lease and polls its stored job ids

> The runner waits instead of paying again. … after 5 minutes stops with a plain step failure rather than pay again.

> byway's own failures have their own identity … The web says a billed call was paid for, is counted in the spending records, and that trying again makes and pays for a new call

> byway's stop reaches the web process

> A run start may name its run

**What it means for your money:** When the run engine tries a step again (after a timeout, or after a worker died), the new try waits for the first try's answer instead of buying the same call again. A clip fal already accepted is collected, not ordered twice. A Start sent twice makes one run, and a failure that is byway's own fault after you were charged says so, rather than inviting a retry that would pay again.

**Main alternative (its Alternatives section):**
> Leave overlapping attempts to the memo. Rejected: the memo records an answer only after the call, so it cannot see an attempt still running, and a lost owner's accepted clip is invisible to it.

The memo is the runner's store of each step's answers.

**What changing it would cost:**
- **Removing the keys: large (several days).** It would bring back what the record reproduced: two overlapping tries of one step made two provider calls, and a worker killed while making a clip had shot 1 bought twice. It touches the contracts, the gateway, the store (migration 7's columns), the runner's memo and ADR-0102's retry key, along with the overlap, worker-loss and run-identity tests.
- **Changing the waits: small (an hour or two).** The 5-minute wait and the 2 s and 10 s checks are constants in `packages/runner/src/activities/memo.ts`.

**Your answer:** Keep / Change: ______

---

### 3. ADR-0091: Provider-edge billing fixes: one billing classification, fal jobs submitted once, served-model pricing, the estimate contract, torn-tail quarantine, one first-recommendation call per intake

**Decided by:** Delegated: Claude implemented the verified recommendation from the 2026-10-08 external-review verification under the user's goal "complete implementation of all fixes that can be implemented independent of the four decisions"; not explicitly approved; reversible.

**Since changed by:**
- ADR-0095: the spend book. A damaged ledger line now pauses paid calls.
- ADR-0100, items 4 and 13: wording corrections.
- ADR-0102, your D1 choice: decision 7's fallbacks are replaced, and the budget wording was revisited.
- ADR-0109: a Gemini image's thinking is now charged.

**The decision, quoted:**
> `billingOf(err)` (`packages/gateway/src/errors.ts`) answers `none` or `maybe`, and walks the cause chain.

> `none`: an answer carrying the provider's own error body (429, 500, 503, 529, any 4xx), an error event in a stream (`overloaded_error`, `api_error`), or a connection that failed before the request was written …

> a completion or an image is sent once more after a `maybe` (`BILLABLE_CALL`), a queue job submission never is (`BILLABLE_JOB`)

> A `maybe` failure is not re-sent: the call fails, not retryable, saying fal may have accepted the clip and asking the person to check fal's dashboard.

> otherwise the requested row, with the ledger entry flagged `priceBasis: 'assumed'`.

That sentence is how a model with no price row is charged.

> Admission reserves planning estimates, not bounds. … A call can settle above its reservation; the true cost is recorded and later calls are refused against it.

> `firstRecommendation()` (`apps/web/src/server/first-recommendation.ts`) shares one advisor call among concurrent first asks for an intake.

**What it means for your money:**
- When a failure leaves byway unsure whether you were charged, it sends a text or image call once more (you may pay twice, and both calls are counted). It never re-sends a video clip.
- Budgets are planning estimates, not hard limits, so a run can end somewhat over its budget.
- An error that carries the provider's own message is treated as free. Only fal's documentation backs that.

**Main alternative (its Alternatives section; Claude's pick).** The first one listed, building the whole spend book at once, has since been done by ADR-0095 and 0099. The live alternative is:
> Treating any 5xx as `maybe`. Rejected. Anthropic's 529 and 503 overloaded answers and fal's 503 carry the provider's own body and mean nothing was done. Making them `maybe` would turn common overloads into failed steps.

**What changing it would cost:**
- **Treating them as `maybe`: small (a few hours).** It is one rule in `packages/gateway/src/errors.ts`, plus the billing and retry tests. Once in use:
  - each overloaded text or image call would hold its estimate against the workspace budget until you clear it;
  - more steps would fail while a provider is busy;
  - a clip refused with fal's own 503 would fail instead of being sent again.
- **Settling the assumption needs no code change.** The first live runs' ledger, compared with each provider's usage records, can settle it (backlog "Check the billing assumptions that no provider documentation backs").
- **Never re-sending: small.** `BILLABLE_CALL` is one setting in `packages/gateway/src/retry.ts`. Setting it to no re-send removes the chance of paying twice for one call, at the price of a failed step instead.

**Your answer:** Keep / Change: ______

---

### 4. ADR-0088: The provider-key promise is enforced at every crossing; provider media is admitted by one rule on every URL and redirect hop

**Decided by:** Delegated: Claude implemented the verified recommendation from the 2026-10-08 external-review verification under the user's goal "complete implementation of all fixes that can be implemented independent of the four decisions"; not explicitly approved; reversible.

**Since changed by:** ADR-0100, items 10 and 11:
- what a browser tab keeps after a refusal;
- every route that reads a JSON body is checked.

A Later note names two gaps the checks do not see (backlog "Held keys the checks do not see").

**The decision, quoted:**
> Values are checked where they cross, with one exact rule per kind of value. Product text is refused, never rewritten.

> It matches the whole trimmed value and each `:`-separated part, from 16 characters up, so a FAL_KEY's secret half is caught on its own. It returns the variable name, never the value, and reads the environment at call time.

> `parseBody` takes the check as a required parameter and refuses a JSON body holding a key, record property names included, with a 400 naming the variable.

> `complete()` (system text and every text part), `image()` and `video()` (the prompt) refuse a request holding a key with `invalid-request`.

> A billed completion whose text holds a key is ledgered first, with its evidence redacted. It is then rejected as a non-retryable `provider-error`.

> Every URL fetched, the first and each redirect hop alike, must be `https:` on the default port, with no userinfo, on `fal.media` or a subdomain of it.

**What it means for your keys and money:** If one of your five provider keys appears in anything you submit, byway refuses it and names which key, instead of storing it or sending it to a model. If a model's answer ever holds one, you pay for that answer and byway throws it away. Clips are downloaded only from fal's own media domain, so if fal serves one from elsewhere, that clip fails after it was paid for (one clip per try) until the domain is added.

**Main alternative (its Alternatives section):**
> Shape redaction of product text (the review's repair): rejected. It rewrites legitimate content, and filtering only the output leaves the input path open: a pasted key would still be stored and sent.

"Shape redaction" means blanking anything shaped like a key, such as `sk-…`.

**What changing it would cost:**
- **Switching to shape redaction: medium (about a day).** It touches the gateway's key check and scrubber (`packages/gateway/src/held-key.ts`, `redact.ts`), the web app's body check, and the key tests, including the end-to-end pasted-key test. It would reopen the input path the record closed.
- **Adding a fal media host: one line.** It goes in `packages/gateway/src/providers/fal.ts`, with a test. The backlog row "Confirm fal's live media host set" covers confirming the set.

**Your answer:** Keep / Change: ______

---

### 5. ADR-0074: Local app security model: a production server for use, a guarded dev server, and no unguarded local control planes

**Decided by:** Delegated: Claude decided under the user's instruction "go with the product track. complete it first" (ADR-0062), after the Phase 4 security review; not explicitly approved; reversible.

**Since changed by:**
- ADR-0080:
  - contributor mode is one guarded server on 127.0.0.1, not a proxy;
  - a person may turn on a page's scripts for the page in view;
  - SVG is served as a sandboxed download.
- ADR-0084: the renderer starts without secrets.
- ADR-0085: generated-page responses are inert unless a same-origin frame asks with consent.
- ADR-0088: the Keys bullet is enforced at every crossing.

**The decision, quoted:**
> `pnpm start` builds the app and serves it with `next start` on 127.0.0.1; this is the normal way to use byway.

> The proxy checks every request, including Next's internal routes and the hot-reload WebSocket, against a Host allowlist, and checks Origin and Sec-Fetch headers on every request that changes state.

> The app's own guard, the same checks, applies to every route.

> The dev server's HTTP API is switched off; byway talks to Temporal only over gRPC. The engine refuses to attach to a Temporal it did not start.

> Generated pages render only in a sandboxed frame, with no `allow-same-origin`, under their own strict CSP.

Without `allow-same-origin` a page cannot reach byway or its data. CSP is a set of rules the browser enforces on what a page may load.

> Keys are never written under the repo: Turbopack's dev filesystem cache is off. They never reach responses, logs, the ledger, artifacts or the browser.

**What it means for your money and keys:** byway listens only on your own computer and answers only requests that come from its own pages. So a website open in your browser cannot start runs, read them or spend your money. Your keys are never written into the code folder and never sent to the browser.

**Main alternative (its Alternatives section):**
> A token in the URL for every request — stronger against cross-site requests, but heavier than a local tool needs once Host and Origin are checked. It can be revisited.

**What changing it would cost:**
- **Adding the token: medium (one to two days).** In Claude's sketch, a secret is made at each start, carried by every page and API call, checked by the guard, and put in the link byway gives you. The guard tests and the end-to-end tests would change. No paid run is needed.
- **If byway is ever hosted,** this model would be replaced in any case (backlog "A hosted byway: a URL other people can open").

**Your answer:** Keep / Change: ______

---

### 6. ADR-0084: The page renderer launches with no secrets and one stated containment policy; the OS sandbox awaits the owner's decision

**Decided by:** Delegated: Claude implemented the verified recommendation from the 2026-10-08 external-review verification under the user's goal "complete implementation of all fixes that can be implemented independent of the four decisions"; not explicitly approved; reversible.

**Since changed by:**
- ADR-0100: item 5, runs of other media check the renderer before their first model step. Item 6 has since been fixed.
- ADR-0105, your D2 decision: the OS sandbox is on by default, and only you switch it off, in Settings. This replaces the record's sandbox-off setting and its "What this does not decide", so that part is not up for review here.
- ADR-0109, item 4: the secrets file's names are kept once per process, so the rule below holds on every start.

**The decision, quoted:**
> `chromiumLaunchOptions()` is the only description of how the renderer's Chromium starts

> Chromium gets `withoutSecrets(process.env, namesFromEnvFile(process.env))`: no provider key name, nothing secret-looking, and no name `.env.agents` listed (set or kept).

> `launchFailure()` turns any failure of the production launch into one non-retryable `StepError`

> `beginRun` calls it for a web-page run before the run's first step, so a web-page run whose renderer cannot start fails with the plain message before any AI call.

**What it means for your keys and money:** The hidden browser that draws model-written pages and uploaded images starts with none of your keys, and nothing else from your secrets file, in its environment. A run that needs that browser checks that it starts before any paid call, so you are not charged for steps of a run that cannot finish.

**Main alternative (its Alternatives section).** The first one listed, the sandbox on, is what you chose in ADR-0105. The next one is:
> A separate renderer process or a low-privilege OS account. A same-user helper adds little over Chromium's own broker and renderer split, and a separate identity needs admin rights and account management, which is disproportionate for a local, single-user app. Revisit if byway is ever hosted or multi-user.

**What changing it would cost:** Large (several days), plus your own action:
- a Windows account made with admin rights, and kept;
- the launch changed to run Chromium under that account, on Windows and Linux;
- ADR-0105's start-up check redone;
- pages drawn under the new account compared with today's.

No paid run is needed.

**Your answer:** Keep / Change: ______

---

### 7. ADR-0109: The money path before the first live run: prices and model ids read again, a Gemini image's thinking charged, a failed run start asks Temporal first (Claude's choices only)

**Decided by:** User-approved. The record's row names the choices inside it that are Claude's:
> Claude built backlog batch B1 ("Before the first live run: honest money path") from the coordinator's brief, and the choices inside it are Claude's, not put to the owner: describing the workflow before a failed start is marked failed (item 3), the 2,000 tokens planned for a Gemini image (item 2), COMPOSED-MEDIUM (item 6), and keeping "Nothing was spent" for code 14 and a reset connection (Consequences). So is how the check of B1 was answered (the OpenAI cache-write rate, the text rate for answer tokens Google does not list, and estimates that still plan OpenAI input at the plain rate), after the owner chose on 2026-10-21 13:41 "Fix all, focused re-check, push (Recommended)", and keeping OpenAI's implicit caching on (Alternatives), recorded after the owner chose on 2026-10-21 16:14 "Fix the wording and small gaps, file the rest (Recommended)".

The rest of the record carries out batch B1, which your answer of 2026-10-18 approved. The playbook's review row does not yet list the last choice (implicit caching). The 2026-10-22 audit filed that for the next records pass.

#### 7a. A failed run start asks the run engine first (item 3)

**Quoted:**
> A failed run start asks Temporal before the run is marked failed.

> Temporal has it. The start reached Temporal after all, or another delivery's did. The run is left to its workflow, and the start returns the run.

> Temporal has none. The run did not start.

> byway could not ask. The run is failed, so the gateway refuses its next calls.

**What it means:** If starting a run times out, byway asks the run engine whether the run really began before calling it failed. A run that did start therefore goes on, instead of running with its paid calls refused. When byway cannot ask, it says it cannot tell, and that a call already under way may still be charged and will show on the run.

**Main alternative (its Alternatives section):**
> Read gRPC 4 as "unknown" without asking Temporal (the backlog's simpler form). Not taken: a run whose workflow Temporal had accepted would still be marked failed, and would then run with its calls refused.

**What changing it would cost:** Small (a few hours). The change is in `packages/runner/src/client.ts` and `start-failure.ts`, plus the tests `start-describe.test.ts` and `engine-state.test.ts` (which runs a real Temporal). Taking the check out would also shorten one wait: with the engine down, a Start's error now comes after about 40 s instead of about 20 s.

**Your answer:** Keep / Change: ______

#### 7b. 2,000 tokens planned for a Gemini image (item 2)

**Quoted:**
> The pre-call estimate plans 2,000 such tokens an image (about $0.015): Claude's planning number, since Google gives no count.

**What it means:** On Balanced and the Google profile, byway plans about $0.049 for each Gemini image before making it: $0.0336 for the image, a 300-token prompt, and about $0.015 for the model's thinking and text. The true charge is recorded afterwards, whatever it is. If the real thinking count is higher, budgets plan low by the difference.

**Main alternative.** The Alternatives section names the larger one:
> Leave the Gemini image price until the live run's ledger … Not taken: … charging nothing for them would make its budgets count low.

A smaller one, a different planning number, is Claude's statement and is not in the record.

**What changing it would cost:** Very small (minutes). It is one figure, `estimatedOutputTokensPerImage: 2000` in `packages/gateway/src/prices.ts`, and its test in `pricing.test.ts`. Some default budgets on Balanced and the Google profile would move; with B1, the Google profile's C1 default went from $3.50 to $4. It is best set from the first live run's ledger (backlog "Gemini image thinking tokens").

**Your answer:** Keep / Change: ______

#### 7c. COMPOSED-MEDIUM (item 6)

**Quoted:**
> The composed profile refuses a model RELAY step, and a relay chain, in a recipe whose medium is not `media`, and says why. The composer gets it back as a violation to repair

The composed profile is the set of rules that a recipe the advisor composes for you must pass. A RELAY step makes a video clip from a storyboard.

**What it means:** A recipe byway composes for a web page, prose or options can no longer contain a video step. Such a step would fail when reached, after the steps before it were paid for.

**Main alternative.** None is in the Alternatives section. The other way, Claude's statement from the record's Context, is to admit such a step as before. It then "fails when reached, after the steps before it were paid for".

**What changing it would cost:** Small (an hour). It is the rule in `packages/advisor/src/profile.ts` and its test in `profile.test.ts`. Keeping the rule costs nothing.

**Your answer:** Keep / Change: ______

#### 7d. "Nothing was spent" kept for code 14 and a reset connection (Consequences)

**Quoted:**
> Code 14 and reset connections keep "Nothing was spent" when byway cannot ask Temporal afterwards: an engine that is not there runs nothing. A connection reset after Temporal accepted the start is the exception; the backlog asked only about code 4, and this was judged too rare to word for (Claude's judgement; backlog "Paid-call residuals named only in ADRs").

A reset is a connection dropped part-way.

**What it means:** When a run cannot start because the engine is not reachable, byway tells you "Nothing was spent", which is true when the engine was down. In the rare case of a connection dropped just after the engine accepted the start, the run is marked failed and its later calls are refused. But the message could be wrong for a call that began before that, whose cost would still show in the spending records.

**Main alternative.** None is in the Alternatives section. The other way, Claude's statement, is to give a reset the wording a timeout gets when byway cannot ask: byway "cannot tell whether this run started", and a call already under way may still be charged.

**What changing it would cost:** Small (an hour or two). Today `isTransportFailure` in `packages/runner/src/start-failure.ts` counts a reset with the refused connections. The change would separate them there, in the web app's copy of the check (`apps/web/src/services/engine-runner.ts`) and in `start-failure.test.ts`. The cost of the change itself: after a reset, someone whose engine really was down would then be told byway cannot tell.

**Your answer:** Keep / Change: ______

#### 7e. OpenAI's cache-write rate (answering the check of B1)

**Quoted:**
> The three OpenAI text rows record their 30-minute cache-write rate ($12.50, $2.50 and $0.125 per 1M tokens), and `providers/openai.ts` reads `cache_write_tokens`, so a written token is charged at that rate. Reads, writes and the rest of the prompt are each charged once, as OpenAI's guide counts them.

**What it means:** OpenAI charges 1.25 times its input price for the part of a prompt it stores for reuse. byway now records that, so its OpenAI spend no longer reads a fifth low on those tokens, and the budgets count OpenAI calls nearer their true cost.

**Main alternative.** None is recorded. The other way, Claude's statement, is to charge written tokens at the plain input rate, as before, which records them a fifth below their cost. Turning caching off (7h) is the way to avoid the write charge itself.

**What changing it would cost:** Small to undo: the three rows in `prices.ts` and the read in `providers/openai.ts`, with their tests. But the records would then read low again.

**Your answer:** Keep / Change: ______

#### 7f. The text rate for answer tokens Google does not list (answering the check of B1)

**Quoted:**
> … so answer tokens the breakdown does not list are charged at the text rate (since the check of B1, MONEY-2; before, they were charged nothing).

> If it bills them at the image rate ($30 per 1M), byway counts low by about $0.014 an image at the largest gap a third party measured (630 tokens).

**What it means:** Google does not label some tokens in a Gemini image answer as either image or text. byway charges them at the cheaper text rate ($7.50 per 1M tokens). If Google bills them at its image rate, byway records each image up to about $0.014 low.

**Main alternative.** None is in the Alternatives section. The other way, Claude's statement from the record's Negative consequences, is to charge them at the image rate. That leans high instead of low.

**What changing it would cost:** Small (an hour). The change is in `packages/gateway/src/providers/google.ts` and `providers.test.ts`, and Gemini images' recorded cost would rise slightly. The first live run shows which rate Google uses (backlog "Gemini image thinking tokens").

**Your answer:** Keep / Change: ______

#### 7g. Estimates still plan OpenAI input at the plain rate (answering the check of B1)

**Quoted:**
> The advisor's estimate and the gateway's pre-call reservation still plan every OpenAI input token at the input rate, so an OpenAI estimate can be low by up to a quarter of its input cost.

> A run budget still stops spending at its limit.

**What it means:** Before an OpenAI call, byway plans as if OpenAI will store none of the prompt, so an OpenAI estimate can be low by up to a quarter of its input cost. The true cost is recorded afterwards and counts against the budgets.

**Main alternative, from the record's Negative consequences:** plan every OpenAI input token as written.
> Planned as all written, these default budgets would rise

For example, it lists:
- Balanced with an OpenAI key: "C6 $4 to $4.50, C6a $4.50 to $5 and C7 $2 to $2.50";
- the OpenAI profile: "C1 $14 to $15 and C5 $10 to $11".

**What changing it would cost:** Medium (about a day). It touches the advisor's estimate (`packages/advisor/src/estimate.ts`), the gateway's reservation (`packages/gateway/src/estimate.ts`), their tests, and the default budgets above. It is best decided from the first live run with an OpenAI key (backlog "Check the advisor's planning numbers against the ledger").

**Your answer:** Keep / Change: ______

#### 7h. Keeping OpenAI's implicit caching on (Alternatives)

**Quoted:**
> Kept on for now, by Claude's judgement: no live run has written to the ledger, so it is not known which way it nets, and by Claude's arithmetic caching costs less than none once each written token is read back, on average, more than about 0.26 to 0.28 times (a read saves 0.9× input, 0.95× on `gpt-6.1-sol`; a write adds 0.25×).

**What it means:** By default, OpenAI stores the opening of long prompts. Storing costs 1.25 times the input price, and reusing the stored opening within 30 minutes costs a tenth of it (a twentieth on gpt-6.1-sol). Left on, caching saves money when byway's prompts reuse their openings often enough, and costs a little more when they do not.

**Main alternative (its Alternatives section):**
> Turn OpenAI's implicit caching off … A request whose `prompt_cache_options` has mode `explicit` and no breakpoint "does not use prompt caching"

Nothing would then be written at 1.25×, and the estimates would hold. In the record's words, it "would also give up the cache reads at 0.1× input (0.05× on `gpt-6.1-sol`)".

**What changing it would cost:** Small (an hour or two). It means sending `prompt_cache_options` with mode `explicit` in `packages/gateway/src/providers/openai.ts`, plus a test. The first live run with an OpenAI key shows which way is cheaper (backlog "OpenAI cache writes: check them against OpenAI's usage records").

**Your answer:** Keep / Change: ______

---

## The other Delegated records

They are listed by number and title only. The playbook names ADR-0071, 0072, 0074, 0076, 0077 and 0078 first and gives no order for the rest. ADR-0074 is in this packet, and the rest follow in number order (Claude's ordering).

1. ADR-0071: In the product, a GREAT-mode critic needs at least three references, and falls back to OK mode without them
2. ADR-0072: A GREAT-mode critic ranks the whole lineup without knowing which item is ours; the runner finds our rank
3. ADR-0076: A different-family critic where a recipe asks for one, recorded in an exposure register
4. ADR-0077: Hidden rank thresholds scale with the lineup actually used
5. ADR-0078: Runs started by an older engine version end plainly when the engine changes
6. ADR-0063: The code checkout lives outside OneDrive, at C:\Users\arvik\code\byway
7. ADR-0064: Product v1 is a local-first web app on the shared engine
8. ADR-0065: Product v1 scope: all eight configurations, recommender, composer, computed labels, demo mode
9. ADR-0066: Product persistence: node:sqlite records and content-addressed artifact files outside the repo
10. ADR-0067: In the product, C1 builds single-file HTML pages by direct model generation and renders them with Playwright
11. ADR-0068: Build the product contracts-first, in parallel git worktrees
12. ADR-0069: In the product, C5 relay links run on fal.ai video, one link per shot, and steps with no v1 executor finish as skipped
13. ADR-0070: Precompile the runner's Temporal workflows with esbuild
14. ADR-0073: Runner semantics chosen where the product spec was open
15. ADR-0075: The person chooses which cliché-sweep hits to swap, one by one
16. ADR-0079: Runner decisions made while fixing the Phase 4 review
17. ADR-0080: Corrections after the independent re-check of the Phase 4 fixes
18. ADR-0081: VOICE writes the person's copy exactly, without a model
19. ADR-0082: Web client state ownership: drafts, polling and the Recommendation screen
20. ADR-0083: Hashed text is well-formed Unicode
21. ADR-0085: Generated-page responses are inert unless a same-origin frame asks with consent; every in-app "Open" goes to the whole-artifact viewer; frames navigate only within byway
22. ADR-0086: Run-screen artifact info is an excerpt with its completeness stated; decision views show whole text; row facts come from whole bytes
23. ADR-0087: Lineup evidence: text critics read every item's full words; image-only critics get a measured, visible, disclosed budget
24. ADR-0089: Recipe IR: model steps may read a port when an optional branch made it
25. ADR-0090: Execution contracts for revising humans and media steps: a reaction revises its port in place, an ASSET prompt declares its image count, the shot check sees its clip
26. ADR-0092: Recipe semantics are derived from execution and checked at every entry
27. ADR-0093: Every loop exit at the cap follows one policy; a loop a person holds ends only on their answer
28. ADR-0094: The backup unit is the whole data directory
29. ADR-0096: Partial restores are reported at start and orphan runs are stopped; the renderer's allowlist holds on every redirect hop
30. ADR-0097: A step takes in only what its prompt shows
31. ADR-0098: Recipe limits, a diff that means "runs the same", and the held voice at run time

**Not in this packet.** The playbook row also asks you to review Claude's choices inside records you decided: ADR-0100's further corrections, ADR-0105's one setting for the data directory, and ADR-0107's item 5 and its reading of item 2. The 2026-10-22 audit also found ADR-0108's reading missing from that row.
