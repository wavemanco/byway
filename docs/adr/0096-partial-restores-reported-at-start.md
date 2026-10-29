# ADR-0096: Partial restores are reported at start and orphan runs are stopped; the renderer's allowlist holds on every redirect hop

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude implemented the verified recommendation from the 2026-10-08 external-review verification under the user's goal "complete implementation of all fixes that can be implemented independent of the four decisions"; not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-08 18:20 |
| **Track** | System |
| **Related** | [ADR-0094](0094-backup-unit-is-the-data-directory.md), [ADR-0078](0078-runs-from-older-engine-versions-end-plainly.md), [ADR-0084](0084-renderer-launch-without-secrets.md), [ADR-0088](0088-provider-boundary-held-keys-and-media-admission.md) |

## Context

[ADR-0094](0094-backup-unit-is-the-data-directory.md) made the whole data directory the backup unit. It left partial restores mostly undetected. Cluster R of the verification designed two pieces for that (item 5), and ADR-0094 left both out of its change:

- **A read-only report at start.** Missing artifact files were found only when something opened them. A restore without `ledger.jsonl` and its head, or with an older pair, reset spend, and the ledger's own check called it intact (probes P1 and P5).
- **Store older than engine.** Start-up reconciliation covered one direction only: the store shows a run as going and the engine has none (OPS-1). A run workflow whose run the store does not have kept running, unnoticed. The gateway refuses calls for a run that has ended, not for one the store lacks, so such a workflow could still spend.

One wave-1 follow-up belongs to this work package as well. The page renderer checked `RENDER_ALLOWLIST` only on a request's first URL. Playwright calls the route handler for that URL only: in playwright-core 1.63 the Chromium network manager continues a redirected request without asking. So a redirect from an allowlisted CDN was followed to any host, the class of F17 ([ADR-0088](0088-provider-boundary-held-keys-and-media-admission.md)) at another boundary.

## Decision

**1. A read-only data-directory report at start.** Before the engine starts, byway prints a `checked` line from `dataDirReport` (`packages/runner/src/data-check.ts`). It covers:

- SQLite's `quick_check`, on its own read-only connection (`checkStore`, `@byway/store`; not part of the contracts' Store);
- every recorded artifact file, missing or not the recorded size, with the runs whose records use it;
- the ledger's hash chain and head (`verifyLedger`);
- runs whose recorded cost is more than $0.01 above what the ledger holds for them. The store keeps each run's cost as the ledger last reported it, so this catches the likely restore that the ledger's own check calls intact.

It reports and never blocks. Refusing spend after a restore lost it is F03's decision. F03's two restore cases sit in `restore.test.ts` as `it.fails` stubs tagged [F03]. Each fails only on today's fail-open outcome, so it turns red when F03 lands. The README's "Spend after a restore" caveat goes in the same change.

**2. One two-way store/engine pass before the worker polls.** `reconcileLostRuns` (`lost-runs.ts`) settles both directions. The store stays the authority on which runs exist:

- Runs the store shows as going that the engine does not run fail plainly, as before (OPS-1).
- Running run workflows on the worker's task queue whose run the store does not have are terminated, with `ORPHAN_RUN_MESSAGE` as the reason.

`settleBeforePolling` (`dev-engine.ts`) runs the C7 retirement ([ADR-0078](0078-runs-from-older-engine-versions-end-plainly.md)) and then this pass, both before the worker polls, so a terminated workflow never runs a step. byway prints what was ended under `engine`. Only the default workspace is scanned for the first direction; v1 has one. An engine ahead of the store on the same run is still not detected.

**3. The renderer's allowlist holds on every redirect hop.** An admitted request is fetched hop by hop through Playwright's request API, with redirects off. Each `Location` must pass the same rule (`allowedUrl`: HTTPS from an allowlisted host). Only GET and HEAD are followed, for at most five hops. Anything else is blocked, and the page gets the final, decoded response. Tests may replace the rule with a predicate (`admit`) for a plain-HTTP local server. Production passes none.

## Alternatives considered

- **Refuse to start when the report finds something.** A missing image should not stop every other run. Failing closed on lost spend is F03's.
- **Anchor the ledger head or a data-directory generation in SQLite.** This overlaps F03's durable accounting and is left to it.
- **Detect an engine ahead of the store on the same run.** It needs per-workflow state queries, out of proportion to a restore the README calls unsupported.
- **Renderer: keep `continue()` and watch `request` events for redirect hops.** That only detects: the hop is already sent when the event fires. A CDP Fetch session of byway's own would compete with Playwright's interception. Fulfilling the 3xx and letting Chromium follow it takes the same auto-continue path, unchecked.

## Consequences

**Positive**

- The likely partial restores are named at start: a lost artifact file, a lost or older ledger, a broken chain, an orphan workflow.
- A run workflow the store does not have is stopped before it runs another step. It may already have run steps, and spent, before the restore; that is not undone.
- The renderer's egress matches the rule the README and spec state.

**Negative**

- Start-up reads every artifact file's metadata and runs `quick_check`. On a very large store that can take a few seconds.
- Requests to the allowlisted CDNs now leave from the engine's Node process, not Chromium's network stack. Node's CA store and proxy settings apply. Each response is held in memory before the page gets it, bounded only by the render deadline and the CDNs' own file limits (backlog).
- Still undetected: an engine ahead of the store on the same run, and an older `exposure.jsonl`.

## Evidence

- [External review verification (2026-10-08)](../reviews/2026-10-08-external-review-verification.md): finding R4 and cluster R's design (item 5); the wave-1 follow-up on the renderer's redirect hops (cluster G, SHOULD-CONSIDER parked).
- The external review, read-only at `C:\Users\arvik\code\byway_review\byway-review.md`: "Release and maintenance actions", item 4.
- Tests:
  - `packages/store/test/check.test.ts`;
  - `packages/runner/test/restore.test.ts`;
  - `packages/runner/test/engine-state.test.ts` (the orphan run);
  - `packages/runner/test/pages.test.ts` (redirect hops; the redirect test fails on the old code with the off-list host reached).

## Later notes

Notes appended under [ADR-0103](0103-adr-log-rule-and-ci.md) rule 1; the Context and Decision above are unchanged.

- **2026-10-22, [ADR-0113](0113-run-inputs-seeds-and-the-held-voice-travel-by-reference.md).** Decision 2's two-way pass now also runs while the engine runs, every five minutes (`reconcileWhilePolling`, `dev-engine.ts`), in both directions. That repeated pass skips queued runs, because a start may be under way, and does not retire runs from an older bundle again. The pass before the worker polls is unchanged and still fails queued runs. So a run whose workflow Temporal closed without byway, on a limit or from outside, is marked failed while the engine runs, not only at the next start; a workflow that Temporal keeps running while its workflow task fails is not caught (ADR-0113, Consequences). The shape is Claude's, in the P2 design the owner approved on 2026-10-21 23:05; its interval, its message (the one used at start) and its lines are Claude's, in the build. Decision 1's report is unchanged. A run's brief, copy deck, draft, tell catalog and VOICE answers are now artifact files the run reads by id (ADR-0113 items 1 to 6). No event names them, so the report lists a missing one with no run named. The step that needs it fails plainly, not retried, saying its file "is missing or damaged in byway's data folder, perhaps from a partial restore", and the run must be started again.
- **2026-10-28, the repeated pass and queued or stuck runs.** The note of 2026-10-22's "That repeated pass skips queued runs" and "a workflow that Temporal keeps running while its workflow task fails is not caught" no longer hold. The repeated pass leaves alone only a queued run Temporal has no workflow for, and closes a queued run whose workflow has closed; and it stops a run workflow whose workflow task is on its fifth try in a row, failing its run plainly ([ADR-0113](0113-run-inputs-seeds-and-the-held-voice-travel-by-reference.md)'s Later note of 2026-10-28 has the details). The pass before the worker polls is unchanged.
