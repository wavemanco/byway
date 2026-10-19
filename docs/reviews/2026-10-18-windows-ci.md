# Windows CI in byway: what keeps failing, why, and the options

*Written 2026-10-18 for the owner; updated the same evening after D2 merged (main at 8401820). Repository: wavemanco/byway. Workflow: `.github/workflows/verify.yml`. Kept in the repository on 2026-10-19 as it was then; it is not updated. The backlog rows "Known Windows timing flake", "CI time, and the CI proposal the owner deferred" and "Engine-thread stalls on slow machines" carry what is current.*

**What changed since the first version:** D2 is merged, so the renderer fix (ADR-0106) is on main. The D2 branch's final CI run (39172144829) and main's first run after the merge (39177268735) both passed on Windows and Linux at the first attempt. The record is now 14 attempts: Windows 8 green and 6 red, Linux 14 of 14. CI time and the deferred proposal now have a backlog row of their own. No new failure has appeared.

## In short

- byway's CI runs the full check (`pnpm verify`: typecheck, unit tests, then the browser tests) on two GitHub machines, Windows (`windows-2025`) and Linux (`ubuntu-24.04`), on every push to main. It **reports only**: nothing is blocked by a red run (ADR-0103).
- Since the suite took its final form on 2026-10-17, **Linux has passed every time (14 of 14 attempts). Windows has failed 6 of 14**; its last two attempts, including main after D2 merged, passed.
- **No failure has been a bug in what byway does for a person on a normal machine.** Every failure was about **time**: something took longer than a fixed limit on GitHub's slow 2-CPU Windows machine. Four of the limits were in tests. Two were in byway's own code (the start-up check, and the renderer's safety net for stuck pages), and both are fixed on main (the second came with D2, ADR-0106, merged 2026-10-18).
- A Windows run takes **28 to 40 minutes**; Linux takes 14 to 18; the same checks take **about 7 minutes on the owner's machine**.
- The failures came one at a time. Our rule is that a red main is fixed before more merges, and each fix had its own adversarial check and CI confirmation, so each one cost hours. That is what consumed 2026-10-17/18.
- One known flake is named and set aside (C5's 120-second wait per step). More time limits of the same kind remain in other tests. They are inventoried below, and any of them could be the next red run.

## 1. Background: what CI is in byway

- **Decision:** ADR-0103 (the owner's decision D4, 2026-10-16). CI runs `pnpm verify` on Windows and Linux. It reports and blocks nothing. A red run puts a mark on the commit and notifies the account that pushed it.
- **The rule for red runs** (ADR-0103, README "CI"):
  - Rerun once (`gh run rerun <id> --failed`). Still red means a real failure: fix it before merging anything else.
  - A test that fails only sometimes is named in the backlog and set aside, "so red keeps meaning broken".
- **The owner's "middle option"** (2026-10-16): a risky change runs CI on its branch first (`gh workflow run verify.yml --ref <branch>`) and merges only when both jobs pass.
- **The CI proposal** (Linux on every push, Windows weekly, unit and browser tests as parallel jobs): the owner answered "Not now" on 2026-10-18. CI stays as it is, and flakes are named and set aside.
- **What the suite is:**
  - About 4,900 "unit" tests, many of which are really integration tests. They launch a real Chromium (the page renderer) or a real Temporal server (the run engine).
  - About 55 browser tests. Each builds byway's web app, starts byway in demo mode, and drives whole configurations end to end, one test at a time (Playwright `workers: 1`).

## 2. How long a run takes, and why

Measured on the green branch run 39095620441 (2026-10-18), compared with the owner's machine:

| Where | Unit tests | Browser tests | `pnpm verify` total | Whole job |
|---|---|---|---|---|
| GitHub Windows (2 CPUs) | 15.0 min (898 s) | 15.2 min | 30.9 min | 32 min |
| GitHub Linux (2 CPUs) | 9.4 min (566 s) | 5.5 min | 15.4 min | 16 min |
| Owner's Windows machine (16 threads) | about 2 min (126 s) | about 4.2 min | about 7 min | — |

Across all runs, Windows jobs took 28 to 40 minutes when they reached the browser tests, and 18 to 19 when they failed in the unit tests. Linux took 14 to 18.

Why:
1. **GitHub's standard machines have 2 CPUs; the owner's has 16 threads.** The same tests run 5 to 8 times slower there.
2. **The tests are heavy.** Real Chromium and real Temporal servers start many times over, and the browser suite builds the app and runs serially.
3. **Windows is about 1.6 times slower than Linux on the unit tests and 2.8 times on the browser tests.** Process start-up, the filesystem and antivirus scanning all cost more there.
4. **One job runs everything in sequence.** Unit tests, then browser tests.

**Bigger changes do not make CI slower.** Every run executes the whole suite, whatever the size of the change. Run time grows only as tests are added. Fewer, larger pushes mean fewer runs.

**Money** (ADR-0103 §"Money"):
- One run costs about $0.37 to $0.49 at list price.
- At 20 to 70 pushes a month plus the weekly run, that is about $9 to $37 a month.
- These minutes come out of the organization's included minutes, which are shared with its other repositories.

## 3. Every Windows failure so far

Attempts since the workflow's final shape. Linux passed in all of them.

| # | Run (attempt) | Commit | What failed on Windows | Cause | Fix | Status |
|---|---|---|---|---|---|---|
| 1 | 39015137461 (1) | a50bb9d, D4 branch | Unit test: a renderer read of a page with 20,000 elements left open took 42.9 s against its 30 s deadline | **Test** held a machine-dependent read to a fixed time | 8cf9041 (D4 round 2): the test counts the work instead of timing it | Fixed |
| 2 | 39058507534 (1) | 5355073, first CI on main | All tests passed; the browser suite's final check found the start-up line "renderer not available: Chromium did not start within 30 s" | **byway**: the start-up check's 30 s started when the check began, while the app build and engine start took the CPU, so the clock ran out before Chromium got its turn | 0c40ec8: the 30 s count from when byway is ready to print the line | Fixed |
| 3 | 39058507534 (2) | 5355073 | Browser test "F14 … Try again" waited 60 s for a button that never came back | **Test** race: the first retry was still in flight when the test raised the budget, was admitted under it, and the button went away | 0c40ec8: the test waits for the retry's answer first | Fixed |
| 4 | 39079760987 (1) | a3bba97 | Unit test "bounds a page that never settles": 18.8 s against a 14 s limit | **Test**: one of five fixed time limits left in the renderer tests | fx-ci-timing (merged 3a0faf9): all five replaced by counts and held operations | Fixed |
| 5 | 39097581622 (1) | 3a0faf9 | A demo run failed: "The page could not be drawn: … (Target page, context or browser has been closed)" | **byway** (likely; see §4): the renderer's safety net closed the shared browser when a page seemed slow to close, and killed another render in flight | ADR-0106 "retire, don't kill" (D2, merged 8401820) | **Fixed on main**; the rerun (attempt 2) passed, and so have both runs since the fix |
| 6 | 39152075629 (1) | f46726f, D2 branch | Browser test C5: "Nothing happened in 120 s after answering …/cp7-voice" | **Test** wait (120 s per step) while Temporal's own storage stalled for seconds on Windows | — | **Named and set aside** (backlog: "Known Windows timing flake: browser test C5 waits at most 120 s for each next turn") |

The rerun of attempt 2 failed for a different reason (row 3). That is why row 2's run reads as failed overall.

Since row 6: run 39172144829 (D2 branch, a3d271f) and run 39177268735 (main after the D2 merge, 8401820) passed on both systems at the first attempt. In each, Windows passed 4,997 unit tests and 55 browser tests (18.6 to 19.7 minutes for the browser tests), with Chromium inside its OS sandbox.

## 4. Root causes, in three layers

### Layer 1: the machine

GitHub's standard Windows machine is slow and stalls. Two pieces of evidence:
- **Temporal's storage times out on Windows.** Every Windows run log that includes the engine tests shows Temporal's own SQLite storage failing with "context deadline exceeded". There were 5 to 14 lines per run, and none on Linux. In run 39152075629, Temporal's gRPC calls took up to 12 s.
- **byway's own process pauses.** The investigation of failure 5 found pauses of 2.5 to 4.1 s in byway's own process under 2-CPU load locally, and up to 9.5 s at start-up under bursty load.

Likely sources of these pauses:
- synchronous SQLite writes on the engine's main thread (the spend book commits with `synchronous=FULL`);
- the runner's disk (the test data lives on `C:`, which is IOPS-throttled);
- plain CPU starvation.

### Layer 2: tests that assumed time

Several tests said, in effect, "this must finish within N seconds". On a 16-thread machine those limits had wide margins. On a 2-CPU Windows machine that also stalls, they did not. Failures 1, 3, 4 and 6 are this kind.

The fix pattern is the one D4 used for the nesting test, and fx-ci-timing used for five more. A test should never measure time. It counts the work done, holds an operation open so that only the product's own deadline can end it, checks the order of events and the exact message, and keeps only a loose limit that catches a hang.

### Layer 3: byway code that assumed time

Two places in byway itself behaved wrongly when the machine stalled:

- **The start-up check (failure 2).** byway said "not available" for a Chromium that would have started fine. The fix was in 0c40ec8, and D2 improved it further: the check now reports what it had already found when its time runs out, and the diagnostic probe gets its own time limit.
- **The renderer's safety net (failure 5).** The SEC-5 rule says that if a page takes more than 5 s to close, the renderer is treated as stuck and the shared browser is closed. On a stalled machine the close had in fact finished, but byway's timer judged it late, and closing the shared browser killed another run's page.
  - **How sure we are:** reproduced locally by pausing byway's process, with the exact CI message. A Chromium crash gives the same text, and CI kept no server log then, so this is "likely", not proven.
  - **The fix:** ADR-0106, merged to main with D2 (8401820). A late close now **retires** the browser: new pages get a fresh one, and the old one is closed only when its own pages finish. A backstop still kills a truly hung Chromium within a bounded time. byway also names its own closes in error messages, and CI now uploads the server log and Playwright traces when a job fails, so the next such failure can be diagnosed.

**What this means for a person using byway.** Only layer 3 reaches a person, and only on a slow or stalling machine: a laptop on battery, under antivirus, on a slow disk, or in a VM.
- The start-up line could say "not available" wrongly. That is fixed.
- A run that draws several pages at once (C1's parallel drafts, C3, page edits) could fail with "could not be drawn". That is fixed on main since D2 merged. It was never seen on the owner's machine, across about 1,400 page closes under heavy load.

## 5. What is fixed, pending, or set aside

| Item | Where |
|---|---|
| The nesting test measures work, not time | main (D4, ADR-0103) |
| The start-up check's 30 s count from when byway is ready | main (0c40ec8) |
| F14's race | main (0c40ec8) |
| Five renderer-test time limits replaced | main (fx-ci-timing, 3a0faf9) |
| The late-close safety net no longer kills other renders (ADR-0106) | main (D2, 8401820) |
| CI uploads the server log and traces on failure | main (D2, 8401820) |
| The start-up check reports what it knew, and the probe has its own bound | main (D2, 8401820) |
| C5's 120 s per-step wait | Named and set aside (backlog) |

## 6. Time limits still in the suite (any could be the next red run)

Listed by the fx-ci-timing build, 2026-10-18, but not changed:

**Unit tests:**
- `packages/runner/test/page-copy.test.ts`: `BOUND_MS = 5000` in 7 assertions.
- `packages/validator/test/flow-memo.test.ts:73`: under 1,000 ms.
- `packages/recipe/test/limits.test.ts:95`: under 500 ms.
- `packages/runner/test/liveness.test.ts:175`: under 10 s.
- `packages/gateway/test/spend-book.test.ts:235`: under 2,000 ms, and `:255`: under 900 ms.
- `packages/runner/test/memo.test.ts:175`: under 2,000 ms.

**Renderer tests:** after a stuck render or read, the check that the next one works runs under the stuck one's short deadline: 5 s in two tests, 2 s in one. One of those failed once locally under 32-process load.

**Test infrastructure:** Temporal's local test server must start within 5 s, a limit inside Temporal's SDK (backlog row "Runner tests: Temporal's local test server sometimes starts too slowly under load").

**Browser tests:**
- The flow helper waits at most 120 s for each next turn (failure 6).
- One state test waits 30 s for "Sent". It failed once locally under load.

## 7. Options

1. **Keep CI as it is; name and set aside each new flake** (the owner's current choice, "Not now", recorded in the backlog row "CI time, and the CI proposal the owner deferred").
   - **Pro:** no change.
   - **Con:** red Windows runs will keep coming as the remaining limits trip, and each one still costs attention.
2. **Make the rest of the suite time-free,** as was done for the renderer tests (§6).
   - **Pro:** fixes the cause in the tests.
   - **Con:** a few hours of careful work, plus checks.
3. **Run Windows CI less often.** Linux on every push, Windows weekly and by hand. Every merge already passes the full gate on Windows on the owner's machine.
   - **Pro:** no 30–40 minute Windows wait per push, and fewer red marks from a slow machine.
   - **Con:** a Windows-only regression could surface up to a week later. A change to ADR-0103 needs a new record.
4. **Run unit tests and browser tests as parallel jobs.**
   - **Pro:** wall time drops to roughly Windows 16 min and Linux 10 min.
   - **Con:** twice the setup, slightly more minutes.
5. **Use larger GitHub machines** (4 or 8 CPUs).
   - **Pro:** much faster and fewer stalls.
   - **Con:** a higher per-minute price, and an organization setting.
6. **Reduce the stalls themselves.** Move synchronous SQLite work off the engine's main thread, and keep the test data off the throttled `C:` disk on CI.
   - **Pro:** helps slow user machines too.
   - **Con:** product work that needs its own design and checks.

## 8. Recommendation

- **Done:** D2 is merged. It carried the one fix that matters to people (ADR-0106), and a failed job now keeps the server log and traces, so the next failure can be diagnosed. Keep naming flakes.
- **Soon** (one bounded batch, when convenient): do option 2 for the limits in §6. It is the same kind of work as fx-ci-timing, and it removes the remaining known causes of red Windows runs.
- **Revisit option 3** if Windows still goes red on timing after that. The owner's machine gates every merge on Windows anyway.
- **Keep option 6 in the backlog.** It is the one that also helps slow user machines.

## Appendix: useful commands

```bash
gh run list --branch main --limit 1
gh run view <run id> --log-failed
gh run rerun <run id> --failed
gh workflow run verify.yml --ref <branch>
gh run watch <run id> --exit-status
```

Runs referred to: 39015137461, 39044491869, 39058507534, 39079760987, 39095620441, 39097581622, 39137471023, 39149469179, 39152075629, 39172144829, 39177268735 (`https://github.com/wavemanco/byway/actions/runs/<id>`). Records: ADR-0084 (renderer), ADR-0103 (CI), ADR-0105 (sandbox), ADR-0106 (retire, don't kill).
