# ADR-0106: A page late to close retires the renderer's browser instead of closing it under other renders

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved (the owner approved this fix on 2026-10-18 by starting the D2 wave after the investigation's report) |
| **Date (local, UTC−7)** | 2026-10-18 06:50 |
| **Track** | System |
| **Related** | [ADR-0084](0084-renderer-launch-without-secrets.md), [ADR-0081](0081-voice-writes-the-persons-copy-exactly.md), [ADR-0099](0099-paid-operations-keyed-to-their-caller.md), [ADR-0103](0103-adr-log-rule-and-ci.md), [ADR-0074](0074-local-app-security-model.md), [ADR-0080](0080-phase-4-recheck-corrections.md) |

## Context

**The failure.** In one of five Windows CI runs that completed the browser tests (run 39097581622, attempt 1), a C1 demo run failed with "The page could not be drawn: the page renderer failed while drawing it (Target page, context or browser has been closed)." The failure was plain and was not retried, so the run ended. Linux never failed this way. CI kept no server log, so the run itself shows nothing more.

**The mechanism.** Every render and every visitor read (ADR-0081) loads its page in a fresh context on one shared Chromium (`packages/runner/src/pages.ts`). SEC-5's fix (commit 99b52f1, 2026-10-07) bounded each load with a deadline and closed the load's context when it ended. If that close took longer than `closeTimeoutMs` (5 s), `dispose()` forgot the shared browser and closed it, so that a renderer too stuck to close could not hang the engine. No ADR recorded that escalation. Closing the shared browser fails every other render or read in flight on it with "Target page, context or browser has been closed". `drawFailure` and `readFailure` turn that into the plain, non-retried step failure ADR-0099 decision 8 and ADR-0081 ask for.

**The investigation** (2026-10-18; its report and its skeptic's challenge are listed under Evidence) found this likely and reproduced it, though it is not proven for CI.

- **At unit level**, with a context close held past a 1 s limit while another render waited for its image, the other render failed with the CI's exact text.
- **End to end**, with the engine process paused for 6 s every 10 s, one of twelve tests failed with the CI's text. Its server log showed two closes judged late at about 6 s that finished 2 to 3 ms after the pause, and the shared browser was closed with three other loads in flight.
- **Chromium does not have to be slow.** Over about 1,400 closes, Chromium closed contexts with a median of 6 to 79 ms and at most 1.1 s, even pinned to 2 CPUs under load. What makes a close "late" is usually the engine's own thread not running for 5 s or more while a close is pending. The timer and Playwright's driver share one event loop, and after a pause the expired timer runs before the I/O that carries Chromium's answer. Synchronous SQLite writes (the spend book commits with `synchronous=FULL` on the engine's thread), disk stalls and CPU starvation can pause it.
- **On CI, either kind is plausible.** CI's Windows machine has 2 CPUs and runs the browser tests 3 to 15 times slower than Linux, so a close genuinely slowed by starvation is as likely as a pause in the engine.

The skeptic also found:

- **A crash looks the same.** A Chromium that crashes while a render waits gives byte-identical text, so the CI text alone cannot tell the two apart.
- **Stuck pages close quickly.** A busy loop after load, one during parsing, an alert loop, a 20 s unload loop and a runaway memory page each closed in 4 to 5 ms. So a late verdict means a hung browser process, a pause in the engine, or a Chromium starved of CPU, not a stuck page.
- **A gap in SEC-5 (E4b).** `getBrowser()` and `newContext()` ran before the deadline and the cancel were set up. With an idle Chromium suspended, the next render was still waiting in `newContext` 20 s past its 3 s deadline. Nothing would free it: there is no context, so no close is late, and the pipe stays open, so no disconnect comes. A cancel was ignored too.
- **A plain count leaves a hung browser open.** "Close a retired browser when its last load ends" alone let a load parked in `newContext` on a hung browser keep it open, never closed, past 50 s. A backstop closed it at 38.6 s, as the old code did (34.6 s, through Playwright's own 30 s kill).
- **"Look again after two `setImmediate` turns" does not work.** After a 6 s stall that began right after `context.close()`, the close was still pending after 1, 2, 5, 20 and 100 turns, because Playwright's client-to-server hop had not yet left Node. It finished 3 to 6 ms later.
- **A close reason reaches the call under way.** `browser.close({ reason })` makes a pending `page.goto` fail with that reason.

**Who is exposed.** Runs that render several pages at once: C1's parallel drafts (four, each a wide and a phone load), C3, F07's page edits and critics that see cards. VOICE's reads are exposed too.

The owner approved the skeptic's revised fix by starting the D2 wave. D2's Settings switch relaunches Chromium with other options, so it needs the same way to swap browsers without failing the renders on the old one.

## Decision

1. **Retire, don't kill.** If a load's context is not closed within `closeTimeoutMs` after the load is over, its browser is retired, and nothing waits for anything to retire it, including a relaunch already on its way. New loads launch another browser. The loads still on the retired browser finish there. The retired browser is closed when the last of them lets it go. `pages.close()` closes the browser in use and every retired one. The bookkeeping is `packages/runner/src/render-browsers.ts`.
2. **A backstop.** A retired browser is closed no later than `timeoutMs + closeTimeoutMs` after it was retired (35 s with the defaults), however many loads still hold it. Closing a retired browser waits at most `closeTimeoutMs`; after that, Playwright's own close goes on, with its kill fallback.
3. **Each load counts on its browser** from the moment the shared browser is handed to it until its own context has been closed or given up on. That count is released in a `finally`, so a `newContext` that failed releases it too. A browser that crashes or disconnects is forgotten and launched again on the next load (ENG-14, unchanged). `ready()` finds or launches the shared browser without counting; the test page it then draws, on a browser that has drawn nothing yet, is a load like any other ([ADR-0105](0105-renderer-os-sandbox-on-with-an-explicit-off-switch.md)).
4. **Opening the context is under the deadline and the cancel** (closing E4b).
   - From `newContext` to the last screenshot, everything races the load's deadline and its step's cancel. The launch is not under them: it keeps Playwright's own launch timeout, so a slow launch on CI is not cut off.
   - A context that opens after its load gave up is closed as it opens.
   - If a context has neither opened nor closed within `closeTimeoutMs` of its load giving up, the browser is not answering, and it is retired as for a late close.
5. **byway's own closes are named.** Every browser close byway makes gives Playwright a reason that starts "byway closed the page renderer": "… after a page in it took more than 5 s to close" (a retired browser, at its last load or its backstop) or "… as it shut down" (`pages.close()`).
   - A call under way at that moment fails with the reason. A call made afterwards fails only with "Target page, context or browser has been closed", as the probe under Evidence shows.
   - So the renderer also remembers which browsers it closed and why. A load that fails on such a browser is reported with the reason, unless it ended by its cancel or with a step failure of its own (its deadline, a page that navigates away): "The page could not be drawn: byway closed the page renderer as it shut down." for a render, and "The page's text could not be read: …" for a read.
   - It is still one plain step failure, not retried.
   - A failure that says only "Target page, context or browser has been closed" now comes from a browser byway did not close: one that went away by itself, as in a crash.
6. **CI keeps what a failed run leaves.** When a job of `.github/workflows/verify.yml` fails, it uploads two artifacts, kept 14 days: the browser tests' server log (`byway-e2e-server.log`, from the system temp folder) and Playwright's traces and screenshots (`apps/web/test-results`). One of each is uploaded per operating system. The step pins `actions/upload-artifact` by commit SHA (v7.0.1), as ADR-0103 §3 asks, and names nothing secret. A run that passes uploads nothing.
7. **SEC-5's intent holds.** A stuck renderer cannot hang a render, a step or byway.
   - A load ends at its deadline or its cancel, waiting for its context included.
   - The render that owns a stuck context still ends at its limit, plus at most two `closeTimeoutMs` (closing its context, then its browser if it was the last load), as before.
   - A hung Chromium is closed once its last load ends, and in any case within the backstop.

**Not done here.**

- **Not counting the engine's own pause as Chromium's lateness** (the investigation's option 2). With browsers retired, a false late verdict costs one relaunch and no failed render. A form that works (look again once when the timer fired late) adds wall-clock judgement for little gain. It is left in the backlog with the skeptic's evidence.
- **Retrying the victims of a crash** (option 3) is parked. With byway's own closes now named, the bare text repeating would show a crash, which is when to build it.

**What this changes in earlier records.**

- **ADR-0103 §3 (CI)** is extended by item 6. Nothing in §3 becomes untrue: the workflow's token stays read-only (`contents: read`), it names nothing secret, and it pins every action. The upload steps run only when a job fails, so no run has exercised them yet.
- **No other Accepted record changes.**
  - ADR-0084's launch, readiness and relaunch-after-a-crash are unchanged.
  - ADR-0099 decision 8 and ADR-0081 (a renderer failure while drawing or reading is one plain step failure, not retried) still hold. When byway itself closed the renderer, that failure now says so.
  - ADR-0074's "bounds runaway pages" and ADR-0080's "contains errors from closing pages" still hold.
  - SEC-5's escalation to closing the shared browser was never recorded; this record replaces it.

## Alternatives considered

- **Raise the close limit (5 s to 30 s).** One line, and the trigger becomes rarer, since only a 30 s stall would trip it. But it keeps the shared fate and only moves a wall-clock threshold, the kind the CI timing fixes removed elsewhere. The render that owns a hung context would wait up to 25 s longer.
- **A browser per render.** Complete isolation. But a launch measured 60 ms idle and 1.9 to 2.4 s under load, twice per render (wide and phone). On CI the start-up launch once ran past 30 s. Each Chromium uses more memory, and D2's sandbox makes each launch heavier.
- **Retry the victims once.** It would also cover a real crash. But it repeats the render and the relaunch, does not stop the kill, and changes ADR-0099 decision 8 and ADR-0081's rule that such a failure is not retried. Parked (above).
- **Kill only the stuck page** (crash its renderer over CDP). It is targeted, but specific to Chromium. A hung browser process does not answer CDP either, so retiring is still needed.
- **A count without a backstop** (option 1 as first written). It left a hung browser open and a load waiting in `newContext` (the skeptic's E4). With `newContext` now bounded, the count alone would close the browser. The backstop stays as a bound that does not depend on every load on the browser being bounded.
- **Recognise byway's close from Playwright's message alone.** Only a call under way at the close carries the reason, so a load between two calls, such as a read waiting for a file from a CDN, would still show the bare text.

## Consequences

**Positive**

- No render or read fails because another page was late to close, whether Chromium was slow, the engine's thread paused or the renderer was stuck.
- A browser that does not open a context can no longer hold a load past its deadline or its cancel. It is retired and closed, and the next load launches another.
- A render or read that byway's own close stops says so, and the bare Playwright text now points to Chromium going away by itself.
- D2's Settings switch can retire the browser to relaunch Chromium with other options, without failing the renders on the old one. This record adds no call for that yet.
- A failed CI run keeps byway's server log and Playwright's traces, which this failure lacked.

**Negative and residual**

- **More than one Chromium at once.** Two can run at once, or more in a cascade, each for at most 35 s after it is retired. They use more memory, and a hung renderer can keep a CPU busy until the loads on its browser end.
- **A false late verdict still costs a relaunch** (0.1 to 2.4 s measured): an engine pause is still judged as Chromium's lateness (option 2, backlog).
- **A Chromium crash still fails every load on it**, plainly and not retried (option 3, parked).
- **The backstop cannot fire before the count in this code.** Every load on a retired browser started before the retirement and ends within its deadline plus `closeTimeoutMs`; the backstop waits that long from the retirement. So it closes a browser only for a load that never lets go, which only a mistake in the count would make. Its unit test shows that it closes such a browser.
- **The fix is not proven for CI.** The investigation could not see CI's trigger. The fix removes the hazard whatever the trigger, except a crash; the next failure's server log will show its cause.
- **Nothing here differs by operating system.** It is tested on Windows and Linux. macOS is not supported yet.

## Evidence

- **The CI failure.** Run 39097581622, attempt 1 (Windows). The log is at `C:\Users\arvik\AppData\Local\Temp\byway-fixes\scratch\ci-39097581622-windows-failed.log`.
- **The investigation's report**, with its "found" and "challenge" parts: `C:\Users\arvik\AppData\Local\Temp\claude\C--Users-arvik-code-byway\67b5b9ac-8595-4cc6-898a-d7d911b9d422\scratchpad\diagnose-closed-result.json`.
  - The investigator's clone, instrumentation, unit reproductions (`diag-closed.test.ts`) and e2e logs are under `C:\Users\arvik\AppData\Local\Temp\byway-fixes\scratch\diagnose-closed\inv1\`.
  - The skeptic's clone, prototype (`retire-prototype.patch`) and experiments (`packages\runner\test\skeptic-*.test.ts`) are under `...\diagnose-closed\skeptic1\`.
  - The backlog row "A late page close kills other renders" summarised them. This change replaces it with "What the late-close fix left (ADR-0106)".
- **The probe.** Playwright 1.63.0, `browser.close({ reason })`: a pending `page.goto` failed with "page.goto: <reason>". Calls made afterwards failed with "Target page, context or browser has been closed": `page.screenshot`, `browserContext.newPage`, `browserContext.route`, `browser.newContext` and `clock.install`. The log is at `C:\Users\arvik\AppData\Local\Temp\byway-fixes\scratch\d2\retire\probe-reason.log`.
- **This change's tests.** No wall-clock assertions; a close or a context that must be late is held by the test until the renderer has given up on it.
  - `packages/runner/test/pages.test.ts`, "one browser, many renders":
    - a page late to close leaves a co-tenant rendering, and the browser closes after the co-tenant ends;
    - a browser that does not open a context cannot hold a read past its deadline, or a render past its cancel;
    - a context that opens after its render gave up is closed;
    - byway's own close is named in a render waiting for its image, a render between two calls, and a read.
  - `packages/runner/test/render-browsers.test.ts`, with stand-in browsers and fake timers: the count, the backstop, the bounded close, nothing waiting for a launch, a crash, a failed launch, and `close()`.
  - `scripts/test/ci.test.ts`: the upload steps, tied to where `scripts/e2e.ts` and the Playwright config write.
  - Every test in `pages.test.ts` before this change still passes, including the never-settles test's `['context', 'browser']`.
- **Red, then mutations.** Before the fix:
  - the co-tenant test saw the browser closed under the co-tenant (`['context', 'browser', 'context']`);
  - the hung-browser read waited past its deadline until the test's 60 s limit;
  - the victim got the generic message.

  Each new test was then shown to fail with the behaviour it guards taken out of `pages.ts` or `render-browsers.ts`. The red logs and the mutation logs are under `C:\Users\arvik\AppData\Local\Temp\byway-fixes\scratch\d2\retire\`.
