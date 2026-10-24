# Ponytail audit report

**Audit of:** main at `e8e9322` (the head of main on GitHub when the audit ran and when this file was committed).
**Date:** 2026-10-24.
**How it was made:** the ponytail-audit skill, run by Claude as six area auditors (money and the gateway, the engine, stored data, the web app and security, recipes and the advisor, scripts, CI and dependencies), each followed by a verifier that tried to refute its findings, in a `--no-local` clone of main; 45 findings were raised, 1 was refuted, and the 20 most important are below. Nothing in it is filed in docs/backlog.md yet. It changed no code.

---

**What this repo does:** byway is a web app that runs on your own computer. You describe a problem, and byway suggests a "recipe": a plan of AI steps. It then runs that plan with paid AI calls for text, images and video, and stops to ask you questions along the way. It records every dollar so that a run stays inside its run budget and inside the workspace budget.

**Load assumed:** one person on their own machine, often a laptop that may go to sleep. One local web app, one worker, a Temporal dev server and one SQLite database file. Temporal is the engine that runs each step and retries it when it fails. Real paid AI calls, a few runs at a time.

**Must fix:**

**1. Pausing during a step, then hitting the budget in that step, freezes the run with no Resume button** `packages/runner/src/workflow/interpreter.ts:290` (ask, called from askBudget at :261-277); `apps/web/src/components/run/RunScreen.tsx:90`
- **What this is:** Pause stops new steps from starting, and it takes effect once no step is running. When a step's call hits the run budget, byway asks "Raise the budget by $X?".
- **Problem:** The budget question waits for the pause to finish, and the pause waits for that same step to end, so both wait forever. Example: you press Pause while an image step runs in a C1 run (C1 is one of byway's built-in recipes). The step's next call is refused at the budget, and the screen shows "Running" with no question and no Resume.
- **Fix:** Give `ask()` a flag, such as `{ underWay: true }`, that skips `await this.control.boundary()`, and pass it only from askBudget. This also covers a voice answer's model call, which freezes the same way. Add a test: pause during a slow call, refuse that call once for budget, and expect the question to open and the run to reach 'paused'.
- **If we skip it:** The run stays stuck. The only way out is Cancel, which throws away everything the run has already paid for.

**Should fix:**

**2. Clearing a "may have been billed" call while it is being sent again loses its cost** `packages/store/src/spend-book.ts:603-607` (uncertainRows, clear); `packages/gateway/src/memory-book.ts:320-349`; `apps/web/src/components/SpendingRecords.tsx:115,124`
- **What this is:** The spend book is the SQLite table that tracks every paid call. Settings lists the calls in it that "may have been billed", each with a Clear button, plus Clear all. A cleared call no longer counts against the workspace budget.
- **Problem:** A call is listed, and can be cleared, while it is still being sent again. If that second send also ends with no answer (it stalls, or the worker stops or crashes), its cost is counted nowhere and the call disappears from Settings. Example: an Opus call reserves $0.40, its stream breaks, and byway sends it again. You press Clear all, and the second send then stalls. The "may have been billed" total shows $0.00 instead of $0.80.
- **Fix:** Do not list or clear a call that is still being sent. Add `AND NOT (${IN_FLIGHT})` to the uncertainRows and clear queries, and `&& !inFlight(r, now)` to the same filters in memory-book.ts. Add a contract test: admit, send, retain, Clear returns 0, abandon. The total should then be the reservation plus the retained amount.
- **If we skip it:** Each such Clear lets the workspace budget be passed by one call's estimate, up to several dollars. It can happen in the first live runs, when you clear calls as the Launch checklist says, and the cleared call can no longer be checked against the provider's bill.

**3. A step attempt that Temporal cancelled keeps re-sending its call while the next attempt buys it too** `packages/gateway/src/gateway.ts:334, 464` (withRetries gets only operation.stop)
- **What this is:** The gateway is the code that makes every paid AI call. It sends a call again when the connection drops, up to 4 tries in all, and only the end of the run stops those re-sends.
- **Problem:** When Temporal gives up on a step attempt (for example after the laptop slept), the next attempt buys the call itself, but the old attempt keeps re-sending. Example: you close the lid for 2 minutes during an Opus step. On wake, the old attempt's stream breaks and it sends again while the new attempt also buys. That is two paid answers plus one "may have been billed" send, for one step.
- **Fix:** In completeOnce and imageOnce, also stop on the caller's cancel: `stop: AbortSignal.any([stop, req.operation?.cancel].filter(Boolean))`. Keep stopIfEnding and the adapter's signal on `stop` alone.
- **If we skip it:** Every timed-out attempt whose connection then drops pays for one extra call. ADR-0099 only accepts a hung call that answers late, not this case.

**4. An image is bought twice when its step runs again after one failed try** `packages/runner/src/activities/memo.ts:195-200, 263`; `packages/runner/src/activities/asset.ts:296-312`
- **What this is:** The memo saves each paid answer under a key: the step, the request, and a count of how many times that request was made (1, 2, ...). When a step runs again, it gets the saved answers back and does not pay again.
- **Problem:** The count goes up even when a try fails and saves nothing, so when the step runs again it asks under the wrong count and buys again. Example: C1's hero image fails on try 1 and works on try 2, then the next image hits the budget. You raise the budget, and the hero image is bought a second time, along with the model call that uses it.
- **Fix:** In once(), give the count back when a call fails with nothing saved (for example, keyOf returns `{ key, undo }`). This is needed only on the plain re-throw path. Add a test where try 1 fails and try 2 works: run the step twice and expect one purchase. It can ship with B-045, whose trigger is the next change to once().
- **If we skip it:** One image and the call after it are paid twice. The ledger then shows an extra purchase that nobody can explain.

**5. A Start sent again after its run began is refused, and the next press starts a second paid run** `apps/web/src/server/api.ts:245-258` (startRun); `apps/web/src/components/startIdentity.ts` (refused)
- **What this is:** Start gives its run an id. If the browser gets no answer, it sends the same id again and gets back the same run, so one Start makes one run.
- **Problem:** The resent Start is checked against the budget again, after the run's first call has already taken part of the money left. Example: $20 is left and the run budget is $20, and the first answer is lost. The resend is refused as "more than what is left ($19.50)", the browser drops the id, and the next Start makes a second run.
- **Fix:** In startRun, skip the budget check when `input.runId` names a run that already exists (`await services.store.getRun(input.runId)`). The runner already decides whether it is the same run. Add a case to api.test.ts that spends $0.50 between the two sends and expects the same run back.
- **If we skip it:** When an answer is lost (laptop sleep, antivirus on localhost, a restart), you are told something false and you pay for two runs.

**6. C2's suggested budget is smaller than what its first step reserves, so it asks for more money at once** `apps/web/src/view/format.ts:64` (suggestBudget); `packages/runner/src/activities/model-step.ts:139`
- **What this is:** byway suggests a run budget 25% above its high estimate. Before each call, the gateway reserves (sets aside) the most that call could cost, including its full 16,000-token answer allowance.
- **Problem:** C2 starts 12 "seed" calls at once. On the Balanced model profile each reserves about $0.16, so only 9 fit in the suggested $1.50. The run asks "Raise the budget by $1?" in its first minute, though the whole run should cost at most $1.03. On Best, 12 × $0.33 = $3.91 is reserved against a $3.50 budget.
- **Fix:** In model-step.ts, give seed steps on non-page media a 4,000-token allowance, as judges have. On Balanced that is 12 × $0.065 = $0.77. An answer that gets cut off is already retried with twice the allowance.
- **If we skip it:** Every C2 run on Balanced or Best with the suggested budget asks for money at once, and it ends if you say no.

**7. On Windows, starting byway from a lowercase drive letter loads the store twice, and an answered question can freeze its run** `scripts/serve.ts:53-56`; `packages/runner/src/activities/human.ts:340-342`
- **What this is:** The store is the package that reads and writes byway's database and files. serve.ts imports it by file path while the runner imports it by package name, so on Windows `c:\` and `C:\` load two copies, each with its own error classes.
- **Problem:** human.ts checks store errors with `instanceof`, and that check fails across the two copies. Example: your answer is saved, the step retries, and the "already answered" error is not recognised. All 5 tries fail, and the run waits forever on a question the store shows as answered, until you cancel.
- **Fix:** The smallest fix is to check the error by its code (`'already-resolved'`, `'withdrawn'`) in human.ts, the way memo.ts checks by name. The root-cause fix is to import the four packages by name in serve.ts, added as `workspace:*` in the root package.json.
- **If we skip it:** On a terminal that reports `c:\` (some IDE terminals do), an answered question can freeze its run. Any later `instanceof` check on store errors will break the same silent way.

**8. A second `pnpm start` deletes the running app's build folder before it notices byway is already running** `scripts/serve.ts:186-215`
- **What this is:** serve.ts starts the engine, builds the web app with `next build`, and only after that checks whether the engine started.
- **Problem:** `next build` first empties `apps/web/.next`, which is the folder the running byway serves its pages from. Example: you type `pnpm start` or `pnpm demo` in a second terminal. The running byway's pages break during the build, and only then does the new one say "Port 7233 is already in use".
- **Fix:** At the top of main(), call `await assertPortFree(temporalPort); await assertPortFree(webPort);`. assertPortFree is already exported from the runner module that serve.ts imports.
- **If we skip it:** An accidental second start breaks the running byway's screens with no message saying why, and they may stay broken until a restart.

**9. When a provider refuses a recommend or compose request, byway says "Try again"** `apps/web/src/server/model-errors.ts:156-177` (modelProblem)
- **What this is:** modelProblem turns an error from the AI calls behind recommending and composing into a message for you.
- **Problem:** It has no case for 'invalid-request' (for example a retired model, or a prompt that is too long). It also treats a 403 that cannot be retried as "did not answer". So you see "Try again", though trying again cannot work.
- **Fix:** Add `case 'invalid-request': return { status: 400, message: err.message };`. For 'provider-error' with `retryable === false`, return `{ status: 502, message: err.message }`. The gateway's message already has secrets removed; add both cases to model-errors.test.ts.
- **If we skip it:** Once a provider retires a model (B-031) or a long problem goes past the provider's limit (B-033), every recommendation fails with an unhelpful "try again".

**10. The estimate ignores the critic's "shuffles" setting and its default number of examples** `packages/advisor/src/estimate.ts:216, 225`; `packages/runner/src/activities/critic.ts:55-64`
- **What this is:** Before a run, the advisor estimates its cost. A critic step is an AI that judges work against examples; it can run several times ("shuffles", 1 to 4) and read up to 10 examples.
- **Problem:** The estimate always counts one critic call, and 4 examples when none are set. Example: C5's launch-gate critic has shuffles 2, so it makes 2 calls per check where 1 is counted. C2's critic can read 10 examples where 4 are counted.
- **Fix:** In estimate.ts, read shuffles with the runner's rule (a whole number from 1 to 4) and count that many calls at the high end. Count 10 examples when the setting is missing or 0. This is about 3 lines.
- **If we skip it:** The high estimate and the suggested budget come out below what these runs can spend.

**11. A gate's retry is priced as re-running one stage, but byway re-runs every stage from there to the gate** `packages/advisor/src/estimate.ts:343-349`; `packages/runner/src/workflow/interpreter.ts:174-195`; `packages/recipe/src/limits.ts` (walkStages)
- **What this is:** A gate is a final check in a recipe. If it fails, it can retry from an earlier stage.
- **Problem:** The engine re-runs every stage from the retry target up to the gate, and limits.ts counts it that way, but the estimate counts only the target stage. Example: C5's gate in stage D3 retries D2. D3's 3 model calls and about 16 to 48 minutes of your answers then run again, and the estimate leaves them out.
- **Fix:** Record the current stage in walkStages. Price the retry as the sum of every stage from retry.stage through the gate's stage, as limits.ts does (about 5 lines).
- **If we skip it:** The worst-case cost shown is too low for every recipe whose gate retries an earlier stage.

**12. No test checks the estimate against what a run really does** `packages/advisor/test/estimate.test.ts`
- **What this is:** The tests of the cost estimate. That estimate feeds the cost shown, the budget questions and the suggested run budget.
- **Problem:** The tests check prices and rounding, but never that a real run's calls fall between the low and high estimate. All 61 tests pass with findings 10, 11 and 17 in place.
- **Fix:** Ship unit cases with those fixes: shuffles, the default number of examples, a retry across stages, and a loop that ends before its fix. Then add one test that runs each built-in recipe through the real engine on its cheapest and costliest path and checks the call count is within the estimate. limits-batch.test.ts already shows how to drive the engine.
- **If we skip it:** The next engine change can move spending away from the estimate while every test stays green.

**13. The conversation extractor silently drops any owner message that has an image** `scripts/extract-conversation.cjs:22`
- **What this is:** AGENTS.md names this script for copying the owner's own words from a Claude Code transcript into the evidence file. The ADRs (the project's decision records) quote that file.
- **Problem:** A message with a pasted screenshot is a list of parts (text plus image), so it fails the "all text" test and is skipped with no warning. Example: "Use option B, see the screenshot" with an image attached never reaches the record.
- **Fix:** Change the test to `Array.isArray(c) && !c.some(p => p.type === 'tool_result')`, and join the parts with `p.type === 'text' ? p.text : '[' + p.type + ']'`. Add one scripts/test case with a text-plus-image message.
- **If we skip it:** Owner decisions given with a screenshot go missing from the record, which breaks the rule that they are quoted word for word.

**Nice to have:**

**14. One damaged artifact file breaks a run's whole screen** `apps/web/src/server/run-data.ts:43-52` (artifactInfo)
- **What this is:** An artifact is a saved output, such as a draft, an image or a clip. For each artifact a run shows, artifactInfo reads its type and a short excerpt, and reading a file whose bytes no longer match its hash throws an error.
- **Problem:** artifactInfo does not catch that error, so the Run page fails and every refresh of it returns a server error. All of that run's open questions become unreachable, though only one file is bad.
- **Fix:** Drop the `has()` check and wrap `get()` alone, skipping an artifact whose error is 'not-found' or 'corrupt'. Add a test that damages one stored file and expects the others back.
- **If we skip it:** After a partial restore or disk damage, one bad file takes a whole run out of the app.

**15. A ledger line that is just `null` makes the ledger check crash** `packages/gateway/src/gateway.ts:820` (auditLedger); `packages/gateway/src/ledger.ts:500`
- **What this is:** The ledger is a file with one line per billed call. auditLedger checks it, both for Settings' "Check the spend ledger" and for the start-up report.
- **Problem:** A line that is valid JSON but not an object, such as `null`, correctly pauses paid calls. But the check then reads `e.id` on null and crashes, so Settings' check fails and the start-up report says only "the data directory could not be checked".
- **Fix:** Use `typeof e?.id === 'string'` at gateway.ts:820.
- **If we skip it:** Paid calls stop, and the check that should name the bad line crashes instead.

**16. An image, or a Gemini answer, that comes back without usage is recorded as costing $0** `packages/gateway/src/providers/openai.ts:252`; `packages/gateway/src/providers/google.ts:88, 152-154`
- **What this is:** Each provider's code reads the provider's usage report (token counts) to price the call. When the counts are missing, the gateway is meant to use its planning figures and mark the price "assumed".
- **Problem:** The image and Gemini parsers put 0 when usage is missing, so the call is priced at $0 with no "assumed" mark. If OpenAI leaves usage out for an image, that image counts as free (its real cost is about $0.013); a Gemini image still counts its $0.0336.
- **Fix:** When the usage object is missing, report NaN counts, as the streamed chat path already does: `usage: res.usage ? {...} : { inputTokens: NaN, outputTokens: NaN, units }`. Do the same in both Google parsers.
- **If we skip it:** Such calls count low against both budgets, and Settings does not mark them.

**17. Critic and check loops are estimated with one fix too many** `packages/advisor/src/estimate.ts:314-327`; `packages/runner/src/workflow/interpreter.ts:674-700`
- **What this is:** A loop repeats render, critic and fix until the critic is happy or a round limit is reached.
- **Problem:** The engine stops right after a passing verdict, before the fix runs, but the estimate counts a fix in every round. C5's repair loop makes a paid clip each round, so its low estimate is about a third too high and its high estimate about a fifth too high. On Balanced that is about $1.05 and $5.80 of clips that never run.
- **Fix:** Split the loop body after its last exit point. With p = min(probe, planned): low = p × head + (p − 1) × tail, and high = planned × head + (planned − 1) × tail, plus the cap as now. This is the same kind of safe over-estimate as B-050, which the owner accepted.
- **If we skip it:** C5's shown cost and suggested budget stay too high. That errs on the safe side, but it misleads.

**18. Downloading a clip, GIF or AVIF names it `.txt`** `apps/web/src/view/text.ts` (EXTENSIONS, extensionFor)
- **What this is:** A download is named after the artifact's title, with a file extension looked up from its file type.
- **Problem:** The table has no entries for video, GIF or AVIF, so it falls back to `txt`. A C5 clip downloads as `clip.txt`, and Windows opens it in Notepad.
- **Fix:** Add `'video/mp4': 'mp4'`, `'image/gif': 'gif'` and `'image/avif': 'avif'` to EXTENSIONS. Add `exportFileName('Clip', 'video/mp4') === 'clip.mp4'` to results.test.ts.
- **If we skip it:** Clips from the first live C5 run will not play when double-clicked.

**19. The gateway keeps a 491-line copy of the spend book that only tests use** `packages/gateway/src/memory-book.ts:96` (copy of `packages/store/src/spend-book.ts`)
- **What this is:** MemorySpendBook rewrites every spend-book rule in plain JavaScript, for tests. Production always uses the SQLite book.
- **Problem:** Every spend-book change has to be made twice: all 11 commits to memory-book.ts also changed spend-book.ts, and finding 2's fix must too. Any rule the shared contract tests do not pin down can drift, so gateway tests can pass against rules production does not have.
- **Fix:** Delete memory-book.ts, its export and its test, and use `openSpendBook(':memory:', { now })` from @byway/store instead. Move every importer (15 gateway test files, the advisor's test helpers and two runner test files), and add @byway/store as a devDependency of gateway and advisor.
- **If we skip it:** Each change to the money code costs double, and the tests can quietly check the wrong rules.

**20. Exported code that nothing uses** `packages/gateway/src/ledger.ts:153-157` (absorbable); `apps/web/src/server/http.ts:78-82` (failFrom); `packages/contracts/src/store.ts:107` (TypedRunEvent); `packages/runner/src/types.ts:187-188` (consumes, produces); `packages/runner/src/activities/writes.ts:75-76` (checkedWrite)
- **What this is:** Helpers that are exported but have no caller in production. checkedWrite is used only by one test.
- **Problem:** They have to be kept up to date for nothing, and two of them mislead. failFrom would send internal error messages (from SQLite or Temporal) to the browser if a new route used it, and checkedWrite's comment points readers to files that actually use checkedWriter.
- **Fix:** Delete all of them, and remove absorbable's name from the export at `packages/gateway/src/index.ts:13`. Have held-voice.test.ts call `checkedWriter(run, voice, before)(text)` instead. Keep Ledger.append, which six test files use.
- **If we skip it:** The dead code stays, including a response helper that leaks error messages.

19 smaller findings are left out:
- wrong wording on a gate that has no retry (ENGINE-3)
- more copied rules and helpers (ENGINE-4, -5, -6; WEB-6, -8; RECIPES-8, -9, -11; isEntry in RECIPES-12/BUILD-7; BUILD-6)
- a sweep that cannot use its index and slows as history grows (DATA-2)
- a missing test that money writes are saved safely to disk (DATA-4)
- a temporary file left behind when an artifact write fails (DATA-5)
- "Yesterday" counted in UTC days rather than your own time zone (WEB-5)
- two small estimate mismatches (RECIPES-6, -7)
- dependency lines that match no import (BUILD-4)
- an unchecked build script (BUILD-8)

Duplicates were merged: MONEY-1 with DATA-1, WEB-7 with BUILD-5, and RECIPES-12 with BUILD-7.

**Verdict:** Careful code with strong money guards, but fix the frozen run (1) and the paths that pay twice or count low (2-5) before the first live run.

**Lean:** -677 lines, -2 dependencies possible.

**Not checked:**
- **Everywhere:** the ADRs, playbook and evidence folders were only searched, never read in full. docs/backlog.md was searched by keyword, not read end to end. Most test files were run but not read. There was no live browser run, no live CI run, and no two byways started side by side (finding 8 comes from reading the code).
- **Money:** the demo mock provider (`providers/mock.ts`, `gateway/src/mock/*`), the rest of `env.ts`, and `contracts/src/gateway.ts` beyond GatewayError.
- **Engine:** `pages.ts` lines 910-2265 (the in-page visitor script); `page-copy.ts`, `page-arbiter.ts`, `copy.ts`, `claims.ts`, `html-tokens.ts` and `tells.ts`; most of `cards.ts`; the advice texts in `sandbox.ts`.
- **Data:** most of the 957-line spend-book contract suite, store tests other than concurrency and spend-book (all were run), and contracts `runner.ts`, `prompts.ts` and `medium.ts`.
- **Web:** the run panels (Pick, Compare, Select, Directive, Text, Confirm, Choose, References, TurnFooter), Timeline, StepDetail, StepThumbs, RunStatusPanel, YourTurn, UnsentWords, DiffView, Route, Nav, SandboxBanner, PageRendererSettings and most of results.tsx; the view modules timeline, steps, labels, vocabulary, refusals, composed, recommendation, drafts, diff, events, questions, waits, claims, renderer and onscreen; all CSS; the Playwright e2e suite; the guard-scan and dev-server tests.
- **Recipes:** most of `recipe/semantics.ts` (placements, run order, critique flow); the typing passes in `validator/scope.ts` from line 120; checkSetAside; the rest of `checks/defaults.ts`; `advisor/diff.ts` and `present.ts`; the catalog's copy tables, `c1h.ts`, `c6a.ts` and `steps.ts`; `protocol/exceptions.ts`; `prompts/errors.ts`; the prompt template texts (only searched).
- **Build:** `scripts/route-map/page.html` (only searched); most scripts/test files; the rest of `pnpm-lock.yaml`; the apps/web e2e specs and unit tests.