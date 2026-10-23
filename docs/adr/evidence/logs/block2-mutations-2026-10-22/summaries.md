# Block 2's build: what each builder tested, and the mutations each test caught (2026-10-22)

Each builder's own report of its tests and mutations, word for word, as it handed them back to the coordinator in block 2's build of 2026-10-22 (the `tests` and `mutations` of each item in the results of the session's workflows block2-build-approved, block2-build-waits and block2-wcore-last-link). Claude only laid them out under each builder, link and item; the README beside this file says how. A mutation is a change made to byway's code on purpose, to show that a test fails without the change it guards; each was undone after its run.

## The flake builder (fix/fx-b2-flake, merged at de4f1f2)

Commits: 1368c40 (The browser tests' wait on a run has a window that each new event restarts, decided in a helper of its own and driven on a fake clock (C5-FLAKE)); e910dca (The browser tests wait on a run while it shows progress: nextTurn reads the run's events through the app's API and fails only after 120 s with no new event, no turn and no end (C5-FLAKE)).

### C5-FLAKE

**Tests, as the builder reported them:**

C:/Users/arvik/code/byway/.worktrees/fx-b2-flake/apps/web/test/e2e-progress.test.ts, 8 tests on a fake clock the test owns. The clock stops at 1 h of fake time, so a wait that never ends fails instead of spinning. Cases: (1) a slow but moving run, one event every 100 s for 400 s, is waited on to its end at 410 s; (2) a stalled run with events at 0 and 50 s fails at 170 s, not before, and the message names event #2 and says 170 s in all; (3) a wait reads only after the last event an earlier wait saw, and that event read again as a new object is not progress; (4) unanswered reads are not progress and the message counts them; (5) a page with no run fails at its window from the start; (6) an outcome already there is returned at once; plus pure cases for progress() and the window. Results: apps/web/test, 47 files, 526 tests pass; packages/runner/test/build.test.ts passes unedited; pnpm -s typecheck exits 0 (the web typecheck covers e2e/).

**Mutations, as the builder reported them:**

Each mutation was restored from a scratchpad copy and checked with cmp. The run that hung is explained in the last point. (1) Window not restarted on progress (observe keeps the old since): 3 tests fail (the window case, the moving run, the stalled run, which fails at 120 s instead of 170 s). (2) Stall measured from the wait's start, i.e. the old deadline: the same 3 fail. (3) An equal sequence number counted as progress: the pure progress case fails, and the read-again case fails with 'The wait never ended.' (4) Every read asks for all events (after=0): the read-again case fails. (5) Unanswered reads never counted: the unanswered case fails. The first run of (3), before the clock was capped and before the stale reply became a new object, hung for about 300 s. That is why the test now returns a new object and the clock is capped at 1 h. The flow.ts wiring (page.request, the URL regex, the lastSeen map) is not covered by vitest. Only the browser suite exercises it.

## The engine builder (fix/fx-b2-engine, merged at ad3f598)

Commits: f550a22 (The lost-run pass while the engine runs (R-RECONCILE): reconcileWhilePolling fails a run whose workflow Temporal closed without byway, skips queued runs, and counts only the runs it closed); f2d8527 (The engine repeats its lost-run pass every five minutes while it runs (R-RECONCILE): repeatEvery never overlaps or stops the engine, what a pass ended is said as at start, and the pass stops first when the engine stops).

### R-RECONCILE

**Tests, as the builder reported them:**

New packages/runner/test/reconcile-while-running.test.ts (harness, real Temporal, calls the pass directly beside a polling worker, builds no RunInput):
(1) Two runs are failed with LOST_RUN_MESSAGE, with their run-failed event and the question withdrawn: a waiting run whose workflow is terminated with Temporal's history-limit reason, and a 'running' run whose workflow, on an unpolled queue, is closed the same way. A live waiting run is left alone; nothing is orphaned.
(2) A real Runner.start, with the pass run between the queued write and workflow.start through a client proxy: the run is skipped, then reaches waiting with no error.
(3) A queued run with no workflow: this pass leaves it, and the at-start pass still fails it.
(4) A run driven to done but read as running by a stale listing stays done, gets no run-failed event, and is not counted.
New packages/runner/test/repeat-every.test.ts (fake timers only): passes never overlap; a pass that throws and one that rejects are each reported and the next runs, even when onError throws; stop() waits for a pass under way and none follows; stopped before its first pass, it runs none.
packages/runner/test/dev-engine.test.ts: its start helper records each engine's repeat, and every stopped engine's repeat is stopped. One new last test: the running engine repeats every RECONCILE_EVERY_MS (5 min). Its recorded pass fails a waiting run it has no workflow for, leaves a queued one, and says exactly one line; a pass with nothing to end says nothing. The onError line names the error, and engine.stop() stops the repeat.
Runs: pnpm -s typecheck exit 0. build.test.ts passes unedited. engine-state, the new files, apps/web services.test.ts and scripts serve.test.ts pass. The whole runner package passes: 57 files, 1374 tests.

**Mutations, as the builder reported them:**

Each mutation was run, then restored from a scratchpad backup.
M1: no queued skip in reconcileLostRuns. Fails the queued-start and queued-row tests.
M2: reconcileWhilePolling without skipQueued. Fails the same two.
M3: every run looked at is counted. Fails the stale-listing test.
M4: the skip widened to every run that is not waiting. Fails the closed-runs test (the running row is kept).
M5: a failing pass is not caught. Fails the report test, with an unhandled rejection.
M6: the next pass is timed from the start of the last. Fails the overlap test (4 under way at once).
M7: stop() does not await the pass under way. Fails the stop test.
M8: stop() does not clearTimeout. Fails the never-runs test.
M9: an onError that throws is not caught. Fails the report test, with an unhandled rejection.
M10: a pass that ends after stop schedules another. Fails the stop test.
M11: the engine never starts the repeat. Fails the dev-engine test.
M12: engine.stop() does not stop the repeat. Fails the dev-engine test.
M13: the engine passes 60_000 instead of RECONCILE_EVERY_MS. Fails the dev-engine test.
M14: the engine's pass says nothing. Fails the dev-engine test.

## The prices builder (fix/fx-b2-prices, merged at f676ab0)

Commits: 5d07fe3 (Long-context tiers priced per call: OpenAI's GPT-6 text models above 272K input tokens and Gemini 3.1 Pro above 200k, in every reservation, settlement and estimate (LC-TIERS)); d7ffbfa (The price table read again in full on 2026-10-22, and the day of that read exported as PRICES_CHECKED for Settings and the estimate (PRICE-CADENCE)); fd8dd2e (Settings and the Recommendation's estimated cost show the day prices were last checked, with a notice after 45 days (PRICE-CADENCE)); 0d7d0eb (The weekly CI run reports whether OpenRouter's model list and the providers' pages still give byway's prices, and when the monthly re-read is due; it fails nothing (PRICE-CADENCE)); 2b6b674 (prices.ts says which day its read dates name: the session's, as the records date the owner's answers (PRICE-CADENCE)).

### LC-TIERS

**Tests, as the builder reported them:**

packages/gateway/test/pricing.test.ts, two new describes (13 tests):
- tokenCost at 272,000 and 272,001 for the three OpenAI models, and at 200,000 and 200,001 for Gemini 3.1 Pro
- the tiers' figures
- cached tokens count toward the threshold and are charged at the tier's cache rates
- a Google cache hit above 200k charged at $4
- no other row changes per-token rate between 9k and 900k
- maxCompletionCost either side of 272,000
- through the gateway: a reservation either side of 272,000, read from the budget refusal
- a 700,000-character brief on Google refused under a $0.50 cap that its short-rate estimate would fit, with nothing sent
- settlement from reported usage at the tier for an OpenAI dated snapshot and for Google with thinking tokens, with matching ledger costUsd
- a tier read from the table the gateway is given

packages/advisor/test/estimate.test.ts (3 tests):
- a threshold of 0 equals pricing every call at the tier's rates
- a threshold of 4,200 changes only the high end (TOKEN_BAND)
- the real thresholds change no catalog estimate on the google and openai profiles

All tests were written and seen failing first. packages/gateway + packages/advisor: 42 files, 1,301 tests pass.

**Mutations, as the builder reported them:**

Each mutation was applied, run against pricing.test.ts and the advisor's estimate.test.ts, then restored:
- M1, tokenCost ignores the tier: 13 tests fail.
- M2, `>=` instead of `>`: the 6 boundary tests fail.
- M3, the tier chosen from uncached tokens only: 2 fail (the whole-prompt test and the Google cache test).
- M4, a missing tier cache rate falls back to the short row's: the Google cache-hit test fails.
- M5, maxCompletionCost priced without the tier: the 3 reservation tests fail.
- M6, completionCost settles without the tier: the 2 settlement tests fail.
- M7, the advisor picks the tier from unbanded tokens (`tokenCost(t) * band`): the band test fails.

### PRICE-CADENCE

**Tests, as the builder reported them:**

packages/gateway/test/pricing.test.ts: 3 tests (PRICES_CHECKED is a real day; every paid row's source names it; no source names a later day).

apps/web/test/prices-checked.test.ts: 9 tests, all with fixed clocks via vi.useFakeTimers({toFake:['Date']}):
- the words through day 45 and from day 46, at UTC day edges, and for an unreadable day
- the notice's markup
- the host reads PRICES_CHECKED
- the Recommendation and Settings pages rendered whole to markup on the real demo services, with next/navigation stubbed, at 45 and 46 days

scripts/test/price-report.test.ts: 9 tests, no network, on page fixtures shaped like the providers' and built from PRICES.

scripts/test/ci.test.ts: 2 tests (the step's shape, condition and place; the script loads under plain Node with only node:fs and prices.ts, which imports only types).

The tests found one real bug before commit: a non-JSON OpenRouter answer escaped its own handler and blanked the whole report. It is fixed.

Final run: packages/gateway, packages/advisor, apps/web/test, scripts/test and packages/runner/test/build.test.ts: 102 files, 2,100 tests pass.

Live run against the real pages on 2026-10-22: every figure matched. With one figure per page changed in memory, it flagged Anthropic, OpenAI (page and script) and Google.

**Mutations, as the builder reported them:**

Date: PRICES_CHECKED one day older fails 3; OpenRouter's source without the 2026-10-22 read fails 1.

Web:
- W1, notice from day 45: 4 fail.
- W2, rounding the days: 4 fail.
- W3, recommend page uses the check's own day as now: 1 fails.
- W4, Settings without the notice: 1 fails.
- W5, Recommendation without the line: 1 fails.
- W6, host with its own day: 1 fails.

Report: each of these fails at least one test.
- R1, inexact OpenRouter compare
- R2, names without word bounds
- R3, a Markdown row read to the end of the page
- R4, no cut at the next model (also catches the 2027 Flash row)
- R5, other sites' scripts fetched
- R6, the tier's input not checked
- R7, sentences looked for in the text only
- R8, no warning when flagged
- R9, an exit code set when flagged (also fails ci.test)
- R10, re-read due only after 30 days
- R11, OpenRouter JSON parsed outside its catch
- R12, no language header

All were restored.

## The waits builder, link 1 (fix/fx-b2-waits, merged at ff62839)

Commits: 2bea6a2 (Each model's answer wait in the store: one row per workspace, provider and model (migration 9) [from the interrupted run; checked, kept unchanged]); ea2eaaf (The gateway reads each model's answer wait on every call: the stall bound is the model's wait, and operation.waitMs replaces the step's limit); 387ab51 (Anthropic requests ask for a summary of the model's thinking (thinking adaptive, display "summarized")); a4b10db (Settings' "How long to wait for an answer": one choice per model, grouped by provider, checked against its own kind's minutes).

### store-table-and-migration

**Tests, as the builder reported them:**

Its tests pass in the full store suite (packages/store/test/answer-waits.test.ts, migrations.test.ts, spend-book.test.ts).

**Mutations, as the builder reported them:**

Recorded in 2bea6a2's message (union check, upsert, provider list, workspace check and filter, CHECK on minutes). Not re-run.

### gateway-reads-each-models-wait-per-call

**Tests, as the builder reported them:**

packages/gateway/test/cut-off.test.ts: per-provider stalls at 15/30/45/60 minutes and at the default, with one Settings read per call; a changed wait applies from the next call only; the other-family critic waits its own model's wait; a choice its kind doesn't offer is not used; an unreadable wait admits and sends nothing; the decline's retry re-reads the wait, or carries a relay step's wait, or is not made if the read fails; the mock asks for none. Also packages/gateway/test/waits.test.ts and packages/runner/test/caps.test.ts.

**Mutations, as the builder reported them:**

24 across gateway and runner, all caught. Examples: Settings never read, waitMs ignored, step limit read again, kind filter dropped, mock asking Settings, wait read after admission, retry keeping the first wait, retry dropping waitMs, retry wait read after admission, wait read per resend, waitMs not validated, waits.ts list and default mutations, storeCaps matching by model only or by provider only. One survivor (storeCaps matching by provider only) was fixed by strengthening the test.

### stream-stall-bound-is-the-models-wait

**Tests, as the builder reported them:**

Same cut-off.test.ts stall tests (fake timers): closed at exactly the wait, sent once more, the second closed a wait later, and the message says 'nothing came for N minutes'.

**Mutations, as the builder reported them:**

Covered above. A default-bound mutation (STREAM_IDLE_MS to 45) is also caught by the existing adapter tests.

### operation-waitMs-honoured-stepLimitMs-removed

**Tests, as the builder reported them:**

cut-off.test.ts: a 24-hour stepLimitMs is ignored, and a relay step's waitMs is used without reading Settings. operation-keys.test.ts: bad waitMs values are refused. liveness.test.ts: in 24-hour, 15-minute and quick steps, each call's operation is exactly {cancel, keepDecline, key, stop, until}, and startInvocation keeps no limit. memo.test.ts: a caller's waitMs joins after hashing, so memo keys stay the same.

**Mutations, as the builder reported them:**

Caught: wrapper adds waitMs, startInvocation keeps limitMs, memo drops the caller's operation, validation loosened.

### anthropic-thinking-display

**Tests, as the builder reported them:**

packages/gateway/test/providers.test.ts checks the body and the logged request. Written first, seen failing, then implemented.

**Mutations, as the builder reported them:**

Caught: display 'omitted'; thinking with no display.

### settings-section-how-long-to-wait

**Tests, as the builder reported them:**

apps/web/test/waits.test.ts covers all 14 rows, order, kinds, defaults, hidden rows, no mock, the defaults sentence, and the rendered markup (help text, each select's options with the selected one, 12 default notes, label and aria-describedby). Static render checked at 900 px and 375 px: no horizontal overflow.

**Mutations, as the builder reported them:**

8 caught (view: kind filter, mock skip, sort, default mark, defaults sentence; component: default note, help sentence, aria-describedby).

### web-api-validates-each-models-set

**Tests, as the builder reported them:**

apps/web/test/api.test.ts: saves each kind's choice, refuses another kind's minutes with exact messages, refuses an OpenRouter model id used under another provider, an unknown model and the mock, checks the request shape, and checks the host lists 14 models in demo mode.

**Mutations, as the builder reported them:**

6 caught (union accepted, match by model name only, unknown model saved, fractional minutes, extra keys, host using usable profiles only).

### undici-agent-fetch-80-minute-timeouts

**Tests, as the builder reported them:**



**Mutations, as the builder reported them:**



### google-and-openai-image-whole-call-deadlines-no-resend

**Tests, as the builder reported them:**



**Mutations, as the builder reported them:**



### fal-acceptance-time-deadline-start-headers-frame-bound

**Tests, as the builder reported them:**



**Mutations, as the builder reported them:**



### waited-reason-and-words

**Tests, as the builder reported them:**



**Mutations, as the builder reported them:**



## The waits builder, link 2 (fix/fx-b2-waits, merged at ff62839)

Commits: e433823 (The text and image clients fetch through an undici Agent with 80-minute timeouts, so Node's five-minute limits no longer cut a call off under its wait); 4504271 (The spend book keeps when each fal job was accepted and a third reason a call may have been billed, "waited" (migration 10)); c5b8910 (A Google call and every image wait their model's wait in all and are not sent again once it runs out; a call that used its wait says so, and is recorded as waited); 2a60931 (A fal clip waits its video model's wait from fal's acceptance, keeps that clock when resumed, is cancelled and never resubmitted when it runs out, starts under a deadline below the wait, and its last frame is bounded).

### WAITS-SETTINGS (link 1: settings, store table, gateway reads the wait, stepLimitMs removed, waitMs, thinking summarized)

**Tests, as the builder reported them:**

Covered by link 1; link 2's image and video tests also check that the wait is read once per call, for the call's own model, and not read when operation.waitMs is given.

**Mutations, as the builder reported them:**

See link 1's handoff.

### WAITS-CAPS: undici Agent fetch for the Anthropic, OpenAI, OpenRouter and Google clients; fal on Node's default

**Tests, as the builder reported them:**

packages/gateway/test/fetch.test.ts (undici wrapped by a recorder): the Agent's options; each of the five client paths (Anthropic, OpenAI chat, OpenAI images, OpenRouter, Google) reaches undici's fetch with the Agent and never Node's fetch; fal's submission goes through Node's fetch and never the Agent.

**Mutations, as the builder reported them:**

8/8 caught: each timeout, the dispatcher, each client's fetch, fal on the Agent.

### WAITS-CAPS: whole-call deadline for Google text, Google images and OpenAI images, never carrying the stop; not resent after the deadline; OpenAI SDK timeout raised

**Tests, as the builder reported them:**

New packages/gateway/test/whole-call.test.ts on fake timers: Google text at 15/30/45/60 and the default; Google and OpenAI images at 5/10/15/20 and the default; each aborted at the wait and not before, sent once, listed as waited. Also: an unoffered choice falls back to the default; a relay step's waitMs is used; a changed image wait applies from the next call; the decline retry rereads its wait; a reset is still resent and the resend gets a full wait from its own send; Cancel leaves the deadline signal alone and the answer is settled with the signal absent from the recorded request; the real OpenAI SDK is not cut at 10 minutes; the real Google SDK sends the deadline as fetch's signal; no timer is left once a call ends. cut-off.test.ts: the Google no-stop test is updated to check that its signal is its own deadline.

**Mutations, as the builder reported them:**

30 for this commit (its message says 31; the true count is 28 plus 2 cross-check), plus 2 deadline-end mutations proven in commit D's added assertions. All caught after two tests were added for initial survivors (a stall then a different failure; the logged request carrying the signal).

### WAITS-CAPS: fal acceptance time stored with the job in the spend book (migration, tested)

**Tests, as the builder reported them:**

contracts/test/spend-book-suite.ts, run on both books: abandoned as waited in each of the three ways; refusals; acceptance times handed to resumed calls by the book's clock, again on a later resume; a waited clip resumed and later listed as failed; the two existing resume tests now expect acceptedAt. store/test/migrations.test.ts: migration 10 pinned; a version-9 database with rows upgraded in place (reasons, jobs, keys, rowid order and indexes kept; 'waited' accepted); schema-level CHECKs. store/test/spend-book.test.ts: version 10.

**Mutations, as the builder reported them:**

28 of 29 caught. Migration mutations were re-run against the behaviour tests with the checksum pin excluded. Survivor: the memory book's 'delete r.waited' on resume has no observable effect (a wait is only listed with its reason; the SQL CHECK enforces it in the store).

### WAITS-CAPS: fal deadline from acceptance, byway cancels and reads fal's answer, never resubmitted

**Tests, as the builder reported them:**

New packages/gateway/test/clip-wait.test.ts (fake setTimeout and Date): cancelled at 30/45/60/75 and the default, not before; never resubmitted; listed with its job; each cancel answer; a clip finished 1 ms inside its wait is never cancelled; an unoffered choice and a relay waitMs; a resumed job accepted 20 minutes earlier is cancelled 10 minutes into the resume, polled by id, never submitted.

**Mutations, as the builder reported them:**

Caught (part of commit D's 31; its message says 30).

### WAITS-CAPS: fal start-deadline headers (both names) below the wait by clip length

**Tests, as the builder reported them:**

clip-wait.test.ts: the table including boundaries at 5/6, 10/11 and 15 s; the floor; balanced (5 s, 30 min gives 1500) and best (12 s, 45 min gives 1800) submissions, with none on the frame job; submitJob sends both header names, and neither without a value.

**Mutations, as the builder reported them:**

Caught: boundaries, unit, floor, one name only, headers dropped, header on the frame job, not sent.

### WAITS-CAPS: frame extraction bounded by the time left on its clip's wait plus 2 minutes

**Tests, as the builder reported them:**

clip-wait.test.ts: bound of 7 minutes (clip finished at 25) and 31 minutes (clip at 1); exactly 2 minutes after a clip found done by the cancel; a held frame download given up at the bound with the clip kept; no timer left after the call.

**Mutations, as the builder reported them:**

Caught: grace 0, bound without the time left, bound from the clip's start, frame job unbounded, late frame not cancelled, download unbounded, frame bound never ended, clip wait never ended.

### The new recorded reason 'waited' (migration of the CHECK) and its words in Settings' records and the step's failure

**Tests, as the builder reported them:**

cut-off.test.ts: stall messages updated to the new words, each stall listed as waited; new test: a stall then a reset is listed as failed. apps/web/test/spending.test.ts: the three wordings, plus a cross-check against the gateway's waitedWords. whole-call and clip-wait tests check the step failures and the listings.

**Mutations, as the builder reported them:**

Caught, including the cross-check catching drift in the clip words and the provider names.

## The W-core builder, link 1 (fix/fx-b2-wcore, merged at 7fbc3bf)

Commits: bcda6d9 (Run inputs by reference (P2-BRIEF): Runner.start stores the brief once as one JSON file, and the workflow and every step carry its id instead of the brief); fc29bd8 (Run inputs by reference (P2-INPUTS): the fixed copy deck, the author's draft and the person's tell catalog are stored once at start, and only their ids travel).

### P2-BRIEF

**Tests, as the builder reported them:**

New stored-inputs.test.ts covers: the start input holds the id and none of the brief; the file is the brief, stored as application/json; a start sent twice gets the same id and starts one run; the same brief with its fields reordered is the same file; the brief is read once over three prompts and never by a judge; a deleted file and an id never stored both fail as a non-retryable StepFailed with the plain message. New inputs-weight.test.ts (in the style of limits-batch.test.ts): C1 and C2 started by the real Runner.start with the largest brief the web accepts, in Chinese (20,000 + 5 x 200,000 characters, over 3 MB), then run by the real Interpreter. The start input is the recipe plus under 1 KiB (about 280 B), and every activity input (46 for C1, 29 for C2) holds none of the brief, carries the same problemId and stays under 16 KiB (the heaviest was 6.5 KB). A new e2e case in e2e/c2-c5.ts: a demo C2 run on that brief ends done, and all 15 prompts that show the brief (12 seed-option, 3 vanilla-build) carry problemSlot(brief) exactly. On the old code that run's start failed with Temporal's 'Blob data size exceeds limit'. start-refusal.test.ts now asserts that an engine refusal stores nothing.

**Mutations, as the builder reported them:**

Each mutation was restored afterwards. (1) The start input carrying the brief again: the start test and both weighing cases fail. (2) The brief read for every prompt with no cache: the read-once and restore tests fail. (3) A missing file not made a StepError: the restore test fails. (4) JSON.stringify of the brief as given: the reordered-fields test fails. (5) The brief stored before the engine's refusal: the 3 refusal cases fail. (6) The slot built from the brief's text alone: the read-once test's exact-slot check fails.

### P2-INPUTS

**Tests, as the builder reported them:**

stored-inputs.test.ts: the three inputs are stored as text files and the start input holds their ids beside refs and none of the texts, with the same ids when sent twice; an empty text is no input; a draft with a lone surrogate (the store refuses it) leaves no run and starts nothing; the own-draft question reads the draft by id, and a missing draft fails with the plain message. held-voice-writers.test.ts: with a deck given by id, modelStep, relayLink and assetStep each build their keepsVoice check on the deck, and a fix that changes its words is refused; a step taking 'voice' is shown the deck, but after a VOICE it gets the answer and the deck is not read; a step that neither takes nor keeps the words never reads the deck, so a lost deck file does not stop it. inputs-weight.test.ts gains C1 with its own tell catalog, C1h with a deck and a catalog, and C3 from the author's own draft (100,000-character inputs): no input holds any of them, every RunRef carries the start's voiceId, and the sweep and the own-draft question receive the ids. prompt-shows.test.ts now passes its catalog by id. The C3 and C6a own-draft e2e runs and the C4 own-tells e2e pass unchanged.

**Mutations, as the builder reported them:**

Each mutation was restored afterwards. Texts handed over unstored: the start test and the 3 own-input weighing cases fail. An empty text stored: the empty-input test fails. withDeck never reading the deck: the 3 deck tests fail. withDeck reading over a VOICE answer: the voice-slot test fails. withDeck reading for every step: the lost-deck test fails. RunRef without voiceId: the C1h weighing case fails. No tellsId passed: the 3 weighing cases with a catalog fail. No draftId passed: the C3 weighing case fails. The tell catalog not read: the C4 e2e fails. The draft not read: the C3 and C6a e2e runs and the draft unit test fail.

## The W-core builder, link 2 (fix/fx-b2-wcore, merged at 7fbc3bf)

Commits: a6978db (Run inputs by reference (P2-SEEDS): the run's SEED strings stay in the store, where every write check reads them, and RunRef stops carrying them; the batch bound loses its seed term); 1431c5f (Run inputs by reference (P2-HELD): each VOICE answer is kept as a text file, and the ports hold the person's words by id, the fixed copy deck's first).

### P2-SEEDS

**Tests, as the builder reported them:**

New packages/runner/test/seeds.test.ts (7 tests): a SEED step's string is kept in the run's range once per step call (the same on a retry, only that run's). With another step's seed in the store and none in the input: the direction note redacts both seeds; a builder whose answer holds the sibling's seed is asked again and the stored work holds none; the author's own draft is refused; VOICE on prose, in a claim log and on a page (fake page reader) is refused; a relay link's storyboard and an asset step's attached images are refused. packages/store/test/memo.test.ts gains a range-read test and a closed-store check. inputs-weight.test.ts asserts no start or step input holds 'S'.repeat(48), and that seeds were handed out before later steps in all 5 cases. limits-batch.test.ts asserts no batch holds a seed. recipe limits.test.ts: a seeded fan-out weighs the same as the same fan-out of builds; the two seed shapes refused before now run; a new case shows a fan-out after 30 options is over in bytes with the new message (24 is not). catalog limits.test.ts pins only [stepRuns, peak]. validator limits-rules.test.ts: 300 seeds then each over them is over in steps only, and a new case shows a fan-out after 30 options is over in bytes. activities.test.ts reads the SEED step's string from the store. Results: runner suite 1390 tests, 1389 pass (the one failure is the pinned hash). store, recipe, catalog, validator, advisor and contracts: 1437 pass.

**Mutations, as the builder reported them:**

Each was applied, run and restored. The prefix read by LIKE fails the store range test. model-step reading no seeds fails the direction and builder tests. Reading the seeds before the step's own is kept fails the direction test and activities.test.ts's SEED case. The seed kept under the old key fails the range test, the direction test and the SEED case. Each of these checked against no seeds fails its own case: own draft, claim log, VOICE on prose, VOICE on a page, asset, relay. The interpreter collecting seeds into RunRef again fails all 5 weighing cases. Restoring the old seed-counting limits.ts fails 7 tests (4 in recipe, 2 in validator, and limits-batch's seed shape). base 1024 alone fails limits-batch's seed shape (bound 2.02 times the heaviest). One mutation was not caught: changing the prefix from 'seed/' to 'seed', because no other runner key begins with 'seed'; the store test pins the exact-prefix behaviour instead.

### P2-HELD

**Tests, as the builder reported them:**

held-voice-writers.test.ts in ids form: the three keepsVoice call sites (modelStep, relayLink, assetStep on a storyboard and on a page) are driven with stored ids. The block 'a fixed copy deck the run was given, read by its id until a VOICE answers (P2)' still passes, with the deck as ports.voice. Its lost-deck case keeps the same deck-message regex and still pins that only voice and keepsVoice steps read the deck. New describe with 3 tests: finishHumanStep keeps a changed answer, an answer sent back as offered and an empty answer (early VOICE on a storyboard) exactly; the author's own draft returns no voiceId; a fix held to an empty answer is held to [''], and a held answer whose file is lost fails before any call with the answer message. held-voice.test.ts: ports hold 'id of words of …' and later inputs hold no answer text. New: the deck is the first ports.voice, held by no one, and on its own does not trigger the guard. New: an answer that comes back without voiceId stops the run. keptVoice and personsWords are tested with a fake reader, and a lost file is named by whether it is held. inputs-weight.test.ts: a 100,000-character VOICE answer appears in no later input (C1's final check and C2's mood boards hold its id); every RunRef has exactly the 6 run facts; C1h's deck reaches the steps as ports.voice. prompt-shows, voice, voice-faults, script-lock and swap-choice were moved to ids (stand-ins now return voiceId). Runner suite: 1396 tests, 1395 pass; the only failure is the pinned hash.

**Mutations, as the builder reported them:**

12 mutations, all caught: the deck not seeded as ports.voice (2 fail); the interpreter holding the text instead of the id (6 fail); a missing voiceId let through (1 fails); finishHumanStep keeping no answer (1 fails); keeping no empty answer (1 fails); keeping the author's draft as words (1 fails); keptVoice handing on ids unread (10 fail); keptVoice reading only held (3 fail); a lost answer named as the deck (2 fail); a lost deck named as an answer (2 fail); the voice slot showing the raw id (1 fails); reading the words for every step (the lost-deck test fails).

## The W-core builder, link 3 (fix/fx-b2-wcore, merged at 7fbc3bf)

Commits: 7329432 (A person's own draft that byway cannot read is asked again with why, not a failed run (OWN-DRAFT)); b246a51 (Runner.start refuses a recipe holding a lone surrogate before a run exists and before anything is stored: the test the review's acceptance named (START-F19)); 8d5ab99 (A gate's retry keeps the person's VOICE answers (VOICE-RETRY): the interpreter carries each VOICE's last answer and the deck it answered, and the VOICE asked again starts from those lines where they still fit).

### OWN-DRAFT

**Tests, as the builder reported them:**

voice.test.ts new describe: a media own draft with shot 1 twice is an AnswerRejected with the exact message, nothing stored, the corrected draft becomes the work; a code-diff 'not a diff at all' is refused the same way with no model call. Both failed first (StepError), then passed. controls.test.ts: both failure cases pass alone (-t).

**Mutations, as the builder reported them:**

Own-draft refusal thrown as StepError again: both voice.test.ts cases and the e2e re-ask case fail; restored.

### START-F19

**Tests, as the builder reported them:**

C1 read back from JSON text with a lone surrogate (JSON backslash-u escape) in the title, a knob value and a knob name: Runner.start throws parseRecipe's ZodError with one root issue 'the recipe cannot be hashed: <path> ... contains a lone surrogate', well-formed, naming where; createRun, workflow start and store putText never called. Passes on current code (7/7 in the file).

**Mutations, as the builder reported them:**

storeRunInputs moved before parseRecipe in client.ts: the 3 new cases and the 3 engine-refusal cases fail (putText called). parseRecipe without its recipeHash check: the 3 new cases fail (CanonicalizationError after the brief was stored). Both restored.

### VOICE-RETRY

**Tests, as the builder reported them:**

voice-retry.test.ts (new, 18 tests): stubbed-interpreter carry tests (late VOICE after a D2 retry, retry into the VOICE's own stage and a second retry, per fan-out branch, no deck when the box is the work's, once per pass in a loop, nothing without a retry); real interpreter on the real openCheckpoint/finishHumanStep (storyboard lines that fit are delivered; lines that no longer fit are quoted and the model's headline is delivered); per-deck activity tests (on-screen, re-ask, options, prose, claim log, unchanged earlier answer, quote limits, page, lost file, deck kept beside the answer). 14 of the first 16 failed before the code; all 18 pass. C5 e2e case passes alone (-t); 14 VOICE-related scenario cases pass alone.

**Mutations, as the builder reported them:**

All caught, each restored: no carry at the retry (7 tests + C5 e2e); 'unchanged' against the box (fit, named-fields, re-ask tests + C5 e2e); named fields judged by deck-unchanged (3); unchanged earlier answer kept (1); page pre-filled (1); place without the candidate path (fan-out test); carried answer not taken once (loop test); finishHumanStep keeping no deck (4); ask() dropping deckId (2 + C5 e2e); note without quotes (6); non-labelled deck always fitting (3).

## The W-core builder, link 4 (fix/fx-b2-wcore, merged at 7fbc3bf)

Commits: d941dad (A page VOICE's fixed sentence moves into the workflow's wording (R-SUFFIX): the question ends with how a page's lines are written, the activity adds what it reads from the page, and no shown text changes); 5943a62 (The output-contract table's image-briefs line names C3's optional "advice" field (R-ADVICE), as C3's template, the prompts README and spec §3.3 already state it); 3701ac5 (C7's in-place answer prompt is keyed on the brief, not on the variant (R-C7): "Answer the questions below in place..." shows only when the brief being revised came from the interview prompt); cfa059a (A one-shot gate's critique clears the empty-critique mark it was handed (R-GATE-MARK): a fix right after a gate that follows an empty CUT applies the gate critic's critique instead of passing with "Nothing to remove").

### R-VOICE-APPLY

**Tests, as the builder reported them:**

Its own tests, as committed in aa453c2: prompts outputs, coverage, mock and review-fixes; gateway purposes, mock, great-critic, exposure and contract; recipe prompt-shows. All re-run green on the final tree.

**Mutations, as the builder reported them:**

Recorded in aa453c2 and not re-run: 'voice.apply' put back in ARTIFACT_ROLES fails outputs.test.ts; the responder put back fails purposes.test.ts; the id put back in HELPER_PROMPTS fails three coverage.test.ts cases.

### R-SUFFIX

**Tests, as the builder reported them:**

- page-voice-prompt.test.ts (new): the untracked file from the interrupted run, which was the right test for R-SUFFIX, kept and finished. Fixed: its no-work case hung, because an empty answer was refused and re-asked forever; the mock now gives that VOICE a page draft and refuses a fifth ask. Added: the page VOICE asked again after the final check sent the work back (through a real gate), and a pure humanPrompt case.
- Its four interpreter cases (first offer plus ENG-6 re-ask, claim log on a page, the VOICE-RETRY note, no work and prose) pass byte for byte before and after the code.
- page-copy.test.ts: five pinned suffix strings lose the sentence.
- voice.test.ts: the page re-ask sends voiceAsked.
- Before the code, 7 changed or new assertions failed; after it, page-copy, page-voice-prompt, voice, voice-retry, voice-faults and revise-in-place pass (198 tests).

**Mutations, as the builder reported them:**

Each restored after:
1. Interpreter never sets page: three page-voice-prompt cases fail.
2. page set without work: the no-work case fails.
3. Earlier note appended after the rule: voice-retry.test.ts's page case and page-voice-prompt's retry case fail.
4. humanPrompt adds the rule whatever page says: humanPrompt's part and the no-work case fail.

### R-ADVICE

**Tests, as the builder reported them:**

outputs.test.ts, new case: the contract names the optional advice after the images, and every image-briefs template's answer-format JSON line uses only keys the contract names. It failed before the change and passes after. prompts plus runner formats.test.ts: 917 pass.

**Mutations, as the builder reported them:**

Dropping "alt" from the contract fails the new case on article.ASSET.md. Restored.

### R-C7

**Tests, as the builder reported them:**

revise-in-place.test.ts now also drives the real Interpreter with its activities stubbed:
- the pure humanPrompt cases;
- C7's own D1 from the catalog still asks SPEC_IN_PLACE_PROMPT;
- a composed VISION-lite reaction after a non-interview brief gets the general question;
- a second in-place reaction after the person's answer gets the general question;
- an interview brief written over by another step gets the general question.
Five failed before the code. configurations.test.ts's C7 e2e cases pass through the workflow.

**Mutations, as the builder reported them:**

Each restored after:
1. Every model brief marked: the composed and written-over cases fail.
2. The person's brief keeps the mark: the second-reaction case fails.
3. The question ignores the mark: C7's own case and the second-reaction case fail.

### R-GATE-MARK

**Tests, as the builder reported them:**

gate-mark.test.ts (new; hand-built recipes through the real Interpreter, activities stubbed):
- without a gate, the fix after an empty CUT still passes with NOTHING_TO_REMOVE;
- after a passing gate, after a failed gate used anyway, and after a gate that follows a person who listed nothing, the fix is a model call given the gate critic's critique (these three failed before the change);
- a fifth case pins the body-wrote-none case: a gate whose body only renders hands the empty CUT on, so the fix still passes. It passes before and after; it guards this form against the map's literal one.

**Mutations, as the builder reported them:**

Each restored after:
1. The old hand-on: the three gate cases fail.
2. The map's literal withCritique(ports, out.critique): the fifth case fails.

## The W-core builder, link 5 (fix/fx-b2-wcore, merged at 7fbc3bf)

Commits: d0721b3 (The claims oracle's stand-in finishHumanStep returns a VOICE answer's id, as the activity does since P2-HELD, and its run input names the brief by id); 2b302e5 (A declined optional step that would have put its critique in place clears the critique (R-DECLINED): the writer after it makes no change and says why, instead of acting on an older critique); 9d403f8 (What audit, a one-shot gate and each hand on, as the interpreter runs them, is held to the validator's scope typing (R-PORTS-TEST): small admitted recipes through the real Interpreter, with consumers after each operator); ec8b418 (What audit, a one-shot gate and each hand on is written down once, in @byway/recipe's semantics (R-PORTS-MOVE): the validator's scope typing and the interpreter both read HANDED_ON); 45ccae8 (The engine refuses an ASSET step whose slots knob is not a whole number of at least 1 (SLOTS-KNOB): such a step paid for its briefs and made no image, or capped its images at a fraction of one); 0ef65e6 (A failure during a fan-out, through the real workflow, and a step it stopped says why (FANOUT-FAILURE): the review's reproduction in liveness.test.ts, and the Run screen's note for a step stopped when the run failed).

### ORACLE-STUB (prerequisite found while doing R-DECLINED)

**Tests, as the builder reported them:**

claims-oracle.test.ts at its default size: 6/6 pass (118 variants, 688 runs done).

**Mutations, as the builder reported them:**

Removing the stand-in's voiceId fails 4 of 6 again: the two oracle checks plus the FORCE and FORCE_REACT controls.

### R-DECLINED

**Tests, as the builder reported them:**

declined-critique.test.ts: 7 cases. C7 with scope-cut optional, declined and run. C5 with the person's cut optional, declined and run. An optional ASSET leaves the critique alone. Semantics and run agree. Recipe 165, validator 220, advisor 412, catalog 416 pass. Runner suite: only the pinned hash fails. Oracle default size passes. On seed 1 at 40,000 tries, results match with and without the change except J-SOMETIMES-NOT-APPLIED(info), 91 against 90.

**Mutations, as the builder reported them:**

Each caught:
- interpreter never clears: 3 runner cases fail
- clears every declined optional: the ASSET case fails
- answersReachingWork keeps the critique: recipe, validator and runner agreement cases fail
- cleared instead of EMPTY_ANSWER in a lens: the recipe audit-lens case fails
- critiqueFlow keeps the critique: the reused-step critiqueSources case fails
- the walk ignores `declined`: flow-walk and unapplied cases fail

### R-PORTS-TEST

**Tests, as the builder reported them:**

7 cases pass on the code before the move and after it. Validator 220 and web guard-boundaries pass.

**Mutations, as the builder reported them:**

Each caught:
- gate hands on the body's view, or the body's score: 2 cases fail
- audit hands on a lens score: 2 fail
- each leaves the option set inside: 2 fail
- scope.ts audit hands on no critique: 1 fails (producer check)
- scope.ts gate keeps the entry critique: 1 fails
- scope.ts each keeps the option set inside: 1 fails

### R-PORTS-MOVE

**Tests, as the builder reported them:**

New recipe test pins the table (it failed before the table existed). operator-ports, gate-mark, declined-critique and semantics-exits pass unchanged (34 tests). Recipe 164, validator 220, advisor 412, catalog 416 and the oracle pass.

**Mutations, as the builder reported them:**

Each caught:
- HANDED_ON.gate empty: the operator-ports gate cases and 3 gate-mark cases fail
- HANDED_ON.audit empty: the audit hand-on case fails
- HANDED_ON.each empty: the each hand-on case fails

### SLOTS-KNOB

**Tests, as the builder reported them:**

New recipe limits case: 0, 0.5, 1.5, -1, '3' and null are refused; 1, 3 and no knob pass; the peak bound is still reported. start-refusal.test.ts: C1 with slots 0.5 and 1.5 is refused by Runner.start, with nothing created or stored. Both failed before the change. Catalog 416 pass (no verdict change).

**Mutations, as the builder reported them:**

Each caught:
- accepting any number ≥ 1 lets 1.5 through: the recipe case and the 1.5 start case fail
- checking every ASSET step, knob or not: the recipe case and 9 catalog tests fail

### FANOUT-FAILURE

**Tests, as the builder reported them:**

New timeline.test.ts case. The web unit suite passes: 519 tests, 46 files, run via the root config. liveness.test.ts passes whole (33).

**Mutations, as the builder reported them:**

Caught:
- stopSignal never cuts off: the reproduction times out waiting for the cut-off
- liveness.ts ENDED without 'failed', alone: times out too, because the siblings hear NOT_FOUND after the workflow closes
- the note also on cancelled runs, the note replacing the step's own notes, or no note at all: each fails the timeline case
Not caught: removing run.ts main.cancel() alone still passes (store-read path).

## The W-core builder, link 6 (fix/fx-b2-wcore, merged at 7fbc3bf)

Commits: 74fedc5 (The claims oracle at the measurement's size on W-core's tree (ORACLE): its header says a lone E-REACT report at other answer seeds is expected, from sampling alone).

### ORACLE

**Tests, as the builder reported them:**

Full-size oracle: 6/6 in 1,655 s on 0ef65e6. After the header edit: the unit-size oracle passed 6/6 (9 s); pnpm -s typecheck (root) passed; packages/runner/test/build.test.ts had 4 of 5 pass, the one failure being the pinned hash, as the task expects.

**Mutations, as the builder reported them:**

The change adds no test and no code, only a comment, so no mutation of my own applies. The oracle's own mutation checks, its four controls (each forces a claim where it does not hold and checks that the matching problem kind fires), all fired at full size in this run.

## The W-core builder, link 7, its last (fix/fx-b2-wcore, merged at 7fbc3bf)

Commits: 0f8fdad (Steps sized so the chosen wait governs (WAITS-STEP-LIMITS): model and image steps under a 24-hour backstop, and each relay step under a limit worked out from the waits a quick step reads just before it, which its calls keep); 3b924b2 (The proxies cancel their steps as TRY_CANCEL, named, and the one cancellation scope stays (CANCEL-SCOPE): a test pins both, and the real workflow shows Cancelled at once while an uncut call is still under way); 6a1a1ae (A clip job fal dropped at the start deadline byway sent with it (504, X-Fal-Request-Timeout-Type "user") is read as nothing billed: the call counts nothing and the step says so plainly); 044b9b9 (The batch bound measured with a fan-out of relay chains, whose relay steps now carry the waits read before them; the four shapes measured before are unchanged, and so is every catalog verdict); cc53dcc (The workflow bundle's pinned hash, moved once for block 2's workflow batch (W): from 38afef53… to b0a4e13b…).

### WAITS-STEP-LIMITS

**Tests, as the builder reported them:**

New packages/runner/test/step-limits.test.ts, 12 tests, no wall-clock assertions. The proxies' options read back, including the relay formula at the defaults, at the longest choices and for every pair of choices. relayWaits: defaults; the profile's tier model and video model matched by provider and model; the longest choices; a choice the kind does not offer is not used; demo, mock-model and unlisted profiles give defaults. A relay step through createActivities and the real memo: Settings raised after the read and again during the link call leave the link call at 15 min and the clip at 30; the memo completes each operation; the next read sees the raise; re-running under other waits buys nothing again. Through a Temporal dev server, reading the run's history: a demo short-ad run schedules model, render and person-finish steps under 24 h with 3 tries and ASSET under 24 h with 2; every other activity runs under 1 min with 5 tries and no heartbeat; relayWaits comes just before each relayLink, its result equals the input's waits and sets the 2 h limit. A keyed 'balanced' run, with Anthropic answered by mockAdapter and Settings at 60/75, schedules each relayLink under 6.5 h. Both histories replay with Worker.runReplayHistory after Settings change.

**Mutations, as the builder reported them:**

17 mutations, all caught: link call or clip re-reading the waits mid-step; clip given the link wait; memo dropping the call's wait; memo key including the operation; formula at 4x or without its 15 min; relay step on the media proxy; waits read on the model proxy; relay handed the defaults instead of its reading; model steps at 15 min; image steps at 45 min or with 3 tries; the read always using the big tier, accepting a choice its kind does not offer, ignoring demo mode, or taking a mock model's choice. The first mutation (link call re-reading) at first slipped through, because the test raised the waits only inside the link call. The test now also raises them between the read and the step, and that mutation is caught.

### CANCEL-SCOPE

**Tests, as the builder reported them:**

liveness.test.ts, 2 new tests. (1) The options of every proxy read back as TRY_CANCEL. In the workflow code with comments stripped: every proxy is made in acts.ts from the four options and nothing else; cancellationType is set once; no other type is named; there is one scope, made in run.ts and cancelled there twice. (2) Through the real workflow: a call byway does not cut off is held past the cancel (new pastCancel option on holdingMock). Cancel still ends the run as cancelled and the workflow closes while the call is held; once released, the call is settled, the run's cost catches up with the ledger, and the status stays cancelled. liveness.test.ts: 35 of 35 pass.

**Mutations, as the builder reported them:**

5 mutations, all caught: WAIT_CANCELLATION_COMPLETED on every proxy (both tests fail; the run stays running); the model proxy left unset (the pin fails, though behaviour today is the same, which is why it is named); a second CancellationScope; a fifth proxy with its own options; the cancel signal no longer cancelling the scope (both fail).

### FAL-START-DEADLINE

**Tests, as the builder reported them:**

clip-wait.test.ts (fake fal, fake timers): three cases, each dropped at its start deadline: balanced 5 s at the default 30 min (deadline 25), balanced 10 s at 45 (35), best 15 s at 75 (60). Each checks the words, billing none, billed false, not marked waited, a single submission carrying its start deadline, no cancel, no frame job, an empty ledger, nothing in flight or uncertain, zero spend and no timers left. A control: a 504 with no timeout type still reads 'may have been billed' and is listed with its job. fal-submit.test.ts: through the real @fal-ai/client over a fake fetch, a result answering 504 with x-fal-request-timeout-type 'user' gives the same words at 30/25, billing none, a single result read and nothing counted.

**Mutations, as the builder reported them:**

7 mutations, all caught: any 504 read as a drop; a drop never recognised; a drop counted as may-have-been-billed; the drop wrapped as an unreadable result; the words giving the wait as the deadline; a drop made retryable; the words leaving out 'nothing was billed'.

### LIMITS-BATCH

**Tests, as the builder reported them:**

limits-batch 5 of 5. With inputs-weight plus the catalog and recipe suites: 17 files, 591 tests, all pass.

**Mutations, as the builder reported them:**

2 mutations, run after commit 044b9b9 and recorded in cc53dcc's body, both caught by the relay shape alone while the four older shapes still passed: ACTIVITY_BYTES.base lowered by 150 bytes, and the relay input carrying its waits four extra times.

### PIN

**Tests, as the builder reported them:**

build.test.ts 5 of 5 with the new pin.

**Mutations, as the builder reported them:**

None; this is a pin, not new logic.

