# ADR-0110: Playwright is updated within two weeks of each minor release; the first update follows the first live run and a baseline of F07's generators

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved: on 2026-10-21 21:27 the owner chose the recommended option "Within two weeks of each release (Recommended)" ([evidence/conversation-continued.md](evidence/conversation-continued.md)). What each update runs, below the owner's words in the Decision, is the backlog row's list, Claude's, not put to the owner |
| **Date (local, UTC−7)** | 2026-10-21 21:27 |
| **Track** | Product |
| **Related** | [ADR-0081](0081-voice-writes-the-persons-copy-exactly.md), [ADR-0084](0084-renderer-launch-without-secrets.md), [ADR-0103](0103-adr-log-rule-and-ci.md), [ADR-0105](0105-renderer-os-sandbox-on-with-an-explicit-off-switch.md), [ADR-0107](0107-code-is-checked-before-it-is-pushed.md) |

## Context

byway draws and reads pages with a pinned copy of Playwright's Chromium: `playwright` and `@playwright/test` are pinned at 1.63.0 (`packages/runner/package.json`, `apps/web/package.json`). A pinned Chromium collects known bugs, sandbox escapes among them, though the OS sandbox has been on by default since [ADR-0105](0105-renderer-os-sandbox-on-with-an-explicit-off-switch.md). The backlog row "Playwright bump policy" asked for a cadence, with no owner decision behind it: "Set the cadence before any distribution, or at the next Playwright upgrade, whichever comes first; the weekly CI run could report when the pinned release falls behind (trigger proposed by Claude, 2026-10-18)".

Each update costs one CI cycle on both systems (a Windows job takes 28 to 40 minutes; backlog row "CI time, and the CI proposal the owner deferred"). The owner said on 2026-10-17: "even if everything passes, over 30 minutes on CI every time isn't practical. We will never get anything done." So a standing cadence is the owner's to set.

F07's arbiter corpus (`packages/runner/test/f07-corpus`, [ADR-0081](0081-voice-writes-the-persons-copy-exactly.md)) is rerun before a Playwright update: its realistic pages are compared with round 14's outcomes and its hand cases with round 13's. Its generators (`gen13.mts`, `gen-v14.mts`) have no recorded outcome. On 2026-10-18 and 2026-10-19 they were only smoke-run, a few pages each, while round 13 ran 300 pages a job, 12 jobs in all. Their outputs are tallies, not pass or fail, so a later run can be compared only with a baseline, and the baseline can be taken only on the version being left behind. The audit of 2026-10-21 found that this baseline, listed as pending on 2026-10-19, had never been put to the owner, and offered it inside the cadence question.

The question, as asked on 2026-10-21 at 19:59: "D4. byway draws pages with a pinned Playwright Chromium (1.63.0; 1.64.1 is out). How often should it be updated? Each update costs one CI cycle on both systems." The options:

- "Within two weeks of each release (Recommended)": "Update within two weeks of each Playwright minor release, sooner for a high or critical Chromium security fix. First update right after your first live run, preceded once by the F07 generators' baseline on today's version (about 6 hours of your machine, no paid calls). The weekly CI run reports when the pin falls behind."
- "Monthly": "A fixed monthly update, with the same checks and the same one-off baseline first."
- "Only when needed": "Update only before a distribution, or when a security advisory names the pinned Chromium. The generator baseline still runs before that first update."

## Decision

In the owner's words, the option chosen on 2026-10-21 at 21:27, "Within two weeks of each release (Recommended)": "Update within two weeks of each Playwright minor release, sooner for a high or critical Chromium security fix. First update right after your first live run, preceded once by the F07 generators' baseline on today's version (about 6 hours of your machine, no paid calls). The weekly CI run reports when the pin falls behind."

1. **The cadence.** Playwright is updated within two weeks of each of its minor releases, and sooner for a high or critical Chromium security fix.
2. **The first update** comes right after the owner's first live run with real keys (backlog "First live run with real keys and real money").
3. **Before it, once, the generators' baseline.** F07's generators run at round 13's size (300 pages a job, 12 jobs, about half an hour a job on the owner's machine, about 6 hours in all, no paid call) on Playwright 1.63.0, the version being left behind, and their tallies are kept in `packages/runner/test/f07-corpus` beside round 13's and 14's outcomes. Later updates compare the generators' tallies with this baseline (backlog row "F07 generators' baseline on Playwright 1.63.0").
4. **The weekly CI run reports when the pin falls behind.** It reports and blocks nothing, as CI does ([ADR-0103](0103-adr-log-rule-and-ci.md)). The report does not exist yet: it is built in batch C of the first block the owner chose on 2026-10-21 at 21:43 ("Two blocks: 0+A+B+C, then W (Recommended)").
5. **What each update runs** (the backlog row's list, Claude's, not put to the owner): the CI cycle on both systems, with the renderer tests and the sandbox on; `packages/runner/test/sandbox.test.ts`, which fails if Playwright's words for a sandbox that cannot start change ([ADR-0105](0105-renderer-os-sandbox-on-with-an-explicit-off-switch.md)), and a re-check of the launch-failure texts ([ADR-0084](0084-renderer-launch-without-secrets.md)); on Linux, whether `scripts/linux/allow-chromium-sandbox.sh`'s pattern still covers the new Chromium; and F07's corpus, the realistic pages against round 14's outcomes and the hand cases against round 13's, with the generators against the baseline. Claude counts an update as a risky change in [ADR-0103](0103-adr-log-rule-and-ci.md) §3's sense, like the renderer's sandbox on Linux, so it runs on its branch first and merges under [ADR-0107](0107-code-is-checked-before-it-is-pushed.md) item 4.

## Alternatives considered

- **Monthly** ("A fixed monthly update, with the same checks and the same one-off baseline first."). Not chosen.
- **Only when needed** ("Update only before a distribution, or when a security advisory names the pinned Chromium. The generator baseline still runs before that first update."). Not chosen.
- **No baseline: read the generators' flags by hand, as ADR-0081 describes.** The backlog row's practice until now. None of the options kept it, since with no recorded outcome an update's tallies have nothing to be compared with.

## Consequences

- Playwright ships about once a month with a new Chromium, so byway's browser stays about six weeks behind at most, by Claude's reckoning when the question was put.
- Each update costs one CI cycle on both systems and the F07 corpus's runs on the owner's machine, about once a month.
- The first update waits for the owner's first live run and for the baseline: about 6 hours of the owner's machine, no paid call.
- Until batch C lands, nothing reports that the pin has fallen behind; Playwright's releases are watched by hand.
- No code changes with this record.

## What this changes in earlier records

Nothing. No Accepted record set a cadence: the backlog row "Playwright bump policy" held the question, and it now points here.

## Evidence

- The question as asked (2026-10-21 19:59 local, 2026-10-22T02:59:16Z) and the owner's answer (21:27 local, 2026-10-22T04:27:30Z) are in [evidence/conversation-continued.md](evidence/conversation-continued.md), under their times.
- The owner on CI time, 2026-10-17 22:19 local: [evidence/conversation-continued.md](evidence/conversation-continued.md).
- F07's corpus and the generators' commands, with round 13's sizes: [packages/runner/test/f07-corpus/README.md](../../packages/runner/test/f07-corpus/README.md).
- The pins: `packages/runner/package.json` and `apps/web/package.json` (1.63.0).
