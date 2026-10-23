# Block 2's fix round: what each builder tested, and the mutations each test caught (2026-10-23)

Each builder's own report of its tests and mutations, word for word, as it handed them back to the coordinator at the end of the fix round of 2026-10-23 (the `tests` and `mutations` of each finding in the round's results, `block2-fix-result.json` in the session's scratchpad). Claude only laid them out under each builder and finding; the README beside this file says how. A mutation is a change made to byway's code on purpose, to show that a test fails without the fix; each was undone after its run.

## The money builder (fix/fx-b2f-money, merged at 6ffaa4e)

Commits: 26f5b1e (fal: a resumed clip whose wait has passed is asked about before it is cancelled, and a failed cancel is followed by one more look (MONEY-2)); 0d9a5f0 (fal: a stopped clip fal reported done has its result read once before it is settled as made, so a job fal dropped counts nothing (TESTS-1)); 34b58cd (clip-wait: the last frame's result read is shown to stop at its bound (TESTS-4)); ba188fe (whole-call: a provider error answer that lands as the deadline runs out is shown to be sent again, not counted as waited (MONEY-4, TESTS-3)); cd830cc (cut-off: an image's and a clip's wait are shown to be read before admission, as a completion's is (TESTS-2)); c19155f (gateway: a clip call that finds another attempt's job accepted as it comes to submit does not submit a second (MONEY-3)).

### MONEY-2

**Tests, as the builder reported them:**

packages/gateway/test/clip-wait.test.ts: (1) a job resumed 45 min after acceptance, done, whose status read takes a 50 ms round trip, is read and kept: log starts [status, result], no cancel, no poll, only the frame job submitted, one ledger entry, nothing uncertain. (2) it.each: a resumed job still at work, or whose status cannot be read, is cancelled at T0+45min with the clock not moved, and ends 'maybe'/waited. (3) a stop during that one status read gives cutOff and 'interrupted', not waited. (4) a failed cancel whose clip finished meanwhile: [cancel, status, result], the clip is kept, nothing uncertain. (5) the existing failed-cancel test now also asserts the second look. Gateway suite: 971 -> 992 tests, all passing.

**Mutations, as the builder reported them:**

M1: `passed` mark dropped from the deadline factory, 3 tests failed (KILLED). M2: the second look after a failed cancel removed, 2 failed (KILLED). M3: seenDone treats an unreadable status as done, 1 failed (KILLED). M5: a stop during the look read as WAITED, 1 failed (KILLED). Each file was restored byte for byte by the mutation script.

### TESTS-1

**Tests, as the builder reported them:**

packages/gateway/test/clip-wait.test.ts: (1) it.each: a stop arriving while the dropped job's result is read, and a stop arriving during the poll with the cancel answered ALREADY_COMPLETED. Each ends with the not-started words, billing 'none', no cutOff mark, nothing ledgered, spend 0, and cancels [] or ['req-1']. (2) a stop while a finished clip's result read hangs: it is read once more, not over at RESULT_LOOK_MS-1, settled as made at RESULT_LOOK_MS, never downloaded, one ledger entry. clipFal gains onClipResult and clipResultHeld. The existing cut-off.test.ts stop tests (already completed, done before the stop) pass unchanged.

**Mutations, as the builder reported them:**

T1: the isNotStarted rethrow in the look removed, 2 failed (KILLED). T3: the look unbounded, 1 failed by a held promise (KILLED). The finding's F4 (pollJob's isNotStarted check moved below the stop check) now SURVIVES the whole gateway suite (992 passed). It is an equivalent mutant: the look gives the same outcome whichever way the race goes, which is what the fix is for.

### TESTS-4

**Tests, as the builder reported them:**

packages/gateway/test/clip-wait.test.ts: 'the frame job's result read is bounded too'. The clip finishes at minute 28 and the frame job a minute later, and its result never comes. The call is not over at 4 min - 1 ms from the frame job's start, and is given up at 4 min with frameTooLate's words. billed:true, no cancel (the job was done), the clip ledgered and kept. Instead of waiting with a helper that could hang, the test loops and asserts `over`, so a regression fails an assertion rather than timing out.

**Mutations, as the builder reported them:**

F13 (`reading: true` removed from the frame's deadline): KILLED by the assertion 'expected false to be true' at the over check (13 ms), not by a timeout.

### MONEY-4

**Tests, as the builder reported them:**

packages/gateway/test/whole-call.test.ts: it.each over google text, google image and openai image. When its deadline aborts it, the first send is answered with the provider's own 429 and its error body (billingOf 'none'); the second send answers. The call is sent again ([true,false] aborted signals) and settled at its true cost. One ledger entry, spendRecords.uncertain [], inFlightUsd 0, uncertainUsd 0.

**Mutations, as the builder reported them:**

G1 (completeOnce `: deadline?.expired`): google text failed by assertion (KILLED). G2 (imageOnce, the same): both image cases failed (KILLED).

### TESTS-3

**Tests, as the builder reported them:**

See MONEY-4: whole-call.test.ts, the it.each 'a provider's own error answer that lands as its deadline runs out billed nothing'.

**Mutations, as the builder reported them:**

G1 and G2 KILLED, as listed under MONEY-4.

### TESTS-2

**Tests, as the builder reported them:**

packages/gateway/test/cut-off.test.ts: (1) it.each over a Google image, an OpenAI image and a fal clip, each with and without a step's key, while Settings' waitMinutes throws 'the store is closed'. The call rejects with that error. book.admit and markSent are never called. Nothing is sent, submitted or uploaded. spendRecords has nothing in flight or uncertain, and spend is 0/0/0. (2) it.each google/openai image: the one retry after a decline (IMAGE_SAFETY / moderation_blocked), when its wait cannot be read, is 'not-made' with the store error as its problem. Only the declined call was admitted and sent, and inFlightUsd and uncertainUsd are 0.

**Mutations, as the builder reported them:**

G5 (video: admit before the wait read), 2 failed (KILLED). G5b (image: the same), 4 failed (KILLED). G6 (image retry's read moved into the attempt, after its admission), 2 failed (KILLED).

### MONEY-3

**Tests, as the builder reported them:**

packages/gateway/test/operation-keys.test.ts: 'a call that finds, as it comes to submit, another attempt's clip already accepted does not submit a second'. Inside the start-frame upload, the attempt is timed out and its lease runs out. Another owner admits the key, is marked sent and has job-other accepted, and its lease runs out too. Result: fal.calls [], error 'maybe' and not retryable, its message containing 'clip job job-other', nothing in flight, uncertain [{providerJobs:{generation:'job-other'}}], nothing ledgered. Before the fix the same test showed 2 submissions.

**Mutations, as the builder reported them:**

M3a: the guard removed, the new test fails (KILLED). M3b: the guard refuses any resumed call (fresh check dropped), 2 failed: the resumed calls' last-frame jobs are no longer submitted (KILLED).

## The spend builder (fix/fx-b2f-spend, merged at 09ed407)

Commits: f853b53 (MONEY-1: an image whose wait ran out ends its slot's tries, and the step says the wait ran out and where to change it); 0ecc105 (CRITIC-1: a recommend or compose call whose wait ran out says so, that it may have been billed, and where to change the wait); 199bc29 (WEB-1: a retained send that ended by its wait says so in Spending records, and a row that counts an earlier send says it does).

### MONEY-1

**Tests, as the builder reported them:**

packages/runner/test/asset-slots.test.ts, new describe "an image whose wait ran out (the waits design; MONEY-1)", using the gateway's real waitedError:
(1) C5 anchor-frames with shot 1 waited: one call for shot 1, the other shots are made, and the exact note includes the waited words and the no-start-frame sentence.
(2) C1's asset step (triesPerSlot 3, which the test asserts): one call for the waited slot, and the exact note.
(3) Every image waited: the step is skipped, and the note is NO_IMAGE_MADE_NOTE plus one waited sentence per image.
(4) The same through memoGateway: one call, so the mark survives the memo layer.
(5) Control: a retryable provider-error is still tried 3 times.
All of asset-slots, activities and declines pass (84 tests).

**Mutations, as the builder reported them:**

Each of these was applied, tests run, then the file restored.
M1: return the waited result only on the last try (`waitedOf(e) && attempt >= tries`). Tests 1-4 fail.
M2: drop waitedSentences from partialNote. Tests 1-2 fail.
M3: drop waitedSentences from the no-image note. Test 3 fails.

### CRITIC-1

**Tests, as the builder reported them:**

apps/web/test/model-errors.test.ts, new case: waitedError for a Google 'answer' (15 minutes) and an Anthropic 'silence' (60 minutes). Both give status 504 and the gateway's message plus the sentence; the Google wording is pinned exactly. A foreign-bundle error carrying the same mark gives the same result, and a mark that is not a wait (waited: 'yes') keeps the generic wording.
apps/web/test/api.test.ts, in the 'model errors while recommending or composing (UX-2)' test: recommendIntake and composeIntake rejected with a waitedError both throw HttpError 504 with the full words.

**Mutations, as the builder reported them:**

Each applied, tests run, file restored.
M1: disable the waited branch. 2 tests fail.
M2: drop the try-again sentence. 2 fail.
M3: accept any truthy mark. 1 fails (the 'yes' case).
M4: answer 503 instead of 504. 2 fail.

### WEB-1

**Tests, as the builder reported them:**

packages/contracts/test/spend-book-suite.ts (runs on SQLite with two connections, SQLite in memory, and the in-memory book):
- New test: a silent-then-answered send ('resent', usd 0.3, retainedUsd, retainedWaited, no waited field); both sends silent ('waited', usd 0.4, waited and retainedWaited); a plain retain (no retainedWaited); a waited retain followed by a plain retain (the wait is kept); a call with nothing retained (neither field); then all of them cleared.
- New test: invalid waits (minutes 0 or NaN, a bad how, null) are refused and nothing is retained.
packages/store/test/migrations.test.ts:
- Pin MIGRATION_11_CHECKSUM.
- Upgrade a version-10 file in place: rows kept, retainedUsd listed, no retainedWaited on old rows, a new retain keeps its wait.
- The schema-level JSON CHECK on retained_waited.
packages/store/test/spend-book.test.ts: SCHEMA_VERSION is 11, and migration 11 has its name.
packages/gateway/test/cut-off.test.ts, against the real gateway:
- A stall then an answer gives 'resent' with retainedWaited {15, 'silence'}.
- A mid-stream error then an answer gives no retainedWaited.
- A stall then ECONNRESET gives 'failed' with retainedWaited.
- stallsAt (both sends silent, every wait choice) gives 'waited' with retainedWaited.
apps/web/test/spending.test.ts: two new tests pin the exact words for every case above.
All of contracts, gateway, store and apps/web pass (94 files, 1770 tests).

**Mutations, as the builder reported them:**

Eleven mutations, each applied, run against memory-book, store spend-book, migrations, cut-off and spending tests, then restored. All were caught.
M1: the gateway hook drops waitedOf(err). 27 tests fail.
M2: PaidCall does not pass the wait to the book. 27 fail.
M3: the store's retain query does not set retained_waited. 7 fail.
M4: the store overwrites with `:waited`, losing the wait on a later plain retain. 2 fail.
M5: the store skips its check of the wait. 2 fail.
M6: the store does not list retainedUsd. 3 fail.
M7: the memory book does not keep the wait. 28 fail.
M8: the memory book skips its check. 1 fails.
M9: the 'resent' wording ignores retainedWaited. 1 fails.
M10: the earlier-send sentence is never added. 1 fails.
M11: the earlier-send sentence ignores the wait. 1 fails.

## The prices builder (fix/fx-b2f-prices, merged at 5aee4c8)

Commits: 0025315 (Price report reads OpenAI's Standard prices only, so a doubled or halved model is flagged (PRICES-1)); 27133aa (Price report checks Kling 2.5's price for its first 5 seconds (PRICES-2)); ce332f8 (Price report reads each tier's threshold beside its row, Anthropic's sentence whole, and flags a new tier (PRICES-3)); 30dc01b (Price report checks the rows in force on the run's day and those to come, not a replaced row (PRICES-4)); 2db2729 (A flag from the price report calls for every page to be read again, not the flagged one alone (PRICES-6)); 604a148 (Price report warns of a page it could not read, which it did not check (PRICES-5)); 5a2773e (Price report prints nothing of a provider's answer that GitHub would read as a workflow command (SECURITY-2)).

### PRICES-1

**Tests, as the builder reported them:**

scripts/test/price-report.test.ts: the OpenAI fixture now has four speed tables at the page's ratios and the script has five maps. New test 'reads OpenAI's Standard prices only...' doubles and halves every OpenAI row (all 5 models) in every table and map and expects the exact not-found line, plus the script line for tiered rows. A table holding gpt-6-astra alone checks the cut at the model's next name. On the saved live pages (2026-10-23), every model at x2 and x0.5 is flagged and x1 is clean.

**Mutations, as the builder reported them:**

M1 drop the cut at the model's next name: caught (new test). M2 restore the 'best of any place' rule: caught. M3 read every map of the script: caught. All restored byte for byte.

### PRICES-2

**Tests, as the builder reported them:**

The fal fixture builds its base from the row. New test changes only the base, to $0.50 and to $0.355 (a figure that only starts with $0.35); each is flagged with the exact line. On the live page copy, $0.50 and $0.355 are flagged and the unchanged page passes.

**Mutations, as the builder reported them:**

M4 drop the derived check: caught. M5 unrounded 5 x 0.07 (0.35000000000000003): caught by 4 tests on unchanged pages. Restored.

### PRICES-3

**Tests, as the builder reported them:**

Fixtures: the real Anthropic sentence with links, Haiku 5.5's two length rows, OpenAI's Flagship and Cyber switches, Google's threshold built from the row. New tests: Anthropic sentence reworded and exceptions widened; Gemini 3.1 Pro at 128k beside an unpriced 2.5 Pro that keeps 200k; Flagship switch at 128K while Cyber's keeps 272K (3 lines); Opus 5.5 split into '(for prompts up to/over 200,000 tokens)' rows; Flash given a tier. On the live copies: the finding's 30-occurrence 128k edit to 3.1 Pro's section, the widened exceptions, the Opus split and the Flagship switch change are each flagged; the Cyber switch changed alone is not; the unchanged pages pass.

**Mutations, as the builder reported them:**

M6 Google tier words anywhere in the text: caught. M7 OpenAI tier words anywhere in the markup: caught. M8 switch read past the model's name: caught. M9 no byLength check: caught. M10 Anthropic sentence back to its old fragment: caught. Restored.

### PRICES-4

**Tests, as the builder reported them:**

The first test names its day (pricePages(CHECKED)). New test: Google's rows on 2026-12-31 hold both Flash rows; on 2027-01-01 the intro row is gone. A page giving only the 2027 price is clean at 2027-01-05 and flagged at PRICES_CHECKED. Live copy with all 62 'through December 31, 2026 / starting January 1, 2027' cells cut to the 2027 figure: flagged up to 2026-12-31, clean from 2027-01-01.

**Mutations, as the builder reported them:**

M11 check every row: caught. M12 drop rows still to come: caught by 3 tests. Restored.

### PRICES-6

**Tests, as the builder reported them:**

The test's NEXT constant was changed first; 2 tests failed until the wording changed. pricing.test.ts's PRICES_CHECKED tests are unchanged and pass.

**Mutations, as the builder reported them:**

M13 old 'each flagged page' wording: caught by 2 tests. Restored.

### PRICES-5

**Tests, as the builder reported them:**

New test: Google answering 403, OpenRouter answering 503, and the whole report failing (an Invalid Date clock) each give exactly one ::warning carrying the line and NEXT. The never-fails test reads the new words. Live copy: OpenAI answering 404 warns.

**Mutations, as the builder reported them:**

M14 unread not counted toward the closing line: caught. M15 unread left out of the warning: caught. M16 outer failure not marked unread: caught. Restored.

### SECURITY-2

**Tests, as the builder reported them:**

New test plants three things: an OpenRouter body of '\n::error::planted' (V8 copies raw newlines into the JSON.parse message), a page Error carrying \r\n, ::add-mask::, U+2028, ##[error] and ESC, and an OpenRouter price of '##[error]planted'. No printed or summary line holds a control character, starts with '::' (other than byway's own ::warning) or contains '##['. Exact lines show each message still reads on one line. Unit cases cover a leading command, a command after spaces and a tab, and a mid-line '::'.

**Mutations, as the builder reported them:**

M17 log/summary lines not plain: caught. M18 warning lines not plain: caught. M19 control characters kept: caught. M20 leading '::' kept: caught. M21 '##[' kept: caught. Restored.

## The web builder (fix/fx-b2f-web, merged at 83fc98c)

Commits: 323145c (Gateway: undici pinned at 7.30.1, the first 7.x clear of every published advisory (SECURITY-1)); 9087f81 (Settings: a model's wait saves go one after another, so the select and its announcement show what was saved (WEB-2)); 3503a8c (Settings: the waits help says a silent stream is sent once more, up to twice the wait, both sends maybe billed (WEB-3)); eaa971f (Waits API: a mock model is refused for what it is, not as one no profile uses (WEB-4)); d924068 (Library: when prices were last checked, and the notice after about 45 days, above its recipes' costs (WEB-5)); c36a35c (e2e: each seeded going run has a parked workflow, so the repeated lost-run pass leaves it alone (STORE-1)).

### STORE-1

**Tests, as the builder reported them:**

The seeding's in-suite pass check, which runs every time artifact-views.spec.ts and keyboard.spec.ts seed. Finding's check: with RECONCILE_EVERY_MS temporarily set to 15_000 (reverted with git checkout), `pnpm e2e artifact-views.spec.ts keyboard.spec.ts` passed 19 of 19, twice: once before and once after adding the cleanup for a seeding that fails part way. The server log had no 'ended ... runs' line. pnpm -s typecheck is clean. All tests pass in packages/runner (67 files, 1476 tests) and in apps/web, packages/gateway and scripts/test (92 files, 1784 tests, build.test.ts included).

**Mutations, as the builder reported them:**

With the workflow.start in newRun removed, `pnpm e2e artifact-views.spec.ts` failed in beforeAll: "The engine's lost-run pass ended 3 of the 3 seeded runs (...): their parked workflows are not running." Restored afterwards. I did not repeat the refuters' own failing run (15 s interval, no fix), which showed 2 or 3 failures at 160c027 with the same seeding.

### SECURITY-1

**Tests, as the builder reported them:**

New test in packages/gateway/test/fetch.test.ts: the installed undici is 7.30.1 or later. fetch.test.ts and whole-call.test.ts pass (39 tests), as do all 972 gateway tests. I reran the evidence probe docs/adr/evidence/probes/node-fetch-limits-2026-10-22/undici-timeouts.mjs unchanged. It still runs on Node's own undici 7.18.2 and gives the same results, 305 s where it gave 304 s. A probe of the same shape against the package's 7.30.1 fetch with an Agent as dispatcher behaved the same: the default Agent failed silent bodies and held headers at 306 s, and a 400 s Agent waited out headers held 330 s and a body silent for 330 s. A JSON POST worked. Script and outputs: C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/undici-audit/package-timeouts.mjs, package-probe.out.txt and evidence-probe-rerun.out.txt.

**Mutations, as the builder reported them:**

Test first: the new test failed at 7.18.2 ('undici 7.18.2: expected 7018002 to be greater than or equal to 7030001') and passed after the bump.

### WEB-2

**Tests, as the builder reported them:**

New apps/web/test/wait-saves.test.ts, 4 tests, using a stand-in server that answers on command. Three arrow steps send two saves (30, then 60) and end on 60 with its announcement. A failure followed by a newer choice is not shown. When the newest save fails, the row goes back to what the server last kept: the default if nothing was kept, otherwise 30 or 45. Two models save side by side. Three of the four failed on the section's old logic, which I first moved into the module unchanged.

**Mutations, as the builder reported them:**

Each restored afterwards. Saves sent side by side: 2 tests fail. A skipped failure shown: 1 fails. Rollback to the row as shown at the change: 1 fails; this mutant survived at first, so I added the 'kept 45, then 60 fails' case. A kept save not remembered: 4 fail. A sent choice left pending: 4 fail.

### WEB-3

**Tests, as the builder reported them:**

waits.test.ts pins the sentence in place.

**Mutations, as the builder reported them:**

The test failed before the sentence was added (the expectation was written first).

### WEB-4

**Tests, as the builder reported them:**

api.test.ts expects the new words for mock-big and for a mock name no profile uses. All 38 api tests pass.

**Mutations, as the builder reported them:**

The test failed before the change, on the old 'No model profile uses mock-big from mock' message.

### WEB-5

**Tests, as the builder reported them:**

prices-checked.test.ts renders LibraryPage whole on the real services with a fixed clock. On 2026-12-06 it shows the line once with no notice; on 2026-12-07 it shows the notice once. Both appear above <ol class="library">.

**Mutations, as the builder reported them:**

Each restored afterwards. No line: fails. No notice: fails. A fixed clock in place of new Date(): fails. The test also failed before the change.

## The voice builder (fix/fx-b2f-voice, merged at c126f43)

Commits: 5198a57 (WORKFLOW-1: a VOICE asked again after the final check's retry starts its box field by field).

### WORKFLOW-1

**Tests, as the builder reported them:**

Tests in packages/runner/test/voice-retry.test.ts, written first (4 failed before the fix):
- Interpreter on the real activities: "lines that still fit ...". The second box and the delivered work now carry the second pass's tagline 'Loaf club' next to the person's headline. Before, they carried the first pass's 'Bread club'.
- "a deck of named fields, field by field ...". The person writes the headline and a two-line shot 1 caption. The second pass changes the headline, tagline and captions. The box keeps the person's two fields and takes the work's lines for the rest. Sending it back writes exactly that. Sending back the work's own lines writes nothing.
- "... whose lines the person wrote the work now has too". The box is the work's lines, with no deckId and no note.
- Options: with the same options, the person's title comes back and option B follows the work. A built box that would not fit (option B's pitch is blank in the work) falls back to the work's lines plus the quote. A third option still does not fit.
- Added after a mutation survived: "a work whose own deck does not read field by field" (a caption holding a label-like line). The box is the work's lines and the question quotes the person's (NOT_KEPT).

The existing tests for a different number of shots, prose, claim logs, pages and ENG-6 are unchanged and pass. In packages/runner/test/e2e/c2-c5.ts I changed only the comment on the C5 second late VOICE. Its assertions hold under both rules, so they stay as they were.

Runs: voice-retry 20/20; configurations.test.ts -t C5 passed (2 tests); the whole runner suite passed (67 files, 1478 tests, including build.test.ts and configurations.test.ts); `pnpm -s typecheck` exit 0.

**Mutations, as the builder reported them:**

Each mutation was applied, run against voice-retry.test.ts, and restored from a byte-for-byte backup checked with cmp:
- M1, back to the whole answer (always the person's value): 4 tests failed (the interpreter run, field by field, the work-has-it-too case, options).
- M2, always the work's value: 4 failed (the interpreter run, field by field, ENG-6 re-ask, options).
- M3, fit check on the built box removed: the options test failed (blank pitch).
- M4, the 'box equals the work's lines' early return removed: the work-has-it-too test failed.
- M5, labelledDeck's blank line between options removed: the options test failed.
- M6, the whole answer returned when the work's deck does not read field by field: it first survived; I added the test for a work whose deck does not read, which then failed.
- M7, the option label left unstripped ("### A/Title:"): the options test failed.

