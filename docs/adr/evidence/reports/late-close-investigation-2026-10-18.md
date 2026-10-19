# The late-close investigation (2026-10-18)

The report [ADR-0106](../../0106-a-late-close-retires-the-renderers-browser.md) cites: a bounded investigation of the Windows CI failure in run 39097581622, and a challenge of it by a second agent. From `diagnose-closed-result.json` in the session's scratchpad under Temp; the text is unchanged, and Claude added the headings. A `<` that GitHub would read as the start of an HTML tag is written `&lt;`, so that it shows. The investigator's clone, instrumentation, unit reproductions and e2e logs (`scratch/diagnose-closed/inv1/`) are not kept.

## What the investigation found

### Cause

Verdict: likely. I reproduced the mechanism at unit level, and once end to end in the real e2e with the exact CI error text. The CI trigger itself cannot be seen, because CI keeps no server log.

How it fails: packages/runner/src/pages.ts dispose() races context.close() against a 5 s wall-clock timer (closeTimeout). When the timer wins, dispose forgets the SHARED browser and closes it. Every other load in flight on that browser then fails its pending Playwright call with "Target page, context or browser has been closed". drawFailure() maps that to the plain, non-retried StepError "The page could not be drawn: the page renderer failed while drawing it (...)", and the run fails. Reads hit the same path through readFailure ("failed while reading it"). The CI wording "failed while drawing" rather than "could not take its screenshot" tells us the CI victim was not in page.screenshot. In both reproductions it was in page.goto.

Correction to the hypothesis: Chromium does not have to be slow. Here Chromium closed contexts in p50 6-79 ms, p99 at most 1.1 s, max 1,112 ms, over about 1,400 closes, including starved 2-CPU runs. What makes a close "late" is the engine process not running for 5 s or more while a close is pending. The 5 s timer and Playwright's driver run on the same event loop. When the loop resumes, the expired timer runs before the I/O that carries Chromium's reply. In the e2e reproduction, two closes judged late at 6,038 and 6,039 ms had in fact completed: they resolved 2-3 ms after the stall ended.

Things that can stall the engine's loop:
- Synchronous node:sqlite. The store uses DatabaseSync with a 10 s busy timeout on a file shared with the web process, so a write waiting on the web process's write lock, or a slow fsync, blocks the thread.
- CPU or VM starvation.
- Disk stalls.

The Windows CI runner has multi-second stalls. Every Windows run log with engine tests shows Temporal's own storage failing with "context deadline exceeded". In this run that was 04:50:44-04:50:50 (14 lines), with 5-8 lines in each earlier Windows run and none on Linux. A Chromium close that is genuinely slower than 5 s would trip the same path.

Other causes considered, ranked:
1. Late-close safety net closing the shared browser under other loads: likely. Reproduced, exact message.
2. A Chromium crash or disconnect (ENG-14): would produce the same message for loads in flight. Not seen in any local run; every disconnect logged was byway's own close or shutdown. It cannot be excluded for CI without the server log. Unlikely.
3. The deadline racing the draw: ruled out. The deadline rejects with its own StepError ("did not finish rendering within 30 s"), and the losing work's later rejection is swallowed by work.catch.
4. A cancel: ruled out. drawFailure returns the cancel's own reason when the signal is aborted.
5. The readiness check's browser: ruled out. checkRenderer() has its own playwrightPages and its own Chromium, closed at start-up (launch #1 in every log). ready() in beginRun and model-step only fetches the shared browser and opens no context.
6. Worker shutdown (pages.close()): ruled out. No shutdown happens mid-suite.
7. The e2e harness's own browser: ruled out. The text is the run's failure, produced by the server-side renderer.
8. A page crash: ruled out. That gives "Target crashed".
9. Temporal retrying an attempt after a heartbeat timeout: this only adds overlapping loads; it closes nothing itself.

Overlap is normal: C1 runs 4 drafts in parallel, each a wide load then a phone load, and max in flight was 4 in every run.

### Reproduction

Clone: C:\Users\arvik\AppData\Local\Temp\byway-fixes\scratch\diagnose-closed\inv1\repo, at 3a0faf9, set up with pnpm install --frozen-lockfile --offline. The main repo is untouched (git status clean).

Instrumentation is logging only, in the clone's packages/runner/src/pages.ts. The patch is ...\inv1\logs\diag-instrumentation.patch. It logs:
- each launch, and each disconnect with whether byway closed that browser;
- the time each context close takes, and each LATE verdict with the number of other loads in flight;
- each failed load with Playwright's raw first line, and each drawFailure/readFailure input;
- event-loop stalls over 1 s;
- stats every 25 loads.

Unit level: packages/runner/test/diag-closed.test.ts, run with `npx vitest run packages/runner/test/diag-closed.test.ts --silent=false`; all 4 tests pass.
- (a) Render A's context close is held 3 s against closeTimeoutMs 1 s; nothing is stuck. Render B, started 50 ms later, waits on its image. B fails with exactly "The page could not be drawn: the page renderer failed while drawing it (Target page, context or browser has been closed)." A still succeeds, and the next render relaunches.
- Control, same timings with A closing on time: B renders.
- (b) Production 5 s limit. Right after A's close is sent, the engine thread makes one write to a SQLite file whose write lock a worker thread holds for 6 s (DatabaseSync, 10 s busy timeout, as the store does). The event loop stalls 6.0 s. A's close resolved at 6,020 ms, 7 ms after the stall, but was judged late at 6,013 ms. The browser was closed, and B failed in page.goto with the CI message.

Stress: packages/runner/test/diag-stress.test.ts, with STRESS_SECONDS=180 and 3 lanes of demo landing pages (gateway mock renderPage) on all 3 surfaces. It ran pinned to 2 CPUs (start /affinity C) with 4 busy loops on those CPUs. Result: 281 renders, 562 closes; p50 79 / p90 155 / p99 285 / max 385 ms; none over 1 s; no late close.

E2E: pnpm e2e started through ...\inv1\e2e-pinned.cmd or e2e-renders.cmd, which use `start "" /affinity 3` so every child inherits the affinity. TEMP and TMP point at ...\inv1\tmp. Logs are in ...\inv1\logs\&lt;run>\out.txt and server.log.

| Run | Tests | Conditions | Result |
|---|---|---|---|
| run0 | UX-1 only | no load | pass |
| run1 | UX-1 x3 | 32 busy loops (2x the 16 logical CPUs) | 3 pass (5.1-5.8 min each); no close over 1 s |
| run2 | UX-1 x3 | pinned to 2 CPUs + 4 pinned busy loops | 1 hit the 6-min test timeout (load too heavy), 2 pass; max close 1,112 ms |
| run3 | full suite | pinned + 2 fsync stressers + 1 busy loop | 53 passed (6.2 min); max close 133 ms; max stall 2.5 s |
| run4 | full suite | pinned + 2 fsync + 2 busy loops | 50 passed, 1 failed, 2 did not run; max close 121 ms; max stall 4.1 s |
| run5 | C1, C3, F07, UX-1 x2 | pinned + 2 High-priority burst spinners (6 s every 20 s) | 8 passed; max close 166 ms; stalls up to 9.5 s at start-up with nothing in flight |
| run6 | C1, C3, F07, UX-1 x3 | pinned + engine process paused 6 s every 10 s | 11 passed, 1 failed with the CI error |

- run4's timings matched CI (C1 1.5 min, C5 4.7 min, UX-1 4.2 min). Its one failure was state.spec.ts:296, an unrelated UI timing flake ("Sent" not found within 30 s).
- run6 paused only serve.ts, with NtSuspendProcess via ...\inv1\suspender.ps1. The process was identified as the parent of the Temporal process listening on the e2e's engine port, so no other byway was touched.

The run6 failure was keyboard.spec.ts:338 (F07): "Error: The run failed: The page could not be drawn: the page renderer failed while drawing it (Target page, context or browser has been closed)." The server log at 07:11:45 shows:
- an event-loop stall of 5,961 ms with 4 loads in flight;
- two contexts judged late at 6,039 and 6,038 ms, both actually closed 2-3 ms later;
- "LATE context close on browser #3: closing the shared browser with 3 other loads in flight";
- loads 237 and 238 (phone) failing with "page.goto: Target page, context or browser has been closed";
- drawFailure receiving the raw error.

An earlier late verdict at 07:10:25 had no other load in flight, so it only caused a needless relaunch.

CI evidence: `gh run view --log` output for 10 runs is saved in ...\inv1\logs\ci\. The failing log is C:\Users\arvik\AppData\Local\Temp\byway-fixes\scratch\ci-39097581622-windows-failed.log.

Cleanup: every busy loop, fsync stresser, suspender, tail watcher, Temporal process and Chromium I started has been stopped.

### Frequency

CI: 1 of the 5 Windows runs that completed the e2e suite (39015137461, 39044491869, 39058507534, 39095620441, 39097581622). 39058507534 failed on a different flake. No Linux runs failed this way. The sample is tiny.

A failure needs three things at once:
1. a close pending;
2. a stall or slow close lasting long enough to cross the 5 s mark of that close;
3. another load in flight on the same browser.

Measured locally without injected engine stalls:
- 0 late verdicts in roughly 900 or more e2e loads (runs 0-5) plus 562 stress closes, including CI-like durations (run4).
- Closes: p50 6-79 ms, p99 at most 1.1 s.
- Natural engine stalls reached 2.5-4.1 s under 2-CPU load, and 9.5 s at start-up under burst starvation; none overlapped a pending close.

With injected 6 s engine pauses every 10 s (run6): 68 pauses, 19 of them with loads in flight. 3 late verdicts in 2 events. 1 event killed 2 loads and failed 1 test of 12. That is about 1 in 10 pauses that land while loads are in flight.

Deterministic unit reproductions: 2 of 2. A pending close plus a 5 s-or-longer stall or slow close, with a co-tenant load, always fails the co-tenant.

On CI the Windows runner is 5-10x slower than my 2-CPU pinning (UX-1 takes 1.9-4.8 min there versus 36 s here), so closes and loads last longer. That raises the chance that a stall lands on a pending close. It is consistent with roughly one hit per few Windows suites.

### What a person sees

A web-page run fails outright, not retried, with "The page could not be drawn: the page renderer failed while drawing it (Target page, context or browser has been closed)". Runs that render several pages at once are exposed: C1 Landing Page Studio and its 4 parallel drafts, C3, the F07 page-edit flow, and any run whose critic sees cards. A VOICE read can fail the same way ("failed while reading it"). Whatever earlier steps spent stays spent, and the person must start over. Even when no other load is in flight, a needless browser relaunch adds 0.1-2.4 s.

It takes the engine pausing for 5 s or more while a render's context is closing and another render is running. On an ordinary desktop under heavy CPU load I saw no late verdict in about 1,400 closes, so it is rare. On machines with multi-second pauses it becomes plausible:
- a Windows laptop throttling or on battery;
- antivirus scanning, or a slow or full disk delaying SQLite's fsync or its write lock (the engine's DatabaseSync waits up to 10 s, and the web app shares the file);
- a VM with stolen CPU;
- a 2-CPU CI machine.

My estimate is about one failed web-page run per few dozen such multi-second pauses that land during rendering.

### Fix options

#### 1. Retire, don't kill: never close a browser that other loads are using

On a late close, forget the browser so new loads launch a fresh one, but close the old browser only when its last in-flight load has ended (each is already bounded by its own deadline and dispose). That close is bounded by closeTimeout. pages.close() also closes retired browsers. A small per-browser count of loads in flight does this.

Pros: Removes the hazard whatever the trigger: an engine stall, a genuinely slow close, or a truly stuck renderer. SEC-5's intent holds: the render that owns a stuck context still ends at its limit, nothing waits on a stuck close, and the stuck Chromium is closed at most about one render deadline later (30 s + 5 s). It is the same mechanism D2's Settings switch needs to swap browsers without killing renders.

Cons: Two Chromiums can coexist for up to about 35 s (memory). A truly stuck renderer can keep a CPU busy until the renders sharing its browser finish. Adds per-browser bookkeeping and an edge case: a retired browser that crashes.

Size: Small to medium: about 30-50 lines in pages.ts, plus 2-3 tests in pages.test.ts using the held-close proxy pattern and no wall-clock limits. Test 1: a late close with a second load in flight, which then renders. Test 2: the retired browser is closed after that load ends. Test 3: the next load launches a fresh browser. Adjust the existing 'neither closes' expectations.

ADR: New ADR, since SEC-5's close escalation (commit 99b52f1) was never recorded as one. It could also be a section of ADR-0105 (D2). Cite SEC-5/ENG-14 and ADR-0080. Update the pages.ts header comment and the closeTimeoutMs doc.

#### 2. Don't count the engine's own pause as Chromium's lateness

When the close timer fires, let pending I/O run once (for example, two setImmediate turns) and look again. Alternatively, count the limit only in time the engine's loop was actually running (100 ms ticks).

Pros: Tiny. Removes the false positive that reproduced here, where the closes had already finished. Means fewer needless relaunches. Complements option 1.

Cons: Does nothing for a close that is genuinely slower than 5 s, so on its own it does not remove the shared-browser hazard. Timing code needs care to stay testable without wall-clock limits (the lesson from the CI timing fixes).

Size: Tiny: about 10-20 lines plus 1 test (the synchronous SQLite busy-wait reproduction).

ADR: A note in option 1's ADR, or a dated note.

#### 3. Retry the victims once

In loaded(), a load that failed because byway's own safety net closed its browser, or because the browser disconnected (a crash, ENG-14) when this load did not cause it, is made once more on a fresh browser within its remaining deadline. Every other failure keeps today's mapping.

Pros: Also covers a real Chromium crash, which option 1 does not. Changes nothing about who closes what.

Cons: Repeats a render and its relaunch. Reads need care: shownText already retries on missing files and shares one deadline. It also changes a recorded rule.

Size: Medium: about 40-60 lines plus tests for render and read.

ADR: Amends ADR-0099 decision 8 (a Playwright error while drawing is one plain, non-retried step failure) and the read twin (F07 round 9, commit 5f0a29b, ADR-0081 reads). Needs a new ADR or dated notes.

#### 4. Raise or scale the close limit

Raise closeTimeout from 5 s to, for example, 30 s (the render timeout), or to 5 s plus the measured loop lag.

Pros: One line. The trigger becomes far rarer, since it would take a 30 s stall.

Cons: Keeps the shared-fate design and only moves the threshold, the kind of wall-clock limit the CI timing fixes removed elsewhere. The render that owns a truly stuck context takes up to 25 s longer to end.

Size: Tiny.

ADR: Dated note (SEC-5).

#### 5. A browser per render (or per activity)

Each load or render launches and closes its own Chromium, so a late close takes down only its own.

Pros: Complete isolation and a simple failure model.

Cons: Launch cost measured here: 60 ms idle, 1.9-2.4 s under load, twice per render (wide and phone). On CI the start-up launch once already ran past 30 s. More memory. D2's sandbox makes each launch heavier. The relaunch and readiness tests change.

Size: Medium.

ADR: New ADR. ADR-0084's single launch policy stays, but the count of launches changes.

#### 6. Kill only the stuck page's renderer

On a late close, crash that context's pages over CDP (Page.crash on a session opened per page) before touching the browser. Fall back to option 1 if that also stalls.

Pros: Targeted: other renders are never affected.

Cons: Chromium-specific CDP. A hung browser process will not answer either, so option 1 is still needed. More code.

Size: Medium.

ADR: New ADR.

### Recommendation

Make option 1 the fix: retire the browser and close it when its loads end. It removes the hard problem rather than tuning a threshold: byway never closes a browser under another render. SEC-5's intent is unchanged, because a stuck renderer still cannot hang a render or byway, and its Chromium is closed once its last co-tenant ends. Add option 2 as a cheap companion, so a pause in the engine (SQLite busy-wait, disk or VM stall) is not mistaken for a stuck renderer and does not cause needless relaunches. Turn diag-closed tests (a) and (b) into regression tests using the held-close pattern, with no wall-clock assertions.

Do not use option 4 alone, because it only moves the threshold. Do not use option 5, because of launch cost on slow machines. Option 3 is optional and only covers real Chromium crashes, which I never saw; I would park it in the backlog.

Also worth doing: have CI upload byway-e2e-server.log and Playwright traces on failure, and have the renderer log late closes and relaunches to the server log. This failure was undiagnosable on CI for lack of either.

Separate issue, not part of this fix: run4 hit an unrelated load flake in state.spec.ts:296 ("Sent" not found within 30 s).

### How it fits D2

This is directly in D2's path, and I would fold it into the D2 wave, ahead of or with the Settings-switch commit:
- **The Settings switch needs it.** Switching the sandbox on or off means relaunching Chromium with other options, and "offer to switch it back on" does the same. Done by closing the shared browser, that kills every render in flight with exactly this error. Option 1's "retire, close when idle" is the mechanism the switch needs anyway.
- **The new readiness check adds exposure.** A check that opens a page and runs a script adds a context on the shared browser before paid steps. That is one more load that can trip the 5 s net, or be killed by another run's late close. It should go through the same retire rule.
- **Sandbox on may slow closes.** Sandboxed renderer processes on Windows (restricted tokens, job objects) may tear down more slowly under load. ADR-0084 measured launch plus close at about 100 ms when idle; under load nobody has measured it. Without the fix that means more trips.
- **D2's message mapping must not catch this failure.** D2 plans a plain message for "Chromium sandboxing failed!", whose first line with the pipe transport is "Target page, context or browser has been closed" (ADR-0084, backlog D2 row). That is the same text as this failure. D2 must key on the launch (browserType.launch:) and the browser log, never on the text alone. Otherwise a render killed by a late close would be reported as "the sandbox could not start". The planned drift test should pin that distinction.

Record it either as a section of ADR-0105 or as its own ADR referenced from it.

## The challenge

**Does the cause hold?** Yes.

### Notes on the cause

The mechanism holds and is the most likely explanation. It is not proven for CI, and parts of the report's evidence claim more than they show.

What I confirmed in my own clone (C:\Users\arvik\AppData\Local\Temp\byway-fixes\scratch\diagnose-closed\skeptic1\repo, at 3a0faf9; tests in packages\runner\test\skeptic-*.test.ts):
- **E3, baseline.** A's context close is held 3 s against a 1 s limit. Render B, waiting on its image, fails with the exact CI text. The next render relaunches.
- **Co-tenancy in UX-1.** The co-tenants are C1's own parallel drafts. The Memo run was done; earlier tests' runs were idle or cancelled. This fits.

Where the report overreaches:
1. **The CI text cannot tell this cause from a crash.** In E2a I killed the browser process while B waited in goto. B failed with byte-identical text: "The page could not be drawn: the page renderer failed while drawing it (Target page, context or browser has been closed)." So a crash or disconnect (ENG-14) is only rarer in general. Nothing in the CI evidence makes it "unlikely".
2. **The e2e reproduction needed an artificial trigger.** The whole engine process was suspended 6 s of every 10 s for about 10 minutes. That gave 2 late events, only 1 with co-tenants. With nothing injected there were 0 late verdicts in about 1,400 closes, even pinned to 2 CPUs. Run 6 shows "a pause of 5 s or more during a close, with co-tenants, gives this failure". It does not show CI had such a pause.
3. **The CI stall evidence is from the wrong phase.** The Temporal "context deadline exceeded" lines (04:50:44-50) came from the vitest unit phase, which ended at 04:53:46. UX-1 ran 05:10:55-05:12:03, 20 minutes later. The e2e server's and its Temporal's output go to the server log, which CI does not keep. There is no evidence of any stall during the failing test.
4. **"The closes had in fact completed" is not shown.** In E1, a stall that starts right after context.close() is called catches the close before it has left Node: Playwright's in-process client-to-server hop is a setImmediate. The close resolved 3-6 ms after the stall, which needs a real pipe round trip to Chromium.
5. **A late close almost never means a stuck page.** Measured in skeptic-stuckclose.test.ts, these all close in 4-5 ms: a busy loop after load, a busy loop during parse, an alert loop, a 20 s unload loop, and a runaway memory page. So a late verdict means a hung browser process, a stall in the engine, or a Chromium starved for CPU.
6. **The CI trigger could be either kind.** On CI, Windows e2e is 3-15x slower than Linux (C1 takes 1.4-4.9 min against 18-36 s). That is a 2-vCPU, 7 GB private-repo runner. A genuinely slow, starved close is as plausible there as a stall in the engine alone. Which one it is matters for option 2.
7. **"Failed while drawing" only rules out page.screenshot.** Errors from goto, evaluate, newContext, newPage and route all get the same wording.

### Causes missed

1. **A browser crash gives the same text.** I showed this (E2a), so it cannot be ranked from CI evidence. Option 1 does not fix it.

2. **A machine-wide slow Chromium close.** On CI this could come from 2 vCPUs, paging in 7 GB, or the IOPS-throttled C: disk. The report says Chromium does not have to be slow, but on CI that has not been measured. Option 2 does nothing for this case.

3. **A more concrete source of stalls in the engine.** The spend book commits its money transactions with synchronous=FULL on the engine's main thread (packages/store/src/spend-book.ts, #durable). That is an fsync on the event loop, several per demo call, while C1's drafts run and render. Also, the e2e data folder and Temporal's database live on C:\ (C:\Users\RUNNER~1\AppData\Local\Temp\byway-e2e-...), the runner's OS disk, not on D:. This is a hypothesis only. It is more natural than waiting on a 6 s write lock held by the web process.

4. **A SEC-5 gap that exists today (E4b).** getBrowser() and newContext() run before the deadline and the abort listener are set up. I suspended an idle Chromium, and the next render was still waiting in newContext 20 s past its 3 s deadline.
   - Nothing ever frees it. There is no context, so no late close happens. The pipe stays open, so 'disconnected' never fires.
   - A cancel is ignored too, because the signal is only checked before getBrowser.
   - In production that means the model proxy's 15-minute limit, times 3 attempts.
   - So "a truly stuck browser blocks every render" is already true of today's code.

5. **A cheap fix for the diagnostic gap.** Playwright puts a close reason into the errors of calls still in flight. Verified in skeptic-reason.test.ts: browser.close({reason}) and context.close({reason}) make a pending page.goto fail with "page.goto: &lt;reason>".
   - If byway gives a reason to its own closes (the late b.close in dispose, and pages.close), the next CI failure names its cause in the test output. No server log upload is needed.
   - D2 gets the discriminator it needs: the bare "Target page, context or browser has been closed" then means Chromium died on its own (a crash or a sandbox failure).

6. **A minor existing quirk.** On its late path, dispose awaits the `browser` promise. If a relaunch is pending, it waits for an unrelated launch, up to Playwright's launch timeout. Option 1 makes it more common for two browsers to exist at once, so this comes up more often.

### The fix options assessed

**Option 1 as written (close a retired browser when its last load ends).** I prototyped it behind an environment switch in my clone (patch: ...\skeptic1\retire-prototype.patch, 37 lines; SKEPTIC_RETIRE=count or backstop).
- **It fixes the reproduced hazard.** In E3, B renders where the baseline fails.
- **Existing tests still pass.** All 54 tests in pages.test.ts pass with the prototype, including the never-settles test's ['context','browser'] expectation. The report's "adjust existing expectations" step is not needed.

**It creates a new failure mode, confirmed in E4.** The browser process is suspended (truly stuck):
- A, in flight, ends at its deadline. C, started after retirement, renders on a fresh browser. Both are fine.
- D started on the hung browser before retirement and is parked in newContext, outside any deadline. With option 1 as written, D was **still pending 50 s later and the hung Chromium was never killed**: D's in-flight count never reaches 0.
- Baseline: D was freed at 34.6 s and Chromium killed, because b.close() falls back to Playwright's 30 s kill.
- So the report's claim that the stuck Chromium closes "at most about one render deadline later" is false for option 1 as written. It holds only if every load on that browser is bounded.
- With a backstop (close a retired browser at the latest timeout + closeTimeout after retiring it), D was freed at 38.6 s and Chromium killed. That matches today.

**SEC-5 intent.** Stuck pages close in milliseconds, so the close escalation only matters for a hung browser process, whose co-tenants are doomed anyway. With the backstop, option 1 keeps SEC-5's intent; without it, a hung browser is never closed. Neither version leaves a truly stuck page blocking every render: new loads launch fresh.

**Option 2 as written ("two setImmediate turns, then look again") does not work.** In E1, after a 6 s synchronous stall that began right after context.close(), the close was still pending after 1, 2, 5, 20 and 100 turns. It resolved 3-6 ms later. So it would not have stopped the false late verdict the report reproduced.
- A form that allows for the stall would work: re-arm once if the timer itself fired late.
- It still does nothing for starvation across the whole machine.
- Once option 1 is in, a false late verdict costs only a relaunch, so option 2 adds timing code for little gain.

**Cost and size.** About 60-80 lines in pages.ts once the required changes are in, plus 3-4 tests. The report's 30-50 lines is low.
- Memory: in a cascade, more than two Chromiums can exist at once (up to the loads in flight plus 1), each for up to about 35 s.
- The number of launches is the same as today.

**Verifying on CI.** At about 1 failure in 5 Windows runs, it takes about 14 clean runs to show the fix works at 95% confidence (0.8^14 is about 4%). The unit regression tests are the real check.

**Option 4 (raise the limit to 30 s).** 30 s is also Playwright's own kill fallback. It is a defensible one-line stopgap if option 1 waits, but it is not the fix.

**D2 fit.** I agree. Add the close reason as the robust way for D2 to tell its sandbox failure apart from byway's own closes.

### Revised recommendation

1. **Tag byway's own closes with a reason now.** This is tiny and can ship first or in the same commit. Pass a reason to the late browser.close in dispose and to pages.close(). Map that reason in drawFailure/readFailure to a plain message, so a victim says "byway closed the renderer". The next CI failure then identifies itself. Also have CI upload byway-e2e-server.log and the Playwright traces on failure.

2. **Fix with option 1, plus four changes.**
   - (a) A backstop: close a retired browser at the latest timeout + closeTimeout after retiring it. This kills a hung Chromium and covers any mistake in the per-browser count.
   - (b) Put newContext (but not the launch, which keeps Playwright's own launch timeout so a slow CI launch is not cut off at 30 s) under the deadline and the cancel signal, and close any context that arrives after its load gave up. This also closes the gap that exists today (E4b).
   - (c) Count a load from the moment getBrowser returns, and release it in a finally block that also covers a failed newContext. Have pages.close() close retired browsers.
   - (d) In dispose, stop awaiting a pending relaunch.

3. **Tests, with no wall-clock assertions.**
   - A held close with a co-tenant: the co-tenant renders.
   - The retired browser is closed after its co-tenant ends.
   - A browser proxy whose newContext hangs until close() is called: the backstop frees the waiting load and closes the browser.
   - A hung idle browser: the render ends at its deadline, and on a cancel.

4. **Drop option 2, or park it in the backlog with E1's evidence.** If it is ever built, use the form that re-arms when the timer fires late, never "two setImmediate turns".

5. **Park option 3.** Once option 1 and the reasons are in, a repeat of the bare text would prove a crash, which would justify building it.

6. **Record it in an ADR.** Use a new ADR or a section of ADR-0105. Record the escalation's real scope: stuck pages close in milliseconds, so the escalation is only for a hung browser. Record retire-plus-backstop and the newContext bound. Add a backlog row for two possible stall sources to check against the first server log: the spend book's fsyncs on the main thread, and the e2e data folder sitting on C:.

7. **Timing.** It can ship on its own and is small. I would land it before D2 rather than inside it, so D2's Settings switch builds on retiring browsers.

Files:
- Clone: C:\Users\arvik\AppData\Local\Temp\byway-fixes\scratch\diagnose-closed\skeptic1\repo
- Prototype patch: ...\skeptic1\retire-prototype.patch
- Experiments: ...\repo\packages\runner\test\skeptic-exp.test.ts, skeptic-reason.test.ts, skeptic-stuckclose.test.ts
- Suspend helper: ...\skeptic1\tools\suspend.ps1

The main repo is untouched, and no Chromium or Temporal processes I started are left running.

