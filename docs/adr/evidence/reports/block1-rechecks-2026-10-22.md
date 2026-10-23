*The three later checks of Block 1, all of 2026-10-22: the re-check of the fix round, the re-check of the second fix round and the privacy check of the third. They were kept only in the session's scratchpad under Temp, as `block1-fix-recheck-result.json` (04:03 local), `block1-round2-recheck-result.json` (10:33) and `block1-round3-check-result.json` (12:08); Claude brought them in on 2026-10-22, in block 2's records pass, each in full and in its file's own order, as [b1-checks-2026-10-21.md](b1-checks-2026-10-21.md) keeps its re-checks. Claude masked them as [block1-check-2026-10-22.md](block1-check-2026-10-22.md) was masked: every passage that described one of the owner's email addresses (RC-1 and its refuters' votes, RC-7, and two lenses' accounts of their scans) is reworded to say only that a description was there; the name of that address's mail provider, where RC-1's refuters and a lens gave it, and the lengths of the two pieces an old test fixture wrote it in (R2-PRIV-1's subject) are masked; and so are the unrelated places where an organisation figure's digits also occur. Claude's words are in square brackets that begin "masked:". The privacy scans found in the results no owner address, none of the parts of one that the scans look for, and no organisation figure; the results held no key-shaped string. The section "How this file was made" says the rest.*

---

# The later checks of Block 1 (2026-10-22)

The reports behind the finding ids that records on main cite from Block 1's fix rounds: RC-1 to RC-7, F2-RC-1 and 2, F3R-1 and 2, RB1-F1-1 to 3 and LC-1 (the re-check of the fix round); B1R2-CODE-1 to 8, R2-PRIV-1, R2-REC-1 to 5 and R2-NOTE-1 and 2 (the re-check of the second fix round); and B1R3-REC-1 to 3 and B1R3-NOTE-1 (the privacy check of the third). [ADR-0111](../../0111-cancel-cuts-off-the-calls-byway-can-stop.md)'s Later notes cite them, as do notes on ADR-0083, ADR-0105 and ADR-0112, the playbook's review and purge rows, rows of the [backlog](../../../backlog.md) and comments in code and tests (the backlog row "Block 1's three later check reports are kept only under Temp" lists them). Each check had lenses and two refuters for each serious finding, who tried to show it was not real. The first check of Block 1 is [block1-check-2026-10-22.md](block1-check-2026-10-22.md).

## How this file was made

- **Masks, by Claude.**
  - At 083ddb8, the Block 1 check report described one of the owner's addresses closely enough to rebuild it (RC-1, blocking). RC-1 and its two refuters quoted that description, restated it and checked it. Each such passage now says only that a description was there, not what it said. So do RC-7's note, which gave the length of the address the commits carry, the first re-check's records-history lens, on which parts of the scan's pattern file match which address, and the second re-check's records-privacy lens, whose list of the terms it scanned for said how the address is formed.
  - RC-1's two refuters and the first re-check's money lens named the address's mail provider; B1R2-CODE-4's second refuter, in an aside on what R2-PRIV-1 found, gave the lengths of the two pieces the old fixture wrote it in. Each is masked. R2-PRIV-1 and its votes say only "the provider".
  - None of the three results gives an organisation figure as written. A lens of the first re-check and one of the second named the unrelated places where a figure's digits also occur; those places are masked, as in b1-checks-2026-10-21.md.
  - Two strings shaped like an address that are not the owner's, a made-up one a refuter quoted whole and the sign-in part of a URL in `packages/runner/test/pages.test.ts`, are masked: the evidence holds no email address (`scripts/test/adr-evidence.test.ts`).
  - The owner asked for these details to go from the first report: at 01:54 the owner chose "Fix all, rewrite history, re-check, branch CI (Recommended)", whose description read in part "Remove the overage figure and your email from the files and from Block 1's unpushed history.", and at 06:40 "Fix them, small re-check, branch CI (Recommended)", whose description began "Reword the report's description of your address" ([conversation-continued.md](../conversation-continued.md), 2026-10-22 01:54 and 06:40). That these answers reach this file too is Claude's reading of them.
  - Square brackets that do not begin "masked:" are the lenses' own.
- **Scans, by Claude.** The three results and this file were scanned with the privacy pattern files kept in the scratchpad (the owner's address parts, without case, and two lists of the organisation's details, each as written and the first without case too), after a probe that each pattern matches a planted string: no hits. This file was also checked with the evidence check's email and key shapes: none, once the two strings above were masked.
- Claude added the headings and the layout. The text is otherwise unchanged. A `<` that GitHub would read as the start of an HTML tag is written `&lt;`.
- Links the lenses quoted from ADR-0111's notes (six) are as they stood there, so from this folder they point nowhere. `scripts/test/adr-evidence.test.ts` does not check this file's links for that reason.
- The line numbers RC-1 and its refuters give in block1-check-2026-10-22.md are those of its version at 083ddb8, before the rewording of 06:40.

The commit ids are the ones the branch had when each check ran. The history rewrites at the owner's answers of 01:54, 06:40 and 10:35 gave the block's later commits new ids, and the purge of 14:35 removed the replaced ones (the playbook's purge row). Each id here that no longer names a commit is listed with the commit main holds in its place, from the rewrites' own maps of old and new ids. The ids the rewrites of 2026-10-21 replaced (11fc3b0, 15acbd2, 481b2e5, 5abafbe, c001ced, eedc340 and f57389c) are in b1-checks-2026-10-21.md's table. The other short hex strings are trees, blobs and hashes as the lenses printed them.

| Cited here | On main |
|---|---|
| 04508f4 | 7735a91 |
| 049918d | 7de1a3c |
| 05fd020 | 3ea91f8 |
| 083ddb8 | 0d36f8a |
| 0d6edde | dc19903 |
| 137bf75 | 886c211 |
| 177b719 | c27ecf0 |
| 18ae018 | ba0adee |
| 2092f9f | 15c74aa |
| 23f9e3c | cda27c3 |
| 264acd4 | 3d0ce86 |
| 3c6cd52 | 960e5ba |
| 44b5f29 | 41bbaa9 |
| 476d54f | 3d0ce86 |
| 48a26fc | 2e503f7 |
| 497e548 | 9293710 |
| 5347b1d | f0d8b49 |
| 56c1347 | 0d36f8a |
| 5b39a9d | 7735a91 |
| 5cb88f9 | 88ee8d9 |
| 5ce7edd | fdf60d1 |
| 5f0786d | 8a8c662 |
| 73bf4ab | 2cf07a1 |
| 773bd9f | cda27c3 |
| 9a6ab87 | e6ffcb8 |
| a52818c | 213fae1 |
| a84c9bb | fdf60d1 |
| a966ea6 | 772fedf |
| b3bf249 | 650eed8 |
| b89c80e | 886c211 |
| cbb2e92 | c1fc822 |
| d665311 | 772fedf |
| daa393a | 66cbab5 |
| e1eb13a | 15c74aa |
| e2121c3 | 8a8c662 |
| e3ded0a | 66cbab5 |
| e438a14 | 126025f |
| e687a17 | 9293710 |
| e6cd3e0 | 960e5ba |
| e95b4c6 | 9ac54d3 |
| e9a1585 | fdf60d1 |
| ea7d1a9 | 60e80f9 |
| f2fc531 | bb737af |
| fd552c8 | bb737af |
| ffff05a | 333728a |

Not kept: the lenses' and refuters' clones, which Claude deleted by 14:05 on 2026-10-22 at the owner's answer of 01:54, "Delete them after the re-check (Recommended)", and the probes, scripts and logs they wrote in the scratchpad, which the text names by their paths under Temp.

## The re-check of the fix round (2026-10-22)

*From `block1-fix-recheck-result.json` (04:03 local). The focused re-check the owner chose at 01:54, "Fix all, rewrite history, re-check, branch CI (Recommended)": five lenses (money, run, web, c-ci, records-history) on the fix round's commits at 083ddb8, against main at a002e60, two refuters for each serious finding, and each of the check's findings marked as the re-check found it. Claude put its findings to the owner at 04:04 and, after the session ended with the question unanswered, again at 06:38; the owner answered at 06:40.*

### Findings that survived the refuters (4)

#### F2-RC-1: ADR-0111 and the backlog misstate how the spend book records two cancel answers for one resumed fal job

*Finding. Severity should-fix; outcome confirmed; lens run; where `docs/adr/0111-cancel-cuts-off-the-calls-byway-can-stop.md:85`.*

**What is wrong:**

The new Consequences bullet that came with RS-2 says "The spend book records the two answers on the one row in the order they arrive (Claude's reading of `abandon` and `release`, which are keyed by the row ...)". docs/backlog.md:128, the row 'Paid-call residuals named only in ADRs', repeats this. It is wrong. The result does not depend on order. `abandon` only moves a row that is open, sent or accepted. `release` moves any row that is not settled, and that includes an uncertain one. `settle` wins over both. So when one attempt's cancel is answered 202 'requested' (abandon: 'may have been billed') and the other's 200 'removed' (release), the row ends released and counts nothing, in either order.

**Evidence:**

packages/store/src/spend-book.ts, the prepared queries: abandon `... WHERE id = :id AND state IN ('open', 'sent', 'accepted')`; release `... WHERE id = :id AND state <> 'settled'`; settle has no state guard except an early return when the row is already settled. paid.ts:460-461 maps a 'maybe' last failure to abandon and a 'none' one to release. fal.ts stoppedGeneration maps 'removed' to cutOffError 'none' and 'requested' or 'failed' to 'maybe'. Probe (scratchpad/recheck-f2-scripts/probe-book.cjs, run in the clone on a real openSpendBook(':memory:'); output in probe-book.log): on an accepted row, abandon then release gives uncertain 0 and uncertainUsd 0; release then abandon gives uncertain 0 and uncertainUsd 0; abandon then abandon gives uncertain 1 and uncertainUsd 0.5.

**When it goes wrong:**

A fal clip step's attempt 1 times out with its job accepted. Attempt 2 resumes the job by its request id. The person cancels while the clip runs. Since RS-2, both attempts send fal's REST cancel. If fal answers one cancel 202 and the other 200 OK (fal's queue page does not document a second cancel), the clip that ran is released and counted nowhere. The ADR tells the owner to check fal's usage records against an order-based reading that does not match the code. The money risk needs fal to give contradictory answers, so it is unlikely. The record is still wrong about a money row in the block's main ADR.

**Proposed fix:**

Reword ADR-0111:85 in place (it is not on main yet) and the backlog row 128 sentence along these lines: each answer acts on the one row by the state it finds. A settled answer wins (settle). Then 'removed' wins (release, which also clears a row another attempt marked 'may have been billed'). Then 'requested' or a failed cancel (abandon, which only moves a row still open, sent or accepted). So a 202 and a 200 for one job count nothing, whichever came first. Keep the check against fal's usage records. Optionally add to the row a trigger to make a release not undo another owner's abandon.

**Refuter 1: confirmed, should-fix.**

**Reasoning:**

I tried to refute F2-RC-1 and could not. Its premise holds, and it reproduces on the real spend book.

1. Both attempts write to the same row. A timed-out attempt's lease is no longer renewed (paid.ts tick: "A cancelled caller's unsettled call is not renewed"). Once that lease runs out, the next attempt's admit resolves the key to `resume` (spend-book.ts #resolveKey: generation job present, not cleared, state accepted or uncertain). admitOnce then sets `opId = resumed?.opId ?? fresh`, so attempt 2's PaidCall carries attempt 1's opId. RS-2 keeps attempt 1 polling, so when the run ends, both run stoppedGeneration and both reach PaidCall.end(). end() (paid.ts:460-461) calls `book.abandon(opId, ...)` when the last failure was 'maybe' (fal 202 'requested', or a cancel that failed) and `book.release(opId)` when it was 'none' (fal 200 'removed'). Neither checks the owner.

2. The outcome does not depend on order. These are the prepared statements in packages/store/src/spend-book.ts:
   - `release`: `... WHERE id = :id AND state <> 'settled'`. It also releases an 'uncertain' row.
   - `abandon`: `... WHERE id = :id AND state IN ('open', 'sent', 'accepted')`. It does nothing to a released row.
   - `settle` has no state guard. It returns early only when the row is already settled.

   So one 202 and one 200 for the same job always leave the row released and counting nothing, whichever came first. A settle beats both.

3. The ADR sentence ("The spend book records the two answers on the one row in the order they arrive (Claude's reading of `abandon` and `release`...)") and backlog row 128 ("records both answers on the one row in the order they arrive (Claude's reading)") give an order-based reading. They leave out the one rule that matters: a 'removed' answer from either attempt clears a "may have been billed" mark set by the other. Strictly, the sentence is misleading rather than stating a false outcome: it names no result. But it is presented as Claude's reading of these exact two functions, and it tells the owner to check fal's usage records against that reading. The reading does not match the code.

4. Severity stays should-fix. The money effect depends on fal giving contradictory answers to two cancels of one job. fal does not document what a second cancel returns, so this cannot be shown to happen. If it did, a clip that may have run would count nothing. The wording sits in ADR-0111, which is not on main yet (`git show a002e60:docs/adr/0111-...` fails), and in a backlog row, both added in this fix round, so both can be corrected in place before the push.

Checked and sound: settle after release and settle after abandon both settle the row at its cost, so the suggested fix's order of precedence (settled, then removed, then requested or failed) is right.

Not checked: what fal actually answers to a second cancel. No keys were used and fal does not document it.

**Evidence:**

Lines added in this fix round: `git diff ba0adee..083ddb8` adds the ADR-0111 Consequences bullet ("The spend book records the two answers on the one row in the order they arrive (Claude's reading of `abandon` and `release`, which are keyed by the row; ...)") and the backlog row 128 sentence ("the spend book records both answers on the one row in the order they arrive (Claude's reading)"). The fix round adds ADR-0111 itself; the file is not on main a002e60.

Code (worktree at 083ddb8):
- spend-book.ts:550 `release: ... WHERE id = :id AND state <> 'settled'`
- spend-book.ts:551 `abandon: ... WHERE id = :id AND state IN ('open', 'sent', 'accepted')`
- spend-book.ts:552-554 `settle`: no state guard; spend-book.ts:188 returns early when the row is already settled
- spend-book.ts #resolveKey: resumes an accepted row whose lease has expired, returning the same opId
- paid.ts admitOnce: `const opId = resumed?.opId ?? fresh`
- paid.ts:460-461: abandon on a 'maybe' last failure, release on a 'none' one
- fal.ts:439-441 (stoppedGeneration): 'removed' gives cutOffError('fal','none'); 'requested' or 'failed' gives cutOffError('fal','maybe')

My own read-only probe (no clone needed, no mutation) imports the worktree's packages/store/src/index.ts with Node 24 and drives the real openSpendBook(':memory:') with a controlled clock. Script: C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/refute-f2rc1/probe.mts. Scenario: owner-a admits a keyed fal clip, marks it sent and accepts generation job req-1. The clock then passes the 60 s lease, and owner-b admits the same key. Output:
- admitB = {"resume":{"opId":"op-a","jobs":{"generation":"req-1"}}} in every case
- A 202 then B 200 (abandon, then release): 0 uncertain rows, uncertainUsd 0, spentUsd 0
- A 200 then B 202 (release, then abandon): 0 uncertain rows, uncertainUsd 0, spentUsd 0
- 202 and 202: 1 uncertain row, uncertainUsd 0.5
- 200 and 200: 0 and 0

Second probe, C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/refute-f2rc1/probe2.mts: release then settle 0.35 gives spentUsd 0.35; abandon then settle 0.35 gives spentUsd 0.35. A settle beats both.

These match the finder's probe-book.log.

**Fix:**

Reword docs/adr/0111-cancel-cuts-off-the-calls-byway-can-stop.md:85 in place, plus the matching sentence in docs/backlog.md row "Paid-call residuals named only in ADRs" (line 128). Suggested text: "Each answer acts on the one row by the state it finds, whichever attempt sends it: a clip already made settles it (settle wins); a 200 'removed' releases it, also clearing a 'may have been billed' mark the other attempt set (release moves any row not settled); a 202 'requested' or a failed cancel marks it 'may have been billed' only while it is still open, sent or accepted (abandon). So a 202 and a 200 for one job count nothing, in either order (Claude's reading of `settle`, `release` and `abandon`)." Keep the check against fal's usage records. Optionally add a trigger to the backlog row: if a live ledger shows a clip cancelled twice with a 202 and a 200, make a release by one owner leave a row the other owner abandoned. No code change is needed for the record fix.

**Refuter 2: confirmed, should-fix.**

**Reasoning:**

I couldn't refute this finding. Neither the owner's answers nor the records turn the sentence into a choice. The builder's hand-off (block1-fix-result.json) offered it as "Claude's reading" of the code, and the only fact behind it was "the spend book's abandon is keyed by row id, not owner". The records pass (04508f4) added "of `abandon` and `release`, which are keyed by the row". So the sentence is a statement about what the code does, and the code does not do it.

The ADR and the backlog say the book "records the two answers on the one row in the order they arrive". That is not how the book works. It keeps one state, and the outcome follows a fixed precedence that does not depend on order:
- settle wins: its SQL has no state guard, and it returns early only when the row is already settled.
- release comes next: `state <> 'settled'`, so it also clears an uncertain row.
- abandon comes last: `state IN ('open','sent','accepted')`, so it does nothing to a released or uncertain row.

In release-then-abandon the abandon is never recorded, and in abandon-then-release it is overwritten. Arrival order matters in only one case: two abandons, where the first one's reason label stays, not the last one's.

The path is reachable as the finding describes:
- paid.ts:460-461 abandons when the last failure is 'maybe' and releases when it is 'none'.
- providers/fal.ts cancelJob maps 200 OK to 'removed', 202 to 'requested', 400 ALREADY_COMPLETED to 'completed', and anything else to 'failed'.
- stoppedGeneration maps 'removed' to cutOffError 'none', 'requested' and 'failed' to 'maybe', and 'completed' to fetching the result and settling.
- A resumed attempt has sent = true, and both PaidCall instances end on the same opId with no owner guard.

The likelier real case runs against the ADR's reading. One cancel gets 200 'removed' (the job was still queued) and the other gets 404 (fed to 'failed' and then abandon). The book ends released, which is right because the job never ran. An order-based reading would predict "may have been billed" when the abandon comes last. In the contradictory 202+200 case, the clip is counted nowhere whichever answer came first. Either way, the owner is told to check fal's usage records against a model the book does not follow.

Why should-fix and not blocking:
- No code changed, and the precedence gives the right money in the likely case.
- The 202+200 under-count needs fal to contradict itself.
- The sentence is Claude's reading of code, not the owner's words.
- The block is unpushed, so the ADR can be reworded in place.

**Evidence:**

I wrote a probe and ran it against the real openSpendBook(':memory:') at 083ddb8, in my own clone C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/recheck-b1-clones/f2rc1-refute (git clone --no-local; pnpm install --frozen-lockfile --offline). It tried every ordered pair of abandon('interrupted'), abandon('failed'), release and settle(0.3) on one accepted row with a $0.50 reservation, and deleted its test file afterwards. 16 of 16 passed. Script: C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/recheck-f2rc1-scripts/probe.cjs. Log: C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/recheck-f2rc1-scripts/probe.log.

Results:
- abandon then release, and release then abandon: uncertain [], uncertainUsd 0 in both orders.
- abandon or release, then settle, in either order: spentUsd 0.3, uncertainUsd 0.
- abandonI then abandonF: uncertain ['interrupted']. abandonF then abandonI: ['failed']. The first label stays.
- Two abandons: uncertainUsd 0.5.

Source checks:
- packages/store/src/spend-book.ts:550-554 has the release, abandon and settle SQL as quoted in the finding, and settle() at line 188 returns early only when the row is settled.
- packages/gateway/src/paid.ts:340-343 marks a resumed call as sent, and lines 459-461 in end() choose settle, abandon or release.
- packages/gateway/src/providers/fal.ts:191-194 (cancelJob) and 435-441 (stoppedGeneration) map fal's answers as described above.

Provenance: block1-fix-result.json has the builder's proposed text "(Claude's reading; check it against fal's usage records ...)" with the fact "abandon is keyed by row id, not owner". 04508f4 put it into ADR-0111:85 and backlog.md:128 (git log -S on ba0adee..083ddb8).

I could not check what fal actually answers to a second cancel of one job: its docs don't say, and I used no keys. I also did not drive the two-attempt path end to end through Temporal. I relied on the code reading plus the book probe.

Out of my area: the clone above should be removed together with the other check clones, as the owner chose.

**Fix:**

Reword ADR-0111:85 in place (it is not on main yet) and the matching sentence in backlog.md:128 along these lines: "Each answer acts on the one row by the state it finds, not by when it arrives. A settled answer wins (settle). Next comes 'removed' (release, which also clears a row the other attempt marked 'may have been billed'). Last come 'requested' and a cancel that failed (abandon, which only moves a row still open, sent or accepted, and keeps the first reason). So a 200 and a 202 for one job count nothing, and a 200 and a failed cancel count nothing, whichever came first (Claude's reading of `settle`, `release` and `abandon`; check it against fal's usage records with the readings above)." Keep the existing trigger. Optionally add a revisit trigger to the backlog row: make a release not undo another attempt's abandon, for example if a live ledger shows a twice-cancelled clip that fal billed but byway released. Records only; no code change is needed.

#### F3R-1: Nothing tests RunScreen's wiring of the RS-5 fix: dropping any of it passes typecheck and every web unit test

*Finding. Severity should-fix; outcome confirmed; lens web; where `apps/web/src/components/run/RunScreen.tsx:109`.*

**What is wrong:**

RS-5 is one of the notes the owner named ("the Run screen's refresh ... after Cancel"). Its pieces are tested: pollDelay, getRunData's `ended`, mergeRunData, runMeter's settledUsd and the panel's under-way line. RunScreen joins them in three places, and no test covers any of the three: line 92 (`const after = ended ? data.ended : undefined`), line 93 (`runMeter(run, events, after?.settledUsd)`) and line 109 (`pollDelay(run.status, after?.callsUnderWay)`), plus the panel prop at line 306. pollDelay (view/run.ts:21) defaults `callsUnderWay = 0`, and runSpend and runMeter (view/meter.ts:37, :46) default `settledUsd = 0`. So a refactor that drops an argument still compiles, and the screen goes back to stopping at Cancelled while uncut calls bill. That is the exact behaviour RS-5 reported. This is the same gap B-test-wiring-uncovered found for the cost line, repeated in the fix for RS-5.

**Evidence:**

Clone at C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/recheck-b1-clones/f3w (083ddb8; `git clone --no-local`; `pnpm install --frozen-lockfile --offline`). Script: C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/recheck-f3-scripts/mutate.mjs. Output: C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/recheck-f3-scripts/mutate-out.txt. Each run is apps/web `pnpm -s run typecheck` plus `pnpm exec vitest run test/`. Baseline: typecheck exit 0, 46 files, 516/516 tests. P1 `pollDelay(run.status)`: typecheck 0, 516/516 pass. P2 `runMeter(run, events)`: typecheck 0, 516/516 pass. P3 `callsUnderWay={0}`: typecheck 0, 516/516 pass. P4 `const after = ended ? undefined : data.ended`: typecheck 0, 516/516 pass. The clone was clean after each run. A grep of apps/web/e2e for 'still under way', 'Spending records' and 'was cancelled' finds no spec that checks the under-way line or polling after a run ends. The specs that press 'Cancel run' (state, composed-start, pasted-key) do not look at either. The fix round's own unit mutations (docs/adr/evidence/logs/block1-fix-mutations-2026-10-22/mutate-unit.mjs) mutate run.ts, meter.ts, run-data.ts, rundata.ts and labels.ts, never RunScreen.tsx. ADR-0111's Later note lists run-screen, api, rundata and runs tests for this change, and none of them renders RunScreen.

**When it goes wrong:**

A later edit to RunScreen (block 2 reworks the run turns) drops `after?.callsUnderWay` from the pollDelay call, or the settled cost from runMeter. The full gate stays green. The person cancels during an image step, and the screen stops polling at 'Cancelled' with the old meter. That is RS-5's original failure ($0.40 shown while the run becomes $0.80), and the panel's under-way line also stays wrong.

**Proposed fix:**

Cheapest fix: make the new parameters required, as YourTurn's `cost` was made required for B-test-wiring-uncovered. That is `pollDelay(status, callsUnderWay: number | undefined)` and `runMeter(run, events, settledUsd: number | undefined)`, with each existing call updated, so a dropped argument fails the typecheck. Better: move the ended-run decision into one pure helper in view/run.ts, e.g. `endedRunView(run, data) -> { delay, settledUsd, callsUnderWay }`. RunScreen then makes one call to it, and run-screen.test.ts tests the helper; prove it by re-running P1 to P4 against it. A browser test would need a demo call that outlives Cancel, which the demo mock does not give (ADR-0111 cuts the mock off). Record it in ADR-0111's Later note as Claude's choice.

**Refuter 1: confirmed, should-fix.**

**Reasoning:**

The finding reproduces exactly at 083ddb8, and I found nothing that refutes it.

1. The code is as the finding quotes it. RunScreen.tsx:92 is `const after = ended ? data.ended : undefined;`, :93 is `runMeter(run, events, after?.settledUsd)`, :109 is `pollDelay(run.status, after?.callsUnderWay)` and :306 is `callsUnderWay={after?.callsUnderWay ?? 0}`. pollDelay (view/run.ts:21) defaults `callsUnderWay = 0`, and runSpend and runMeter (view/meter.ts:37 and :46) default `settledUsd = 0`, so dropping either argument still compiles.

2. No unit test can reach RunScreen. Across the repo, RunScreen is imported only by apps/web/app/runs/[id]/page.tsx, and no test imports that page. run-screen.test.ts tests the view/run.ts helpers and renders RunStatusPanel directly (line 177), never RunScreen.

3. I ran mutations in my own clone, and every one passed. P1, P2, P3, P4 and all three of P1+P2+P3 together each kept the web typecheck at exit 0 with 516 of 516 tests in 46 files. A positive control proves the harness catches failures: changing pollDelay itself (view/run.ts) failed run-screen.test.ts "keeps polling an ended run". The clone was clean after every run.

4. P1+P2+P3 together restores the three wiring lines exactly as they were before the fix (the ba0adee side of the fix round's RunScreen diff). At ba0adee the gate passed 58 of 58 browser tests. The fix round changed only configurations.spec.ts and pasted-key.spec.ts in e2e, and neither change concerns RS-5. ADR-0111 item 2 cuts off the demo's mock and has it reserve $0, so no demo run is left with a call under way after Cancel that any spec looks at. No e2e file contains "still under way". The specs that press Cancel run (state.spec.ts at lines 72, 368 and 424, composed-start.spec.ts at line 94, pasted-key.spec.ts at line 266) check only the 'Cancelled' status, plus unsent words in one of them.

5. The builder's RS-5 mutation list in block1-fix-result.json, and the logged list in the docs diff, change run.ts, run-data.ts, rundata.ts, meter.ts and labels.ts. None changes RunScreen.tsx.

Why should-fix and not blocking: the wiring is correct today. No record claims the wiring is tested: ADR-0111's Later note lists run-screen, api, rundata and runs tests, and each of those catches the piece it covers. So this is neither a false record nor a test that cannot catch what it guards. It is the same kind of gap as B-test-wiring-uncovered (YourTurn's cost not passed on by RunScreen), which the check rated should-fix, in a note the owner named for fixing.

Two corrections to the finding's details:
(a) RunStatusPanel's `callsUnderWay` is a required prop (RunStatusPanel.tsx:29). Deleting the prop at :306 fails the typecheck. Only a wrong value such as `{0}` (P3) gets through.
(b) The suggested fix says a browser test "would need a demo call that outlives Cancel". That overstates it. state.spec.ts already intercepts the run poll with page.route and route.fulfill (lines 87-120), so a spec could add `ended: { callsUnderWay, settledUsd }` to the poll answer after Cancel. A static render of RunScreen could also catch P2 to P4 (the meter figure, the under-way line). P1 is the exception: polling happens in usePolling's useEffect (useRefresher.ts:58-67), so a render cannot see it. P1 needs the required parameter or the pure-helper fix.

Not checked: I did not run the browser suite against P1 to P4. The e2e conclusion rests on point 4 above.

**Evidence:**

My own clone, made with `git clone --no-local --branch fix/fx-block1` at HEAD 083ddb8365912240c7ea45e8822d5fbc8b8ef047, then `pnpm install --frozen-lockfile --offline`, exit 0: C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/recheck-b1-clones/f3r1-refute

Script: C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/recheck-f3r1-scripts/mutate.mjs
Output: C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/recheck-f3r1-scripts/mutate-out.txt

Each run is apps/web `pnpm -s run typecheck` (next typegen && tsc --noEmit) plus `pnpm exec vitest run test/`.
- base: typecheck 0; 46 files and 516 tests passed.
- CTRL (view/run.ts `return callsUnderWay > 0 ? 3000 : null;` changed to `return null;`): vitest exit 1. Failed: run-screen.test.ts "keeps polling an ended run, lazily, while some of its calls are still under way".
- P1 `pollDelay(run.status)`: typecheck 0; 516 of 516 passed.
- P2 `runMeter(run, events)`: typecheck 0; 516 of 516 passed.
- P3 `callsUnderWay={0}`: typecheck 0; 516 of 516 passed.
- P4 `const after = ended ? undefined : data.ended;`: typecheck 0; 516 of 516 passed.
- P1+P2+P3 together: typecheck 0; 516 of 516 passed.
- `git status --porcelain` on the clone afterwards: empty.

Supporting reads:
- `git grep RunScreen` outside src and docs finds only app/runs/[id]/page.tsx and a comment in configurations.spec.ts:175.
- `git diff ba0adee..083ddb8 -- apps/web/src/components/run/RunScreen.tsx` shows the old lines `runMeter(run, events)`, `pollDelay(run.status)` and the RunStatusPanel without callsUnderWay.
- `git diff --stat ba0adee..083ddb8 -- apps/web/e2e` lists only configurations.spec.ts (+6) and pasted-key.spec.ts.
- RunStatusPanel.tsx:29 reads `callsUnderWay: number;`, a required prop.
- ADR-0111 line 39: the demo's mock "reserves $0, so a cut-off mock call counts nothing".

**Fix:**

Do as the finding suggests, with these adjustments.
1. Cheapest fix: make the new parameters required. Use `pollDelay(status: RunStatus, callsUnderWay: number | undefined)` and `runSpend/runMeter(run, events, settledUsd: number | undefined)`, and update the existing calls (run-screen.test.ts and runs.test.ts call them with two arguments). Dropping an argument then fails the typecheck. This does not catch the P3 and P4 kind of mutation, a wrong value or a flipped ternary.
2. Better: one pure helper in view/run.ts, for example `endedRunView(status, ended) -> { delay, settledUsd, callsUnderWay }`. RunScreen makes a single call to it, and run-screen.test.ts tests the helper. Re-run P1 to P4 against it and record the results in the round's mutation log.
3. Optionally, a browser check that needs no demo call outliving Cancel: in a state.spec.ts-style test, after Cancel, use page.route to fulfill the run poll with `ended: { callsUnderWay: 1, settledUsd: <higher figure> }`. Then assert the under-way line, the meter's figure, and that a further poll is made.
4. Record the choice in ADR-0111's Later note as Claude's choice, beside the tests it already lists.

**Refuter 2: confirmed, should-fix.**

**Reasoning:**

I could not refute F3R-1. Its facts hold, the gap is not a choice the owner made, and no record files it as a limit with a trigger.

1. Nothing in the gate can see RunScreen's RS-5 wiring.
   - The root vitest config includes packages/*/test, apps/*/test and scripts/test.
   - A git grep of every .ts, .tsx and .mjs file for RunScreen or runs/[id]/page finds only these: page.tsx, RunScreen.tsx itself, draftStore.ts, a comment in e2e/configurations.spec.ts, and the fix round's e2e mutation script. No unit test imports RunScreen, directly or through page.tsx. No test reads its source either.
   - run-screen.test.ts renders RunStatusPanel and tests pollDelay and underWayNote directly. It never renders RunScreen.
   - Typecheck cannot catch a dropped argument. pollDelay(status, callsUnderWay = 0) is at view/run.ts:21; runSpend and runMeter(..., settledUsd = 0) are at view/meter.ts:37 and :46. RunStatusPanel's callsUnderWay prop is required, but `{0}` still satisfies it. P4 is a logic swap with the same types.
   - The specs that press 'Cancel run' (state.spec.ts:72/368/424, composed-start.spec.ts:94, pasted-key.spec.ts:266) check only that .run-status reads 'Cancelled'.
   - The demo cuts off its own mock (ADR-0111), so no browser test ever has a call still under way after a run ends.
   - The line numbers the finding gives (92, 93, 109, 306) match 083ddb8.

2. Not the owner's choice, and not recorded as a limit.
   - The owner named RS-5 to be fixed ("the Run screen's refresh and wording after Cancel").
   - ADR-0111's Later note lists run-screen, api, rundata and runs tests for the change and says nothing of the wiring.
   - No backlog row and no builder hand-off mentions it.
   - The fix round's mutate-unit.mjs mutates run.ts, meter.ts, run-data.ts, rundata.ts, labels.ts and RunStatusPanel, but never RunScreen.tsx. Its e2e script mutates RunScreen once (E1), for the cost line only.
   - The same builder, in the same commit (5c55592), closed this kind of gap for the cost line: it made YourTurn's `cost` required and added a C4 browser check. It did not do the same for the RS-5 wiring. So the fix round repeats B-test-wiring-uncovered, which the check rated should-fix and the owner told the builders to fix.

3. Why should-fix and not blocking or note.
   - Not blocking: no test claims to guard the wiring and fails to, and the code at 083ddb8 behaves correctly.
   - Not note: under P1 the screen would do worse than RS-5's original failure. Suppose the first snapshot after Cancel has callsUnderWay=2. The panel says '2 AI calls ... still under way; the cost shown is brought up to date as they end', but polling has stopped. That sentence about money stays wrong on screen. P4 brings back RS-5's original behaviour exactly.

4. Two places where the finding overstates.
   - P2 (the meter ignores settledUsd) is narrower than 'the exact behaviour RS-5 reported'. settleLateCost (liveness.ts:177, called in the activity wrapper's finally, index.ts:79) raises run.costUsd once the call's invocation ends. While polling continues, the meter mostly catches up through the run record. It stays stale only if settleLateCost fails (its error is caught and ignored, best effort), or if the last poll lands between the call settling and settleLateCost writing.
   - The 'cheapest fix', making the parameters required, catches P1 and P2 only. It does not catch P3 (`callsUnderWay={0}`) or P4 (the inverted `after`). Only the pure-helper approach, or a render test, covers those.

**Evidence:**

- RunScreen.tsx at 083ddb8:
  - :92 `const after = ended ? data.ended : undefined;`
  - :93 `runMeter(run, events, after?.settledUsd)`
  - :109 `pollDelay(run.status, after?.callsUnderWay)`
  - :306 `callsUnderWay={after?.callsUnderWay ?? 0}`
- Defaults: view/run.ts:21 `callsUnderWay = 0`; view/meter.ts:37 and :46 `settledUsd = 0`.
- Who uses RunScreen: a git grep for RunScreen or runs/[id]/page over *.ts, *.tsx and *.mjs finds only app/runs/[id]/page.tsx, RunScreen.tsx, draftStore.ts, a comment in e2e/configurations.spec.ts, and docs/adr/evidence/logs/block1-fix-mutations-2026-10-22/mutate-e2e.mjs. That script's one RunScreen mutation is E1, cost={null}.
- What run-screen.test.ts imports: RunStatusPanel, labels and view/run helpers, not RunScreen.
- What the browser specs check after 'Cancel run': state.spec.ts cancelRun (:69-74) and :424, and composed-start.spec.ts :94, assert only `.run-status` toHaveText('Cancelled'). Nothing checks 'still under way' or the meter.
- Records: the block1-fix-result.json mutation list for RS-5 covers pollDelay, run-data, rundata, meter and underWayNote, not RunScreen. Its B-test-wiring-uncovered entry says the builder made `cost` required (TS2741) and added an e2e check.
- No record of the gap: ADR-0111 Later note (line 116) and docs/backlog.md have no row about it.
- The finding's clone at C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/recheck-b1-clones/f3w is at 083ddb8365912240c7ea45e8822d5fbc8b8ef047 with a clean `git status --porcelain`.
- That lens's output, C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/recheck-f3-scripts/mutate-out.txt, shows P1 to P4 each with typecheck exit 0 and 516/516 tests passing.
- I did not re-run the mutations in a clone of my own. Since no test imports RunScreen and the parameters have defaults, the outcome follows from the code. I also did not run a real-provider cancel, so I did not observe the P2 race window directly; it is inferred from where settleLateCost runs in activities/index.ts:79.

**Fix:**

Before the push, make the gate fail when any of P1 to P4 is applied:
- (a) Move the ended-run decision into one pure helper in view/run.ts, for example `endedRunView(status, ended) -> { delay, settledUsd, callsUnderWay }`. RunScreen calls it once, and run-screen.test.ts tests it.
- Or (b) make pollDelay's callsUnderWay and runMeter/runSpend's settledUsd required (`number | undefined`), which catches P1 and P2. Then add a renderToStaticMarkup test of RunScreen, which Next already renders on the server so it can be rendered the same way, with a cancelled run and `ended: { callsUnderWay: 2, settledUsd: 0.8 }`. Assert the under-way line and the $0.80 meter; that catches P2 to P4.

Either way, re-run P1 to P4 with mutate.mjs and record that each one fails. Add a line to ADR-0111's Later note saying the wiring is now tested, and by what (Claude's choice).

#### RC-1: The Block 1 check report brought in by 5ce7edd still describes the owner's second email address closely enough to rebuild it

*Finding. Severity blocking; outcome confirmed; lens records-history; where `docs/adr/evidence/reports/block1-check-2026-10-22.md:97`.*

**What is wrong:**

The records pass masked the @ forms in the imported check report. It left in a refuter's description of [masked: one of the owner's addresses; what the description gave of it is not repeated here]. So the text holds a part of the owner's email in a form no pattern finds. The file's header says "every fragment of the owner's email address [is] masked", and the evidence README row says the email is masked. The owner's answer of 01:54 says "Remove the overage figure and your email from the files and from Block 1's unpushed history."

**Evidence:**

Lines 90, 96 and 97 [masked: describe the address; what they say of it is not repeated here]. With these lines, a reader [masked: is close to the whole address]. git log -S finds this text only in 5ce7edd (which added the file) and 083ddb8 (which edited its header). The pre-rewrite e9a1585 has the same tree as 5ce7edd. The Temp original that was sent to the owner at 08:47:47Z has the same sentences (grep -c 2), so this is new exposure through the import. The import was not a redaction gap the owner saw. My scan of every blob and message of the 60 commits found no spelled part of either address. The test and the scans look for spellings, so they cannot see a description like this one.

**When it goes wrong:**

The block is pushed and merged --no-ff. Main is never rewritten, so a description that [masked: comes close to giving] the owner's address stays on GitHub for good. The header and the evidence README would also say falsely that every fragment was masked. This is the exposure the owner asked to have removed from the files and the unpushed history.

**Proposed fix:**

Before the push, reword lines 90, 96 and 97 to say only that the userEmail context held another of the owner's addresses. Drop [masked: every detail of the address they give]. Then rewrite the last two unpushed commits (5ce7edd, 083ddb8) so that no branch commit holds the old text, as the owner's 01:54 answer already chose for the email. Re-run the history scan on the new range.

**Refuter 1: confirmed, blocking.**

**Reasoning:**

I tried to refute RC-1 and could not. Every claim it makes that matters holds on 083ddb8, and the one slip I found does not change the result.

What I reproduced, read-only, in the fx-block1 worktree:
1. The text is there. docs/adr/evidence/reports/block1-check-2026-10-22.md [masked: describes the address at lines 90, 96 and 97; what it says of it is not repeated here]. So a reader [masked: is close to the whole address].
2. No spelling-based check can see it. `git grep` [masked: for the address as it would be spelled] finds 0 hits in the tree at 083ddb8 and 0 in the messages of a002e60..083ddb8. adr-evidence.test.ts has WHOLE_ADDRESS and three SPLIT_ADDRESS patterns. None of them matches line 96, because a quote follows the @, or line 97, because there is no '@' and no 'dot &lt;ending>'. So the gate passes while the description stays in the file.
3. The fix round brought this in. The text is not at a002e60 (git grep exit 1). In a002e60..083ddb8, `git log -S` finds [masked: each of the describing phrases] only in 5ce7edd. The only other hit is 7715586 for "local part", and that is the test's own comment, not the address.
4. The records say more than is true. The header (line 1) says "every fragment of the owner's email address [is] masked". The evidence README row (line 14) says "the owner's email masked". But line 97 still spells [masked: part of the address] in quotes.
5. Masking only the @ forms is not enough. I compared the Temp original sent to the owner (byway-block1-check-2026-10-22.md in the scratchpad) with the repo copy. The only lines that differ are 87-88 and 95 in the original, which are 89-90 and 97 in the repo copy. Each change replaces a '&lt;local>@…' form with "[email fragment masked]". The describing sentences are word for word the same in both: one hit for each phrase in each file. The owner's chosen option ("Remove the overage figure and your email from the files and from Block 1's unpushed history") is carried out only in letter. Pushing, with main never rewritten after a --no-ff merge, would keep the rest for good.

The slip in the finding: `git log -S` lists only 5ce7edd, not 083ddb8. 083ddb8 changed only the header line, so the count of matches did not change. Its tree still holds the text (git grep at 083ddb8 hits lines 89, 90 and 97), so the point stands. Also, e9a1585 has the same tree as 5ce7edd (7e2f6e48 for both), but `git branch -a --contains e9a1585` is empty. It is not reachable from any branch and would not be pushed.

Severity: blocking. This is the owner's email in part, in the tree and in an unpushed commit of the range. It fails a removal the owner chose, and two records say it is fully masked. The earlier SEC-PRIV-1 refuters graded the spelled fragment should-fix because the repo is private, and that argument applies here too. But the owner has since chosen removal from the files and the unpushed history, and the brief's blocking classes cover the owner's email and a broken rule.

What I could not check: I did not confirm the description against the session's subagent logs. A scan that would have printed only counts was refused by the permission classifier (PII handling), and I did not try to get around that. So the claim that the description matches the real second address rests on the report's own refuter text. The description does agree with itself throughout.

**Evidence:**

Repo-relative paths, in the fx-block1 worktree at 083ddb8:
- `grep -n -o` on docs/adr/evidence/reports/block1-check-2026-10-22.md: [masked: the describing phrases, at lines 90, 96 and 97].
- Line 1 (header): "The organisation's figures and every fragment of the owner's email address are masked; the email fragments are also described here without their @ form."
- docs/adr/evidence/README.md, line 14: "...with the organisation's figures and the owner's email masked".
- `git grep -c` [masked: for the address as it would be spelled] at 083ddb8: no hits (exit 1). Range messages: 0 hits. So no spelled form exists, only the description.
- `git log --oneline -S` [masked: for each of the describing phrases] over a002e60..083ddb8 gives 5ce7edd, and so does `-G` [masked: for one of them]. `git grep -c` [masked: for one of them] at a002e60 returns exit 1, so main does not have it.
- `git rev-parse e9a1585^{tree} 5ce7edd^{tree}` gives 7e2f6e48 for both. `git branch -a --contains e9a1585` is empty.
- Temp original compared with the repo copy: `diff` shows changes only at 0a1,2 (the new header), 87,88c89,90 and 95c97. Each change only swaps an '@' form for "[email fragment masked]". Every describing phrase appears once in each file.
- scripts/test/adr-evidence.test.ts, lines 75 and 86-90: WHOLE_ADDRESS needs '@' and a dotted domain. SPLIT_ADDRESS[0] needs '@' followed only by space, slash or backslash before the provider, and line 96 has a quote there. [1] needs bracketed 'at'. [2] needs '&lt;x> at &lt;provider> dot &lt;ending>'. None of them matches lines 90, 96 or 97.
- docs/adr/evidence/conversation-continued.md, line 563: the chosen option says "Remove the overage figure and your email from th[e files and from Block 1's unpushed history]".

**Fix:**

Before the push:
1. In docs/adr/evidence/reports/block1-check-2026-10-22.md, reword lines 89, 90, 96 and 97 to say only that "the userEmail context held another of the owner's addresses, not the git author address". Remove:
   - [masked: each detail of the address those lines give]
2. Change the header (line 1) and the evidence README row so they say what was actually removed: the address and every description of it.
3. Then rewrite only the last two unpushed commits, 5ce7edd and 083ddb8. They are the branch tip, so no other commit id changes. After that, no commit of a002e60..HEAD should hold the old sentences.
4. Re-run the same scans on the new range. Run `git log -S` and `-G` for [masked: four of the describing phrases]; all four should be empty. Run `git grep` at the new HEAD as well.

The descriptions cannot be caught by a general pattern, so this fix is records-only. Optionally, the records pass could add a review-checklist line: an email's length, prefix or provider counts as a fragment.

**Refuter 2: confirmed, blocking.**

**Reasoning:**

I tried to refute RC-1 four ways. None of them works.

(1) Is the description accurate? I opened the pre-rewrite blob that is still in the local object store (e438a14:docs/adr/evidence/reports/b1-checks-2026-10-21.md, line 3866) and checked it with a script that prints only booleans and lengths. [masked: What it found is not repeated here.] So the report's lines 90, 96 and 97 describe the owner's second address correctly.

(2) Can the public repo fill in [masked: the rest of the address]? I tested whether [masked: the rest] comes from any part of the commit-author address that main already carries. It does not, so the finding's [masked: count of candidates] stands, and it is small enough to enumerate by brute force.

(3) Did the owner choose or allow this? No. The owner did see these sentences in the report sent at 01:47 local. The copy in the scratchpad (scratchpad/byway-block1-check-2026-10-22.md) has the same [masked: describing] sentences. But at 01:54 the owner chose "Remove the overage figure and your email from the files and from Block 1's unpushed history." The owner was never asked to put the report into the repository. The records pass (block1-fix-records-result.json) did not bring it in either. It only advised "Bring them in, redacted". The import was Claude's own choice in 5ce7edd, at 03:23, after the owner's answer. That commit's message gives the reason for describing the fragments "without their @ form": "so the evidence email check ... passes". That is a reason to get past the test, not a privacy reason. No owner answer, ADR or backlog row records a limit that allows this description.

(4) Is it a false record? Partly. The header does disclose that "the email fragments are also described here without their @ form". So it does not hide that descriptions exist. But the same sentence says "every fragment of the owner's email address [is] masked", and that is false: line 97 spells [masked: part of the local part] in quotes. The evidence README row says the same ("the owner's email masked"). The finding actually understates this. It says no spelled part exists, but [masked: part of it] is spelled verbatim. [masked: Why the scans miss it is not repeated here.]

Minor inaccuracies that do not change the verdict:
- `git log -S` lists only 5ce7edd. 083ddb8 edited the header without changing how often the string occurs. Both trees do hold the text.
- The [masked: other address the report names] is the commit-author address, which main's metadata already holds. [masked: What the report says of it] and the list of days are not exposures in themselves, so dropping them is optional.

Why blocking and not should-fix:
- The SEC-PRIV-1 refuters graded the whole fragment should-fix because the repository is private.
- After that, the owner decided the email must leave the files and the unpushed history before the push.
- The re-check brief classes the owner's email in any commit of a002e60..083ddb8 as blocking. This text keeps most of that email ([masked: what it gives]) in two unpushed commits, against the owner's chosen removal.
- After the --no-ff merge, main is not rewritten, so this is the last point where removal is cheap.

**Evidence:**

- **Repo copy at 083ddb8:** docs/adr/evidence/reports/block1-check-2026-10-22.md
  - Lines 90, 96 and 97 [masked: describe the address; their words are not repeated here].
- **Pre-rewrite blob:** a Node probe of e438a14 line 3866, printing no values, returned [masked: an answer that the description is right].
- **Public author metadata:** a second probe over the author and committer addresses on main returned [masked: an answer that main's one author identity does not give the rest of the second address]. So [masked: the finding's count of candidates] remains, and the second address is not already public.
- **Sent report vs repo copy** (counts only): the sent copy has [masked: one hit for each of four describing phrases]. The repo copy has the same counts plus 6 "[email fragment masked]". Neither holds the fragment or the local part spelled whole (counts 0).
- **Where the text lives:**
  - `git grep` for [masked: the describing phrases] at 083ddb8 finds the description only in this file. The other hits are adr-evidence.test.ts's doc comments, which are generic.
  - `git log -S` over a002e60..083ddb8 lists only 5ce7edd.
  - e9a1585^{tree} = 5ce7edd^{tree} = 7e2f6e48.
  - 5ce7edd is contained only in refs/heads/fix/fx-block1, and origin has no fix/fx-block1, so it is unpushed.
- **Commit message of 5ce7edd:** "with the organisation's figures and every fragment of the owner's email address masked; the email fragments are also described without their @ form, so the evidence email check (which now finds split addresses) passes."
- **Evidence README line 14:** "with the organisation's figures and the owner's email masked".
- **Owner, conversation-continued.md:** the option was asked at 01:48 and answered at 01:54, quoted above.
- **Records pass result:** "I did not bring them in ... Bring them in, redacted".
- **Not checked:** whether any other repository or remote holds this text (the commits show as unpushed). Also any recheck-b1-clones made from this branch, which would carry it locally; the owner already chose to delete the clones after the re-check.
- Probe scripts are under the scratchpad at rc1-refute/ (probe.mjs, cmp.mjs, guess.mjs). [masked: Why it gives these paths relative to the scratchpad is not repeated here.]

**Fix:**

Before the push:
1. In docs/adr/evidence/reports/block1-check-2026-10-22.md, reword lines 89–90 and 96–97. They should say only that the session's userEmail context held another address of the owner's, and that the lens copied it into the B1 checks report in a split form. Drop all of these:
   - [masked: each detail of the address those lines give]
2. Fix the header's "every fragment ... masked; the email fragments are also described here" so it is true. For example: "the owner's email address is masked and not described".
3. Because 5ce7edd and 083ddb8 are the last two unpushed commits, re-make just those two so that no branch commit holds the old text (for example, re-commit 5ce7edd's change with the reworded file, then re-apply 083ddb8). No filter tool is needed. Earlier ids do not change, so the playbook and README ids that 083ddb8 cites stay valid.
4. Re-run the history scan over a002e60..new-head, adding a search for the descriptive phrases ([masked: three of them]), and re-run adr-evidence.test.ts.
5. Leave the old objects (e9a1585, the old 5ce7edd and 083ddb8) local and unreachable, like the earlier pre-rewrite commits. The playbook row on local pre-rewrite commits could name them.

#### RC-2: Playbook row 51 says this rewrite's replaced commits are dangling like the earlier ones and that git gc --prune=now removes them, but two reflogs still hold them

*Finding. Severity should-fix; outcome confirmed; lens records-history; where `docs/playbook.md:51`.*

**What is wrong:**

The row says the 2026-10-22 rewrite "leaves the commits it replaces (from e438a14 on ...) in the checkout the same way", meaning dangling, held by no ref, and (per the earlier fsck) by no reflog. It also says `git gc --prune=now` in the checkout removes them. In fact the reflog of fix/fx-block1 and the fx-block1 worktree's HEAD reflog still point at the pre-rewrite e9a1585, 05fd020 and 18ae018. Those commits keep every replaced ancestor alive, including the blobs that hold the overage figure and e9a1585's copy of RC-1's text. gc --prune=now does not prune objects that a reflog entry younger than gc.reflogExpireUnreachable (30 days) points at.

**Evidence:**

I ran read-only `git reflog show fix/fx-block1` in C:/Users/arvik/code/byway: 20 entries, 3 of them pre-rewrite commits (e9a1585, 05fd020, 18ae018). `git -C .worktrees/fx-block1 reflog show HEAD`: 21 entries, the same 3. The HEAD and main reflogs hold none of the 2026-10-21 ids, which matches the row's account of the earlier rewrites. `git for-each-ref --contains` for e438a14, 18ae018, e9a1585, 05fd020 and b3bf249 returns nothing, so no push sends them. A --no-local clone (recheck-b1-clones/lc, and my own rec-email) holds none of e438a14, 11fc3b0, 481b2e5 or 18ae018.

**When it goes wrong:**

The owner follows the row's command to purge the organisation details from the checkout. git gc --prune=now leaves the overage-bearing blobs from the 2026-10-22 rewrite in .git for up to 30 days, or for as long as the fx-block1 worktree and branch reflogs last. A copy or backup of the .git folder then carries them, which the row says pruning prevents.

**Proposed fix:**

Say in the row that this rewrite's replaced commits are still held by fix/fx-block1's reflog and the fx-block1 worktree's HEAD reflog. Give the commands as `git reflog expire --expire-unreachable=now --all` (all worktrees by default), then `git gc --prune=now`, still at the owner's say, since this is a permanent local deletion.

**Refuter 1: confirmed, should-fix.**

**Reasoning:**

The finding reproduces in every part I tested. Row 51 of docs/playbook.md (last changed in the fix round by 04508f4) says the 2026-10-22 rewrite "leaves the commits it replaces (from e438a14 on ...) in the checkout the same way". The row's first sentence defines that way: dangling objects that no ref holds and, per the audit's fsck, no reflog holds either. The row then says `git gc --prune=now` in the checkout removes them.

That account fits the 2026-10-21 commits but not this rewrite's. Two reflogs still hold this rewrite's replaced commits: the reflog of refs/heads/fix/fx-block1 (in the common .git/logs) and the HEAD reflog of the fx-block1 worktree. `gc --prune=now` keeps every object those reflogs reach. gc expires a reflog entry only once it is older than gc.reflogExpireUnreachable (30 days by default, not set in this repo's config), and these entries are from today.

Severity stays should-fix, not blocking. The held objects are reachable from no ref and lie outside a002e60..083ddb8, so no push sends them; `git for-each-ref --contains` returns nothing for them. The fault is a wrong local-cleanup instruction in a record. It is not a leak in the tree or the pushed history, and it does not misstate the owner's words.

Side effect of the same fault: the row's "Left alone, git's automatic gc prunes them once they are two weeks old" is also wrong for this rewrite's commits. Their reflog entries must expire first (30 days), and only then does the two-week prune window apply.

Checked and sound: the 2026-10-21 ids the row names (eedc340, 11fc3b0, 15acbd2, 481b2e5, c001ced, 5abafbe, f57389c) are listed as unreachable by fsck, and the rev-list --reflog closure does not include them. The row is accurate for those. No refs/original and no refs/stash remain.

Not checked: the earlier rewrites' clones under b1check-clones, and whether other scratch clones copied the reflog-held objects. Those clones are outside this finding's claim.

**Evidence:**

All commands were read-only on C:/Users/arvik/code/byway, git 2.52.0.windows.1.

1. `git reflog show fix/fx-block1` has 20 entries. Entries @{2} to @{18} are pre-rewrite commits (e9a1585, 5b39a9d, 3c6cd52, 177b719, the four fx-f merges, 05fd020, 18ae018, 44b5f29, ea7d1a9, e95b4c6, the four fx-n merges down to b3bf249). @{1} is "filter-branch: rewrite" to 5ce7edd. `git -C .worktrees/fx-block1 reflog show HEAD` has the same entries at @{2} to @{18}.

2. Ancestry: `git merge-base --is-ancestor` puts e438a14, b3bf249, 18ae018 and 05fd020 under e9a1585, and puts 11fc3b0, 481b2e5 and eedc340 outside it. Reachability from reflogs: `git rev-list --reflog` (777 commits) contains e438a14, e9a1585, 05fd020, 18ae018 and b3bf249. It contains none of 11fc3b0, 481b2e5, eedc340, 15acbd2, c001ced, 5abafbe or f57389c.

3. `git fsck --unreachable` (657 lines) lists all seven 2026-10-21 ids as unreachable. It lists none of e438a14, e9a1585, 05fd020, 18ae018 or b3bf249. So these commits are not dangling "the same way".

4. The overage-bearing blob is held only by reflogs. docs/adr/evidence/reports/b1-checks-2026-10-21.md is blob 45c63a1 at e438a14 and at 18ae018, and blob 547de58 at ba0adee. 45c63a1 appears 0 times in `git rev-list --objects --all` and once in `git rev-list --objects --reflog`; fsck does not list it as unreachable. A diff of the two blobs, digits masked, shows the old one's grep pattern carries a `##.##` figure that the new one has as `[redacted]`.

5. I reproduced the scenario in a synthetic repo in the scratchpad (since deleted):
   - Setup: a branch checked out in a linked worktree, a commit holding 'overage 12.34', a later commit, then `git filter-branch --tree-filter` to redact it, then refs/original deleted. `git for-each-ref --contains <old tip>` returned nothing.
   - `git gc --prune=now` from the main checkout: `git cat-file -t` still returned "commit" for the old tip and "blob" for the secret blob. Both the branch reflog and the worktree HEAD reflog still listed the old commits.
   - `git reflog expire --expire-unreachable=now --all`, then `git gc --prune=now`: both objects were gone ("could not get object info"). The worktree's HEAD reflog was cleared too, so `--all` covers linked worktrees by default.

**Fix:**

In docs/playbook.md row 51, replace "leaves the commits it replaces (from e438a14 on ...) in the checkout the same way" with an accurate account. The replaced commits stay in the checkout's object store and no ref holds them, but two reflogs still do: fix/fx-block1's reflog and the fx-block1 worktree's HEAD reflog (entries 2 to 18 of each, from the rewrite of 2026-10-22). Because of those reflogs, `git gc --prune=now` alone keeps them, and so does git's automatic gc until those entries are 30 days old.

Change the removal sentence to name the two commands in order, still for the owner to run, since it is a permanent local deletion: `git reflog expire --expire-unreachable=now --all`, which covers every worktree's reflogs by default, then `git gc --prune=now`. Also say that the first command drops unreachable entries from every reflog in the repository, not only fix/fx-block1's. The two-week sentence then applies only to the 2026-10-21 commits.

**Refuter 2: confirmed, should-fix.**

**Reasoning:**

RC-2 holds, and I could not refute it. Row 51 of docs/playbook.md says the 2026-10-22 rewrite "leaves the commits it replaces (from e438a14 on ...) in the checkout the same way". In context, "the same way" means dangling objects that no ref holds and, per the 2026-10-21 fsck, no reflog either. The row's "Why" column also says "`git gc --prune=now` in the checkout removes them there". Both claims are false for this rewrite's commits while fix/fx-block1 and its worktree exist. The branch's reflog and the fx-block1 worktree's HEAD reflog still point at the pre-rewrite chain. gc only expires reflog entries for unreachable commits after gc.reflogExpireUnreachable, which is not set here, so git's default of 30 days applies, and prune keeps everything a reflog points at.

The fix round wrote this. At ba0adee the row had the gc sentence, which was true for the 2026-10-21 commits, but not the "same way" sentence. The records pass (04508f4) added that sentence, and 083ddb8 kept it after the rewrite (5ce7edd, 03:23), when the reflogs already held the old chain. So the round extended a true statement to commits it does not fit.

This is not a choice the owner made or a limit with a trigger. The owner's chosen option says "The playbook's row on the local pre-rewrite commits is updated to match", so the owner expects the row to be accurate. The row's trigger ("before its .git folder or the scratchpad is copied or backed up off the machine") can fire before any cleanup.

Two things limit the severity, so it stays should-fix and is not blocking:
- Pruning is reserved for the owner, and the row says "Claude can give the exact commands".
- No ref holds these commits, so no push sends them. The earlier fix branches (fix/fx-batch and others) were deleted, which is why their reflogs vanished and the 2026-10-21 commits became truly dangling. Deleting fix/fx-block1 and removing its worktree after the merge would likewise make the row true.

Still, the row gives a false account of how to remove the commits that hold the organisation's overage and part of an email address. That is a wrong record, but nothing leaks.

One correction to the finding's own evidence: it understates the case. Each reflog has 17 pre-rewrite entries (@{2} to @{18}: e9a1585, 5b39a9d, 3c6cd52, 177b719, the four fx-f merges, 05fd020, 18ae018, 44b5f29, ea7d1a9, e95b4c6, the four fx-n merges ending at b3bf249), not 3. The conclusion holds all the more.

I could not check git's behaviour on the real checkout, because I did not run gc there (read-only rule). I showed the same behaviour in a throwaway repository instead.

**Evidence:**

All git calls were read-only and made through Node's spawnSync without a shell. Helper script: C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/rc2-git.mjs. No values from the organisation or the email address were printed.

1. Reflogs:
   - `git reflog show fix/fx-block1` in C:/Users/arvik/code/byway: @{0} is 083ddb8, @{1} is 5ce7edd ("filter-branch: rewrite"), and @{2} to @{18} are the pre-rewrite commits e9a1585 through b3bf249. @{19} is a002e60.
   - `git -C .worktrees/fx-block1 reflog show HEAD` shows the same 17 pre-rewrite entries.
   - For each of e9a1585, 5b39a9d, 3c6cd52, 177b719, 48a26fc, 9a6ab87, 05fd020, 18ae018, 44b5f29, ea7d1a9, e95b4c6, b3bf249 and e438a14: `merge-base --is-ancestor X 083ddb8` says no, and `for-each-ref --contains` returns 0 refs. e438a14 is an ancestor of e9a1585.
   - No refs/original or refs/stash exist.
   - gc.reflogExpireUnreachable, gc.reflogExpire and gc.pruneExpire are all unset, so git's defaults apply. Git is 2.52.0.windows.1.
2. Reachability: `git rev-list --all --reflog` lists 777 commits and `git rev-list --all` lists 738. e438a14, 18ae018, e9a1585, 05fd020 and b3bf249 are reachable only through reflogs. The 2026-10-21 ids (eedc340, 11fc3b0, 15acbd2, 481b2e5, c001ced, 5abafbe, f57389c) exist but are reachable through neither, which matches the row's account of the earlier rewrites.
3. The pre-rewrite blobs differ from the rewritten ones. e438a14's rewritten twin, matched by subject, is 126025f. `git diff --stat e438a14 126025f` shows 1 file, docs/adr/evidence/reports/b1-checks-2026-10-21.md, with 3 lines changed: the rewrite's redaction. Those blobs stay alive through the reflog chain. 5ce7edd and e9a1585 have equal trees, because 05fd020 had already removed the figure at the tip.
4. When the sentence appeared: `git show <c>:docs/playbook.md | grep -c`:
   - "in the checkout the same way": 0 at ba0adee, 1 at 04508f4 and at 083ddb8.
   - "`git gc --prune=now` in the checkout removes them there": 1 at all three.
5. Throwaway repository with a linked worktree (rc2-gcdemo.mjs in the scratchpad), made by committing a secret blob on the worktree's branch and then amending it away:
   - After `git gc --prune=now` from the main checkout, the old blob and commit are still present.
   - After `git reflog expire --expire-unreachable=now --all` and then `git gc --prune=now`, both are gone. So `--all` covers the worktree's HEAD reflog.
   - A second demo (rc2-orig.mjs) left the worktree's ORIG_HEAD pointing at the old commit; expire plus gc still removed it. So the fx-block1 worktree's ORIG_HEAD, which points at the pre-rewrite 5cb88f9, does not keep these objects alive.
6. The branch list is claude/admiring-agnesi-9896e0, fix/flaky-ledger-tamper-mtime, fix/fx-block1 and main. .git/logs/refs/heads/fix holds only flaky-ledger-tamper-mtime and fx-block1. Earlier fix branches were deleted together with their reflogs, which explains why the 2026-10-21 commits are truly dangling.

Checked and sound: the row's account of the 2026-10-21 commits (no ref, no reflog), and "No push sends them". The demo repositories and temporary lists were deleted afterwards.

**Fix:**

Edit docs/playbook.md row 51 (records only):

1. Replace "leaves the commits it replaces (from e438a14 on ...) in the checkout the same way" with an accurate account. No ref holds them, but fix/fx-block1's reflog and the fx-block1 worktree's HEAD reflog still point at the pre-rewrite chain, so they are not dangling yet.
2. Limit "`git gc --prune=now` in the checkout removes them there" to the 2026-10-21 commits. For the 2026-10-22 commits, give the commands as `git reflog expire --expire-unreachable=now --all` (it covers every worktree's reflogs by default), then `git gc --prune=now`. These still run at the owner's say, since this is a permanent local deletion.
3. Optionally add that deleting fix/fx-block1 and removing its worktree after the merge also drops those two reflogs, as happened to the earlier fix branches. After that, `git gc --prune=now` alone suffices.

No code change is needed. Fixing this does not hold up the push, because no ref holds these commits and no push sends them.

### Refuted findings (0)

None.

### Notes (11)

Minor findings and observations, not put to refuters.

#### RB1-F1-1: The new stall bound can close an Anthropic call that is still thinking, which used to finish within its step

*Note. Severity note; lens money; where `packages/gateway/src/providers/anthropic.ts:154`.*

**What is wrong:**

Before this round, Anthropic's streamed calls had no bound after the 200; only the step's 15-minute startToCloseTimeout limited them. Now StreamIdle closes the stream once 10 minutes pass with no 'connect' or 'streamEvent'. anthropicParams sends no thinking config, so Opus 5.5, Sonnet 5.5 and Fable 5.1 think adaptively with display "omitted". During that think, Anthropic sends only pings, and the SDK drops them. So a think that stays silent for 10 to 15 minutes, which used to complete inside the step, is now closed, read as 'maybe', sent once more (paid twice) and then likely closed again.

**Evidence:**

@anthropic-ai/sdk 0.131.0 core/streaming.js has `if (sse.event === 'ping') { continue; }`, so pings never reach the MessageStream. BetaMessageStream.js:375 emits 'streamEvent' only for events the stream yields. anthropic.ts:147-157 restarts the bound only on 'connect' and 'streamEvent'. The claude-api reference (loaded this session) says "omitted" is the default on these models and that with it "the default looks like a long pause before output". runner/src/activities/call.ts asks again at 32,000 and then 64,000 tokens after an answer is cut short (MAX_OUTPUT_CEILING 64_000). The trade-off is disclosed honestly in backlog row 138 ("An Anthropic think that sends nothing for ten minutes is read as a stalled stream"), in ADR-0111's Later note on CC-2 and in stream.ts's doc. No cap can be passed: the resend's retain checks the workspace cap.

**When it goes wrong:**

On the first live run, a step is asked again at 32,000 tokens after a cut-short answer, and Opus 5.5 thinks silently for 11 minutes. Before this round the answer came at about 13 minutes, inside the 15-minute step. Now the stream is closed at minute 10, counted 'may have been billed' at its reservation, and sent once more. That attempt is likely closed again or timed out by Temporal, so the step fails after paying for two or three calls.

**Proposed fix:**

This is an owner-facing trade-off, already filed; nothing is wrong with the money accounting. Options for the owner: keep it, with the backlog trigger; for Anthropic only, use a bound no shorter than the step's 15-minute timeout, which still closes the leaked connection CC-2 named and never fails a call that would have finished; or ask Anthropic for `thinking: {type: 'adaptive', display: 'summarized'}` so thinking streams events. That last option changes the request body, and per the reference it is billed the same.

#### RB1-F1-2: redactMessage throws a TypeError for an error whose message has only a getter (DOMException)

*Note. Severity note; lens money; where `packages/gateway/src/gateway.ts:1108`.*

**What is wrong:**

The SEC-NOTE-1 helper runs `if (e instanceof Error) e.message = redact(e.message);` in an ES module (strict mode). A DOMException (AbortError or TimeoutError, as AbortSignal.timeout and fetch produce) is `instanceof Error` in Node 24, but its `message` is a getter-only accessor on the prototype. The assignment then throws a TypeError, and that TypeError replaces the adapter's error. op.failed(e) has already run, so the money count is still right, but the error the caller sees loses its billing and cut-off mark and fal's request ids.

**Evidence:**

Probe on Node v24.13.1 (scratchpad recheck-f1-domex.mjs). `new DOMException('…','TimeoutError') instanceof Error` printed true. `d.message = 'x'` threw "TypeError: Cannot set property message of  which has only a getter", and so did assigning to an AbortSignal.timeout reason. I found no production path that reaches it today. Every raw await in the fal adapter's video() goes through req.attempt or req.submit (mapped through toGatewayError), throws a GatewayError, or goes through cancelJob, which never throws. So this is latent.

**When it goes wrong:**

A later change lets an adapter's own DOMException reach video()'s catch, for example a new fetch with AbortSignal.timeout outside req.attempt, or a FalClientLike.cancel that throws. The step then fails with "Cannot set property message…" instead of the provider's error, and it is not marked as a cut-off or as 'maybe'.

**Proposed fix:**

Make the helper total. Either wrap the assignment (`try { e.message = … } catch { return Object.assign(new GatewayError('provider-error', redact(e.message), false), { billing: (e as ClassifiedError).billing }) }`), or use Object.defineProperty(e, 'message', { value, configurable: true, writable: true }), which also works on a DOMException. Add one test with a DOMException.

#### RB1-F1-3: A head that runs ahead of the file with an empty id is now named as a line that does not exist

*Note. Severity note; lens money; where `packages/gateway/src/ledger.ts:580`.*

**What is wrong:**

For a head ahead of the file (head.seq > last line), lineName(head.id, head.seq) returns `line:<head.seq>` when the head's id is ''. headOf already requires the id to be a string, so '' is the only case this changes. That line does not exist. Gateway.brokenLine's lineAt(n) returns undefined, and ledgerCheckText then says "Line 3 of the spend ledger cannot be read as an entry. If it is the last line, a crash probably cut it short…". What actually happened is that entries the head records are missing from the end. Before the change the text read "fails its check at entry : an entry was changed, lost or cut off": the wrong name, but the right meaning.

**Evidence:**

ledger.ts:580 `if (lastSeq < head.seq) return lineName(head.id, head.seq);`. ledger.ts:466-469 shows lineAt returning undefined past the end. history.ts:107-111 gives the `line:` wording, with LINE_FATE_UNKNOWN when there is no brokenLine. ledger.test.ts:227-232 pins 'line:3' for a 2-line file. Mutation L3 (head.id returned as is) fails that test, so the behaviour is pinned rather than accidental. C-LEDGER-ID's suggested fix covered entry.id and atHead.id, not head.id.

**When it goes wrong:**

Someone hand-edits or damages ledger.jsonl.head to {"seq":3,"id":"",…} over a 2-line ledger. Settings' "Check the spend ledger" then points them at a third line that is not there, as one a crash may have cut short, rather than saying entries were lost or cut off. No money is affected.

**Proposed fix:**

When the head runs ahead and its id is empty, return 'head', or keep the entry wording, instead of `line:<head.seq>`. Or leave head.id as it was before this round, since headOf guarantees it is text. Update ledger.test.ts:227-232 to match.

#### F2-RC-2: A slots knob between 0 and 1 buys two brief answers, not one as A3's records say

*Note. Severity note; lens run; where `docs/backlog.md:82`.*

**What is wrong:**

A3's records describe a slots knob below 1 as a step that 'still buys its brief answer' (ADR-0112 item 6) and makes 'one paid call whose briefs are all dropped' (backlog row 'An ASSET step whose slots knob is below 1 still buys its brief answer'). That holds for 0 and for negative knobs. For a knob strictly between 0 and 1, freePlan gives min = max = 0.5. checkBriefs then refuses every answer, so the step asks the model again with 'Write at least 0.5 image briefs.' and buys two brief answers. A3's new note is still right in that case: NO_SLOTS_NOTE, the briefs named, the step skipped. This behaviour predates the fix round (slot-plan.ts did not change), and no catalog recipe sets such a knob.

**Evidence:**

Probe test appended to the clone's asset-slots.test.ts and then removed (scratchpad/recheck-f2-scripts/probe-a3.cjs, output in probe-a3.log). Knob 0: briefCalls 1, cost 0.01, skipped, note NO_SLOTS_NOTE + 'The briefs for “hero” and “detail” were left out.' Knob 0.5: briefCalls 2, second ask 'Write at least 0.5 image briefs.', cost 0.02, same note. Knob -1: briefCalls 1. Code: slot-plan.ts:49-53 (freePlan: min = Math.min(range.min, max)) and :109-114 (checkBriefs: briefs.length >= plan.min).

**When it goes wrong:**

A recipe outside the catalog sets knobs.slots to 0.5. The step pays for two brief answers and sends the model a nonsense instruction. The backlog row that should drive the fix undercounts the waste.

**Proposed fix:**

Add a sentence to backlog row 82 and ADR-0112 item 6: a knob between 0 and 1 buys two brief answers, the second asked with 'Write at least 0.5 image briefs.'. Leave the code to the row's fix (refuse a knob that is not a whole number of at least 1 at admission, or skip before the brief call).

#### F3R-2: The mutation-log README says the summaries' spec line numbers are at fix/fx-f3's last commit; e2e-summary-1's pasted-key lines are 3 lower

*Note. Severity note; lens web; where `docs/adr/evidence/logs/README.md:9`.*

**What is wrong:**

The README ends with "Spec line numbers are as of that change, fix/fx-f3's last commit." e2e-summary-1.txt ran before 051b1aa (the pasted-key spec fix), which added 3 lines inside test 3. So the summary's pasted-key line numbers after line 101 are as of c58d01c. A reader who checks them at 083ddb8 lands on the wrong lines. The proofs themselves still hold: 051b1aa changed only test 3, and test 4's baseline passed in that set. A smaller point: base-C4 (E1's baseline) is in neither committed summary, though its log exists under Temp and the gate's 58/58 run covers it.

**Evidence:**

e2e-summary-1.txt: W6 at pasted-key.spec.ts:145:37, E6 at :159:115, E3/W7 at :115 and :154. e2e-summary-2.txt (after 051b1aa): E3/W7 at :118 and :157. At 083ddb8, line 145 is a comment ("// The other attachment and the text are still kept...") and line 159 is blank. The assertions are at :148 (`not.toContain(DRAFT)`) and :162 (`'Attachment 2 ("Draft") ...'`). At c58d01c, lines 145 and 159 are those same assertions. `git show 051b1aa` touches only lines 98-112 (test 3). The committed summaries match the scratchpad's f3/e2e/summary.txt and f3/e2e2/summary.txt byte for byte, after CR stripping. f3/e2e/base-C4.log shows '1 passed (36.8s)'.

**When it goes wrong:**

Someone checks a CC-1 proof against the repository: W6 or E6 seems to fail on a comment or a blank line, and the proof looks fabricated or stale.

**Proposed fix:**

In the README, say that e2e-summary-1's pasted-key line numbers are at c58d01c (before 051b1aa, which moved test 4 down 3 lines) and that e2e-summary-2's are at fix/fx-f3's last commit. Optionally say that E1's baseline (C4 passing) is in the gate's run, not in the summaries.

#### LC-1: The sandbox guard's new import() pin is described as total, but two layouts still load Playwright through PINNED without moving any pin

*Note. Severity note; lens c-ci; where `apps/web/test/guard-sandbox.test.ts:20`.*

**What is wrong:**

f0d8b49 says the names the pin report holds cannot load Playwright unseen. Three places say it: the header (lines 18-20, "so the names that report holds cannot load Playwright unseen"), the new LAUNCH pin's `what` (line 224, "none, so the pin report's names cannot load Playwright") and ADR-0105's Later note of 2026-10-22 (line 172, "so neither the report's names nor a name built from pieces can load Playwright unseen"). Two layouts get past it. (1) A code line that starts with a block comment. uses() drops every line that starts with //, /* or *, so the line is never checked. This filter predates the fix round, and it hides a literal import('playwright') too. (2) `import` at the end of one line with its `(` on the next. The new pin is read one line at a time and needs `import\s*\(` on a single line. The new test covers only `import(` with its argument on the next line. Neither layout is listed under the header's "What it does not see".

**Evidence:**

Clone recheck-b1-clones/lc at 083ddb8 (git clone --no-local, pnpm install --frozen-lockfile --offline). The script scratchpad/rc-lc-scripts/guard-proofs.mjs writes each case to disk, runs only apps/web/test/guard-sandbox.test.ts, then restores the files (the clone's status was empty afterwards). G0 HEAD: 39/39 pass. G6 new packages/runner/src/zz-probe.ts with `import { PINNED } from '../../../scripts/playwright-pin.ts';` and `export const zz = async () => (await import(PINNED[0].name)).chromium;`: fails (the new pin moves). G7, the same file with the second line prefixed `/**/ `: 39/39 pass. G8, the same file with the load split as `(await import` + newline + `  (PINNED[0].name)).chromium;`: 39/39 pass. G10, `/**/ export const zz = async () => (await import('playwright')).chromium;`: 39/39 pass. This shows the comment-line filter is older than the fix round. A .mts file holding both layouts loads a module under Node 24 ("loaded string string"). The gate has no format check: the root scripts' verify is typecheck && test && e2e.

**When it goes wrong:**

A later change loads Playwright through PINNED, or a copy of it, using one of these two layouts. The guard stays green while its header and ADR-0105 say this cannot happen. Both layouts are unusual formatting and take a deliberate odd edit. They are the same kind of gap as the computed-name blind spot the header already declares, and as MI-3, which was a note. Nothing launches this way without `.launch(`, which the launch-call pin holds to pages.ts.

**Proposed fix:**

Make the wording match what the guard actually does. List both layouts under "What it does not see" (a code line that begins with a block comment, and `import` split from its `(` across lines). Drop "cannot ... unseen" from the header, from the pin's `what` and from ADR-0105's Later note, or qualify it there. Or close both: have uses() strip a leading /* ... */ before its comment test, join a line that ends in `import` with the next line, and add both layouts as 'fails on' cases.

#### RC-3: The Block 1 check report's header says the rewritten commits kept their messages and each got a new id, and maps only one of its old ids

*Note. Severity note; lens records-history; where `docs/adr/evidence/reports/block1-check-2026-10-22.md:1`.*

**What is wrong:**

083ddb8 added "the commits kept their messages, and the rewrite gave each a new id (18ae018 is now ba0adee)". Three messages changed: 44b5f29 became 41bbaa9 with MI-2's time corrected from 19:59 to 21:27, and 18ae018 (now ba0adee) and 5347b1d (now f0d8b49) had the ids they cite remapped. Commits before e438a14 kept their ids. The report cites eleven other replaced ids (44b5f29, e438a14, b3bf249, ffff05a, cbb2e92, 0d6edde, e95b4c6, a52818c, 73bf4ab, 049918d, ea7d1a9) with no map. The B1 checks report's header gives a full old-to-new table.

**Evidence:**

I compared message, identity and author date for all 39 pairs in hist3-map.json: 36 are identical, and these 3 differ. 41bbaa9's message reads 21:27 local (2026-10-22T04:27Z). The report's MI-2 entry quotes the old 19:59 text. My id scan finds those 11 ids unreachable from 083ddb8 (they exist only as dangling objects).

**When it goes wrong:**

A reader is told the commits kept their messages and reads MI-2 against 41bbaa9. They conclude the 19:59 misstatement is still in history, when it was corrected. And they cannot find any cited commit except 18ae018.

**Proposed fix:**

Say that three messages changed (MI-2's time, and two cited ids remapped) and that only the commits from e438a14 on got new ids. Add the old-to-new table from hist3-map.json, as the B1 checks report's header does. This can go with RC-1's rewrite.

#### RC-4: 3ea91f8 is now an empty commit whose message describes an edit it no longer makes

*Note. Severity note; lens records-history; where `commit 3ea91f8 (message)`.*

**What is wrong:**

After the rewrite, 3ea91f8 changes no files: its parent ba0adee already holds the redacted report. Its message still says the B1 checks report "no longer holds the organisation's September overage or a fragment of the owner's email address" and "The block's unpushed history is rewritten the same way before the push."

**Evidence:**

`git diff --name-only 3ea91f8^ 3ea91f8` lists 0 files. hist3-map.json maps 05fd020 to 3ea91f8 with identical trees. The B1 checks report differs from the original in 30 rewritten commits, by 3 lines each.

**When it goes wrong:**

Someone reading `git log -p` on main sees a commit that claims a redaction and changes nothing. The redaction is invisible, because the rewrite moved it into every earlier commit.

**Proposed fix:**

Say this in the --no-ff merge message ("3ea91f8 is empty after the rewrite; its redaction now stands in every commit from e438a14 on"), or drop the commit in the RC-1 rewrite.

#### RC-5: The new split-address check misses "&lt;local> at &lt;provider>.com" and an HTML-escaped @, and does not read docs/reviews, where the review packet went

*Note. Severity note; lens records-history; where `scripts/test/adr-evidence.test.ts:86`.*

**What is wrong:**

The header says the check finds an address "split around its @ before a mail provider's name". It catches the SEC-PRIV-1 form and the nine fakes. It does not catch "jane.doe at &lt;provider>.com". It does not catch "jane.doe&#64;&lt;provider>.com", which GitHub renders as a whole address in a .md file. It does not catch quoted search terms "'jane.doe@' / '&lt;provider>'", the shape the SEC-PRIV-1 vote said the lens used. The email test scans only docs/adr/evidence, and the D5 packet was brought into docs/reviews.

**Evidence:**

In my --no-local clone (recheck-b1-clones/rec-email): with SPLIT_ADDRESS removed from emailsIn, the new test fails (7/8). A planted docs/adr/evidence file holding "jane.doe@/&lt;provider>" fails "the evidence files hold no email address". Planted files holding "jane.doe at &lt;provider>.com" or "jane.doe&#64;&lt;provider>.com" pass 8/8. Restored, the clone is clean. Applying the patterns in memory finds line 3866 of the B1 checks report at 18ae018 and nothing at 083ddb8. Line 157 reads filesUnder(EVIDENCE, /./) only. My history scan found no part of either address in docs/reviews or anywhere else.

**When it goes wrong:**

A later lens or import writes the owner's address as "name at provider.com" or with &#64;. The gate passes, and the address goes to GitHub rendered in full.

**Proposed fix:**

Decode HTML entities and %40 before matching. Accept "at" followed by a provider with a dot ending. Include docs/reviews in the email test, or keep review evidence under docs/adr/evidence.

#### RC-6: Playbook row 51 says the re-check's clones hold the pre-rewrite commits, but --no-local clones do not

*Note. Severity note; lens records-history; where `docs/playbook.md:51`.*

**What is wrong:**

The row says every scratchpad clone holds the pre-rewrite commits, "the check clones of the first block (b1check-clones) and of its re-check as well, because git clone --no-hardlinks ... copies its whole object store". The re-check's clones are made with --no-local, as the owner's clones answer set out, and they hold none of them.

**Evidence:**

In recheck-b1-clones/lc and recheck-b1-clones/rec-email, `git cat-file -t` fails for e438a14, 11fc3b0, 481b2e5 and 18ae018. Their refs are only main, fix/fx-block1 and two unrelated local branches.

**When it goes wrong:**

No harm, since every clone is deleted after the re-check. The record just misstates which clones carry the details.

**Proposed fix:**

Change "and of its re-check as well" to say the re-check's clones were made with --no-local and hold no unreachable commits.

#### RC-7: The owner's [masked: commit-identity address] is the author and committer of every commit in the block, as on main

*Note. Severity note; lens records-history; where `commit identities a002e60..083ddb8`.*

**What is wrong:**

The rewrite kept every commit's identity. All 60 commits in a002e60..083ddb8, and all 678 on main, have one author/committer identity, and its email is [masked: one of the owner's addresses]. The owner's words "Remove ... your email from the files and from Block 1's unpushed history" were asked about the SEC-PRIV-1 fragment. Read literally, they also cover this.

**Evidence:**

An in-memory scan with the scratchpad's email parts found email parts in the identity of 60 of 60 block commits and 678 of 678 main commits, all with one distinct identity. Trees, messages and notes hold no part (0 hits).

**When it goes wrong:**

The owner expects that no Block 1 commit on GitHub carries the address. Every commit does, as in the 678 already pushed.

**Proposed fix:**

Tell the owner in the report. Changing it means rewriting the block's identities, for example to a GitHub noreply address. The block would then differ from main, so it is the owner's call.

### The earlier findings, as the re-check found them (50)

- **TS-MONEY-1** (money), fixed: Test-only; the code was already right. cut-off.test.ts adds, for openai and openrouter, a case where every chunk arrives and then the stop comes (settled at $0.033 and at OpenRouter's reported $0.0213, with no priceBasis and nothing uncertain). It also adds a stop between the finishing and usage chunks ('assumed') and a stream that throws on its stop after finishing. In my clone, mutation G (stop read before finish after the loop) failed 5 tests and mutation H (in the catch) failed 2.
- **TS-MONEY-3** (money), fixed: A note Claude chose to fix, beyond the owner's words. One test keeps the last usage: an early partial usage of 1200/5 at $0.002, then the full 1200/80 at $0.0213. In the clone, mutation I (first usage wins) and mutation J (usage summed) each fail it.
- **TS-MONEY-4** (money), filed-as-chosen: No code change, per 'file the rest'. backlog.md row 137 (billing assumptions) now says that an error chunk's own code is not read, and that OpenRouter's processing comments may commit the 200. readChatStream wraps every error chunk as streamEndedEarly 'maybe', which matches the row.
- **TS-MONEY-5** (money), fixed: A note Claude chose to fix; the fixes are sound. (a) gateway.ts:279 releases only when billingOf(e) is 'none'. I checked that the stop's own errors read as 'maybe': APIUserAbortError has no status or body, closed() is named AbortError, and streamEndedEarly states 'maybe'. readChatStream no longer rethrows raw SDK errors, so an OpenAI or OpenRouter error chunk with the stop stays a cut-off. Mutations: the reverted catch fails the Anthropic 400 test, and E1 fails both error-chunk tests. (b) `whole` is set only from the SDK's 'message' event, which _addMessage emits solely at message_stop (BetaMessageStream.js:139-142, 429-432), so its usage is final; removing the fallback fails 2 tests. (c) stopIfEnding now runs before markSent and after it, for completions and images. Removing the first check fails the completion test and the image test; removing the second fails the stop-during-mark test (by timeout). On a resend, what was retained for the first attempt is unchanged.
- **CC-2** (money), fixed: The owner named 'the stream idle limit'. The bound is armed only once the response begins (after OpenAI's create() resolves; on Anthropic's 'connect', which _connected emits after the headers). Before that, the SDKs' own 10-minute timeout still applies; I verified both clear it in fetchWithTimeout's finally. The bound restarts at each chunk or event, and only a timer firing sets `stalled`. A stall reads as streamEndedEarly 'maybe', becomes a retryable provider-error through ENDED_EARLY, is sent once more with the first attempt retained ('resent'), and fails on a second stall. The tests use fake setTimeout/clearTimeout only. Eleven mutations (C1, C2, C4, C4b, C5, off-by-one, detail, C6, C7, C8, C10, C11) are all caught. C4, C4b, C6 and C10 fail only at vitest's 5 s timeout, which the builder disclosed. The claim 'no stricter than the unstreamed call' holds for OpenAI and OpenRouter. For Anthropic it is a new bound; see RB1-F1-1.
- **SEC-NOTE-1** (money), fixed: One of the owner's 'two privacy gaps'. cancelJob redacts with the fal key and every key shape before cutting to 64 characters, and the no-answer detail likewise before its 300-character cut; the test puts the key across the cut. response.frame.cancel is the redacted detail. video() also rethrows through redactMessage. Mutations R1 to R5 each fail a test. See RB1-F1-2 for a latent robustness gap in that helper.
- **C-LEDGER-ID** (money), fixed: lineName returns the id only when it is non-empty text, for entry.id, atHead.id and head.id. Tests go through verify() (ids nested 10,000 and 100 deep, numeric, object, empty) and through auditLedger (deep and numeric ids give brokenAt 'line:2', a fault, and no throw). Mutations L1 to L4 are all caught (7, 1, 1 and 2 failures). See RB1-F1-3 on how the head-ahead case reads.
- **RS-1** (run), fixed: Both peak tests now await the workflow's result and read Temporal's history. From the first CANCEL_SIGNAL signal on, the only ActivityTaskScheduled is ['cancelRun']. I ran my own mutations in a clone of 083ddb8. R1: an emitEvents fired and not awaited after cancelRun. R2: an emitEvents scheduled by the Cancel signal handler before cancelRun; it writes no step event, so the old step-started check could not see it. Both peak tests failed on each, with "expected [ 'cancelRun', 'emitEvents' ]" and "[ 'emitEvents', 'cancelRun' ]". The release variant is right. It holds with cuts=false, so the 32 calls are handed no signal and answer on their step's cancel. Each step's ask again is refused before any provider. The test asserts 32 calls, ledger ids equal to the answered ids, the run's cost equal to their total, nothing uncertain, and run-cancelled last. That matches the acceptance and both refuters' fix. The check reads Scheduled rather than Started events. That is correct, because Temporal writes the 32 drafts' Started events late, so Started events after the signal cannot be read as starts after Cancel. Records (backlog:127, status page F02, ADR-0111 Tests) match.
- **RS-2** (run), fixed: stopSignal now asks the store at the cancel, then every 1 s on a chained setTimeout while the run is going, until invocation.done. A failed read is asked again. The timer is cleared at the invocation's end, and a read still on its way then cuts nothing off. index.ts passes invocation.done, and every caller is updated. My mutations: R3 (the wrapper hands the cancel itself as `until`) failed the NOT_FOUND-with-run-ended activity test, the 3 RS-3 tests and the RS-2 activity test. R5 (the re-read reuses the first answer) failed the 4 activity tests. R7 (the re-read stops after one tick) failed the 3 fake-timer rule tests; the activity test passes under it, which is fine because that test needs only one re-read. The workflow bundle is unchanged: ba0adee..083ddb8 touches nothing under runner/src/workflow, contracts, recipe or store, and build.test.ts (pinned hash) passes 5/5 in the clone. The new background reads live no longer than the heartbeat interval that already ran for each invocation, so no new keep-alive. One records error from this change: F2-RC-1, the double fal cancel.
- **RS-3** (run), fixed: An it.each over WORKER_SHUTDOWN, TIMED_OUT and NOT_FOUND runs the real createActivities().modelStep under MockActivityEnvironment with the run going. It checks that stop is not aborted at the cancel and after two store reads, then that the answer is kept. My R4 (WORKER_SHUTDOWN read as the run ending) failed the WORKER_SHUTDOWN case with 'expected true to be false'. The builder's M3, the raw cancel used as the stop, is the finding's own mutation.
- **RS-7** (run), fixed: No Date.now, performance.now or elapsed-time assertion is left in liveness.test.ts. ENG-10 now checks that the slow call is still in flight once shutdown resolves. The 20 s Promise.race stays. With the harness's 0.5 s grace and 3 s force time, shutdown takes about 3.2 s (measured), so 20 s is about 6 times the margin. My R6 (worker.ts ignores the force time it is given) was caught by the race at 21.6 s. With a 30 s call latency, the in-flight check would also catch it without the race (reasoned, not run), so the race is a hang guard. The backlog CI-time row drops liveness.test.ts:175, and ADR-0111's Tests line reads 'none asserts on the clock'.
- **A1** (run), fixed: The CDN test server routes on the pathname. never.css?token=abc123 must be named http://&lt;host>/never.css, and the message must not match /token|\?/. My mutation (call site back to url.href) failed the 'fetched again in a second read' test. The baseline passes (Chromium, 5 s).
- **A2** (run), fixed: New test: the first answer places hero, the second places detail. The work must hold detail, and asset must be [hero]. The `<` to `<=` mutation fails it. ADR-0112 Evidence records the test, notes that the earlier 25 mutations missed this item, and records it as a note Claude fixed beyond the owner's option.
- **A3** (run), fixed: A step whose free plan's most is below 1 now finishes skipped with NO_SLOTS_NOTE and names every brief left out. The 'at most 0 images' wording is gone. I checked the change is sound. The interpreter ignores `skipped` for assets, so ports are unchanged as before. `skipped` only changes how the step is shown (Timeline, How it was made, ResultView), as it already does for NO_IMAGES_NOTE and NO_BRIEF_NOTE. My mutations 'none' only for max < 0, and the below-1 droppedSentence branch disabled, each failed the new test. It is recorded as Claude's choice beyond the owner's words in ADR-0112 item 6 and in ADR-0111's Later notes, which quote the owner's 01:54 answer word for word (it matches conversation-continued.md:563/567). The leftover is filed as a backlog row with a trigger Claude proposed. That row undercounts the paid calls for a knob between 0 and 1 (F2-RC-2).
- **A4** (run), fixed: New test: a C3 prose ASSET step with produces ['asset'] places its image. It must give no artifactId and asset = [the image]. The mutation `const beside = placed.missing;` fails it.
- **RS-4** (web), fixed: The Failed panel now shows CUT_OFF_NOTE and the under-way line (RunStatusPanel.tsx). run-screen.test.ts renders both panels, not only the string, and the unit mutation that drops the note fails. ADR-0111 item 7 records the words as Claude's. The runner-side reproduction and the 'Stopped' reason are filed as a backlog row whose claims match the check's evidence.
- **RS-5** (web), fixed: The behaviour is sound. getRunData adds `ended` = {callsUnderWay, settledUsd} for an ended run only. It reads the run's own in-flight rows first; IN_FLIGHT is a live lease on open, sent or accepted rows, so an orphaned reservation drops out when its lease ends and the polling cannot go on forever. It then reads byRun, the same figure settleLateCost uses. pollDelay polls every 3 s while calls are under way, mergeRunData does not carry an older answer forward, and a failed book read falls back to the old stop, as recorded. The gap: RunScreen's wiring of these pieces has no test (F3R-1).
- **RS-6** (web), fixed: CUT_OFF_NOTE says 'that may have been billed', which leaves out released and settled cut-offs. It matches UNCERTAIN_ADVICE's 'at its estimate against the workspace budget (not the run's)', which agrees with the spend book: the run cap counts settled and in-flight rows only, and the uncertain rows are listed in Settings. The words are pinned exactly in run-screen.test.ts and recorded as Claude's.
- **B-a11y-cost-not-described** (web), fixed: The cost paragraph gets a useId id. Yes and No are each aria-describedby that id, and only when a cost exists; the group is still described by the prompt. The live region now reads 'Your turn: {prompt} {cost}'. Unit: questions.test.ts checks the ids and describedby, and 3 unit mutations fail. Browser: configurations.spec.ts C4 checks toHaveAccessibleDescription on both buttons. I also ran the live-announcement mutation in a browser, which the round had not; C4 failed at :180 as it should (see checked).
- **B-test-wiring-uncovered** (web), fixed: YourTurn's `cost` is required (`string | null`). C4 now checks .turn-cost through the real page, RunScreen and YourTurn. E1 (RunScreen cost={null}) failed C4 at :178 in a real run, per the log.
- **CC-1** (web), fixed: The browser mutation proofs are real. Each log shows a fresh `next build`, a Playwright run and the failing assertion with its expected and received values (checked: E1, E3/W7 in e2e2, E6, W6). The committed summaries match the scratchpad summaries byte for byte. Every batch-B mutation the refuters proposed (W1-W9, U1, U3, R1) failed. W1-control's unexpected result is explained consistently: line 198 in the control run is the original line 199, `news(page).toHaveText('')`, because withoutPolls was removed. One records nit on line numbers (F3R-2).
- **SEC-NOTE-2** (web), fixed: keepAgain is gone from updateAttachment and removeAttachment. withheldAfterCheck re-keeps a held attachment only when the next request carried it exactly as it now stands and the server named it in no part. partsHolding and itemsHolding check every field and item, names included, so 'not named' means no key was found. The accept path, the held-key refusal path, an edit during the request (via current.current), an emptied attachment (not sent), removal, additions (fresh keys, never reused) and remount (an empty set, with the held one never stored) all keep the rule. Other errors leave the set alone. ADR-0100's Later note records the reload trade-off as Claude's choice, not put to the owner, and the playbook's review row lists it. Start's text, a refused example and a refused Run answer are filed truly in the backlog row 'Kept again with the key still in it'. I checked its claims in StartForm.edit and saveStartDraft, examplesDraft.keepExamples (exact-text filter) and draftStore's refused/sameResolution.
- **B-held-attachment-rekept-on-rename** (web), fixed: Same change as SEC-NOTE-2. pasted-key test 4 renames the held attachment and checks that 'Draft v2' is not in the tab. E3/W7 (the old rule) failed tests 3 and 4 at :118 and :157 (e2e-summary-2).
- **B-stale-attachment-number** (web), fixed: The refusal is now stored and worded on each render by startRefusalNow from the form's current keys. An attachment removed above the held one renumbers it; removing the held one drops it; null once nothing named is left. Unit mutations fail in http.test.ts; browser runs E5/W8 and E6 failed test 4. This was one of the twelve notes Claude fixed beyond the owner's words, and ADR-0111, ADR-0100 and the playbook record that.
- **B-cancel-label-repeat** (web), fixed: aria-label is removed from the Cancel group; CANCEL_QUESTION still describes it. No spec finds the group by that name (grep). No test pins the label's absence, which is acceptable for a note. Recorded in ADR-0111 item 7 as one of Claude's beyond-the-owner fixes.
- **B-figure-planning-sizes** (web), filed-as-chosen: Added to the backlog row 'Check the advisor's planning numbers against the ledger', with the check's figures. This falls under the owner's 'file the rest'.
- **B-other-paid-questions** (web), filed-as-chosen: New backlog row. Its prompts are verified in wording.ts (BEST_SO_FAR, NOT_CONVERGING, GATE_FAILED), and so is the cap raise `Math.max(1, g.max)` in interpreter.ts; the trigger is marked as Claude's.
- **B-ai-calls-excludes-images** (web), filed-as-chosen: New backlog row covering both screens. Both count estimate.modelCalls (RecommendationView facts-sub, view/questions.ts).
- **C-PIN-TIMEBOMB** (c-ci), fixed: 711a2b7: each report() test now calls a pinnedAt() temp root. Only 'reads the pins the two packages have' still reads the live pins, and it compares them with the package files, so it survives a bump. In the clone with both live pins at 1.64.1, the 6 Playwright-pin tests passed; at 1.70.2 all 60 ci.test.ts tests passed, and the lockfile was untouched (vitest run through node, not pnpm). ba0adee's ci.test.ts against pins at 1.64.1 fails as the finding said ('expected [] to have a length of 1 but got +0'). The test can still fail: with `if (false && behind)` it fails, and changing `>= 0` to `> 0` fails 2 tests. scripts/playwright-pin.ts and verify.yml are unchanged in ba0adee..083ddb8, so the report still only reports: continue-on-error, schedule and Linux only, no exit code, still asserted by the first test. Its docblock and ADR-0110 both quote the owner's D4 option word for word, matching conversation-continued.md. ADR-0110's Evidence sentence holds in substance (an update needs no edit to ci.test.ts; ci.test.ts has 60 tests). It is loose in one place: 'every test of the report reads pins written into a temporary folder' is true of the report() tests, while the pinReport() tests use the in-memory PINS fixture.
- **C-MOCK-DIFF** (c-ci), fixed: 87806a4: existingDiff takes fences(prompt).findLast(diff) and splits the Why inside the block exactly as runner splitCodeDiff does. The Why right after the block wins, then the Why inside it, then the default. Proofs in the clone: ba0adee's responders.ts fails both new tests (gateway and prompts mock.test.ts, 2 failed of 138). Putting back only the lazy regex as the block finder also fails both, so the fence-cut regression is caught by itself. As the builder disclosed, find in place of findLast passes 138/138. In every C7 fix and voice.apply template the critique slots come before the artifact block, and the mock's code-diff critiques hold no diff fences, so findLast is the right pick and the gap does not bite today. This is a note Claude fixed beyond the owner's words, and the playbook and ADR-0111 records list it as such.
- **C-DIFF-DEDUPE** (c-ci), fixed: 7935624: identical lines are counted ('twice', 'N times'), and a line said once is unchanged. Each node is visited once by collect(), so the count is the number of distinct steps behind the line. Parts are named apart from their lead, and a part removed with its lead is not pushed, so the count does not double up a single change. Putting back `[...new Set(lines)]` fails the renamed test (1 failed of 52). The advisor tests plus apps/web recommendation and vocabulary tests pass, 442/442. The playbook's batch-C review row says lines are now said 'with how many they stand for'. This is a note fixed beyond the owner's words, and the records say so.
- **C-STORY-PERSON** (c-ci), filed-as-chosen: Filed under the owner's 'file the rest'. human.ts is unchanged, and line 269 still throws StepError. The backlog row is true on every point I checked. The catalog's own-draft steps are C3 own-draft, C6 write and C6a write, all prose, found by walking CATALOG in the clone. The row names C3 and C6 and omits C6a, which is also prose, so 'No catalog recipe reaches it' holds. f24041d's message does say 'so askModel asks again'. b45ec0a is ENG-6 and 28ece89 is the first interpreter commit. interpreter.ts rejectedAnswer exists. controls.ts's failing-run test uses the helper recipe twoAuthors with 'not a diff at all'. The row's trigger is marked as proposed by Claude. 681e0de's formats.ts comment is true as it stands: a person's draft 'takes the problem as it takes any other draft parseArtifact cannot use'.
- **MI-3** (c-ci), fixed: f0d8b49: the header and the LAUNCH comment now name the pin report's two lines. I proved on disk in the clone that each of these moves the Playwright-name pin (1 failed of 39): a literal import of playwright in scripts/serve.ts (G1), in packages/runner/src/render-browsers.ts (G2) and in scripts/playwright-pin.ts (G4), and an import of playwright-core in apps/web/src/server/api.ts (G3). The new it.each writes four cases into playwright-pin.ts itself, so the old commit message's '(checked)' is now backed by a test. See LC-1 for the new sentence about loading by name.
- **SEC-NOTE-3** (c-ci), fixed: The way round SEC-NOTE-3 named is closed. import(PINNED[0].name) inside playwright-pin.ts (G5), and the same call from a new runner file that imports PINNED (G6), each fail the new 'modules loaded by a name the line does not write out' pin. A require that createRequire made, called by a computed name, still passes (G9), and the header now declares it. The new pin's 'cannot load Playwright unseen' wording goes further than the guard does (LC-1, note).
- **REC-B1-1** (records-history), fixed: b1-checks lines now read [redacted]. The rewrite changed that file by 3 lines in 30 commits and nothing else, with parents mapped 39 of 39. Scanning every blob and message of a002e60..083ddb8 for the figure in any spelling (dot, escaped dot, multiple backslashes, comma, spaces, [.], 'dollars and', cents) found 0. One other hit is unrelated: [masked: where it is].
- **SEC-ORG-1** (records-history), fixed: Same as REC-B1-1. The org-pattern scan over the 308 blobs new to the block and the 60 messages found 0 hits. The org name appears only as the repository path it already has on main.
- **SEC-PRIV-1** (records-history), partly: The fragment is gone from b1-checks at every commit, and the split check works: proven by mutation in a --no-local clone, and it finds line 3866 at 18ae018. But the newly imported Block 1 check report describes the address closely enough to rebuild it (RC-1), and the check has gaps (RC-5).
- **REC-B1-2** (records-history), fixed: ADR-0103's row links ADR-0110. ADR-0110's 'What this changes' says §3 is extended, as ADR-0106 did. ADR-0103's note was extended (that note is not on main). adr-records passes on a simulated --no-ff merge into a002e60.
- **MI-1** (records-history), fixed: As REC-B1-2. The extra 'changed by ADR-0110' on ADR-0105's row is justified: ADR-0105 item 47 says 'which only packages/runner/src/pages.ts has', and scripts/playwright-pin.ts lines 25-26 name both packages.
- **REC-B1-3** (records-history), fixed: ADR-0111 header, index row and playbook now say User, matching the legend. The count line (112; 105 accepted, 15 by continuation, 38 delegated; 7 proposed) matches a recount of the 112 rows and 112 files. c1fc822's commit message still says User-approved, as the history of its day.
- **REC-B1-4** (records-history), fixed: audit-2026-10-21.md below its header equals the Temp file saved 02:58:38Z and sent 02:58:54Z, except for one '<' written as '&lt;', as the header says. Pointers were added. Neither redacted sentence appears in it as a 5-word run.
- **REC-B1-5** (records-history), fixed: docs/reviews/2026-10-21-review-packet.md below its header is byte-identical to the Temp file sent at 06:04:10Z. The playbook row now says it was given at 23:04 and is kept.
- **REC-B1-6** (records-history), fixed: ADR-0110 Context and Consequences now give two CI cycles, under Claude's risky-change reading, labelled as Claude's.
- **REC-B1-7** (records-history), fixed: The links are left as quoted. The header says why, and the file is in the QUOTED set.
- **REC-B1-8** (records-history), fixed: The backlog tests row says SUB-DA-4 was filed since 489483e (an ancestor of main) and that the 22:59 chat was wrong. The chat correction to the owner is still owed by the coordinator.
- **MI-2** (records-history), fixed: 41bbaa9's message (formerly 44b5f29) says 2026-10-21 21:27 local (2026-10-22T04:27Z), matching the transcript and ADR-0110.
- **MI-4** (records-history), fixed: The status page's F03 list drops the GET-render item and points to 524e057 (reachable) and ADR-0091's note.
- **MI-5** (records-history), partly: The row now covers b1check-clones and quotes the owner's clones answer verbatim. But it wrongly includes the --no-local re-check clones (RC-6), and it misses that reflogs hold this rewrite's replaced commits, so its gc command would not remove them (RC-2).
- **TS-MONEY-2** (records-history), recorded-as-chosen: ADR-0111 Consequences name the risk, and the first-live-run row has the check before an OpenAI run. Both quote 'Record it and add a check (Recommended)' and its description verbatim. There is no code change, as chosen. C3's other-family critic is gpt-6-astra (c3.ts:51, profiles.ts:42).
- **C-RECORDS-SLIPS** (records-history), fixed: claims-oracle-full.log is byte-identical to Temp (176 bytes). 17e2599 was committed at 22:33:38 and f922278 at 22:34:36, as the logs README says. The 44b5f29 time slip is fixed in 41bbaa9.

### What each lens checked

#### money

- I read the fix round's gateway diff, ba0adee..083ddb8: errors.ts, gateway.ts (completeOnce, imageOnce, video catch, stopIfEnding, redactMessage), ledger.ts, providers/anthropic.ts, fal.ts, openai.ts, openrouter.ts and the new stream.ts, and the cut-off.test.ts diff (545 lines).
- I checked the SDK behaviour the fixes rely on in node_modules. openai 7.28.0's Stream ends quietly on an abort (core/streaming.js:139-147), and an SSE error becomes an APIError carrying the error body. Both SDKs clear their 600,000 ms DEFAULT_TIMEOUT once fetch resolves (openai client.js:1068-1095; @anthropic-ai/sdk 0.131.0 client.js:669-675). The Anthropic SDK drops pings, emits 'connect' after the headers, 'streamEvent' for each event yielded, and 'message' only at message_stop. It throws APIUserAbortError when the stream was aborted after the last event, and emits nothing after 'end', so no restart() can re-arm the timer after end().
- The stall bound: only a stalled stream is closed, measured from the last chunk or event; nothing is armed before the response begins. A stall reads as 'maybe' and goes out once more after retain() checks the workspace cap (ADR-0095), so no cap can be passed. A stall after the finishing chunk settles at planning figures, the same as the stop path.
- The race fixes, against billingOf: the stop's own errors are 'maybe'; a 4xx, a provider-bodied error or a before-write failure is 'none' (ADR-0091's documented assumption, recorded in backlog row 137); withRetries sends nothing after a stop. ADR-0111 items 2, 4, 6 and 8, ADR-0091, 0095, 0099, 0102 and 0109 are not weakened, apart from the trade-off in RB1-F1-1.
- Worked example of a completed streamed answer (OpenAI fixture, no stop). The estimate is reserved, then marked sent, then the stream is read: chunks, finish 'stop', then a usage chunk. The call is settled at (500*1 + 1000*12.5 + 500*10 + 300*50)/1e6 = $0.033 with one ledger entry. end() drains, uncertainUsd is 0, and idle.end() clears the timer.
- Worked example of a cut-off call (OpenAI, stop after two content chunks). AbortSignal.any aborts the SDK's request, and the stream ends quietly. finish is undefined and the stop has aborted, so readChatStream throws closed() (AbortError, 'maybe'). The gateway catch gives cutOffError('maybe'), withRetries does not retry it (not retryable), and end() abandons the call as 'interrupted' at its reservation, with no ledger entry. The same call with Anthropic's 400 arriving as the stop comes is released, counting nothing (tested).
- Mutation proofs in my own clone, C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/recheck-b1-clones/f1-gateway (git clone --no-local of 083ddb8, pnpm install --frozen-lockfile --offline). The baseline is 261 of 261 in 6 files, and 344 tests across the 8 targeted files. All 31 mutations failed at least one test; the script and output are in that scratchpad (recheck-f1-mutate.mjs, recheck-f1-mutate-out.txt). The clone was restored after each mutation; git status shows only vitest's .vitest/ output.
- Records: ADR-0111's Later notes on CC-2, TS-MONEY-5, SEC-NOTE-1 and the tests, ADR-0083's C-LEDGER-ID note, and backlog rows 137-138 match the code. The claim of 10 minutes at 128,000 tokens an hour, about 21,000 tokens, holds, and so do the runner's ask-again limits of 16k, 32k and 64k.
- Privacy: no line added in a002e60..083ddb8 and no commit message contains a fragment of the owner's name or address. The [masked: mail provider's name] matches are the SEC-PRIV-1 test's built-up placeholders and the check report's prose.

*Not checked by this lens:*

- Live provider behaviour, since no network was used. That Anthropic sends only pings during an omitted think rests on the claude-api reference and the SDK source, not on a real stream. Whether OpenAI or OpenRouter send an early role chunk before reasoning was not checked.
- The full gate on 083ddb8 (typecheck, 5,382 unit tests, 58 browser tests) and the workflow bundle hash were not rerun. I ran only the targeted gateway tests in the clone.
- Fixes outside the gateway lens: runner liveness RS-*, web RS-4/5/6, StartForm, the C-MOCK-DIFF mock change, advisor, pin report, and the evidence files.
- Whether the commits' author email field, which uses the same git identity as main's last 50 commits, falls under the owner's 'from Block 1's unpushed history'. I did not examine it beyond confirming it matches main; it is left to the privacy lens.
- Five mutations (C4, C4b, C6, C10, and the stop check after the mark) fail only when vitest's per-test timeout stops a hang. I ran them with --testTimeout=5000 and did not check the repository's own vitest timeout setting.
- I did not delete my clone. Per the owner's 'Delete them after the re-check (Recommended)', it should be removed with the other re-check clones.

#### run

- The f2 diff in ba0adee..083ddb8: liveness.ts, activities/index.ts, asset.ts, pages.ts (comment only), liveness.test.ts, asset-slots.test.ts, pages.test.ts, and the records the f2 hand-offs fed: ADR-0111 Decided by, item 1, Consequences, Tests and Later notes; ADR-0112 items 6 and 'departs', Evidence; backlog rows 82, 127, 128 and the CI-time row; the status page F02 row.
- Clone at 083ddb8, made with git clone --no-local and pnpm install --frozen-lockfile --offline: C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/recheck-b1-clones/f2run. It is clean after every mutation was restored, and kept for the deletion the owner chose after the re-check. Scripts and logs: C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/recheck-f2-scripts.
- Baseline in the clone: liveness.test.ts 27/27 in 40 s. Its only error line is the expected GracefulShutdownPeriodExpiredError.
- Mutations of my own, all caught: R1 and R2 (RS-1, workflow), R3, R5 and R7 (RS-2), R4 (RS-3), R6 (RS-7), A1's url.href, A2's tie, A4's beside, A3's two branches.
- The real 1 s re-read waits: the RS-3 tests and the RS-2 activity test take about 1.03 s each. The condition wait gives up after 1,000 polls of 10 ms; that measured 15.7 s on Windows (timer granularity) and should be about 10 s on Linux. The test timeout is 30 s. The wait catches a missing re-read (R3, R5) and asserts nothing about elapsed time. I judge it a limit that only stops a hang, not a timing dependency: a 2-CPU CI machine would need a 1 s timer to fire more than 9 s late to trip it.
- Every store read in the RS-3 test after the call is held comes from the stop rule. R5 hangs without the re-read, so no other getRun reader can satisfy 'read twice'.
- Release-variant assertions: no false failure on correct code. The 32 first calls are the held ones, ledger ids come from the results, and the cost wait uses a condition.
- The workflow uses no local activities or child workflows, so every activity appears as ActivityTaskScheduled in the history the RS-1 check reads.
- The bundle hash: build.test.ts passes 5/5 in the clone, and the fix round changes no bundle input.
- A3's skipped result is used only in display code (apps/web Timeline, StepDetail, ResultView, view/run.ts).
- The owner's 01:54 answer as quoted in ADR-0111's Later notes matches conversation-continued.md word for word.
- The runner diff and the runner commit messages in ba0adee..083ddb8 hold no private address or organisation details (pattern scan, 0 hits).

*Not checked by this lens:*

- The whole unit suite and the browser tests (targeted tests only, by rule).
- RS-2 end to end through a real Temporal heartbeat timeout or partition. It is covered only by the fake-timer rule tests and MockActivityEnvironment with the real activity wrapper.
- What fal really answers to a second cancel of one job (undocumented), so how likely F2-RC-1's undercount is in practice.
- Running the 1 s re-read tests under real CPU load or on Linux CI. The flake margin was judged from measured durations and the code, not from a stress run.
- Whether a resumed fal job's frame-extraction stage can have the two attempts cancel different jobs on one row. It was not traced.
- Other lenses' areas: the gateway (f1), the web app (f3 and f4), and the history rewrite and private-detail scans beyond the runner diff.

#### web

- The fix round's apps/web diff (ba0adee..083ddb8): StartForm, startDraft, refusals, RunScreen, RunStatusPanel, YourTurn, ConfirmPanel, panels/types, run-data, rundata, run, meter, labels, and the e2e changes to configurations and pasted-key, read line by line against the check's findings and the f3 builder's report.
- The Failed and Cancelled panels' words: CUT_OFF_NOTE and underWayNote checked against the spend book. The run cap counts settled, in-flight and the new reservation, not uncertain rows; the workspace cap counts uncertain rows at reserved plus retained; uncertainRows lists them. They also match UNCERTAIN_ADVICE. ADR-0111 item 7 and the Later notes give the words exactly and label them Claude's.
- RS-5 behaviour: IN_FLIGHT means a live lease on open, sent or accepted rows, so polling stops when calls settle, are cut off or their leases lapse. byRun is the same figure settleLateCost writes to the run. In-flight rows are read before settled ones. The page's initial render and every poll go through getRunData. usePolling re-arms when its delay changes. spendRecords' extra work is cheap: absorb reads, and setAsideTails is one readdir. Busy timeout and WAL are set.
- Accessible description: ActionButton passes aria-describedby through, and actionAttributes sets only aria-disabled and aria-busy. There is one aria-live region in RunScreen. In my clone a browser mutation of the live announcement (cost left out) failed configurations.spec.ts C4 at :180 ('Received string: "Your turn: Run this step? ..."'). Log: C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/recheck-f3-scripts/p5-e2e.log. Script: C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/recheck-f3-scripts/mutate-e2e.mjs. Ports 3481 and 7481 were free afterwards, and the clone was clean.
- The attachment rule on every edit path in StartForm (rename, text edit, removal, add, restore, accept, held-key refusal, other errors, an edit during the request), plus the server's partsHolding and itemsHolding covering every field and item. No other writer of byway.start-attachments exists (grep).
- The pasted-key spec changes: watchForKeys exempts only the first paste. The post-fix Start request is still scanned for leaks, so the change makes the test stronger, not weaker.
- Records: ADR-0100's Later note (reload trade-off as Claude's, not put to the owner), ADR-0111 items 7 and 1 and its Later notes, ADR-0105's CC-1 note, the spec's Start line, the F16 and F02/F03 rows of the review status, the playbook's review row, and the backlog rows filed for my lens. The owner's 01:54 answer is quoted word for word in ADR-0111, matching conversation-continued.md.
- CC-1 evidence: the committed e2e summaries match the scratchpad summaries. Logs spot-checked for real builds and real assertion failures. 051b1aa changes only test 3, so the earlier pasted-key test-4 proofs still hold. The 19 unit mutations in mutate-unit.mjs are real string swaps, and each failed its named test.
- The B-test-wiring fix: YourTurn's cost is required. The E1 log shows C4 failing at :178 with .turn-cost not found.
- Privacy for my lens: the fix round's apps/web diffs and the three f3 commit messages contain no email address except the Anthropic noreply co-author. The commit author identity across a002e60..083ddb8 is the same single identity as main's earlier history (compared without printing it), so these commits expose nothing new.
- Read-only: the reviewed worktree is still clean at 083ddb8. All mutations ran in my own --no-local clone, recheck-b1-clones/f3w, which was clean after each run.

*Not checked by this lens:*

- What a real screen reader says (NVDA, JAWS, VoiceOver). The accessibility fixes were checked through markup and Chromium's accessibility tree only.
- RS-5 end to end in a browser. No demo path keeps a call under way after Cancel, because ADR-0111 cuts off the demo's mock, so the 3 s polling and the meter catching up were checked by code reading and unit tests only.
- The full unit and browser gate. I ran only apps/web's typecheck, its 46 unit test files, and one targeted C4 browser run.
- Re-running the fix round's browser mutations myself, other than the new live-announcement mutation. I relied on their logs, which I spot-checked.
- Real provider streams and fal jobs behind the cut-off note's claims, beyond the spend-book code.
- Areas outside this lens: gateway and runner changes, history-rewrite completeness, organisation details in other files, and the other lenses' findings.

#### c-ci

- Read the check's survivor and notes entries for the six findings, builder f4's report (perFinding, mutationProofs, handoffs, open) and the records pass's notes on them.
- Read the diffs of 87806a4, 711a2b7, 7935624, 681e0de and f0d8b49. All nine lens files are byte-identical between f4's tip (f0d8b49) and 083ddb8, so the merge 2e503f7 and the records commits did not change them.
- C-PIN-TIMEBOMB in clone recheck-b1-clones/lc (git clone --no-local of fix/fx-block1 at 083ddb8, pnpm install --frozen-lockfile --offline). Pins at 1.64.1: 6/6 Playwright-pin tests pass. Pins at 1.70.2: 60/60 ci.test.ts tests pass. ba0adee's test at 1.64.1: fails. Warning line turned off: fails. Up-to-date comparison weakened: 2 fail. Every file was restored from HEAD blobs and the clone's status is empty. No other *.test.ts names 1.63.0 or 1.64.
- The pin report still only reports: playwright-pin.ts and .github/workflows/verify.yml are unchanged across ba0adee..083ddb8. The owner's D4 option text appears word for word in conversation-continued.md, in ADR-0110 (Decision and question) and in the script's docblock.
- ADR-0110's fix-round edits on my lens (Evidence on C-PIN-TIMEBOMB, and 'What this changes' on ADR-0105's item 1) agree with the code. The commit ids they cite (17e2599, ab217bc, 9f1bb47, 246a3e2, 41bbaa9, f24041d, b45ec0a, 28ece89) all resolve to commits reachable from 083ddb8.
- C-MOCK-DIFF: fences() semantics, block.end, and that the Why split matches runner splitCodeDiff. The C7 and voice.apply templates' slot order (critique before artifact). Old reader, lazy-finder-only and first-block mutations, run against both mock test files.
- C-DIFF-DEDUPE: collect() and pair() visit each node once. The part/lead naming in partsIn and withLead. The Set mutation fails the test. Advisor and web recommendation/vocabulary tests 442/442.
- C-STORY-PERSON: walked CATALOG in the clone for non-model, non-voice steps that produce the artifact (C3, C6, C6a, all prose; C5's only one is a tool relay). human.ts:268-269. interpreter.ts rejectedAnswer. The f24041d message text. The backlog row's wording.
- MI-3 and SEC-NOTE-3: guard proofs G0-G10 written to disk in the clone (scratchpad/rc-lc-scripts/guard-proofs.mjs), each run as the guard test alone, with every file restored afterwards. I checked that no product file is .js/.cjs/.mjs and that no product line calls require(.
- The ADR-0105 Later note and the playbook say MI-3, SEC-NOTE-3, C-MOCK-DIFF and C-DIFF-DEDUPE were fixed beyond the owner's words. ADR-0105 quotes the owner's option label word for word. ADR-0111 holds the owner's full fix-round description word for word, matching conversation-continued.md.
- Seen in passing, outside my lens: the author field of every commit in a002e60..083ddb8, and of main's 50 latest pushed commits, is the owner's configured git identity email (masked here). It is the same identity on already-pushed main, so I did not treat it as the SEC-PRIV-1 fragment. The privacy lens should confirm that is the intended reading.

*Not checked by this lens:*

- I did not rerun the full gate (typecheck, the full unit suite, browser tests) or the Temporal/runner e2e suites. I ran only targeted tests: ci.test.ts, guard-sandbox.test.ts, the gateway and prompts mock tests, packages/advisor, and apps/web recommendation and vocabulary.
- I did not rebuild the workflow bundle to check its hash. I relied on the builder's report and the gate statement (f4's runner change is a comment only).
- CI on either machine, and Linux-specific behaviour.
- Files f1-f3 touched (money, run, web) and records outside my six findings, apart from the ADR-0110 and ADR-0105 sentences above.
- Whether the commit-author identity counts as 'the owner's email in any commit' under the owner's rewrite instruction. That belongs to the privacy lens.
- The re-check clone at C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/recheck-b1-clones/lc is left in place, clean at 083ddb8, for deletion after the re-check as the owner chose. My helper scripts are in C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/rc-lc-scripts.

#### records-history

- The owner's three answers of 2026-10-22 01:54: the question JSON and answer text in conversation-continued.md match the session transcript exactly. No owner entry falls between 06:15:52Z and 09:00Z. 40 quotes across the changed records (ADR-0100, 0105, 0111, the playbook, the backlog, the b1-checks header) are verbatim substrings of the 01:48/01:54 entries.
- ADR-0110: the changed-by links from ADR-0103 and ADR-0105 are in the index, its 'What this changes' text and Evidence are updated, and adr-records.test.ts and adr-evidence.test.ts pass (35/35) on a simulated --no-ff merge into a002e60 in my clone.
- ADR-0111: Decided by is 'User' per the legend; the twelve beyond-scope notes are named as Claude's choice. The check found 21 findings and 29 notes, matching block1-check-result.json.
- Count line: recomputed from the index (112 rows, 112 files, 105/15/38/7).
- Imported evidence against what the owner got: the audit (one &lt; only), the packet (identical) and the Block 1 check report (sent 08:47:47Z; header plus three re-masked lines differ) all match. The claims-oracle log and the e2e and unit mutation summaries are byte-identical to their Temp sources in fxnc and f3.
- History: all 60 commits in a002e60..083ddb8 (1,482 unique blobs, every message, notes, and the decoded \u, &#, %XX variants). The overage in any spelling: 0. Any part of either owner address in trees and messages: 0. Org-detail patterns in new blobs and messages: 0.
- The rewrite: 39 pairs in hist3-map.json. 30 differ only in the B1 checks report (3 lines each), 9 have identical trees, and all parents are mapped correctly. No ref holds e438a14, 18ae018, e9a1585, 05fd020 or b3bf249, and refs/original is gone.
- The integration commit 41bbaa9 gives 21:27 local.
- Commit ids: every mixed-hex id in docs changed by the block and in the 60 messages resolves on 083ddb8. The exceptions are quoted reports, playbook row 51's deliberate pre-rewrite ids, the evidence README's 18ae018 with its mapping, the probe READMEs with their mappings, and 38afef53 (the bundle hash).
- Neither redacted sentence (ADR-0103's Consequences sentence, the Windows CI write-up's sentence) appears as a 5-word run in the audit, the packet, the Block 1 check report, the B1 checks report or the conversation record.
- SEC-PRIV-1 mutation proof in my --no-local clone recheck-b1-clones/rec-email: with the split patterns removed the new test fails, and a planted split fake fails the tree test. The clone was restored to a clean 083ddb8.

*Not checked by this lens:*

- ADR-0111's claims about OpenAI's community reports and gpt-6-astra's model page (no web lookup).
- Paraphrased, not verbatim, restatements of the two redacted sentences.
- Commit abbreviations made only of letters a-f or only of digits (only mixed-hex tokens were resolved).
- Code changes outside the records, evidence and history lens.
- Independence caveat: the classifier denied my first script, which derived the email from the transcript into a scratch file (it never ran, and I deleted it). I used the scratchpad's email-patterns.txt in memory instead. [masked: Which of its parts match which of the owner's addresses is not repeated here.]
- Disclosure: one tool output in this session printed the escaped overage figure, because a sed mask missed the escaped form while I compared e438a14 with 126025f. It is in this session's tool-results cache, C:\Users\arvik\.claude\projects\C--Users-arvik-code-byway\67b5b9ac-8595-4cc6-898a-d7d911b9d422\tool-results\bydz81mle.txt, and in the transcript. It is not in the repository or in any file I wrote.
- My scratch for the coordinator to delete with the other clones: C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/recheck-b1-clones/rec-email, plus the scripts in C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/recheck-b1-lens-rec. They hold no secret values.

## The re-check of the second fix round (2026-10-22)

*From `block1-round2-recheck-result.json` (10:33). The small re-check the owner chose at 06:40, "Fix them, small re-check, branch CI (Recommended)": a code lens and a records-privacy lens on the second fix round's commits at 137bf75, against main at a002e60, two refuters for each serious finding. Claude put its findings to the owner at 10:34; the owner answered at 10:35.*

### Findings that survived the refuters (10)

#### B1R2-CODE-1: The conversation record does not hold the owner's design answers on the stall limit, which the code, ADR-0111 and the backlog quote

*Finding. Severity should-fix; outcome confirmed; lens code; where `docs/adr/evidence/conversation-continued.md`.*

**What is wrong:**

The record ends at the owner's answer of 2026-10-22 06:40. The answers to the stall-limit design questions came later and are not in it: "In Block 2, 15 meanwhile (Recommended)", "Per model (Recommended)", the default "15 minutes (Recommended)", and the owner's own words on video and image waits. Three places quote them, and none links any evidence that holds them: stream.ts:7-8, ADR-0111:119 and backlog.md:138.

**Evidence:**

grep -cF on docs/adr/evidence/conversation-continued.md at 137bf75 gives 0 for "In Block 2, 15 meanwhile (Recommended)", 0 for "Per model (Recommended)" and 0 for the owner's video sentence ("I am fine with including fal ... second party reviewers?"). It gives 2 for "15 minutes (Recommended)", but both hits are inside the 06:40 question lists, not the design answer. The file's last entry is "USER 2026-10-22T06:40:01.778-07:00 ... [ANSWER]". The same strings appear once each in ADR-0111 (the video sentence matches the brief's text exactly), and "In Block 2, 15 meanwhile (Recommended)" appears in packages/gateway/src/providers/stream.ts. Only f2fc531 touched the record in this round, and it covers the 06:40 answers only.

**When it goes wrong:**

A reader who checks ADR-0111's Later note, or STREAM_IDLE_MS's comment, against the evidence finds no record of the answers that set the bound. The quotes cannot be checked word for word, and the chosen option's description cannot be checked either (the stream.ts comment repeats its premise, see B1R2-CODE-3).

**Proposed fix:**

Extract the conversation again up to and including the design question and its answers (and the questions' option descriptions) into conversation-continued.md, then quote-check ADR-0111:119, backlog.md:138 and stream.ts:7-8 against it. Commit before the push.

**Refuter 1: confirmed, should-fix.**

**Reasoning:**

The finding reproduces exactly. At 137bf75 the conversation record stops at the owner's answer of 2026-10-22 06:40. Its header says "up to 2026-10-22 06:40 local", and its last entry is "## USER 2026-10-22T06:40:01.778-07:00 ... [ANSWER]" at line 602. The stall-limit design question and the owner's answers to it came later, and they are not in the record.

The session transcript (the main thread, not sidechains) has:
- the AskUserQuestion with the four design questions at 2026-10-22T13:41:34Z (06:41 local);
- the owner's answer at 2026-10-22T16:50:28Z (09:50 local).

These are the only owner entries after 06:40. The other one, at 17:04Z, is a task notification. So both the question and the answer fall after the record's last entry.

Only f2fc531 touched the record in 56c1347..137bf75, and it extended the record only to 06:40. ADR-0111:119 introduces the design answers with "The design was put to the owner the same day, and the owner answered:". It gives no time and no evidence link. backlog.md:138 refers to ADR-0111. stream.ts:8 cites no evidence. A reader therefore has nowhere in the repo to check these quotes. No test checks quotes against the record either: scripts/test/adr-evidence.test.ts only scans for addresses and organisation details.

It is not blocking. Compared by program against the transcript, the quotes are word for word: all four answers and the "In Block 2, 15 meanwhile (Recommended)" option description in ADR-0111:119, the fragments in backlog.md:138, and the label in stream.ts:8. So nothing records the owner's words falsely. What is missing is evidence. That is the should-fix the brief named for this case.

Two small details in the finding are loose, and neither changes it:
- The stream.ts quote sits on line 8; lines 7-8 are the sentence that holds it.
- The two hits for "15 minutes (Recommended)" (record lines 572 and 599) are inside the option label "No shorter than the step's 15 minutes (Recommended)". That label is in the 04:04 and 06:38 question lists, as the finding says.

Two related slips turned up:
1. The evidence README's row for conversation-continued.md still says "from 2026-10-07 to 2026-10-22 01:54 local". It has been stale since f2fc531 took the record to 06:40, and that commit's change to the README did not update it.
2. ADR-0111:119 reads "Claude puts a short design to the owner before building it, The design was put to the owner the same day". There is a capital "The" after a comma.

What I could not check: whether the app records other surfaces of the session, which the transcript JSONL might lack. I ran no tests, because this is a records finding.

**Evidence:**

git show 137bf75:docs/adr/evidence/conversation-continued.md | grep -cF gives these counts:
- 0 for "In Block 2, 15 meanwhile (Recommended)"
- 0 for "Per model (Recommended)"
- 0 for "I am fine with including fal"
- 0 for "second party reviewers?"
- 2 for "15 minutes (Recommended)": lines 572 and 599, both inside the label "No shorter than the step's 15 minutes (Recommended)" in the 04:04 and 06:38 CLAUDE-ASKS lists
- 1 for "Build selectable limits for every model/provider: 15, 30, 45, and 60 minutes"
- 3 each for "Fix them, small re-check, branch CI (Recommended)", "Keep it as it is" and "Yes, after the push (Recommended)"

The record's last header is "## USER 2026-10-22T06:40:01.778-07:00 (2026-10-22T13:40:01.778Z)".

git grep at 137bf75:
- "In Block 2, 15 meanwhile (Recommended)" is found only in docs/adr/0111-cancel-cuts-off-the-calls-byway-can-stop.md:119, docs/backlog.md:138 and packages/gateway/src/providers/stream.ts:8.
- "Per model (Recommended)", "second party reviewers" and "30, 45, 60, 75" are found only in ADR-0111:119 and backlog.md:138.

git log 56c1347..137bf75 -- docs/adr/evidence/conversation-continued.md lists only f2fc531.

Session transcript C:/Users/arvik/.claude/projects/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422.jsonl, main thread:
- AskUserQuestion at 2026-10-22T13:41:34.650Z with the questions "Where should the selectable answer-wait limits (15/30/45/60 minutes) be built?", "How fine-grained should the choice be?", "Video clips (fal) are queue jobs ... Include them?" and "What should the default be for text and image models?".
- Answer at 2026-10-22T16:50:28.366Z: "In Block 2, 15 meanwhile (Recommended)", "Per model (Recommended)", the owner's own video sentence, and "15 minutes (Recommended)".
- No other owner message or answer after 13:40:02Z.

Comparison script (C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/refute-code1/cmp.js):
- ADR-0111 holds all four answers and the option description verbatim (true).
- The record holds none of the answers, nor the question or the description (all false).

The evidence README row for conversation-continued.md reads "from 2026-10-07 to 2026-10-22 01:54 local", though the record now runs to 06:40.

scripts/test/adr-evidence.test.ts has no quote check.

**Fix:**

1. Extract the session again, through the 2026-10-22T13:41:34Z AskUserQuestion (06:41 local) and the owner's answer at 2026-10-22T16:50:28Z (09:50 local), into docs/adr/evidence/conversation-continued.md. Add a CLAUDE-ASKS entry with all four questions and their options and descriptions, exactly as asked, and an [ANSWER] entry. Update the record's header ("up to ... 09:50 local") and the extraction-dates sentence.
2. In docs/adr/evidence/README.md, correct the row's span. It still says 01:54; change it to the new end.
3. In ADR-0111:119, give the design answers' time and link the record ("([evidence/conversation-continued.md](evidence/conversation-continued.md), 2026-10-22 09:50)"). Fix "before building it, The design" to "before building it. The design".
4. Quote-check ADR-0111:119, backlog.md:138 and stream.ts:7-8 against the new entries. They match the transcript today.
5. Commit before the push. As with f2fc531, run the evidence check over the new text so that nothing describing the owner's address goes in.

**Refuter 2: confirmed, should-fix.**

**Reasoning:**

The finding is right, and I could not refute it. At 137bf75, conversation-continued.md ends with the owner's [ANSWER] of 2026-10-22 06:40 local. The stall-limit design questions came after that: Claude asked them at 06:41:34 local (13:41:34Z) and the owner answered at 09:50:28 local (16:50:28Z). Neither entry is in the record, and no other file in the tree holds them.

Three places quote those answers: ADR-0111:119, backlog.md:138 and stream.ts:7-8. None of them links any evidence that holds them. ADR-0111 dates only the 06:40 answer. The backlog points to "ADR-0111's Later notes", and stream.ts points to the ADR as well.

The evidence README's contract makes this a broken record. It names conversation-continued.md as the evidence for "The records and backlog rows that quote the owner after 2026-10-07".

The owner's choices are not in dispute. The record simply does not back them yet, and the brief itself says to report that as a should-fix.

It is not blocking. I checked every quote against the session transcript and each one matches word for word: "In Block 2, 15 meanwhile (Recommended)" with its option description, "Per model (Recommended)", "15 minutes (Recommended)" and the owner's whole sentence on video. So there is no false record of the owner's words. The evidence is only missing.

What I could not check: whether the next records pass already planned this extraction. It does not matter, because the finding holds at 137bf75, the commit to be pushed.

**Evidence:**

- **The record.** At 137bf75, `grep -cF` on docs/adr/evidence/conversation-continued.md gives these counts:
  - 0 for "In Block 2, 15 meanwhile (Recommended)"
  - 0 for "Per model (Recommended)"
  - 0 for "I am fine with including fal"
  - 0 for "second party reviewers"
  - 2 for "15 minutes (Recommended)". Both hits are the option "No shorter than the step's 15 minutes (Recommended)" in the CLAUDE-ASKS entries of 04:04 and 06:38, not the design answer.
- **Where the record ends.** Its last heading is "## USER 2026-10-22T06:40:01.778-07:00", and its header says it runs "up to 2026-10-22 06:40 local".
- **Where the quotes live.** `git grep -F` at 137bf75 finds "Per model (Recommended)" and "second party reviewers" only in docs/adr/0111-cancel-cuts-off-the-calls-byway-can-stop.md:119 and docs/backlog.md:138. "In Block 2, 15 meanwhile" is in those two files and in packages/gateway/src/providers/stream.ts:8. In a002e60..137bf75 no evidence file ever held them; only those three files did.
- **The round's commits.** `git log 56c1347..137bf75` on the record shows only f2fc531. Its message says it covers the entries after 01:54 up to the 06:40 answers.
- **The transcript.** I parsed the session's .jsonl with a script that masks addresses: C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/b1r2-code1-scan.mjs.
  - Claude asked four questions with AskUserQuestion at 2026-10-22T13:41:34.650Z: "Where should the selectable answer-wait limits (15/30/45/60 minutes) be built?", "How fine-grained should the choice be?", "Video clips (fal) are queue jobs ... Include them?" and "What should the default be for text and image models?".
  - The owner's answer is dated 2026-10-22T16:50:28.366Z. It reads "In Block 2, 15 meanwhile (Recommended)", "Per model (Recommended)", the owner's own sentence on video, and "15 minutes (Recommended)".
  - A second script (b1r2-code1-after.mjs, same folder) finds no other owner message or answer after 13:40:30Z. Those two entries are all the record is missing.
- **The quotes are true.** Each quote in ADR-0111:119 and backlog.md:138 matches the transcript word for word, including the option description ADR-0111 gives for "In Block 2, 15 meanwhile". The video sentence ending "...credible second party reviewers?" matches exactly.
- **The README's contract.** docs/adr/evidence/README.md:8 names conversation-continued.md as the evidence for "The records and backlog rows that quote the owner after 2026-10-07".

**Fix:**

Extend conversation-continued.md with the record's own extractor by two entries:
- the CLAUDE-ASKS of 2026-10-22 06:41:34 local (13:41:34Z), with all four questions and their option descriptions exactly as asked;
- the owner's [ANSWER] of 09:50:28 local (16:50:28Z).

Update the header's range ("up to 2026-10-22 09:50 local") and its list of extraction passes. In ADR-0111:119, add the answer's time and a link to evidence/conversation-continued.md for the design answers, then quote-check ADR-0111:119, backlog.md:138 and stream.ts:7-8 against the record. Commit before the push.

Two slips sit next to this, and the same records pass can fix them:
- docs/adr/evidence/README.md:8 still says the record runs "to 2026-10-22 01:54 local". f2fc531 extended the record to 06:40 without updating the README.
- docs/backlog.md:137 (the billing-assumptions row) still says "A stream that sends nothing for ten minutes (STREAM_IDLE_MS, providers/stream.ts)". 137bf75 made that bound fifteen minutes.

There is also a typo at ADR-0111:119, "...before building it, The design was put to the owner...": a comma splice with a capital T.

#### B1R2-CODE-2: ADR-0111's Consequences and the backlog still state the stall bound as ten minutes, and ADR-0111 cites a backlog row the round renamed

*Finding. Severity should-fix; outcome confirmed; lens code; where `docs/backlog.md:137`.*

**What is wrong:**

The bound is fifteen minutes (STREAM_IDLE_MS = 900_000) and the tests assert "15 minutes". Two passages still describe current behaviour with ten minutes. backlog.md:137 says "A stream that sends nothing for ten minutes (STREAM_IDLE_MS, providers/stream.ts) is read the same way". ADR-0111:93 (Consequences, ADR-0091 bullet) says "Since block 1's fix round (Later notes), a stream that sends nothing for ten minutes is `maybe` too". ADR-0111:113 is the dated CC-2 Later note, so its "ten minutes" is history. But it sends the reader to the backlog row "An Anthropic think that sends nothing for ten minutes is read as a stalled stream", and 137bf75 replaced that row with "Selectable answer waits per model (block 2)".

**Evidence:**

A grep of the tree outside docs/adr/evidence for 'ten minutes|10 minutes|ten-minute' finds stream.ts lines 10 and 16 (both about the SDKs' own timeout, correct). It also finds ADR-0111:93, :113 and :119 (119 quotes the owner's question, correct) and backlog.md:137 and :138 (138 gives the history correctly). `git diff 56c1347..137bf75 -- docs/backlog.md` shows the row that ADR-0111:113 names being removed and the new row added. A grep for the old row name in docs/*.md finds nothing.

**When it goes wrong:**

The owner or a later session reads the backlog's billing-assumptions row, or ADR-0111's Consequences. They take the bound to be ten minutes and reason about Anthropic thinks from that, or they follow ADR-0111:113 to a backlog row that no longer exists.

**Proposed fix:**

Change backlog.md:137 and ADR-0111:93 to fifteen minutes, citing ADR-0111's Later note of 2026-10-22. In ADR-0111:113, either name the new row ("Selectable answer waits per model (block 2)") or add "(now ...)" after the old row name.

**Refuter 1: confirmed, should-fix.**

**Reasoning:**

Every part of the finding reproduces at 137bf75. The code bound is fifteen minutes: `STREAM_IDLE_MS = 900_000` in providers/stream.ts:19, and 137bf75 changed it from 600_000. The stall message is built from that constant (`stalledDetail`, stream.ts:54), and cut-off.test.ts:778 and :857 assert "nothing came for 15 minutes".

Two passages still state ten minutes as current behaviour:
- **backlog.md:137** (billing-assumptions row): "A stream that sends nothing for ten minutes (STREAM_IDLE_MS, providers/stream.ts) is read the same way". It names the constant, which now holds fifteen minutes. The next row, backlog.md:138, says fifteen, so the file contradicts itself.
- **ADR-0111:93** (Consequences, ADR-0091 bullet): "Since block 1's fix round (Later notes), a stream that sends nothing for ten minutes is `maybe` too".

137bf75 edited only ADR-0111's line 119 note. It did not touch :93 or backlog :137.

ADR-0111:113 (the dated CC-2 note) points to the backlog row "An Anthropic think that sends nothing for ten minutes is read as a stalled stream". That row existed at 56c1347 (backlog line 138). d665311 kept it. 137bf75 replaced it with "Selectable answer waits per model (block 2)". The old row name now appears in the tree only at ADR-0111:113, so the pointer leads nowhere.

The fix is allowed:
- ADR-0103 rule 1 lets Consequences change even after a record reaches main, and ADR-0111 has not reached main.
- ADR-0111's Later-notes header (:110) says Consequences was "corrected in place in the same pass", and :116 and :118 do the same. Leaving :93 at ten minutes breaks the record's own practice.

One thing softens it. ADR-0111:119 states fifteen minutes and names the new row, so a reader of the whole note list can recover. That does not make :93 or backlog:137 correct.

Severity is should-fix, not blocking. These are stale records of byway's behaviour, not wrong money, not wrong behaviour, and not the owner's words. Note ADR-0111:113's own "ten minutes" is dated history and correct as history; only its row pointer is stale.

Not checked: docs/adr/evidence (excluded on purpose). No tests were run, since the finding is about docs only.

**Evidence:**

Worktree HEAD is 137bf75ff13d01d29437d065db91ad324e601fb2.

- **Constant:** `grep -rn "STREAM_IDLE_MS\s*=" packages/gateway/src` gives stream.ts:19 `export const STREAM_IDLE_MS = 900_000;`. `git show 137bf75 -- packages/gateway/src/providers/stream.ts` shows `-export const STREAM_IDLE_MS = 600_000;` and `+export const STREAM_IDLE_MS = 900_000;`.
- **Message and tests:** stream.ts:54 builds the message as `nothing came for ${STREAM_IDLE_MS / 60_000} minutes`. cut-off.test.ts:778 and :857 expect "nothing came for 15 minutes".
- **Stale passages:**
  - `sed -n 137p docs/backlog.md` contains "A stream that sends nothing for ten minutes (STREAM_IDLE_MS, providers/stream.ts) is read the same way, \"may have been billed\" and sent once more at most (CC-2)".
  - `sed -n 93p` of ADR-0111 contains "Since block 1's fix round (Later notes), a stream that sends nothing for ten minutes is `maybe` too, Anthropic's included".
- **Wider grep:** `git grep -iE "10-minute|ten minute|10 min\b"` outside docs/adr/evidence finds no other stale stall wording. The other hits are stream.ts:10 and :16 (the SDKs' own timeout, correct), ADR-0111:113 and :119 (dated history and a quote of the owner), and backlog:138 (history given correctly).
- **Row rename:**
  - `git show 56c1347:docs/backlog.md` has the old row at line 138.
  - `git show d665311 -- docs/backlog.md` only edits that row's text.
  - `git show 137bf75 -- docs/backlog.md` has `-| An Anthropic think that sends nothing for ten minutes is read as a stalled stream |` and `+| Selectable answer waits per model (block 2) |`.
  - `grep -rn "An Anthropic think that sends nothing"` over the tree finds only ADR-0111:113.
- **ADR-0111 changes:** `git show 137bf75 -- docs/adr/0111-...md` touches only hunk @@ -116,5 +116,5 @@, the RB1-F1-1 note at :119.
- **Rules on editing:** ADR-0103:40 (rule 1) says the "other sections may change", meaning those other than Context and Decision. ADR-0111:110 says "Consequences ... were corrected in place in the same pass".

**Fix:**

1. In docs/backlog.md:137, change "for ten minutes" to "for fifteen minutes (ten from CC-2 until the owner's answer of 2026-10-22, ADR-0111's Later notes)".
2. In ADR-0111:93, change "a stream that sends nothing for ten minutes is `maybe` too" to "a stream that sends nothing for fifteen minutes is `maybe` too (ten until the owner's answer of 2026-10-22, Later notes)".
3. In ADR-0111:113, keep the dated "ten minutes" text as history and repoint its row reference: (backlog row "An Anthropic think that sends nothing for ten minutes is read as a stalled stream", now "Selectable answer waits per model (block 2)").
4. Re-run the ADR log check to confirm it still passes. The edits are to Consequences and Later notes only, which ADR-0103 rule 1 allows.

**Refuter 2: confirmed, should-fix.**

**Reasoning:**

I could not refute it. The owner chose fifteen minutes ("In Block 2, 15 meanwhile (Recommended)", "15 minutes (Recommended)"), and the code does what they chose: STREAM_IDLE_MS = 900_000 at packages/gateway/src/providers/stream.ts:19, and cut-off.test.ts:778 and :857 assert "nothing came for 15 minutes". Two passages still describe how byway behaves now with the old ten minutes:

1. docs/backlog.md:137 says "A stream that sends nothing for ten minutes (STREAM_IDLE_MS, providers/stream.ts) is read the same way". The next row (:138) says the bound is fifteen minutes, so two neighbouring rows disagree.
2. ADR-0111:93 (Consequences) says "a stream that sends nothing for ten minutes is `maybe` too". That is present tense, and today it is false: such a stream is still open and nothing is decided about it at ten minutes.

This is not a historical record left alone on purpose. ADR-0111:110 says the record has not reached main, so Consequences "were corrected in place in the same pass". ADR-0103 rule 1 (line 40) allows sections other than Context and Decision to change even after main. Consequences is meant to match the current state. The first fix round updated it for CC-2, and the second round did not update it for fifteen minutes.

On ADR-0111:113: that CC-2 Later note is dated, so its "ten minutes" is history and correct. But it names a backlog row ("An Anthropic think that sends nothing for ten minutes is read as a stalled stream") that 137bf75 removed. The diff of docs/backlog.md shows that row deleted and "Selectable answer waits per model (block 2)" added, and a grep of docs finds the old row name only at ADR-0111:113. So it points to a row that no longer exists. The harm is small, because the RB1-F1-1 note at :119, two bullets later, names the new row.

Severity should-fix is right. These are stale descriptions in the documentation. They do not misquote the owner, they do not change money or behaviour (the code and tests are right), and they do not break a rule.

What I checked:
- the head (137bf75) and the line holding the constant in stream.ts;
- the assertions in the tests;
- a grep for ten minutes / 10 minutes / ten-minute in docs, apps, packages and scripts outside docs/adr/evidence. It finds only ADR-0111, backlog.md and stream.ts, and stream.ts:10 and :16 correctly describe the SDKs' own timeout;
- the diff 56c1347..137bf75 for docs/backlog.md and ADR-0111;
- ADR-0103 rule 1 and ADR-0111's statement that it corrects in place;
- an earlier ADR that marks a renamed or closed backlog row inline: ADR-0105:136, "(now closed)".

What I did not check:
- whether docs/adr/evidence/conversation-continued.md holds the design answers. That belongs to the other lenses.
- I did not run any tests. Nothing in this finding needs a mutation.

**Evidence:**

- packages/gateway/src/providers/stream.ts:19 `export const STREAM_IDLE_MS = 900_000;`
- packages/gateway/test/cut-off.test.ts:778 and :857 expect "nothing came for 15 minutes".
- docs/backlog.md:137: "A stream that sends nothing for ten minutes (STREAM_IDLE_MS, providers/stream.ts) is read the same way, \"may have been billed\" and sent once more at most (CC-2)".
- docs/backlog.md:138: "Until then the bound on a stalled stream is fifteen minutes for every streamed provider ... ten minutes from CC-2 until the owner's answer". This contradicts :137.
- docs/adr/0111-cancel-cuts-off-the-calls-byway-can-stop.md:93: "Since block 1's fix round (Later notes), a stream that sends nothing for ten minutes is `maybe` too, Anthropic's included".
- ADR-0111:110: "This record had not reached main when they were written, so Decided by, items 1 and 7, Consequences, What this changes and Evidence were corrected in place".
- ADR-0103:40 (rule 1): only Context and Decision are final once on main; other sections may change.
- ADR-0111:113 cites the backlog row "An Anthropic think that sends nothing for ten minutes is read as a stalled stream".
- `git diff 56c1347..137bf75 -- docs/backlog.md` removes that row (`-| An Anthropic think that sends nothing for ten minutes is read as a stalled stream |`) and adds `+| Selectable answer waits per model (block 2) |`.
- `grep -rn "An Anthropic think that sends nothing" docs` finds only ADR-0111:113.
- ADR-0111:119 names the new row ("Selectable answer waits per model (block 2)").

**Fix:**

- **docs/backlog.md:137:** change "ten minutes" to "fifteen minutes" and cite ADR-0111's Later note of 2026-10-22 (RB1-F1-1). For example: "A stream that sends nothing for fifteen minutes (STREAM_IDLE_MS, providers/stream.ts; ten minutes from CC-2 until the owner's answer of 2026-10-22) is read the same way".
- **ADR-0111:93 (Consequences):** make the same change, "a stream that sends nothing for fifteen minutes (ten in the first fix round; Later notes) is `maybe` too". The record's own header allows this in-place correction until it reaches main.
- **ADR-0111:113:** keep the dated "ten minutes", because it is history. After the old row name, add "(now \"Selectable answer waits per model (block 2)\")", as ADR-0105:136 does with "(now closed)".

#### B1R2-CODE-3: "At fifteen minutes no think is cut off before its step would end anyway" is untrue for the text calls inside media steps, which have 45 minutes

*Finding. Severity should-fix; outcome confirmed; lens code; where `packages/gateway/src/providers/stream.ts:15`.*

**What is wrong:**

The comment holds for model steps (startToCloseTimeout 15 minutes). The same premise sits in the option the owner chose, quoted in ADR-0111:119: "today's step limit ... so no silent think is cut off before its step would end anyway". It does not hold for the streamed askModel calls made inside the `media` activities, which have a 45-minute limit. Those are assetStep's briefs and integrate calls and relayLink's link call. For an Anthropic call in one of those steps, a silent think of between 15 and 45 minutes used to finish inside its step (Anthropic had no bound before CC-2). Now it is closed as stalled, read as "may have been billed", and sent once more with that attempt retained. That is the paid-twice case the owner's question was about. The code does what the owner chose (15 minutes for every streamed provider). The reason given for the choice is wrong for these calls.

**Evidence:**

packages/runner/src/workflow/acts.ts:20 `model` has startToCloseTimeout '15 minutes'; acts.ts:22 `media` has '45 minutes'. interpreter.ts:324 and :339 run assetStep and relayLink through `media`. asset.ts:130 (briefs, 4,000 tokens) and asset.ts:195 (integrate, the default 16,000, which call.ts:83 doubles to 32,000 after a cut-short answer) and relay.ts:62 call askModel, which calls gateway.complete. anthropic.ts:148 wraps every completion in StreamIdle(req.signal). At the SDK planning rate the backlog row cites (128,000 tokens an hour), 32,000 tokens is about 15 minutes. backlog.md:138 itself gives "model steps 15 minutes and media steps 45 today".

**When it goes wrong:**

A C3- or C5-style run: the asset step's integrate call to Claude is asked again at 32,000 tokens after a cut-short answer and thinks silently for 16 minutes. The stream sends only pings, so StreamIdle closes it at 15 minutes. The call is counted at its reservation as "may have been billed" and sent once more. The owner may be billed twice inside a step that allowed 45 minutes.

**Proposed fix:**

Narrow the comment to model steps and add the media-step case. Tell the owner, in their words, that the premise of "In Block 2, 15 meanwhile" does not hold for text calls inside image and video steps, and ask whether those calls should keep 15 minutes until block 2. Do not change the bound without their answer.

**Refuter 1: confirmed, should-fix.**

**Reasoning:**

I could not refute the finding, and it reproduces. The comment at stream.ts:15 says "At fifteen minutes no think is cut off before its step would end anyway". That premise is false for the streamed text calls made inside `media` activities. It is also stated in the option text quoted at ADR-0111:119 ("today's step limit ... so no silent think is cut off before its step would end anyway") and again in the 137bf75 commit message ("so no silent Anthropic think is cut off before its step would end").

How the code path works:
- acts.ts:20 gives `model` a 15-minute limit and acts.ts:22 gives `media` 45 minutes.
- interpreter.ts:324 sends assetStep through `media`, and interpreter.ts:339 sends relayLink through `media`.
- Inside those steps, askModel (call.ts:78) calls deps.gateway.complete for four calls: briefs (asset.ts:130, 4,000 tokens), integrate (asset.ts:195, the default 16,000, which call.ts:83 doubles to 32,000 on a cut-short answer) and the relay link (relay.ts:62, 4,000).
- The tier is `step.tier ?? 'mid'`, and the Anthropic profiles map mid to Sonnet 5.5 or Opus 5.5. anthropicParams sets no thinking config, so these models think adaptively.
- anthropic.ts:148 wraps every completion in StreamIdle. The timer restarts only on the SDK's `connect` and `streamEvent` events.
- The installed @anthropic-ai/sdk 0.131.0 skips ping events (core/streaming.js:112, `if (sse.event === 'ping') continue;`). So a silent think restarts nothing.
- When the stream stalls, streamEndedEarly marks it billing 'maybe', and BILLABLE_CALL (retry.ts:31, maybeResends 1) sends it once more.
- On main (a002e60), Anthropic's stream had no signal and no bound (`opts.client.beta.messages.stream(anthropicParams(req, true)).finalMessage()`). A think of 15 to 45 minutes inside a media step therefore used to finish within its step.

Reproduction: in a scratch clone I added a test to cut-off.test.ts. It uses the existing fake-timer harness and simulates an Anthropic stream that connects, sends two events, then stays silent for 16 minutes before answering. Result: 2 sends, both aborted ([true, true]), and the call failed with "anthropic's stream ended without producing a whole answer (nothing came for 15 minutes, after 2 events)", with uncertainUsd 0.040088 (both attempts counted as "may have been billed"). About 30 minutes passed in all, well inside a 45-minute media step.

Why the severity stays should-fix and not blocking:
- The behaviour is what the owner chose: "15 minutes for every streamed provider" is in the option description itself. Only the reason given is wrong.
- The real exposure is narrow. Briefs and relay link reach at most 8,000 tokens after doubling, so a 15-minute silent think there would mean under about 9 tokens a second. Integrate's 32,000-token retry is exactly 15 minutes at the SDK's planning rate of 128,000 tokens an hour. So the case needs a think that leaves room for an answer and runs below about 35 tokens a second.
- It is still a real double-pay path, and it is the very case the owner asked about.

What I checked and what I could not:
- For model steps the comment broadly holds. When a step attempt times out, ADR-0099 lets a new attempt take over and resend the call within one 60-second lease. I did not trace that takeover path in code.
- I did not run the full suite, only the one added test.

Side observation, outside this finding: docs/adr/evidence/conversation-continued.md holds the 06:40 answers (lines 572–603), but grep finds none of the later design answers ("In Block 2, 15 meanwhile", "Per model", "15 minutes", the video question). The record does not hold them yet.

**Evidence:**

- Branch tip: worktree C:/Users/arvik/code/byway/.worktrees/fx-block1 at 137bf75.
- packages/gateway/src/providers/stream.ts:14-15: "pings, which the SDK does not pass on. At fifteen minutes no think is cut off before its step would end anyway."
- packages/runner/src/workflow/acts.ts:20: `model` startToCloseTimeout '15 minutes'. acts.ts:22: `media` startToCloseTimeout '45 minutes', maximumAttempts 2.
- interpreter.ts:324 is `media.assetStep(...)` and :339 is `media.relayLink(...)`.
- asset.ts:130 askModel briefs, maxOutputTokens 4_000. asset.ts:195 askModel integrate, no maxOutputTokens, so DEFAULT_MAX_OUTPUT 16_000 (call.ts:38), doubled at call.ts:83 to at most 64_000 (32,000 on the second and last attempt).
- relay.ts:62 askModel link, maxOutputTokens 4_000.
- anthropic.ts:146-157 is `new StreamIdle(req.signal)`, with restart only on 'connect' and 'streamEvent'. The stalled path throws streamEndedEarly with billing 'maybe'.
- retry.ts:31 `BILLABLE_CALL = { maybeResends: 1 }`.
- SDK node_modules/.pnpm/@anthropic-ai+sdk@0.131.0_zod@4.6.5/.../core/streaming.js:112 `if (sse.event === 'ping') { continue; }`.
- Main a002e60 anthropic.ts:128 is `opts.client.beta.messages.stream(anthropicParams(req, true)).finalMessage()`, with no signal and no bound.
- ADR-0111:119 quotes the option: "Meanwhile Block 1 uses 15 minutes for every streamed provider (your shortest choice and today's step limit), so no silent think is cut off before its step would end anyway."
- docs/backlog.md:138 says "model steps 15 minutes and media steps 45 today".
- Reproduction: clone C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/recheck-b1r2-clones/code3 (pnpm install --frozen-lockfile --offline). The test is inserted into packages/gateway/test/cut-off.test.ts in the "a streamed call that stalls (CC-2)" describe; its source is at C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/ins-code3.txt.
- Command: `npx vitest run test/cut-off.test.ts -t REPRO --silent=false`.
- Output: "REPRO sends 2 aborted [ true, true ] elapsed-bound-min 15" and "REPRO outcome {"err":"anthropic call failed: anthropic's stream ended without producing a whole answer (nothing came for 15 minutes, after 2 events)"} uncertainUsd 0.040088".
- Incidental: grep for "15 meanwhile" in docs/adr/evidence/conversation-continued.md finds nothing.

**Fix:**

Do not change the bound without the owner's answer. Narrow the comment at stream.ts:14-15 to model steps (15-minute limit). Add that the text calls inside media steps (asset briefs, asset integrate, relay link; 45-minute limit) can now be closed as stalled after 15 silent minutes when they would have finished inside their step, and are then sent once more as "may have been billed". In practice that means integrate's 32,000-token retry at below about 35 tokens a second.

The commit message of 137bf75 and ADR-0111:119 restate the premise ("so no silent think is cut off before its step would end"). Leave the quoted option text as it is, since it is the owner's chosen option, and add a correcting sentence after it in the Later note. Put the media-step case to the owner, quoting their choice "In Block 2, 15 meanwhile (Recommended)": its stated reason does not hold for text calls inside image and video steps. Ask whether those calls keep 15 minutes until block 2 or get the media step's limit.

Separately, add the 2026-10-22 design answers ("In Block 2, 15 meanwhile (Recommended)", "Per model (Recommended)", "15 minutes (Recommended)", and the video question) to docs/adr/evidence/conversation-continued.md. They are not there yet.

**Refuter 2: confirmed, should-fix.**

**Reasoning:**

I tried to refute the finding and could not. Every factual link in it checks out at 137bf75, and the owner's choice does not make the stated reason true.

1. The bound applies to text calls in media steps. `media` has startToCloseTimeout '45 minutes' (acts.ts:22) and `model` has '15 minutes' (acts.ts:20). interpreter.ts runs `media.assetStep` (s.role 'asset') and `media.relayLink` (s.role 'relay'). Both call askModel: asset.ts:130 (briefs, 4,000), asset.ts:195 (integrate, no maxOutputTokens, so DEFAULT_MAX_OUTPUT 16,000, which call.ts:83 doubles up to MAX_OUTPUT_CEILING 64,000 after a max-tokens stop) and relay.ts:62 (4,000). askModel calls deps.gateway.complete. anthropic.ts:148 builds `new StreamIdle(req.signal)` for every completion, and STREAM_IDLE_MS is 900,000 no matter which activity made the call. Nothing else bounds these calls: I found no other timeout in call.ts, asset.ts, relay.ts, anthropic.ts or gateway.ts.

2. They go to Anthropic by default. Each uses `tier: step.tier ?? 'mid'`. In profiles.ts:36 and :47 the mid tier is anthropic claude-sonnet-5-5 or claude-opus-5-5, and in :74 it is the OpenRouter Claude. So in the default profiles these are streamed Anthropic calls that think silently.

3. Before this block they could finish. On main (a002e60), anthropic.ts called `opts.client.beta.messages.stream(anthropicParams(req, true)).finalMessage()` with no signal and no idle bound. A long silent think inside a media step therefore finished as long as the step's 45 minutes allowed.

4. A stall now counts as possibly billed and is sent again. streamEndedEarly (stream.ts) attaches `billing: 'maybe'`, and its own comment says "the gateway sends it once more at most, as for a lost answer (ADR-0091)". So a silent think longer than 15 minutes in an integrate call can now be closed, kept at its estimate and sent again. That is the paid-twice case the owner asked about.

5. The premise is stated as general in three places, and it is false for media steps:
- stream.ts:15: "At fifteen minutes no think is cut off before its step would end anyway."
- The commit message of 137bf75: "so no silent Anthropic think is cut off before its step would end".
- ADR-0111:119 quotes the option the owner chose: "(your shortest choice and today's step limit), so no silent think is cut off before its step would end anyway."

The records themselves show the 45-minute limit was known. backlog.md:138 says "model steps 15 minutes and media steps 45 today", yet the same row still calls fifteen minutes "a model step's own limit". The original question to the owner also framed the risk only as "its 15-minute step".

Why not refuted: the owner chose 15 minutes ("In Block 2, 15 meanwhile (Recommended)", "15 minutes (Recommended)"). The finding accepts that and does not ask to change the bound. What it challenges is the reason given to the owner for that choice, which is wrong for one class of calls and touches money. So this is not "a choice the owner made", and should-fix is the right weight.

Why not blocking: the code does what the owner chose. The risky window needs a silent think of 15 minutes or more. At the SDK's planning rate (128,000 tokens an hour), 32,000 tokens is exactly 15 minutes, so in practice only the integrate call's retry at 32,000 to 64,000 tokens can reach it. The briefs and relay calls (4,000 tokens, doubled to 8,000, about 3.75 minutes) almost certainly cannot.

One correction to the finding: the practical risk sits in assetStep's integrate call. Briefs and relayLink are exposed only in principle. The premise is still false for all three, because their step's limit is 45 minutes.

What I did not do: no clone or mutation run. The finding is about the reason given and the records, not a test, and the bound being independent of the activity is plain in the code. I did not measure real Sonnet or Opus think times.

**Evidence:**

- C:/Users/arvik/code/byway/.worktrees/fx-block1/packages/gateway/src/providers/stream.ts:13-15: "a model that is thinking sends only pings ... At fifteen minutes no think is cut off before its step would end anyway." Line 18: `export const STREAM_IDLE_MS = 900_000;`
- packages/runner/src/workflow/acts.ts:20: `model = proxyActivities<RunnerActivities>({ startToCloseTimeout: '15 minutes', ...`
- acts.ts:22: `media = proxyActivities<RunnerActivities>({ startToCloseTimeout: '45 minutes', ... maximumAttempts: 2`
- packages/runner/src/workflow/interpreter.ts: `media.assetStep({ run: this.run, call, step: spec, ports })` and `media.relayLink({ ... shot: shot! })`
- packages/runner/src/activities/asset.ts:130 askModel (maxOutputTokens 4_000, tier step.tier ?? 'mid'); asset.ts:195 askModel 'helper.asset.integrate' with no maxOutputTokens
- packages/runner/src/activities/relay.ts:62 askModel (4_000, tier 'mid')
- packages/runner/src/activities/call.ts:38-39 DEFAULT_MAX_OUTPUT 16_000 and MAX_OUTPUT_CEILING 64_000; call.ts:83 doubles after 'max-tokens'
- packages/gateway/src/profiles.ts:36 and :47: mid tier is anthropic claude-sonnet-5-5 or claude-opus-5-5
- packages/gateway/src/providers/anthropic.ts:146-148: `const idle = new StreamIdle(req.signal); const stream = opts.client.beta.messages.stream(anthropicParams(req, true), { signal: idle.signal });`
- Main (a002e60) anthropic.ts:128: `opts.client.beta.messages.stream(anthropicParams(req, true)).finalMessage()`, with no signal and no bound
- stream.ts streamEndedEarly returns `{ billing: 'maybe' }`; its comment says the gateway "sends it once more at most, as for a lost answer (ADR-0091)"
- Commit 137bf75 message: "STREAM_IDLE_MS is now 900,000 ms (a model step's own limit), so no silent Anthropic think is cut off before its step would end"
- docs/adr/0111-cancel-cuts-off-the-calls-byway-can-stop.md:119 quotes the chosen option's text: "Meanwhile Block 1 uses 15 minutes for every streamed provider (your shortest choice and today's step limit), so no silent think is cut off before its step would end anyway."
- docs/backlog.md:138: "model steps 15 minutes and media steps 45 today, packages/runner/src/workflow/acts.ts" next to "fifteen minutes for every streamed provider, a model step's own limit"

**Fix:**

Keep STREAM_IDLE_MS at 900,000. The owner chose it.

Change the wording:
- stream.ts:13-15 should say that fifteen minutes matches a model step's limit, so no silent think in a model step is cut off before the step would end. It should also say that text calls inside media steps (assetStep's briefs and integrate, relayLink's link call; `media`, 45 minutes) can be closed as stalled after 15 minutes of silence. Such a call is then counted as "may have been billed" and sent once more, until block 2's selectable waits.
- Correct the same claim in ADR-0111's Later note and in the backlog row "Selectable answer waits per model (block 2)". Keep the quoted option text verbatim, because it is what the owner was shown, and add the correction after it.

Tell the owner, quoting their choice "In Block 2, 15 meanwhile (Recommended)", that its stated premise ("so no silent think is cut off before its step would end anyway") does not hold for text calls inside image and video steps, which have 45 minutes. The practical case is the integrate call asked again at 32,000 to 64,000 tokens. Ask whether those calls should keep 15 minutes until block 2. Change nothing until they answer.

The 137bf75 commit message repeats the claim. Fix it in a later record rather than adding another history rewrite just for this, unless the block's history is being rewritten anyway.

#### B1R2-CODE-4: The evidence email check misses Markdown's own escape of @ and some other ways of splitting search terms

*Finding. Severity should-fix; outcome confirmed-partly; lens code; where `scripts/test/adr-evidence.test.ts:100`.*

**What is wrong:**

Commit 2092f9f says "an address with its @ escaped ... and quoted search terms are found". `unescaped` undoes HTML entities and %40/%2E, but not Markdown's backslash escape: GitHub renders `<local>\@<provider>.com` in a .md file as the whole address, and both WHOLE_ADDRESS and SPLIT_ADDRESS[0] need a local-part character, or only spaces, right before the @. Search terms with the quote before the @, terms separated by a comma, backticked parts, an entity without its semicolon (`&#64`) and "at &lt;provider> period com" are missed too. docs/reviews is the folder where lens text lands, and RC-1 was a lens-written description, so the Markdown escape is the most likely way an @ gets escaped there.

**Evidence:**

Probe C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/lensb1r2/email-probe.mjs evals the file's own WHOLE_ADDRESS..emailsIn code at 137bf75 against fake addresses. Log: .../scratchpad/lensb1r2/email-probe.log. MISSED: `<fake>\@<provider>.com`, `'<fake>@', '<provider>.com'`, `'<fake>' @ '<provider>'`, a backticked local part and domain around @, `<fake>&#64<provider>.com`, `<fake> at <provider> period com`, and an @ followed by U+200B. Found: AT/DOT in capitals, (at)/(dot), @ then newline, &#65312;. Each of the round's new forms is guarded: mutations in the clone (removing the unescape, the %40 replace, the quote characters after @, the ".&lt;ending>" alternative, the docs/reviews scan, or one named exception) each fail the email tests. With the patterns as written, a scan of all 1,267 tracked files at 137bf75, every added line of the 69 commits a002e60..137bf75, and their messages found no address at any listed mail provider.

**When it goes wrong:**

A lens's note or review packet copied into docs/reviews writes the owner's address as `<local>\@<provider>.com` to avoid a GitHub @-mention. The check passes, GitHub shows the whole address, and the block is pushed with it.

**Proposed fix:**

In `unescaped`, also turn `\@` into '@' (and `\.` into '.'). In SPLIT_ADDRESS[0], allow quotes, backticks and backslashes before the @ as well as after it, and allow ',' and '+' between quoted parts. Add these fakes to the 'finds an address split...' test.

**Refuter 1: confirmed, should-fix.**

**Reasoning:**

I tried to refute this and could not. The gap reproduces when I run the test file's own code, and a CommonMark/GFM renderer shows the Markdown escape as the whole address.

1. I read the code at 137bf75 (HEAD of the worktree, clean). `unescaped` (scripts/test/adr-evidence.test.ts:100-107) undoes decimal and hex entities, &commat;, &period;, %40 and %2E. It does not undo Markdown's backslash escape. WHOLE_ADDRESS (line 77) needs a local-part character right before the @. SPLIT_ADDRESS[0] (line 90) allows only `\s*` between the local part and the @, and only `[\s/\\'"`]` after it, so a comma or a plus is not allowed there. SPLIT_ADDRESS[2] (line 92) needs "dot" or ".". JS `\s` does not include U+200B.

2. I reproduced it with the exact test code, without re-implementing it. In a fresh clone I appended an `it()` to the test file that calls the file's own `emailsIn` on fakes and runs under vitest. MISSED: `&lt;fake>\@&lt;provider>.com`, `&lt;fake>\@&lt;provider>\.com`, `'&lt;fake>@', '&lt;provider>.com'`, `'&lt;fake>' @ '&lt;provider>'`, backticked parts around the @, `&#64` with no semicolon, "at <provider> period com", and an @ followed by U+200B. Found, as the finding says: the whole address, AT/DOT in capitals, (at)/(dot), an @ then a newline, and &#65312;. The file's 8 original tests pass at baseline.

3. The rendering claim holds. micromark 4.0.3 with micromark-extension-gfm 3.0.0 is in the repo's node_modules and follows the same CommonMark escape rule as GitHub's cmark-gfm. It renders `&lt;fake>\@&lt;provider>.com`, and the form with `\.` too, as the whole fake address in plain text, without a mailto link. So a writer has a reason to escape the @ (it stops autolinking), and the page still shows the address. The header comment at line 95-99 says the function undoes "the escapes ... that a renderer shows as '@' or '.'". The commit subject of 2092f9f reads exactly "an address with its @ escaped, ... and quoted search terms are found". Markdown's own escape is such an escape, and the scanned folders hold 22 .md files, so both statements overclaim.

4. The suggested fix works. In the clone I added `\@`→'@' and `\.`→'.' to `unescaped`, allowed quotes, backticks and backslashes before the @, and allowed ',' and '+' after it in SPLIT_ADDRESS[0]. The five fixable forms then turn found. All 8 original tests still pass, including the scan of evidence and docs/reviews, the plain-text fixtures (`node_modules\.pnpm\@temporalio...`, package scopes, type URLs) and the NOT_ADDRESSES staleness check.

Why should-fix and not blocking: the gap is real, but my own scan found nothing that slips through it. That scan covered all 1,267 text files tracked at 137bf75, every added line of the 69 commits a002e60..137bf75, and their messages, for every missed form. I checked first that the scan finds each fake, and it got 0 hits. The header at lines 13-14 lists only whole, split, HTML-entity and %40 forms, so the test does catch what its header says it guards. The overclaim is in the commit subject and the 'renderer shows' comment.

One small overstatement: `&#64` with no semicolon is not something a Markdown renderer shows as @. micromark leaves it as written. The scanned folders hold no .html files, where a browser would decode it. So it is only a description a reader could rebuild, not a rendered address. The suggested fix does not cover it, nor "period" or U+200B, and those remain lower-likelihood gaps.

Not checked: GitHub's live renderer itself (I worked read-only, with no network rendering; micromark was the stand-in). I also did not re-run the code lens's mutation proofs of the round's new forms.

**Evidence:**

Code at 137bf75, scripts/test/adr-evidence.test.ts: line 90 `new RegExp(`[A-Za-z0-9._%+-]+\\s*[@\\uFF20][\\s/\\\\'"\`]*(?:${PROVIDERS})\\b`, 'gi')`; lines 100-107 `unescaped` with only entity, &commat;/&period;, %40 and %2e replacements. Commit 2092f9f subject: "Evidence check: an address with its @ escaped, ... and quoted search terms are found, and docs/reviews is scanned too (RC-5)".

Clone: C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/recheck-b1r2-clones/c4 (git clone --no-local --branch fix/fx-block1, HEAD 137bf75, pnpm install --frozen-lockfile --offline). Baseline `node node_modules/vitest/vitest.mjs run scripts/test/adr-evidence.test.ts`: 8 passed. A first clone, .../recheck-b1r2-clones/code4-refute, cannot start vitest (ERR_PACKAGE_IMPORT_NOT_DEFINED "#module-evaluator", apparently because of the path's length). It is unused and can be removed.

Probe inserted by C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/code4-refute-probe/insert.mjs. Result with the file's own emailsIn: markdownBackslashAt MISSED, markdownBackslashAtAndDot MISSED, quotedCommaTerms MISSED, quotedBeforeAt MISSED, backtickedParts MISSED, entityNoSemicolon MISSED, atWordsPeriod MISSED, zeroWidthAfterAt MISSED; controlWhole/controlCapsAT/controlParenDot/controlNewline/controlFullWidthEntity found.

Render check by C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/code4-refute-probe/render.mjs (micromark 4.0.3 + GFM): `&lt;fake>\@&lt;provider>.com` renders as the whole fake address (true), no mailto (false); the `\.` form also renders whole (true); `&#64` without semicolon keeps the escape (renders literally); `&#64;` renders whole.

Fix trial by C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/code4-refute-probe/apply-fix.mjs: the five fixable forms become found, and the remaining misses are entityNoSemicolon, atWordsPeriod and zeroWidthAfterAt. Result: "Tests 1 failed | 8 passed (9)", where the only failure is the probe's deliberate expect(result).toEqual({}).

Leak scan by C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/code4-refute-probe/gap-scan.mjs (spawnSync git, no shell, prints locations only): "files scanned: 1267; commits: 69; hits: 0". Self-check: each fake form is found by its pattern.

**Fix:**

As the finding suggests, and tried in the clone without false positives:
- In `unescaped`, add `.replace(/\\@/g, '@').replace(/\\\./g, '.')`.
- In SPLIT_ADDRESS[0], allow `['"\`\\]*` before `\s*[@＠]` and add ',' and '+' to the class after it: `[\s/\\'"\`,+]*`.
- Add the five fakes to the 'finds an address split...' fixture: the backslash-escaped @ (with and without `\.`), the comma-separated quoted terms, the quote before the @, and the backticked parts.

Optionally:
- Count "period" alongside "dot" in SPLIT_ADDRESS[2].
- Strip U+200B-U+200D, U+2060 and U+FEFF in `unescaped`.
- Treat `&#64` / `&#x40` without ';' as '@'. This is low value for .md files.

Either way, narrow the 2092f9f claim's wording in the header and records to the escapes actually undone, or widen the code to match it.

**Refuter 2: partly, note.**

**Reasoning:**

The central claim holds. Markdown's backslash escape of @ is an escape a renderer shows as "@", and the check at 137bf75 misses it. The code says it undoes "the escapes ... that a renderer shows as '@' or '.'" (adr-evidence.test.ts:95-99), and the folders it scans are mostly .md files. So this gap is real and goes against the code's own stated aim. The owner never chose to leave it out. The quoted-before-@ and backticked-parts misses are real too.

The severity is overstated, and one sub-claim is wrong:
1. The entity without its semicolon is not an escape a Markdown renderer shows as "@". CommonMark needs the ';', so it renders as the literal text "&#64".
2. Nothing false is recorded. The test header (lines 13-14) and 2092f9f's body list exactly which escapes are undone: HTML numeric entities, &commat;/&period;, %40/%2E. The subject line's "an address with its @ escaped" is a summary of that body. ADR-0111's note says only "the evidence check (RC-5)".
3. The finding extends RC-5, which the re-check graded "note", and the round did exactly what RC-5 asked.
4. Nothing in the scanned material uses this shape. The tree has no Markdown \@ in any of the 225 evidence/review files. The only \@ anywhere in the tree are Windows paths in CI logs. The earlier leaks were "@/" (SEC-PRIV-1) and a prose description (RC-1). Neither was a Markdown escape, and no pattern can catch RC-1's kind. So "the most likely way an @ gets escaped there" is a guess.
5. "period com", the zero-width space, and the comma- or plus-separated terms are more spelling classes of an open-ended heuristic. The code already says it has limits ("an address at another domain without its dot is not seen"). The owner's standing rule is to size a check to realistic inputs and not chase edge classes of an open-ended check.
6. Every push still gets an adversarial check, and that check scans with the address parts themselves, which finds any spelling that keeps the local part. The test is a backstop.

Result: a correct, cheap improvement worth a note, not a should-fix.

Outside this finding (for the privacy lens or coordinator; I name no provider): 2092f9f's message still has the bullet "The fakes name another provider than before, so no fixture pairs "owner email" with the provider of the address SEC-PRIV-1 found." The builder's report (wl3d8w0hp.output) asked for that bullet to be dropped when the commits were re-made. It survived the rewrite. At 2092f9f^ the fixture names a mail provider (variable named after it, [masked: its value written in two pieces]) and pairs it with "no owner email". So the range's history plus this message point to the provider of the address SEC-PRIV-1 found. Under the task's own rule, that is blocking. Please route it.

**Evidence:**

What I checked, read-only, at C:/Users/arvik/code/byway/.worktrees/fx-block1 (HEAD 137bf75):

- **The code.** Read scripts/test/adr-evidence.test.ts in full. WHOLE_ADDRESS (line 77) and SPLIT_ADDRESS[0] (line 90) need a local-part character, then only spaces, before the @. unescaped (lines 100-107) handles only entities, &commat;/&period; and %40/%2E.
- **My own probe.** C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/refute-b1r2-code4/probe2.mjs, log probe2.log in the same folder. It evals the file's own code from `git show 137bf75`.
  - At 137bf75 these fakes are MISSED: backslash-@ before a listed provider, backslash-@ before another domain, backslash-@ with backslash-dot, quoted-before-@, and backticked parts.
  - The finding's suggested fix applied in memory (backslash-@ to @, backslash-dot to ., quotes/backticks/backslashes allowed before @) finds all five.
  - With the fix, 0 of the test's own plain fixtures are flagged.
  - On the 225 files of docs/adr/evidence and docs/reviews at 137bf75, hits are 2 both before and after the fix: the two named NOT_ADDRESSES. No file's count changes.
  - Lines in those .md files matching &lt;alnum>, backslash, @: 0.
- **Rendering.** C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/refute-b1r2-code4/render.mjs, using micromark 4.0.3 (CommonMark) from the worktree's node_modules:
  - a fake with backslash-@ renders as `<p>[masked: the made-up address, whole]</p>`, so the whole address shows
  - the entity without ';' renders as `<p>jane.doe&amp;#64example.com</p>`, which is literal text, not an @
  - inside a code span, backslash-@ stays literal
- **The tree.** `git grep -F '\@' 137bf75` finds only Windows paths (`\.pnpm\@temporalio`) in four CI/vitest logs, and no Markdown escape.
- **Records.**
  - The re-check result lists RC-5 at severity "note", and its suggested fix is exactly what 2092f9f did.
  - 2092f9f's body says "HTML's numeric entities (decimal and hex ...), &commat; and &period;, and %40 and %2E".
  - ADR-0111's Later note says only "the evidence check (RC-5)".
  - The owner's proportionate-guarantees memory says to give verifiers a realistic-input stopping rule.
- **Aside.** aside.mjs in the same folder printed booleans only:
  - 2092f9f's message has the "another provider than before" bullet: true
  - 2092f9f^ has the "owner email" fixture, and the provider changed at 2092f9f: true
  - one commit in a002e60..137bf75 adds "no owner email"

What I could not do: render through GitHub itself. cmark-gfm follows the same CommonMark rule that lets any ASCII punctuation, @ included, be backslash-escaped. I did not repeat the lens's clone mutations, since the finding is about a gap in coverage, not a test that cannot catch a regression.

**Fix:**

Optional, the next time the file is touched:
- In `unescaped`, add `.replace(/\\@/g, '@').replace(/\\\./g, '.')`. In memory this flags none of the current corpus or the plain fixtures.
- Add one `markdownEscape` fake (`${local}\\@${'ex'+'ample'}.com`) to the split-address test.
- Change the docstring at lines 95-99 to name Markdown's backslash escape among the escapes undone.

Allowing quotes or backticks before the @ is cheap and safe too, but it is not needed. Do not chase "period com", the zero-width space, or comma- and plus-separated terms. Drop the entity-without-semicolon item, which Markdown does not render as @.

Separately and with higher priority, before the push: remove the bullet in 2092f9f's message that ties the old fixture's provider to SEC-PRIV-1's address, as the builder asked. Also consider whether the old fixture's "no owner email" provider pairing in the commits before 2092f9f needs the same rewrite.

#### R2-PRIV-1: The history still says which mail provider the owner's second address uses: 2092f9f's message bullet together with the old fixture in nine commits

*Finding. Severity blocking; outcome confirmed; lens records-privacy; where `scripts/test/adr-evidence.test.ts:167`.*

**What is wrong:**

The rewrite re-made e1eb13a as 2092f9f and left its message unchanged. Line 8 of 2092f9f's message still reads: "The fakes name another provider than before, so no fixture pairs "owner email" with the provider of the address SEC-PRIV-1 found." 7715586 added the fixture `slash: \`no owner email (${local}${at}/${...})\``, whose provider constant is built from two string pieces. Read together, the bullet and that fixture tell a reader the domain of the address SEC-PRIV-1 found, which is the owner's second address. The fixture is in the tree of nine commits in a002e60..137bf75: 7715586, e6cd3e0, 04508f4, a84c9bb, 56c1347, e3ded0a, f2fc531, e2121c3 and 264acd4. The builder's report asked for this bullet to be dropped when the commits on top of 5ce7edd/083ddb8 were re-made ('open': "Please drop that bullet when the commits ... are re-made"). They were re-made, and the bullet stayed. A domain is part of an address, and the owner's only exception is the commit author identity.

**Evidence:**

Pairwise compare of hist4-map.json, the second rewrite's 11 pairs: e1eb13a -> 2092f9f has the same tree and the same message (sha1 of %B identical), and so does every pair after a84c9bb/56c1347. Running `git log -1 --format=%B 2092f9f` shows the bullet on line 8. A git grep for the two-piece provider constant in scripts/test/adr-evidence.test.ts finds it in exactly the nine commits above; at 7715586 it is line 167, and at 264acd4 line 168. The 2026-10-22 redaction filter in the scratchpad (hist-redact-b1checks.cjs) matched the real fragment by that same provider, so the bullet is accurate. The earlier re-check accepted the fixture as a placeholder when it stood alone; the new message bullet is what ties it to the real address. No test reads commit messages or old trees, so the gate cannot see this. My scan of all 69 trees and messages found no other provider-with-owner pairing: the provider name appears only in the generic PROVIDERS list and this fixture.

**When it goes wrong:**

Pushing main publishes 7715586..264acd4 and 2092f9f. Anyone who reads the RC-5 commit message next to 7715586's diff learns the domain of the owner's second address, the address the RC-1 rewrite was done to stop describing.

**Proposed fix:**

Before the push, re-make 2092f9f with that bullet removed or made neutral (for example "The fakes use other providers."). That gives new ids to 2092f9f, 23f9e3c, 497e548, d665311 and 137bf75 only, and their trees do not change. No record or message cites any of those ids: git grep of the tip and of the range's messages finds 0. Changing 7715586's fixture as well reaches 14 commits back, so that is the owner's call; the builder named it 'Report first'. The tip's tree would still not change, and no record cites any id from 7715586 on. The purge afterwards also covers the replaced commits.

**Refuter 1: confirmed, blocking.**

**Reasoning:**

The finding is right on every point I could check. 2092f9f's message line 8 still holds the bullet the builder asked to drop. The two-piece provider constant and the "no owner email (...@/&lt;provider>)" fixture are in the test file's tree in exactly the nine commits named, at line 167 in 7715586/e6cd3e0/04508f4 and line 168 in a84c9bb through 264acd4. 2092f9f is the commit that swaps that constant for a different provider. So read against 2092f9f's own diff, the bullet says that the provider in the old fixture is the provider of the address SEC-PRIV-1 found.

The bullet is accurate, which is why this is a leak and not a wrong claim. The scratchpad's hist-redact-b1checks.cjs removes the real fragment with a pattern of the form `no owner email \([^)\n]*@\s*\/\s*<P>\)` and checks for a leftover `@\s*/\s*<P>`, where P is that same provider. So the old fixture copied the real report fragment word for word, with only the local part swapped for a fake.

The rewrite carried the problem forward unchanged. Comparing the e1eb13a->2092f9f pair and the four pairs after it in hist4-map.json shows the same tree and an identical %B hash for each. main is built by merge commits that keep history (a002e60 and its parents are merges), so pushing Block 1 publishes all nine trees and 2092f9f's message.

Under the task's rubric, any part or description of the owner's email address in any commit or message of a002e60..137bf75 is blocking. A domain is part of an address, and the owner's only exception is the commit author identity, which does not cover this. The tip itself is clean: the provider constant is gone from it, and the bullet text appears only in 2092f9f's message. No test reads commit messages or old trees, so the gate cannot see this.

The fix is cheap. No record or message cites any affected id (2092f9f, 23f9e3c, 497e548, d665311, 137bf75, their pre-rewrite ids, or 7715586 through 264acd4).

What I could not check: whether the commit author identity already publishes an address at the same provider. The permission classifier denied that classification as PII handling, and I did not work around it. Even if it does, that is the owner's separate author-identity exception and does not cover a statement about the SEC-PRIV-1 address. I ran no mutation clones, because this is a history and message finding and no test is involved.

**Evidence:**

- `git log -1 --format=%B 2092f9f`, line 8: "- The fakes name another provider than before, so no fixture pairs "owner email" with the provider of the address SEC-PRIV-1 found."
- A per-commit scan of `scripts/test/adr-evidence.test.ts` over `git rev-list a002e60..137bf75`:
  - "no owner email" is at line 167 and the two-piece constant is present in 7715586, e6cd3e0 and 04508f4.
  - Line 168 with the constant: a84c9bb, 56c1347, e3ded0a, f2fc531, e2121c3, 264acd4.
  - In 2092f9f, 23f9e3c, 497e548, d665311 and 137bf75 the constant count is 0 and the fixture is at line 200 with another provider.
- `git diff 264acd4 2092f9f -- scripts/test/adr-evidence.test.ts`: the old constant becomes `const mail = 'hot' + 'mail'`, and slash/backslash/spaces/bracketed/fullWidthAt/whole are rewritten to use it.
- Masked read of the scratchpad's hist-redact-b1checks.cjs: line 9 is `t.replace(/no owner email \([^)\n]*@\s*\/\s*<P>\)/g, 'no owner email address')` and line 10 checks for a leftover `/@\s*\/\s*<P>/i`. P is the old fixture's provider (it appears twice in that file), so the fixture reproduced the real fragment's text with only the local part faked.
- Rewrite pairs: e1eb13a->2092f9f, 773bd9f->23f9e3c, e687a17->497e548, a966ea6->d665311, b89c80e->137bf75, 476d54f->264acd4 and daa393a->e3ded0a all have the same tree and the same message hash. e1eb13a's line 8 is the same bullet.
- The builder's report, wl3d8w0hp.output line 135: "Please drop that bullet when the commits on top of 5ce7edd/083ddb8 are re-made."
- `git grep` of 137bf75 and the range's messages finds the bullet only in 2092f9f's message, and finds 0 citations of any of the 19 affected old or new ids.
- `git log --merges -5 a002e60` shows main is built from merge commits that keep history, so the intermediate trees get pushed.

**Fix:**

Before the push, re-make 2092f9f with line 8 of its message removed, or replaced by a neutral line such as "- The fakes use other providers." The new line must not say why the provider changed or link it to SEC-PRIV-1. Then re-make 23f9e3c, 497e548, d665311 and 137bf75 on top of it, with their trees and messages unchanged. Nothing in the tree or the messages cites these ids, so no record needs updating.

Changing 7715586's fixture as well would re-make 14 commits and is the owner's call. Without the bullet, it stands alone as the placeholder the earlier re-check accepted.

After the rewrite, check two things:
1. `git log --format=%B a002e60..HEAD` has no line containing "provider than before" or "provider of the address".
2. The new tip's tree hash equals 137bf75's.

The planned local purge after the push should also cover e1eb13a and the other replaced commits.

**Refuter 2: confirmed, blocking.**

**Reasoning:**

I tried to refute R2-PRIV-1 three ways: (1) the owner chose to keep it; (2) it is not the owner's address, or it falls under the author-identity exception; (3) the bullet does not actually tie the provider to the address. None of them works.

(1) The owner made no choice about this. The answers after the record's last extraction are only those of 13:40Z (fix round, the stall limit in the owner's own words, git identity "Keep it as it is", purge "Yes, after the push (Recommended)") and 16:50Z (the design answers and the video question). None mentions the fixture or the bullet. In the main session's messages after 13:40Z, the only mention is Claude's own lens brief. It lists "the mail provider named together with the owner" as a description that must not remain. The builder asked for the bullet to be dropped ("Please drop that bullet when the commits on top of 5ce7edd/083ddb8 are re-made"). The second rewrite left it, and I found no record of a decision to keep it, so it was missed.

(2) The tip's own check report (block1-check-2026-10-22.md, the SEC-PRIV-1 section) says the fragment "is the owner's address" and that it "matches neither the block's commit author address nor the configured git user emails". So it is the second address. "Keep it as it is" covers only the git author and committer identity. RC-1, the blocking survivor this rewrite answered, listed "the provider" among the details to drop. The owner's 01:54 answer chose to remove "your email from the files and from Block 1's unpushed history". By the task's rule (any part or description of the owner's address in any commit or message of the range), a domain tied to that address is blocking.

(3) The tie is real. The bullet says the new fakes name "another provider than before, so no fixture pairs 'owner email' with the provider of the address SEC-PRIV-1 found". So the earlier fixture did pair them. In 7715586 that fixture is `no owner email (${local}${at}/${<provider constant>})`, right under a comment saying a real address was found written "&lt;local part>@/&lt;provider>" (SEC-PRIV-1). The scratchpad redaction filter hist-redact-b1checks.cjs (line 9) matched the real line 3866 by that same provider. So the bullet is accurate, and with the fixture it tells a reader which provider the second address uses. Nothing else at the tip or in the range's messages makes this tie. Searching for "provider of the address", "fixture pairs", "another provider", "address's provider" and "same provider" finds only 2092f9f's message ("another provider" also appears in unrelated tree text about model families).

One correction to the finding: the bullet is not the only thing that hints at the provider. On its own, the 7715586 fixture copies the masked line 3866 ("no owner email (...)", quoted in the tip's report) with the real provider kept. That is a strong hint even without the bullet; the bullet turns it into a confirmed fact. Dropping only the bullet brings the history back to the state the earlier re-check accepted. Whether that remaining hint is acceptable is the owner's decision (the builder's "Report first"), and the earlier re-check's placeholder verdict should not settle it. This does not lower the severity of the bullet itself.

What I did not check: the remote over the network (I used only local remote-tracking refs); tests (no code is involved). I did not open .env.agents or byway_review.

**Evidence:**

All git reads were done read-only through Node spawnSync. The scripts are in C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/r2priv1/ (verify.mjs, remote.mjs, tipscan.mjs, user-after.mjs, asst-bullet.mjs).

- e1eb13a and 2092f9f have the same message (sha1 of %B, first 12 hex digits: fc70118dfcda) and the same tree (e3d860e48a08). hist4-map.json maps e1eb13a to 2092f9f. `git log -1 --format=%B 2092f9f` holds the bullet as its last list item. It is the only commit in a002e60..137bf75 whose message holds that bullet.
- The two-piece provider constant is in scripts/test/adr-evidence.test.ts in exactly 9 of the 69 range commits: 7715586, e6cd3e0, 04508f4 (const at L165, slash fixture at L167), and a84c9bb, 56c1347, e3ded0a, f2fc531, e2121c3, 264acd4 (const at L166, slash at L168). At 7715586, L161-162 are the comment about the real "&lt;local part>@/&lt;provider>" form (SEC-PRIV-1), and L167 is `slash: \`no owner email (${local}${at}/${&lt;const>})\``.
- hist-redact-b1checks.cjs line 9 replaces "no owner email (...@/&lt;that same provider>)" with "no owner email address". This confirms the real fragment's provider.
- At the tip, block1-check-2026-10-22.md says "It is the owner's address" and "It matches neither the block's commit author address nor the configured git user emails" (SEC-PRIV-1). It also quotes "Line 3866 begins '- Personal data: no owner email ([email fragment masked])...'".
- block1-fix-recheck-result.json, RC-1 (blocking), suggestedFix: "Drop the length, the starting string, [masked: one detail], the provider, ...".
- Builder report tasks/wl3d8w0hp.output, line 135: "Please drop that bullet when the commits on top of 5ce7edd/083ddb8 are re-made". Line 136: "Report first: the unpushed commit 7715586 ... still has the fake fixture ... It mirrors the real form with the real provider."
- Transcript: owner answers after 13:40Z are only those of 13:40:01Z and 16:50:28Z; neither mentions the fixture or the bullet. Claude's own records-privacy lens brief (17:05Z) forbids "the mail provider named together with the owner".
- No remote-tracking branch contains 7715586 or 2092f9f; origin/main is a002e60. After 264acd4 the branch holds 2092f9f, 23f9e3c, 497e548, d665311 and 137bf75. 7715586^..137bf75 is 14 commits. None of the 14 ids is cited in the tip tree or in any range message.

**Fix:**

1. Before the push, re-make 2092f9f with that bullet deleted. Deleting it is safer than rewording it, since any wording that compares the new fakes with the old ones points back at the old ones. Then replay 23f9e3c, 497e548, d665311 and 137bf75 with their trees unchanged. Check that the new tip's tree equals 137bf75's tree. Scan the new range's messages for "provider of the address", "fixture pairs", "than before" and "owner email". Record the new ids in a hist5 map. No record cites the five old ids, so no record changes.
2. Put the 7715586 fixture to the owner as a separate question, as the builder's 'Report first' asked, and do not treat the earlier re-check's placeholder verdict as settling it. The question: re-make the 14 commits from 7715586 so the "slash" fake uses another provider (the tip's tree is unchanged, and no record cites those ids), or keep it. Without the bullet the fixture is still a strong hint, because it copies the masked line 3866 with the real provider kept.
3. The owner's chosen purge ("Yes, after the push") then also removes the objects these replays leave behind.

#### R2-REC-1: The owner's design answers (question at 06:41, answers at 09:50) are not in the conversation record, yet ADR-0111, the backlog and 137bf75 quote them

*Finding. Severity should-fix; outcome confirmed; lens records-privacy; where `docs/adr/0111-cancel-cuts-off-the-calls-byway-can-stop.md:119`.*

**What is wrong:**

Several records quote the owner's answers on the design: ADR-0111's Later note on the stall limit, backlog row 138 "Selectable answer waits per model (block 2)", stream.ts's doc comment and the message of 137bf75. The quoted answers are "In Block 2, 15 meanwhile (Recommended)" with its description, "Per model (Recommended)", "15 minutes (Recommended)" and the owner's video words. conversation-continued.md ends at 06:40; its header says "up to 2026-10-22 06:40 local". ADR-0111's note gives these answers no time and no evidence link, and the backlog row points only to ADR-0111. The evidence README's row for the record (line 8) still says it runs "to 2026-10-22 01:54 local", which has been stale since f2fc531 extended the record to 06:40.

**Evidence:**

I read the transcript read-only (main thread only). AskUserQuestion at 2026-10-22T13:41:34Z (06:41 local) asked four questions: "Where should the selectable answer-wait limits (15/30/45/60 minutes) be built?", "How fine-grained should the choice be?", the video question and "What should the default be for text and image models?". The answer came at 16:50:28Z (09:50 local). Every quote in ADR-0111:119, backlog.md:138 and 137bf75's message is a verbatim substring of that answer and question, so the wording is right. None of them is in conversation-continued.md. One quote shows why a substring check would mislead: "15 minutes (Recommended)" does occur in the record, but only inside the 06:40 option "No shorter than the step's 15 minutes (Recommended)", an answer to a different question. Between 06:40 and 09:50 the owner typed nothing else (the other main-thread user entries are task notifications).

**When it goes wrong:**

A later reader follows ADR-0103's rule to the evidence and cannot find the owner's choice of 15 minutes, per-model waits or the research request. A naive quote check would match the default-for-text-and-image-models answer to an option the owner did not choose.

**Proposed fix:**

Extract the entries after 06:40 with the record's extractor: the 06:41 CLAUDE-ASKS and the 09:50 [ANSWER]. Move the header's end to 09:50 and update the evidence README row 8's range, which is stale twice over. Then cite "([evidence/conversation-continued.md](evidence/conversation-continued.md), 2026-10-22 09:50)" in ADR-0111's note and in the backlog row.

**Refuter 1: confirmed, should-fix.**

**Reasoning:**

The finding reproduces in full. At 137bf75, docs/adr/evidence/conversation-continued.md stops at 2026-10-22 06:40 local. Its header (line 3) says "up to 2026-10-22 06:40 local", and its last entry is the [ANSWER] at line 602. None of the owner's design answers is in it. Yet ADR-0111:119, backlog.md:138, packages/gateway/src/providers/stream.ts:8 and the message of 137bf75 all quote those answers. ADR-0111's note gives the 06:40 answer a time, but the design answers get only "The design was put to the owner the same day, and the owner answered:", with no time and no evidence link. The backlog row points only to ADR-0111. I read the session transcript read-only (main thread only, with addresses masked in my script). The question was asked at 2026-10-22T13:41:34.650Z (06:41 local) and answered at 16:50:28.366Z (09:50 local). Every quoted answer is a verbatim match. The quoted description of "In Block 2, 15 meanwhile (Recommended)" also matches the option's description exactly (`adr.includes` returned true). So the wording is right and this is not a false record of the owner's words. That keeps it out of blocking. It is still a gap in where the quotes come from: they point to evidence the repository does not hold. The task said this exact case should be reported as should-fix.

The substring trap the finding describes is real. "15 minutes (Recommended)" occurs twice in the record, both times only inside the 06:38/04:04 option "No shorter than the step's 15 minutes (Recommended)". That was an answer to the Anthropic stall-limit question, and the owner did not choose it: they wrote their own answer. A naive quote check would wrongly count the default-for-text-and-image answer as present. The evidence README row for the record (line 8) still says "from 2026-10-07 to 2026-10-22 01:54 local". f2fc531, part of this round, extended the record to 06:40 without touching the README. The only README change in 56c1347..137bf75 is the block1-check row. So that row is stale already, and will be stale again once the 09:50 entries come in. Between 13:40Z and 16:50Z the transcript holds no other message the owner typed; the next user entry is a task notification at 17:04Z.

One extra slip of note size in the same ADR-0111 sentence: "Claude puts a short design to the owner before building it, The design was put to the owner the same day" has a comma where a full stop belongs.

What I could not check: whether the record's own extractor gives byte-identical output for the 06:41 and 09:50 entries. I did not run it, because the work was read-only. I also did not inspect sidechain entries.

**Evidence:**

- **Record ends at 06:40:** `grep -c -F` on conversation-continued.md finds 0 matches for each of "15 meanwhile", "Per model", "deep dive", "30, 45, 60, 75", "second party reviewers", "How fine-grained" and "selectable answer-wait". The last headers are at lines 598 (CLAUDE-ASKS 06:38:05) and 602 (USER 06:40:01, the [ANSWER]).
- **The trap match:** `grep -o ".{60}15 minutes (Recommended)"` returns only "...{\"label\":\"No shorter than the step's 15 minutes (Recommended)", twice.
- **The question:** the transcript scan (C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/r2rec1-scan.mjs) shows AskUserQuestion at 2026-10-22T13:41:34.650Z with four questions: "Where should the selectable answer-wait limits (15/30/45/60 minutes) be built?", "How fine-grained should the choice be?", the fal/video question and "What should the default be for text and image models?".
- **The answer:** at 16:50:28.366Z the answers are "In Block 2, 15 meanwhile (Recommended)", "Per model (Recommended)", the owner's own video text, and "15 minutes (Recommended)".
- **Wording check:** r2rec1-desc.mjs confirms the option description quoted in ADR-0111 is verbatim (true).
- **No other owner message in the gap:** the next main-thread user entry after the answer is a task-notification at 17:04:36Z, and none appears between 13:40Z and 16:50Z.
- **Quotes without citation:** ADR-0111:119 says "The design was put to the owner the same day, and the owner answered: where, \"In Block 2, 15 meanwhile (Recommended)\" (...)", with no time or link. backlog.md:138 says "quoted in ADR-0111's Later notes", and has no evidence link. stream.ts:8 says "The owner chose it on 2026-10-22, \"In Block 2, 15 meanwhile (Recommended)\"".
- **Stale README row:** evidence/README.md line 8 reads "from 2026-10-07 to 2026-10-22 01:54 local". `git show --stat f2fc531` lists only conversation-continued.md (37 insertions, 1 deletion). `git diff 56c1347..137bf75 -- docs/adr/evidence/README.md` changes only the block1-check row.
- **No test checks quotes:** scripts/test/adr-evidence.test.ts uses conversation-continued.md only to exempt it from link resolution (line 170). That is why the gate passed.

**Fix:**

1. Run the record's own extractor on the entries after 06:40: the CLAUDE-ASKS at 2026-10-22T06:41:34 (13:41:34Z) and the [ANSWER] at 09:50:28 (16:50:28Z).
2. Update the header of conversation-continued.md: move its end to 09:50 and add the extraction run to the header's list of runs.
3. Update evidence/README.md row 8 so its range runs to 2026-10-22 09:50 local.
4. Cite "([evidence/conversation-continued.md](evidence/conversation-continued.md), 2026-10-22 09:50)" in ADR-0111's note of the stall limit, after the design answers. Give the backlog row "Selectable answer waits per model (block 2)" the same date and link.
5. While editing ADR-0111:119, change "before building it, The design" to "before building it. The design".
6. Optional: have adr-evidence.test.ts check that each date-cited quote in a Later note occurs in the record at that entry, not just anywhere in the file. A file-wide check would pass "15 minutes (Recommended)" against the wrong question.

**Refuter 2: confirmed, should-fix.**

**Reasoning:**

I could not refute R2-REC-1. Every part of it checks out at 137bf75.

(1) The records quote the owner's design answers accurately. In the session transcript (main thread only), the AskUserQuestion at 2026-10-22T13:41:34Z (06:41 local) has four questions. The answer at 16:50:28Z (09:50 local) is: "In Block 2, 15 meanwhile (Recommended)", "Per model (Recommended)", the owner's own words on video, and "15 minutes (Recommended)". The description ADR-0111 quotes for the first option matches the option's description word for word (grep -F count 1). So this is not a false record of the owner's words, and it should not be raised to blocking.

(2) None of these answers is in docs/adr/evidence/conversation-continued.md. Its last heading is the USER entry of 2026-10-22 06:40:01, and its header says "up to 2026-10-22 06:40 local". These strings occur 0 times in the record: "Per model (Recommended)", "In Block 2, 15 meanwhile", "deep dive internet research", "How fine-grained" and "selectable answer-wait". "15 minutes (Recommended)" does occur twice, at lines 572 and 599, but only inside the option "No shorter than the step's 15 minutes (Recommended)". That option belongs to the stall-limit question asked at 04:04 and again at 06:38, which is a different question. The finding's point about a misleading substring match is correct.

(3) ADR-0111's note is inconsistent with the notes around it. Each other quoted answer there carries "([evidence/conversation-continued.md](...), 2026-10-22 01:54)" or "06:40". The design answers get only "The design was put to the owner the same day, and the owner answered:", with no time and no link. Backlog row 138 points only to ADR-0111's Later notes. The stream.ts doc comment (line 8) and 137bf75's message quote the answers with no evidence either.

(4) Row 8 of the evidence README still says the record runs "from 2026-10-07 to 2026-10-22 01:54 local". f2fc531 (in a002e60..137bf75) extended the record to 06:40 without touching the README. The README's history in the range shows no later change to that row.

(5) Between 06:40 and 09:50 the main thread holds no other owner entry. The first user entry after the answer is a task-notification at 17:04:36Z.

The task brief itself says that if the record lacks the design answers, that is a should-fix. Nothing here is a choice the owner made, so it is not exempt. The words are right and the evidence is missing, so it is not blocking.

One small extra slip in the same note at ADR-0111:119: "Claude puts a short design to the owner before building it, The design was put to the owner the same day" has a capital letter after a comma. It should be a full stop.

What I checked: the worktree at 137bf75 (read-only); the record's headings, header and quote counts; ADR-0111 lines 105-135; backlog row 138; the evidence README row; the history of the record and README in a002e60..137bf75; the stream.ts comment; the question and answer in the transcript, read by a Node script that printed only those fields with any '@' masked; and scripts/test/adr-evidence.test.ts. That test does not compare quotes against the record; it treats conversation-continued.md as QUOTED text for its privacy scan. So the "naive quote check" in the failure scenario is a hypothetical manual check, not an existing tool.

What I did not do: run the record's extractor, or check whether an extraction pass is planned before the push. I found no record of such a plan.

**Evidence:**

- conversation-continued.md, last heading (line 602): "## USER 2026-10-22T06:40:01.778-07:00". Its header says "up to 2026-10-22 06:40 local".
- grep -c -F in conversation-continued.md: "Per model (Recommended)" 0; "In Block 2, 15 meanwhile" 0; "deep dive internet research" 0; "How fine-grained" 0; "15 minutes (Recommended)" 2, both inside "No shorter than the step's 15 minutes (Recommended)" (lines 572 and 599, the 04:04 and 06:38 stall-limit questions).
- Transcript, main thread: ASK at 2026-10-22T13:41:34.650Z with the questions "Where should the selectable answer-wait limits (15/30/45/60 minutes) be built?", "How fine-grained should the choice be?", the video (fal) question and "What should the default be for text and image models?". The answer at 16:50:28.366Z matches ADR-0111's quotes, and the option description ADR-0111 quotes matches word for word. The next main-thread user entry is a task-notification at 17:04:36Z.
- ADR-0111:119: "...The design was put to the owner the same day, and the owner answered: where, "In Block 2, 15 meanwhile (Recommended)" ..." has no time and no evidence link. The neighbouring notes cite "([evidence/conversation-continued.md](...), 2026-10-22 06:40)" and "01:54".
- backlog.md:138: "The owner's answers of 2026-10-22, quoted in ADR-0111's Later notes" points nowhere else.
- evidence/README.md, record row: "from 2026-10-07 to 2026-10-22 01:54 local". f2fc531 ("Evidence: the owner's answers of 2026-10-22 06:40 ...") changed the record but not the README.

**Fix:**

1. Use the record's extractor to add the 06:41 CLAUDE-ASKS (the four questions with their options, as asked) and the 09:50 [ANSWER] to docs/adr/evidence/conversation-continued.md.
2. Move the record's header end to 2026-10-22 09:50 local.
3. Update the evidence README's row for the record from "01:54" to the new end.
4. In ADR-0111's note (line 119), cite "([evidence/conversation-continued.md](evidence/conversation-continued.md), 2026-10-22 09:50)" after the design answers, and replace ", The design" with ". The design".
5. In backlog row 138, add the same evidence link or the time "09:50".
6. Optionally, give the date and time in the stream.ts comment as well.

#### R2-REC-2: The purge the playbook records would delete every stash entry, though the option the owner said yes to says stashes are untouched

*Finding. Severity should-fix; outcome confirmed-partly; lens records-privacy; where `docs/playbook.md:51`.*

**What is wrong:**

Row 51 quotes the owner's yes, "Yes, after the push (Recommended)", to an option whose description says "Reachable commits (every branch, including the other session's, and stashes) are untouched." It then commits Claude to running `git reflog expire --expire-unreachable=now --all` and then `git gc --prune=now`. With --all, the expiry also processes refs/stash. Every stash entry's old or new id is a stash commit, and stash commits are not ancestors of the stash tip, so the whole stash reflog is expired. gc --prune=now then deletes those commits for good. This checkout's stash stack is shared with the main checkout, every worktree and other sessions. The commands, their order (expiry first) and their timing (after the push, CI green and clones deleted, at the owner's answer of 06:40) are otherwise right and match the owner's words.

**Evidence:**

I probed a throwaway repo in the scratchpad (recheck-b1r2-privacy/stash-probe) with git 2.52.0.windows.1, the version on this machine. Three stashes were listed (stash@{0..2}). After `git reflog expire --expire-unreachable=now --all`, `git stash list` printed nothing and `git reflog show refs/stash` had 0 lines; only the refs/stash ref itself was left. byway today has 0 stash entries (`git stash list | wc -l`), so nothing would be lost if the purge ran now. With --all, the expiry also drops reflog-only recovery points on other sessions' branches.

**When it goes wrong:**

Another session runs `git stash push -u -m <tag>`, as this environment tells it to, in the window between now and the purge. Claude then runs the purge as the playbook row records it, and that session's stash disappears and is pruned. The owner was told stashes are untouched.

**Proposed fix:**

Before running the purge, tell the owner that the option's description was wrong about stashes, and re-ask; the premise has changed. Then change the commands and the row. Either expire only the reflogs that hold the replaced commits: `git reflog expire --expire-unreachable=now refs/heads/fix/fx-block1`, plus the fx-block1 worktree's HEAD with `git -C <that worktree> reflog expire --expire-unreachable=now HEAD`. Or make `git stash list` being empty a precondition the row states, and stop if it is not. The row should say which one is used.

**Refuter 1: confirmed, should-fix.**

**Reasoning:**

The finding holds up on every point, except that "every stash entry" says slightly too much. I compared the quote with the record and reran the git behaviour myself.

1. The record is quoted correctly. In docs/adr/evidence/conversation-continued.md (offsets 88308 and 92660), the purge question and the option the owner chose match playbook line 51 word for word. The question shows the exact commands. The description of the chosen option says "Reachable commits (every branch, including the other session's, and stashes) are untouched." The answer at offset 93804 is "Yes, after the push (Recommended)". The playbook row then commits Claude to `git reflog expire --expire-unreachable=now --all` followed by `git gc --prune=now`.

2. The effect on stashes is real. With --all, refs/stash is expired as a normal ref, so an entry counts as reachable only if the current stash tip reaches it. Stash commits are not ancestors of one another, so once there are two or more entries, every entry leaves the reflog. gc --prune=now then deletes every stash commit except the newest. The newest stays only because refs/stash itself still points at it: it can still be applied by its id, but it no longer shows in `git stash list`. With exactly one entry nothing is lost, because that entry's old id is null and its new id is the tip. So the precise claim is: with two or more stashes, all of them disappear from the list and all but the newest are deleted for good. The failure scenario is right whenever another session's stash is not the newest one.

3. The scenario can happen. refs/stash is shared by the main checkout and every worktree; my probe saw a stash pushed from a worktree in the same list. This environment tells sessions to use `git stash push -u -m <tag>` and to apply by id. The repository has 0 stash entries now, so nothing would be lost if the purge ran today. The purge only runs after the push, CI and clone deletion, so no harm has happened yet and the severity is should-fix, not blocking.

4. The narrow fix the finding suggests would be enough. Of all the reflogs in the common git folder and the worktrees, only two hold commits that no ref reaches: fix/fx-block1 and the fx-block1 worktree's HEAD.

What I did not check: whether any other session plans to stash before the purge, and whether git versions other than 2.52.0.windows.1 behave differently.

**Evidence:**

Quote check, read-only: conversation-continued.md at offsets 88308 and 92660 holds the question "After the push, purge the replaced pre-rewrite commits ... git reflog expire --expire-unreachable=now --all, then git gc --prune=now." The chosen option's description is "... Reachable commits (every branch, including the other session's, and stashes) are untouched." The answer at offset 93804 is ="Yes, after the push (Recommended)". docs/playbook.md:51 quotes this exactly and then commits to the same two commands.

Probe, git 2.52.0.windows.1, throwaway repos in the scratchpad (since deleted): one repo plus a linked worktree. Three stashes were pushed from main and one with -u from the worktree, so `git stash list` showed four entries. After `git reflog expire --expire-unreachable=now --all`, `git stash list` printed nothing, `git reflog show refs/stash` printed 0 lines, and refs/stash still pointed at the newest stash. After `git gc --prune=now`, `git cat-file -e` showed the newest stash commit present and the other three gone. `git stash apply <newest id>` still worked.

Single-stash control: with one stash, `git stash list` still showed 1 entry after the expiry.

Repository state, read-only: `git stash list` gives 0 entries. A scan of every reflog under the common git folder and its worktrees found only two that point at commits no ref reaches: logs/refs/heads/fix/fx-block1 (30 entries, 29 such) and worktrees/fx-block1/logs/HEAD (31 entries, 29 such).

**Fix:**

The owner was told stashes would be untouched, and that is wrong whenever there are two or more stashes. Say so to the owner and re-ask before the purge runs. Either option below removes the risk; the row must say which one is used.

(a) Narrow the expiry to the two reflogs that hold the replaced commits: `git reflog expire --expire-unreachable=now refs/heads/fix/fx-block1` in the checkout, and `git reflog expire --expire-unreachable=now HEAD` run in the fx-block1 worktree. Then run `git gc --prune=now`. The scan found no other reflog holding unreachable commits.

(b) Keep --all, but make it a stated precondition that `git stash list` prints at most one entry, and stop if it prints more.

Whichever is chosen, playbook.md:51 should say that `--all` also expires the stash reflog. The row should not repeat the description's "stashes are untouched" as if it were true without that qualifier.

**Refuter 2: partly, should-fix.**

**Reasoning:**

The core of R2-REC-2 holds, and "the owner chose it" does not refute it. The question the owner answered did name the exact commands (`git reflog expire --expire-unreachable=now --all`, then `git gc --prune=now`), so the commands themselves are the owner's choice. But the option the owner said yes to also promised "Reachable commits (every branch, including the other session's, and stashes) are untouched." Claude wrote that promise, and the commands break it whenever the shared stash holds two or more entries. The owner chose on a false description. The record is not false: playbook row 51 quotes the question and the option word for word, matching docs/adr/evidence/conversation-continued.md lines 572/599 and the answer on line 603. What is wrong is the plan. The row commits Claude to running the commands as quoted, with no stash condition, so it would break what the owner was told.

The finding overstates the mechanism in two places.
(1) Its claim that "Every stash entry's old or new id is a stash commit, so the whole stash reflog is expired" is false for a lone stash. The first entry's old id is null, which git's unreachable() treats as reachable, and its new id is the tip, so a single stash survives. byway has no refs/stash today, so the finding's failure scenario, where one other session pushes one stash before the purge, loses nothing. Loss needs two or more entries at purge time: two sessions stashing, or one session stashing twice without dropping.
(2) "gc --prune=now then deletes those commits for good" applies to every stash commit except the tip. refs/stash still points at the tip, so its commit survives and `git stash show refs/stash` still works. It does vanish from `git stash list`.

Severity stays should-fix. Nothing is at risk today (0 entries, no refs/stash). The purge runs only after the push, CI and clone deletion. The record quotes the owner faithfully. So this is not blocking, but the row should not go out committing Claude to commands that contradict the description the owner accepted.

On the fix: the memory rule "never add gates the owner did not choose" means Claude should not quietly swap the commands. Narrowing them to targeted reflogs changes what the owner chose, so it needs the owner's yes. A stop-and-ask when the stash holds two or more entries only enforces the option's own promise, so it is consistent with the owner's choice.

**Evidence:**

I used throwaway repos in C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/refute-r2rec2, with git 2.52.0.windows.1 (the machine's version, the same one byway uses). The probe ran `git reflog expire --expire-unreachable=now --all` and then `git gc --prune=now`:
- 1 stash: the list kept 1 entry and its commit was present.
- 2 stashes: the list and the reflog were empty, refs/stash was still present, the older commit was MISSING and the tip commit was present.
- 3 stashes: the list was empty, both older commits were MISSING and the tip was present.
- After that, `git stash show --stat refs/stash` still showed the tip's change, while `git stash list` printed 0 entries.
- `git -c gc.refs/stash.reflogExpireUnreachable=never reflog expire --expire-unreachable=now --all` still emptied a 2-entry stash. The explicit flag overrides the per-pattern config, so config cannot protect the stash.
- `git reflog expire --expire-unreachable=now refs/heads/main HEAD`, a targeted expiry, left both stash entries in place.

byway itself, read-only: `git rev-parse -q --verify refs/stash` exits 1, `git stash list` has 0 entries, `.git/logs/refs/` holds only heads and remotes, core.logallrefupdates is true, and `git worktree list` shows 3 checkouts.

Records: docs/playbook.md:51 quotes the question, including its commands, and the option text verbatim. It then says "So then Claude runs, in the checkout, `git reflog expire --expire-unreachable=now --all` ... and then `git gc --prune=now`", with no stash precondition. No other doc names these commands: grep found only conversation-continued.md and playbook.md.

Not checked: whether the latest rewrite (the eleven new commit ids) added reflogs beyond fix/fx-block1's and the fx-block1 worktree's HEAD that hold replaced commits. A targeted expiry would need that list.

**Fix:**

Before the purge, tell the owner that the option's line "stashes are untouched" is wrong whenever the shared stash holds two or more entries. Then re-ask, offering:
(a) the targeted expiry, `git reflog expire --expire-unreachable=now refs/heads/fix/fx-block1` in the checkout plus `git -C <fx-block1 worktree> reflog expire --expire-unreachable=now HEAD`, after re-listing which reflogs hold the replaced commits now that the latest rewrite has run; or
(b) the owner's commands as chosen, run only if `git stash list` is empty or has one entry immediately before.

Until the owner answers, amend row 51 to say Claude checks `git stash list` right before the expiry and stops and asks if it lists two or more entries. That condition only enforces the option's own promise. Also correct the row's wording: a lone stash survives, and with two or more, every entry drops out of the list and every stash commit but the tip is pruned. Do not change the commands without the owner's yes, and do not rely on gc.refs/stash.reflogExpireUnreachable, which the explicit flag overrides.

#### R2-REC-3: After 137bf75, ADR-0111's body and a backlog row still state a ten-minute stall bound, and a Later note names a backlog row that no longer exists

*Finding. Severity should-fix; outcome confirmed; lens records-privacy; where `docs/adr/0111-cancel-cuts-off-the-calls-byway-can-stop.md:93`.*

**What is wrong:**

137bf75 set STREAM_IDLE_MS to 900_000 and renamed the backlog row, but three statements were not updated. ADR-0111:93 (its account of ADR-0091) still says "a stream that sends nothing for ten minutes is `maybe` too". Backlog row 137, "Check the billing assumptions that no provider documentation backs", still says "A stream that sends nothing for ten minutes (STREAM_IDLE_MS, providers/stream.ts) is read the same way". ADR-0111:113, the CC-2 Later note, cites backlog row "An Anthropic think that sends nothing for ten minutes is read as a stalled stream". 137bf75 replaced that row with "Selectable answer waits per model (block 2)", and no backlog row has the old name now.

**Evidence:**

packages/gateway/src/providers/stream.ts:19 reads `export const STREAM_IDLE_MS = 900_000;`. Of all the `row "..."` citations in the docs this round changed, ADR-0111:113 is the only one that names a missing row and that this round created; the other four missing names are older historical mentions. ADR-0111 is not on main, so the round itself corrected other bullets in place (F2-RC-1).

**When it goes wrong:**

A reader of ADR-0111's consequences or of the billing-assumptions row believes a stalled stream is closed after ten minutes; it is fifteen. A reader who follows the CC-2 note's row name finds no such row.

**Proposed fix:**

Correct ADR-0111:93 and backlog row 137 in place so they say fifteen minutes, with the owner's choice and block 2's selectable waits. In ADR-0111:113, point to the row "Selectable answer waits per model (block 2)", or add "(now ...)" after the old name.

**Refuter 1: confirmed, should-fix.**

**Reasoning:**

I tried to refute R2-REC-3 and could not. All three of its claims hold on 137bf75 (HEAD of fix/fx-block1 in C:/Users/arvik/code/byway/.worktrees/fx-block1).

(1) ADR-0111 line 93, in "What this changes in earlier records" (the ADR-0091 bullet), still says in the present tense "Since block 1's fix round (Later notes), a stream that sends nothing for ten minutes is `maybe` too". But packages/gateway/src/providers/stream.ts:19 is `export const STREAM_IDLE_MS = 900_000;` (fifteen minutes). In-place correction was allowed here: ADR-0111 is not in main a002e60 (`git cat-file -e` fails), and the Later notes preamble says "What this changes" was corrected in place. ADR-0103 rule 1 also freezes only Context and Decision.

(2) Backlog row 137 ("Check the billing assumptions that no provider documentation backs") still says "A stream that sends nothing for ten minutes (STREAM_IDLE_MS, providers/stream.ts) is read the same way". 137bf75 did not touch that row.

(3) ADR-0111 line 113, the CC-2 Later note, cites backlog row "An Anthropic think that sends nothing for ten minutes is read as a stalled stream". 137bf75's diff of docs/backlog.md deletes that row and adds "Selectable answer waits per model (block 2)". Searching docs/ for the old row name finds it only at ADR-0111:113, so the pointer leads nowhere.

Two things soften this, but neither refutes it. The RB1-F1-1 Later note at ADR-0111:119 and backlog row 138 both say fifteen minutes correctly, so the ADR read in full has the right figure. And the CC-2 note's own "ten minutes" was true when that dated note was written, so only its row citation is broken, not its figures. Still, a reader of line 93 or of row 137 on its own is told ten minutes, and the CC-2 pointer is dead. This is a records slip, not wrong money or behaviour, so should-fix is the right severity.

Not checked: whether the conversation record holds the owner's design answers, and other lenses' scope. That was outside this finding.

**Evidence:**

- `git rev-parse HEAD` gives 137bf75ff13d01d29437d065db91ad324e601fb2.
- docs/adr/0111-cancel-cuts-off-the-calls-byway-can-stop.md:93 reads: "Since block 1's fix round (Later notes), a stream that sends nothing for ten minutes is `maybe` too, Anthropic's included".
- docs/backlog.md:137 reads: "A stream that sends nothing for ten minutes (STREAM_IDLE_MS, providers/stream.ts) is read the same way, \"may have been billed\" and sent once more at most (CC-2)."
- ADR-0111:113 reads: (backlog row "An Anthropic think that sends nothing for ten minutes is read as a stalled stream").
- packages/gateway/src/providers/stream.ts:19 reads: `export const STREAM_IDLE_MS = 900_000;`.
- `git show 137bf75 -- docs/backlog.md` shows "-| An Anthropic think that sends nothing for ten minutes is read as a stalled stream |" and "+| Selectable answer waits per model (block 2) |". Its --stat shows the ADR changed by only 1 line (the RB1-F1-1 note, line 119).
- `grep -rn "An Anthropic think that sends nothing" docs` matches only ADR-0111:113.
- `grep -n "ten minutes"` in the ADR and backlog finds only ADR-0111:93, ADR-0111:113 and backlog:137 (backlog:138 says ten only as history: "ten minutes from CC-2 until the owner's answer").
- `git cat-file -e a002e60:docs/adr/0111-...` gives "exists on disk, but not in 'a002e60'", so the ADR is not on main.
- docs/adr/0103-adr-log-rule-and-ci.md:40, rule 1, makes only Context and Decision final on main.

**Fix:**

- ADR-0111:93: replace "a stream that sends nothing for ten minutes is `maybe` too" with fifteen minutes, as the owner chose on 2026-10-22, until block 2's selectable waits per model (see the RB1-F1-1 Later note).
- docs/backlog.md row 137: change "A stream that sends nothing for ten minutes (STREAM_IDLE_MS, providers/stream.ts)" to fifteen minutes, ten from CC-2 until the owner's answer, and point to the row "Selectable answer waits per model (block 2)".
- ADR-0111:113: leave the dated note's ten-minute history as it is. Fix only its row pointer, either by naming "Selectable answer waits per model (block 2)" or by adding "(now the row \"Selectable answer waits per model (block 2)\")" after the old name.

**Refuter 2: confirmed, should-fix.**

**Reasoning:**

I could not refute any of the finding's three parts. All three hold at 137bf75. None of them comes from an owner's choice. The owner chose "15 minutes (Recommended)" and "In Block 2, 15 meanwhile (Recommended)", and the code follows that choice, so the records that still say ten minutes are wrong about the current state.

(1) ADR-0111:93 sits in "What this changes in earlier records", a body section. The record's own Later-notes preamble (line 110) says the record had not reached main, so "Consequences, What this changes and Evidence were corrected in place". That is how this record handles stale body text. The RB1-F1-1 note (line 119) says "So the bound is now fifteen minutes", yet line 93 still says "a stream that sends nothing for ten minutes is `maybe` too". The `maybe` reading is still right; only the duration is stale.

(2) docs/backlog.md:137, the row "Check the billing assumptions that no provider documentation backs", is part of a living list. It still says "A stream that sends nothing for ten minutes (STREAM_IDLE_MS, providers/stream.ts)". Row 138, directly below it, says fifteen minutes and "ten minutes from CC-2 until the owner's answer", so the backlog now contradicts itself.

(3) ADR-0111:113, the CC-2 note, is a dated historical note. Its own ten-minute statements are a fair account of what CC-2 did, and line 119 supersedes them, so I do not count those as defects. Its citation is a different matter: it names the backlog row "An Anthropic think that sends nothing for ten minutes is read as a stalled stream". 137bf75's diff shows that row being replaced by "Selectable answer waits per model (block 2)". The citation is not marked as a closed or renamed row, the way backlog:122 marks "the closed row", so it leads nowhere.

On severity: the money path is not affected. STREAM_IDLE_MS is 900_000, the tests say 15 minutes, and the billing classification is unchanged. No rule is broken, because ADR-0103 rule 1 makes in-place correction optional before main. No owner words are misquoted. Because of that, this is not blocking. It is more than a note, though: a body section of the ADR and a live backlog row both state the wrong value for current behaviour, and that is the same kind of slip this round fixed in place for F2-RC-1. Should-fix is the right level.

What I checked:
- the HEAD id;
- ADR-0111 lines 85 to 120;
- backlog rows 134 to 140;
- 137bf75's diff of the ADR and the backlog;
- every `row "..."` citation in ADR-0111, the backlog and the playbook, matched against their row names;
- a search of docs/ outside evidence/ for other stale mentions of the stall bound.

What I did not check: the quote-check of the owner's answers in conversation-continued.md, which belongs to another finding, and other ADRs' prose beyond the search. Docs only: no tests or clones were needed.

**Evidence:**

HEAD is 137bf75ff13d01d29437d065db91ad324e601fb2.

The code: packages/gateway/src/providers/stream.ts:19 reads `export const STREAM_IDLE_MS = 900_000;`. cut-off.test.ts:778 and :857 expect "nothing came for 15 minutes".

ADR-0111:93 ("What this changes", ADR-0091 bullet): "Since block 1's fix round (Later notes), a stream that sends nothing for ten minutes is `maybe` too, Anthropic's included". ADR-0111's Later-notes preamble says the record had not reached main, so "Consequences, What this changes and Evidence were corrected in place". ADR-0111:119 (RB1-F1-1): "So the bound is now fifteen minutes for every streamed provider".

docs/backlog.md:137 (billing-assumptions row): "A stream that sends nothing for ten minutes (STREAM_IDLE_MS, providers/stream.ts) is read the same way". docs/backlog.md:138: "the bound on a stalled stream is fifteen minutes ... ten minutes from CC-2 until the owner's answer".

ADR-0111:113 (CC-2 note) cites: backlog row "An Anthropic think that sends nothing for ten minutes is read as a stalled stream".

`git show 137bf75 -- docs/backlog.md` shows that row removed (`-| An Anthropic think that sends nothing for ten minutes ...`) and `+| Selectable answer waits per model (block 2) |` added. I matched every row citation in ADR-0111, the backlog and the playbook against their row names. Only three citations name no current row:
- ADR-0111:13, "Cancel stops calls already in flight": the row this ADR closed, cited in Context. Historical.
- backlog:122: explicitly "the closed row ...".
- ADR-0111:113: the only live citation that points at nothing.

A search for "stall" and "ten minutes" across docs/ outside evidence/ found no other stale stall-bound statements.

**Fix:**

1. ADR-0111:93: correct the ADR-0091 bullet in place to read roughly "a stream that sends nothing for STREAM_IDLE_MS (fifteen minutes since the owner's answer of 2026-10-22; ten in the first fix round) is `maybe` too", with a pointer to the RB1-F1-1 Later note.
2. docs/backlog.md:137: change "for ten minutes (STREAM_IDLE_MS, providers/stream.ts)" to "for fifteen minutes (STREAM_IDLE_MS, providers/stream.ts; ten from CC-2 until the owner's answer, selectable per model in block 2)".
3. ADR-0111:113: keep the note's historical ten-minute account, but change the citation to the current row, for example: backlog row "An Anthropic think that sends nothing for ten minutes is read as a stalled stream" (now "Selectable answer waits per model (block 2)").

These are record edits only and need no gate beyond the existing adr-evidence/record checks.

#### R2-REC-4: The playbook's review row records nothing of the second fix round and still lists the stall bound as Claude's choice

*Finding. Severity should-fix; outcome confirmed-partly; lens records-privacy; where `docs/playbook.md:49`.*

**What is wrong:**

Row 49 ("Review the 38 Delegated records") lists, for the first fix round, the owner's answer and "the choices the round's records name as Claude's". That list includes "the bound on a stalled stream". The row has no entry for the second round. It does not record the owner's "Fix them, small re-check, branch CI (Recommended)". It does not record the choices ADR-0111's note names as Claude's ("Each change is Claude's, under that answer"), among them F3R-1's required parameters and whole-screen render, which the builder recorded as Claude's choice. It also leaves out the code changes that go beyond "the small record slips" the option named: RB1-F1-3's change to ledger.ts and RC-5's change to the evidence test. Meanwhile the owner has now chosen the bound, at 06:40 and 09:50, yet the row still asks the owner to review it as Claude's.

**Evidence:**

`git diff 56c1347 137bf75 -- docs/playbook.md` changes only row 51. A grep of docs/playbook.md for "second fix round", "Fix them, small" or "selectable" finds only row 51's purge text.

**When it goes wrong:**

The owner's review packet asks them to review a bound they already chose, and it misses the second round's choices that ADR-0111 attributes to Claude.

**Proposed fix:**

Add the second round to row 49: the owner's 06:40 answer, quoted, and the choices ADR-0111's note names as Claude's, with RB1-F1-3's and RC-5's code changes marked as beyond the option's words if Claude reads them that way. Change "the bound on a stalled stream" to say that its value is now the owner's choice (15 minutes until block 2's per-model waits).

**Refuter 1: confirmed, should-fix.**

**Reasoning:**

The finding holds. I read the files and ran the commands on 137bf75.

1. Row 49 (docs/playbook.md) lists the first fix round's choices only. It quotes the owner's "Fix all, rewrite history, re-check, branch CI (Recommended)" and then lists "the choices the round's records name as Claude's: in ADR-0111, ... the bound on a stalled stream, ...". Nothing in the row covers the second round. At 137bf75, git grep of docs/playbook.md finds none of "second fix round", "Fix them, small", "selectable", "RB1-F1", "F3R-1", "F2-RC" or "RC-5". The only 06:40 in the file is row 51's purge text. `git diff 56c1347 137bf75 -- docs/playbook.md` changes only row 51. 137bf75 itself touches ADR-0111, the backlog, stream.ts and cut-off.test.ts, but not the playbook. The first round's entry came in a separate records pass (04508f4). The second round's records commit (d665311) changed row 51 only.

2. The second round's choices are Claude's on the record. ADR-0111's note "2026-10-22, block 1's second fix round" quotes the owner's 06:40 option whole and ends "Each change is Claude's, under that answer." The builder's report says of F3R-1 (no default on the parameters, and a render test of the whole RunScreen) that "ADR-0111's new Later note records this as Claude's choice". Row 49 lists none of this.

3. Two fixes go beyond the option's words. The option read "fix the three should-fix items, the abort-error bug and the small record slips". The re-check filed RB1-F1-3 against packages/gateway/src/ledger.ts and RC-5 against scripts/test/adr-evidence.test.ts. Commit 23f9e3c changes ledger.ts (11 lines) and ledger.test.ts, and 2092f9f rewrites the evidence test (65+/24-). Those are code and test changes, not record slips. ADR-0111 calls RB1-F1-3 "ADR-0083's C-LEDGER-ID note" and does not mark either fix as beyond the owner's words. The first round's note did mark such fixes: "That was Claude's choice, beyond the owner's words".

4. The owner now sets the bound's value. STREAM_IDLE_MS = 900_000 (stream.ts:19). ADR-0111's note "the stall limit for Anthropic (RB1-F1-1)" and backlog row 138 quote the owner's answers. Even so, row 49 still lists "the bound on a stalled stream", unqualified, for review as Claude's choice.

What I would correct in the finding (none of it changes the verdict):
- The evidence line says the greps find "only row 51's purge text". In fact they find nothing anywhere in the playbook. The finding is stronger than it says.
- "09:50" appears nowhere in the repository at 137bf75. ADR-0111 says only that the design was answered "the same day". The design answers are also missing from the conversation record: docs/adr/evidence/conversation-continued.md ends at 06:40 (line 603). That gap belongs to the separate check the task names.
- The bound should not simply move to the owner's column. Only its value (15 minutes until block 2) is the owner's. How it works is still Claude's choice from CC-2 and stays for review: the wait starts once the response begins, restarts at each chunk, and a stall reads as "may have been billed" and is sent once more at most.

Severity: should-fix fits. The row is incomplete and partly stale. It is not a false record of the owner's words, because the first round's records do still name the bound as Claude's. No key, organisation detail, email address or wrong amount of money is involved.

Checked: playbook row 49 and the playbook diff over the round; ADR-0111's notes (lines 6, 112, 113, 118, 119); backlog row 138; the 06:40 option text in conversation-continued.md (lines 572 and 603; the quote matches); the re-check's notes and their files; the builder's report on F3R-1; the files changed by 23f9e3c, 2092f9f, 264acd4 and 137bf75; STREAM_IDLE_MS in stream.ts.
Not checked: whether the docs/reviews packet should also change (it predates ADR-0111 and says so). I ran no tests, because the finding is about records only.

**Evidence:**

- `git grep -n -F "second fix round"|"Fix them, small"|"selectable" 137bf75 -- docs/playbook.md`: no matches. `git grep -o -F "the bound on a stalled stream"` matches docs/playbook.md:49 only.
- `git diff 56c1347 137bf75 -- docs/playbook.md`: one line changed, row 51 ("Drop the pre-rewrite commits").
- `git show --stat 137bf75`: ADR-0111, docs/backlog.md, providers/stream.ts, cut-off.test.ts. The playbook is not among them.
- ADR-0111 line 118 ends "Each change is Claude's, under that answer." It fixes "ADR-0083's C-LEDGER-ID note (RB1-F1-3)" and "the evidence check (RC-5)" without saying they go beyond the owner's words. Line 112, the first round's note, says "That was Claude's choice, beyond the owner's words".
- `git show --stat 23f9e3c`: packages/gateway/src/ledger.ts (11 lines), ledger.test.ts, ADR-0083. `git show --stat 2092f9f`: scripts/test/adr-evidence.test.ts (65+/24-).
- Re-check JSON: RB1-F1-3 is filed against packages/gateway/src/ledger.ts and RC-5 against scripts/test/adr-evidence.test.ts.
- Builder's report: "ADR-0111's new Later note records this as Claude's choice and names the residual (P1b)" (F3R-1).
- conversation-continued.md:572/603: the option is "Fix them, small re-check, branch CI (Recommended)", described as "...fix the three should-fix items, the abort-error bug and the small record slips...". The file's last entry is 06:40 and holds none of the design answers.
- stream.ts:19 `export const STREAM_IDLE_MS = 900_000;`. ADR-0111 line 119 and backlog:138 quote "In Block 2, 15 meanwhile (Recommended)", "Per model (Recommended)", "15 minutes (Recommended)".
- `git grep -F "09:50" 137bf75 -- docs`: no matches.

**Fix:**

In docs/playbook.md row 49, after the first fix round's entry, add the second round:
1. Quote the owner's option of 2026-10-22 06:40 whole, as ADR-0111's note does: "Fix them, small re-check, branch CI (Recommended)".
2. List the choices ADR-0111's note names as Claude's under that answer: F3R-1's parameters with no default and the whole-screen render test, with the residual that pollDelay(..., undefined) still passes; RB1-F1-2's redaction that defines the message rather than assigning it; F2-RC-1's correction in place; and the record fixes it lists.
3. Mark RB1-F1-3 (the change to ledger.ts) and RC-5 (the evidence test's new patterns and its scan of docs/reviews) as beyond the option's "small record slips", Claude's choice. Make the same mark in ADR-0111's note.
4. Reword "the bound on a stalled stream" in the first round's list so that how the bound works stays Claude's (it starts when the response begins, restarts at each chunk, and a stall reads as "may have been billed" and is sent once more at most). Its value is the owner's: fifteen minutes for every streamed provider until block 2's selectable waits per model, at the owner's answers of 2026-10-22, quoted in ADR-0111's Later notes. Cite ADR-0111 and backlog row "Selectable answer waits per model (block 2)".
5. Give the design answers no clock time until the conversation record is extracted past 06:40 and holds them.

**Refuter 2: partly, should-fix.**

**Reasoning:**

The main claim holds. Row 49 has nothing on the second fix round. The stall-bound half goes too far.

1) The missing second round (holds). Row 49 does more than point at records. It lists, round by round, the choices the records name as Claude's. The repository treats an incomplete list as a gap to fix:
- The audit of 2026-10-21, item 12, raised two choices missing from this row, and they were added.
- The B1 check report calls this row "the repository's mechanism for 'Delegated (reversible and flagged for review)'".

ADR-0111's second-round Later note quotes the owner's "Fix them, small re-check, branch CI (Recommended)" and ends "Each change is Claude's, under that answer." The builder's report says ADR-0111's note records F3R-1 as Claude's choice. Several of the changes are real choices in behaviour, not only record repairs:
- RB1-F1-2: an error that takes no new property is copied with its class and fields.
- RB1-F1-3: verify() now names a head that runs ahead of the file by its id, or by its number when the id is empty. This is a code change in ledger.ts.
- RC-5: the evidence check's patterns and scope.

The option the owner chose named "the three should-fix items, the abort-error bug and the small record slips". RB1-F1-3 is a second code bug (a note), not the abort-error bug, and not a record slip. RC-5 is a test change. ADR-0111 files RB1-F1-3 under "ADR-0083's C-LEDGER-ID note", which understates that ledger.ts changed. Round 1's note did flag its twelve extra notes as "beyond the owner's words". Round 2 flags nothing, and row 49 has no entry for it at all.

What softens it:
- Row 49's sources column cites "ADR-0111 (Decided by, Later notes)", and ADR-0111's Decided by covers "those its Later notes name". A reviewer who reads the cited notes would find the second round.
- By D5, the review gates no run.

So it is a records gap, not a false record or a broken rule. It is low-end should-fix, matching the audit-12 precedent.

2) The stall bound (overstated). The row's first-round item is still accurate as history: ADR-0111's CC-2 note still records the bound as Claude's design under the first round's answer. That answer's option had named "the stream idle limit", so the bound's existence was already within the owner's option. Claude's choices were:
- the value (ten minutes);
- when the wait starts (once the response has begun) and that it restarts at each chunk;
- that a stall reads as "may have been billed", sent once more at most with that attempt kept.

On 2026-10-22 at 09:50 local (transcript 16:50:28Z) the owner chose "In Block 2, 15 meanwhile (Recommended)", "Per model (Recommended)" and "15 minutes (Recommended)". The 06:40 answer, "Build selectable limits ...", asked for a feature; it did not set a value. So the owner now owns the value and the block 2 design. The bound's other choices are still Claude's and still worth reviewing.

The failure scenario, "asks them to review a bound they already chose", is therefore half wrong. The row needs a qualifier that the value is now the owner's, not the item's removal.

Side note: conversation-continued.md ends at the 06:40 answer, so the 09:50 answers are only in ADR-0111's Later note and the backlog row, not in the evidence file. That is outside this finding.

**Evidence:**

- `git diff 56c1347 137bf75 -- docs/playbook.md` changes only the "Drop the pre-rewrite commits" row (line 51). A grep of docs/playbook.md for "second fix round|Fix them, small|selectable|fifteen minutes|15 minutes" finds nothing in row 49. Row 49 still lists "the bound on a stalled stream" among "the choices the round's records name as Claude's", with no qualifier.
- ADR-0111 line 118 (second-round note) ends: "Each change is Claude's, under that answer." It lists RB1-F1-3 as "ADR-0083's C-LEDGER-ID note (RB1-F1-3)".
- Commit 23f9e3c also changes packages/gateway/src/ledger.ts: the line `if (lastSeq < head.seq) return head.id !== '' ? head.id : String(head.seq);` replaces `lineName(head.id, head.seq)`.
- The diff stat shows scripts/test/adr-evidence.test.ts with 89 lines changed (RC-5).
- The option as asked (conversation-continued.md, 06:38/06:40) reads: "fix the three should-fix items, the abort-error bug and the small record slips".
- block1-fix-recheck-result.json lists RB1-F1-3 ("A head that runs ahead of the file with an empty id is now named as a line that does not exist") and RC-5 as notes.
- The builder's report (wl3d8w0hp.output) says ADR-0111's new note records F3R-1 "as Claude's choice".
- ADR-0111 line 113 (CC-2) still describes the bound's mechanism as Claude's: the wait starts once the response has begun, restarts at each chunk, and a stall reads as "may have been billed".
- ADR-0111 line 119 and stream.ts at 137bf75 (STREAM_IDLE_MS = 900_000) record the owner's 15 minutes. The design answers are in the transcript at 2026-10-22T16:50:28Z (09:50 local). conversation-continued.md's header says "up to 2026-10-22 06:40 local".
- Precedent for treating an incomplete row as a gap: docs/adr/evidence/reports/audit-2026-10-21.md item 12, and b1-checks-2026-10-21.md around line 1826.
- Row 49's sources column cites "ADR-0111 (Decided by, Later notes)".
- Not checked: whether any other row or the review packet already covers the second round. The packet was prepared from a002e60, so it cannot. No mutation was needed; this finding is about records only.

**Fix:**

In docs/playbook.md row 49, after the first fix round's list, add a sentence on the second round. It should:
- quote the owner's 06:40 answer "Fix them, small re-check, branch CI (Recommended)" and point to ADR-0111's Later note, which quotes it whole;
- list the choices that note names as Claude's: F3R-1's required arguments and whole-screen render test, RB1-F1-2's copy of an error that takes no new property with its class and fields, RB1-F1-3's naming of a head that runs ahead of the file by id or number, and RC-5's wider evidence check;
- mark RB1-F1-3's ledger.ts change and RC-5's test change as beyond the option's words ("the abort-error bug and the small record slips") if Claude reads them that way, as round 1 did. If so, say the same in ADR-0111's note.

Qualify, rather than remove, "the bound on a stalled stream", for example: "the bound on a stalled stream (its value is the owner's since 2026-10-22: fifteen minutes until block 2's per-model waits; when its wait starts and restarts, and that a stall reads as 'may have been billed', stay Claude's)".

#### R2-REC-5: The playbook's purge row does not record the second rewrite of 2026-10-22, whose replaced commits hold the report's old description of the owner's address

*Finding. Severity should-fix; outcome confirmed; lens records-privacy; where `docs/playbook.md:51`.*

**What is wrong:**

Row 51 describes the replaced commits only for the rewrites of 2026-10-21 and for the rewrite at the 01:54 answer ("from e438a14 on ... 17 entries in each"). It does not mention the rewrite done at the owner's 06:40 answer ("rewrite the last two unpushed commits"). That rewrite replaced 11 commits, 5ce7edd..b89c80e, with a84c9bb..137bf75. Of those, 5ce7edd and 083ddb8 hold the report's passages that described the owner's address. The reflogs now hold 28 replaced entries each, not 17. The commands would catch these too, but the record gives the reader an incomplete picture of what sensitive content remains locally.

**Evidence:**

hist4-map.json has 11 pairs. `git reflog show fix/fx-block1` lists 30 entries, 28 of them not ancestors of 137bf75, and the worktree's HEAD reflog has 31 entries, 28 of them unreachable. As a positive control, 5ce7edd and 083ddb8 each hold 45 of 45 distinctive spans of the old lines in rc1-pairs.json, and daa393a and every commit of a002e60..137bf75 hold 0.

**When it goes wrong:**

Someone copies or backs up the .git folder believing only the overage and the fragment live in the replaced commits. The old description of the address goes with it.

**Proposed fix:**

Add a sentence to row 51 on the 06:40 rewrite: what it replaced, that 5ce7edd and 083ddb8 hold the old description, and that the reflogs now hold 28 such entries each. Keep R2-REC-2's change to the commands.

**Refuter 1: confirmed, should-fix.**

**Reasoning:**

The finding reproduces in full, and the gap is a little wider than it says. Row 51 of docs/playbook.md (read at 137bf75, clean tree) names the rewrites of 2026-10-21. It names the rewrite at the 01:54 answer as "replaced the commits from e438a14 on, which hold the organisation's overage and part of an email address" and says the reflogs hold "17 entries in each, from that rewrite". It says nothing about the later rewrite that gave 11 commits new ids after the rewording at 06:40. No other record mentions that rewrite either. I grepped docs/ for 5ce7edd, 083ddb8, b89c80e, daa393a, a84c9bb, "28 entries", "eleven commits" and "11 commits" and found nothing. The evidence README's row 14 and the check report's header record the 01:54 rewrite and the 06:40 rewording, but not the second id rewrite. ADR-0111 and the messages in the range only quote the owner's "rewrite the last two unpushed commits".

So the row's count is stale (17, now 28), and its account of what the replaced commits hold leaves out the report's old description of the address. Two further gaps, beyond the finding:
(a) e9a1585 holds all four old passages too. It is the old head that the 01:54 rewrite replaced, and both reflogs still point at it. So the row's description of that rewrite's commits is incomplete as well.
(b) The row says the fix round's re-check clones (recheck-b1-clones) "hold none of them". That is true only of the commits the 01:54 rewrite replaced. All 7 of those clones hold 5ce7edd and 083ddb8, because those commits were reachable when the clones were made.

Not blocking. Every commit of a002e60..137bf75, their messages and the tree hold none of the old passages. No ref holds the replaced commits, so no push sends them. The recorded commands (git reflog expire --expire-unreachable=now --all, then git gc --prune=now) would remove them. The owner's chosen deletion of every check clone covers recheck-b1-clones. The harm is the one the finding names: a reader who trusts the row gets a wrong picture of what is left locally, for example before copying the .git folder or the scratch clones.

Not checked: copies outside the scratchpad and the main checkout's own object store beyond what these reflogs and refs show. I did not open C:/Users/arvik/code/byway_review or .env.agents.

Off-path note, not this finding: the row quotes the owner's chosen option, "Reachable commits (... and stashes) are untouched". I made a throwaway repo with three stashes and ran `git reflog expire --expire-unreachable=now --all` on git 2.52.0.windows.1. Afterwards `git stash list` was empty. byway's stash stack has 0 entries today, but the stack is shared with other sessions. So the recorded purge could drop stash entries that exist when it runs, despite that sentence.

**Evidence:**

All git calls were made from Node with spawnSync('git', [...]) and no shell. The scripts are in C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/refute-r2rec5/: reflogs.mjs, oldlines.mjs, span1.mjs, hist3check.mjs, clones.mjs and stashtest.mjs.

1. Row 51 (grep -n confirms the line) names only the 2026-10-21 rewrites and the 01:54 rewrite "from e438a14 on", with "(17 entries in each, from that rewrite: read-only git reflog, 2026-10-22)". It also says recheck-b1-clones "hold none of them (... RC-6)". There is no sentence on a later rewrite.

2. hist4-map.json has 11 pairs: 5ce7edd→a84c9bb, 083ddb8→56c1347, daa393a→e3ded0a, fd552c8→f2fc531, 5f0786d→e2121c3, 476d54f→264acd4, e1eb13a→2092f9f, 773bd9f→23f9e3c, e687a17→497e548, a966ea6→d665311 and b89c80e→137bf75. hist4-stale.json is []. hist3-map.json's first old id is e438a14, and the only pair whose new id the fourth rewrite replaced is e9a1585→5ce7edd.

3. Reflogs. refs/heads/fix/fx-block1 has 30 entries; 28 are not ancestors of 137bf75 (merge-base --is-ancestor), and 11 of those are the fourth rewrite's old ids. The worktree's HEAD reflog has 31 entries; 28 are not ancestors, again with 11 of the fourth rewrite's old ids. Both unreachable lists run from b89c80e … 5ce7edd to e9a1585 … b3bf249. for-each-ref --contains returns 0 refs for each of the 11 old ids, and cat-file -t shows each is still a commit.

4. Content of docs/adr/evidence/reports/block1-check-2026-10-22.md, matched against rc1-pairs.json (4 old/new line pairs; I printed only counts):
- 5ce7edd and 083ddb8 each hold 4/4 old lines and 0/4 new, which is 109/109 of the 30-character windows of the old lines that are absent from their new lines.
- e9a1585 (hist3's old head) holds 4/4 old lines.
- daa393a, the other 8 old ids, all 11 new ids and all 69 commits of a002e60..137bf75 hold 0/4 old lines and 4/4 new. Only 11 of those 69 carry the file. In each, 1 of the 109 windows matches, and span1.mjs shows that window is part of another pair's new wording.
- The commit messages match 0 windows. The worktree file matches 0 old lines.

5. Clones (git cat-file -e on 5ce7edd and 083ddb8):
- recheck-b1-clones: all 7 (f1-gateway, f2rc1-refute, f2run, f3r1-refute, f3w, lc, rec-email) hold both.
- recheck-b1r2-clones (4), b1check-clones (32) and recheck-b1r2-privacy/stash-probe hold neither.

6. Off-path: stashtest.mjs, in a throwaway repo under the scratchpad, made 3 stashes and ran `reflog expire --expire-unreachable=now --all`. `git stash list` went from 3 entries to none (git 2.52.0.windows.1). byway's `git stash list` currently shows 0 entries.

**Fix:**

Add to row 51 a sentence on the rewrite done after the 06:40 rewording. Say that it gave the last 11 unpushed commits new ids (5ce7edd … b89c80e became a84c9bb … 137bf75). Say that 5ce7edd and 083ddb8, like e9a1585 from the 01:54 rewrite, hold the check report's old description of the owner's address (said only in those words). Give the reflogs' count as of the reading: 28 replaced entries in fix/fx-block1's reflog and 28 in the worktree's HEAD reflog, dated git reflog reads, not 17.

Qualify "so they hold none of them" for recheck-b1-clones: they hold none of the 01:54 rewrite's replaced commits, but all seven hold 5ce7edd and 083ddb8, and they go with the owner's chosen clone deletion. Extend the Why column's list of what the replaced commits hold to include that description.

Keep R2-REC-2's command change, and leave the commands as they are, since they already cover these commits. Separately, as its own note for the owner, not part of this finding: the option's description "stashes are untouched" is not what `git reflog expire --expire-unreachable=now --all` does to the stash reflog. Before the purge, check that refs/stash is empty, or exclude it.

**Refuter 2: confirmed, should-fix.**

**Reasoning:**

I tried to refute the finding and could not. Every factual claim I tested holds, and the gap is a little wider than the finding says.

Four ways it could have been wrong:

1. **Does the owner's choice cover it?** No. At 06:40 the owner chose "Fix them, small re-check, branch CI (Recommended)", whose description includes "rewrite the last two unpushed commits", and "Yes, after the push (Recommended)" for the purge. Both choices say what Claude does. Neither says the rewrite may go unrecorded. The purge commands sweep the new entries too, so the owner's choice is not weakened, but the record's account of what remains is incomplete.

2. **Is it recorded somewhere else?** No. At 137bf75, git grep finds none of the 11 replaced ids, nor "hist4", in any tracked file. ADR-0111's Later note of 06:40 quotes the option but does not say the rewrite was done or what it replaced. The check report's header and the evidence README say only that the passages were reworded. filter-branch kept every message unchanged, so no commit message mentions the rewrite either. Earlier rewrites set a pattern of a records commit after each one (56c1347, "Records after the history rewrite"). This rewrite has none.

3. **Is the row's "17 entries in each" still accurate?** It is scoped "from that rewrite", so it is not false. But each reflog now holds 28 entries that 137bf75 cannot reach, so a reader who checks the count, before or after the purge, gets a number the row does not explain.

4. **Is the harm only theoretical?** The row warns in general that copying the .git folder or the scratch clones sends the replaced commits. But it tells the reader those commits hold "the organisation's overage and part of an email address". It does not say they hold the report's old description of the owner's address, which RC-1 rated blocking.

The gap is wider than the finding states, in two ways:

- **One of the 17 entries from the 01:54 rewrite also holds the old description.** That entry is e9a1585, the tip before that rewrite. So the row's account of the 01:54 commits is incomplete too.
- **The row's clone sentence now reassures falsely.** It says the re-check clones (recheck-b1-clones) were made with --no-local "so they hold none of them". All 7 of those clones have HEAD at 083ddb8, made before the latest rewrite. They therefore hold 5ce7edd and 083ddb8 as reachable commits, and their checkouts hold the old description.

Operationally nothing breaks. The two purge commands and the owner's "delete every check clone" answer remove all of it. That is why this is should-fix and not blocking. It is a records-completeness slip in the one record that tracks where the owner's sensitive content still lives on this machine. It understates where that content is, which is worse than RC-6's overstatement (a note), but it does not affect whether the purge works, as RC-2 did (should-fix).

**Evidence:**

All checks were read-only, with git called through Node spawnSync and no shell. Scripts are in C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/r2rec5/ (reflog.mjs, spans.mjs, all28.mjs, clones.mjs).

- **Row text.** docs/playbook.md:51 at 137bf75 describes the two rewrites of 2026-10-21 and "The rewrite of the first block's unpushed history, at the owner's answer of 2026-10-22 01:54, replaced the commits from e438a14 on ... (17 entries in each, from that rewrite...)". It also says recheck-b1-clones "hold none of them". It says nothing of the 06:40 rewrite.
- **No record anywhere.** git grep at 137bf75 for 5ce7edd, 083ddb8, b89c80e and hist4 matches no tracked file. ADR-0111:118 quotes "rewrite the last two unpushed commits" but records no rewrite done and no ids. Neither the check report's header (block1-check-2026-10-22.md:1) nor evidence/README.md:14 mentions it.
- **The map.** hist4-map.json has 11 pairs (5ce7edd→a84c9bb ... b89c80e→137bf75) and hist4-stale.json is []. git diff of each pair: only 2 pairs differ, and only in docs/adr/evidence/reports/block1-check-2026-10-22.md. The other 9 have identical trees and messages.
- **Reflogs.** fix/fx-block1 has 30 entries and the worktree HEAD has 31. In each, 28 are not ancestors of 137bf75: 17 from the 01:54 rewrite and 11 from hist4, all 11 old ids present. @{11} is "filter-branch: rewrite" (01:54) and @{0} is "filter-branch: rewrite" (the latest).
- **Positive control.** I took 40-character windows of rc1-pairs.json's old lines that are absent from the new lines; there are 44 (the finding's own split gave 45). 5ce7edd and 083ddb8 each hold 44 of 44; daa393a, a84c9bb, 56c1347, e3ded0a and 137bf75 hold 0; git grep over all 69 commits of a002e60..137bf75 finds 0. Of the 28 unreachable reflog commits, 3 hold the old description: 5ce7edd, 083ddb8 and e9a1585 (the last from the 01:54 rewrite).
- **Clones.** I walked 82 repositories under the scratchpad. 7 hold 5ce7edd and 083ddb8, all in recheck-b1-clones (f1-gateway, f2rc1-refute, f2run, f3r1-refute, f3w, lc, rec-email), each with HEAD at 083ddb8.
- **Owner's words.** conversation-continued.md:599-603 has the option text and the 06:40 answers exactly as quoted.

What I could not check: I did not read the builder's report or the prior re-check result beyond RC-2's and RC-6's severities (should-fix and note). I did not inspect the clones under recheck-b1r2-clones, which were made after the rewrite with --no-local. I printed no address content.

**Fix:**

Add to docs/playbook.md row 51, keeping R2-REC-2's change to the commands:

- **The latest rewrite.** At the owner's answer of 2026-10-22 06:40 ("rewrite the last two unpushed commits"), Claude rewrote the block's unpushed history once more. It replaced 11 commits, 5ce7edd..b89c80e, with a84c9bb..137bf75; only the check report changed, in two of them. Of the replaced commits, 5ce7edd and 083ddb8 hold the report's old description of the owner's address.
- **The 01:54 rewrite's tip.** e9a1585, among the commits the 01:54 rewrite replaced, holds that description too.
- **The reflogs.** fix/fx-block1's reflog and the worktree's HEAD reflog now hold 28 such entries each (17 + 11).
- **The clones.** Correct the recheck-b1-clones sentence: those 7 clones were made at 083ddb8, before the latest rewrite, so they hold 5ce7edd and 083ddb8 as reachable commits. Deleting them, which the owner chose, removes those copies.

Optionally, add a one-line note to ADR-0111's 06:40 Later note that the rewrite was done and which ids it replaced, matching the header of block1-check-2026-10-22.md.

### Refuted findings (0)

None.

### Notes (6)

Minor findings and observations, not put to refuters.

#### B1R2-CODE-5: The render test's comment says a wrong argument fails it; for the poll after Cancel it does not (ADR-0111 says so)

*Note. Severity note; lens code; where `apps/web/test/run-screen.test.ts:227`.*

**What is wrong:**

Dropping either argument now fails the typecheck, and the render test catches a wrong cost, a wrong count on the panel and an ungated `after`. A wrong value for the refresh after Cancel still passes both the typecheck and every web test: pollDelay(run.status, undefined), (…, 0) or (…, after?.settledUsd). The comment "a wrong one fails here" is true for runMeter and the panel only. ADR-0111:118 states this residual correctly ("passing `undefined` for the poll's count still compiles, and only the polling would show it").

**Evidence:**

Clone .../scratchpad/recheck-b1r2-clones/lens-code (137bf75, --no-local, offline install). Results: `pollDelay(run.status)` gives apps/web typecheck TS2554 at RunScreen.tsx(109,65). `runMeter(run, events)` gives TS2554 at (93,17). `runMeter(run, events, undefined)`, `callsUnderWay={0}` and `const after = data.ended` each fail 1 of 15 in run-screen.test.ts. `pollDelay(run.status, undefined)` passes the typecheck (exit 0) and all 46 web test files (518/518). `pollDelay(run.status, 0)` and `pollDelay(run.status, after?.settledUsd)` pass run-screen.test.ts 15/15. No e2e spec checks polling after a run ends. The clone was clean after each run.

**When it goes wrong:**

A refactor passes 0 or undefined to pollDelay. An ended run with calls still under way stops polling at Cancelled, and its late cost appears only on a reload. No check catches it.

**Proposed fix:**

Narrow the comment to "a wrong cost, count or end test fails here; a wrong poll count does not (ADR-0111)". Or move the screen's delay into a pure function of RunData and the connection, and test that function.

#### B1R2-CODE-6: redactMessage's "never throws" and "same class" are slightly overstated at contrived edges

*Note. Severity note; lens code; where `packages/gateway/src/gateway.ts:1111`.*

**What is wrong:**

For the cases the round targets the helper is total. A DOMException keeps its identity, class, name, billing, cutOff and falRequests. A frozen GatewayError is copied with its class, code, retryable and fields. The money count is unchanged, because op.failed(e) reads billingOf and isCutOff from the original before redaction (gateway.ts:615-616; paid.ts:389-392). Three edges remain. `redact(e.message)` runs outside the try, so an Error whose message is not text throws a TypeError (the old assignment did too). A frozen DOMException is copied onto DOMException.prototype without its internal brand, so the copy's `code` getter throws. No current reader touches it: memo.ts checks `name` first, and Temporal's converter reads name, message, stack and cause. `cause` is passed on unredacted (unchanged behaviour). Also, the two new tests do not check money: their adapter throws before submit, so the call was never sent, and `inFlight: []` holds whatever op.failed is given.

**Evidence:**

Probe .../scratchpad/lensb1r2/redact-probe.mjs (a copy of the helper, Node 24.13.1). For a DOMException: the same object, "[redacted]" message, name TimeoutError, code 23. For a frozen DOMException: a copy, instanceof true, fields kept, and `.code` throws 'Value of "this" must be of DOMException'. For an Error with message 42: TypeError 't.split is not a function'. The cause message keeps the key. Mutations in the clone (script .../recheck-b1r2-clones/redact-mutate.mjs): restoring the old assignment fails both tests; dropping redaction fails both; `catch { return e; }`, copying onto Error.prototype, or copying without own fields each fail the frozen test. Replacing `op.failed(e)` with `op.failed(undefined)` passes both redaction tests, while 3 other cut-off.test.ts tests fail.

**When it goes wrong:**

Only with an adapter error whose message is not text, or a frozen DOMException read for its `code`. Neither happens in the current adapters.

**Proposed fix:**

Optional: write `redact(String(e.message))` inside the try, and say in the comment that a copied DOMException keeps its class by prototype only. Add a case to the DOMException test where the call was sent (markSent) and assert uncertainUsd, so the test guards the count directly.

#### B1R2-CODE-7: The contracts' description of verifyLedger does not mention the new bare-number result

*Note. Severity note; lens code; where `packages/contracts/src/gateway.ts:465`.*

**What is wrong:**

A head that runs ahead of the file with an empty id is now named by its number ('3'), not 'line:3'. Settings shows "fails its check at entry 3: an entry was changed, lost or cut off", which is true. auditLedger's brokenLine ignores it, which is correct. But Gateway.verifyLedger's doc (contracts/src/gateway.ts:465) and LedgerAudit.brokenAt's doc (contracts/src/spend.ts:343) and ledgerCheckText's doc ("anything else the id of the first entry") still describe only an id, `line:<n>` or `head`.

**Evidence:**

ledger.ts:583 `return head.id !== '' ? head.id : String(head.seq)`. In the clone, reverting to lineName(head.id, head.seq), or returning head.id alone, each fails 1 of 50 in ledger.test.ts. history.ts:104-112 shows how '3' is rendered.

**When it goes wrong:**

A future reader of brokenAt treats any value that is not `line:`/`head` as an entry id and looks for an entry whose id is '3'.

**Proposed fix:**

Add "or the number of a missing entry whose head record has an empty id" to the three doc comments.

#### B1R2-CODE-8: The new ".&lt;ending>" form flags ordinary sentences that end with a provider's name

*Note. Severity note; lens code; where `scripts/test/adr-evidence.test.ts:91`.*

**What is wrong:**

`(?:\s+dot\s+|\s*\.\s*)` allows a space after the dot, so "&lt;word> at &lt;provider>. &lt;Word>" (for example "run at live. Then" or "looked at Outlook. The") counts as an address. This errs on the side of safety and no current file trips it. The test's ordinary-text cases do not include a sentence that ends after the provider's name.

**Evidence:**

Probe log .../scratchpad/lensb1r2/email-probe.log: "run at live. Then" is FLAGGED; "set the cutoff at 15 minutes. Then" passes.

**When it goes wrong:**

A future evidence file or review that mentions a mail product at the end of a sentence fails the check, and the writer has to reword it.

**Proposed fix:**

Use `\s*\.(?=[A-Za-z])` (no space after the dot) for the ".&lt;ending>" form, or accept the false positive and add such a sentence to the test's ordinary text as an expected hit.

#### R2-NOTE-1: 3ea91f8 is still an empty commit whose message claims a redaction (RC-4)

*Note. Severity note; lens records-privacy; where `docs/adr/evidence/reports/b1-checks-2026-10-21.md:3866`.*

**What is wrong:**

3ea91f8's message says the B1 checks report "no longer holds the organisation's September overage or a fragment of the owner's email address", but the commit changes no files. The builder's suggestion stands: say so in the --no-ff merge message.

**Evidence:**

`git diff --name-only 3ea91f8^ 3ea91f8` is empty (builder's RC-4). The commit is still in a002e60..137bf75.

**When it goes wrong:**

A reader of the log looks for the redaction in 3ea91f8 and finds nothing.

**Proposed fix:**

Put the builder's sentence in the merge message: "3ea91f8 is empty after the rewrite; its redaction now stands in every commit from e438a14 on".

#### R2-NOTE-2: ADR-0111's stall-limit note has a broken sentence and a step that is now done; two intermediate commits misdescribe their own report

*Note. Severity note; lens records-privacy; where `docs/adr/0111-cancel-cuts-off-the-calls-byway-can-stop.md:119`.*

**What is wrong:**

Line 119 reads "Claude puts a short design to the owner before building it, The design was put to the owner the same day". A comma joins two sentences, and the first, written in the present tense, describes a step that is now complete. Separately, the rewrite gave a84c9bb and 56c1347 the bracketed rewording, but their header still says "the email fragments are also described here without their @ form" and does not explain the brackets until e3ded0a. a84c9bb's message says the same.

**Evidence:**

`sed -n 119p` of ADR-0111. `git diff 56c1347 e3ded0a` changes only the header line, and `git diff 5ce7edd a84c9bb` changes only the four passages.

**When it goes wrong:**

Readability only, at the tip and in two intermediate commits.

**Proposed fix:**

Fix the sentence at 119 when R2-REC-1 adds the evidence link. The intermediate commits can be left as they are, since the final tree's header explains the rewording.

### What each lens checked

#### code

- Read the round's code diff 56c1347..137bf75 (gateway.ts redactMessage, ledger.ts, stream.ts, meter.ts, run.ts) and its tests (cut-off, ledger, run-screen, runs, adr-evidence, guard-sandbox).
- Redaction helper: probed in Node 24.13.1 (DOMException, frozen DOMException, frozen Error, non-text message, cause, AggregateError, Proxy, stack). Five mutations in a --no-local clone; each failed one or both new tests. The money count is unchanged by construction: op.failed(e) runs before redaction. The two new tests do not exercise money, shown by an op.failed(undefined) mutation.
- RunScreen wiring: dropping pollDelay's or runMeter's argument fails the apps/web typecheck (TS2554 at 109 and 93). Wrong cost, panel count and ungated `after` each fail run-screen.test.ts. A wrong pollDelay value (undefined, 0 or settledUsd) passes the typecheck and all 518 web unit tests. No e2e spec checks polling after a run ends.
- Ledger: a head running ahead with an empty id returns its number. Two mutations fail ledger.test.ts. The Settings text and brokenLine handle the number correctly.
- Evidence email check: six mutations of the new forms or scan scope each fail the email tests. A probe of 15 fake forms and 8 ordinary texts, using the file's own code. The two named docs/reviews exceptions pass and are pinned. The check's patterns run over all 1,267 tracked files at 137bf75, every added line of the 69 commits a002e60..137bf75, and their messages found no address at a listed mail provider (output masked).
- Stall bound: STREAM_IDLE_MS = 900_000. Every streamed adapter (anthropic, openai, openrouter) uses StreamIdle. The tests fake setTimeout and clearTimeout. Setting the bound back to 600_000 fails 4 stall tests. Grepped every remaining ten-minute statement.
- Media-step timeouts (acts.ts) against the stall bound's stated premise.
- Workflow bundle hash: build.test.ts passes 5/5 in the clone with the pinned hash 38afef53…, which no commit of a002e60..137bf75 changes. The round touches no workflow or contracts source.
- Quote check of the owner's 2026-10-22 answers against conversation-continued.md, ADR-0111 and stream.ts. The 06:40 answers are present. The design answers are absent.

*Not checked by this lens:*

- Did not run the full unit, typecheck or browser gate; ran targeted tests only. The browser tests (58) were not run.
- Could not quote-check the design answers or their option descriptions word for word, because the record does not hold them.
- Prose descriptions of the owner's address (anything not shaped like an address) were not searched beyond the check's own patterns. The records lens covers RC-1's report wording, the git identity and the purge.
- ADR-0111's F2-RC-1 rewording, ADR-0112 item 6 and the playbook rows on the replaced commits (records lens).
- Branch CI on either machine.
- Whether Temporal's history already holds any unredacted error stack or cause from earlier runs.

#### records-privacy

- Rewrite integrity: I compared the trees of the pre-rewrite tip b89c80e and of 137bf75: same tree, 2f60eb6c. Pairwise against hist4-map.json, the trees and messages of all 11 replaced commits match, except that a84c9bb and 56c1347 differ only in the four reworded lines of the Block 1 check report. Both ranges have 69 commits, and the merge-base is 04508f4.
- Old description of the address: 45 distinctive spans of the old lines in rc1-pairs.json appear in 0 of the 69 commits' report files and in 0 messages. As a positive control, 5ce7edd and 083ddb8 each hold 45 of them.
- Privacy scan of all 69 commits of a002e60..137bf75 and a002e60, trees with git grep and messages, outputs masked: the owner's surname and given name 0; [masked: the scan's other terms for the address, and what each found]; the provider name only in the generic PROVIDERS list and the old fixture (finding R2-PRIV-1).
- Organisation: the pre-redaction values from scratchpad hist-redact.cjs, matched without printing them: the overage as dot, escaped dot, comma, space, any separator, words ('N dollars', 'N cents'), the integer near overage or extra, and the plan price, included minutes, runner dollars, pool shares and the three repository names. None is in any of the 69 trees or messages; the one comma-form hit is unrelated: [masked: where it is]. The org name occurs only in byway's own repo paths, as on main.
- Author and committer: all 69 commits have the one identity, which is main's author address (the owner's 'Keep it as it is'); the only other address is the Co-Authored-By noreply trailer.
- Owner quotes: every quoted string added in docs and in the messages of 56c1347..137bf75 was checked against conversation-continued.md; the 06:41 and 09:50 entries were checked against the session transcript (main thread, read-only). All owner quotes are verbatim. The record's 04:04 to 06:40 entries are byte-identical to the transcript, including the 06:37 interrupted result.
- ADR-0111's corrected F2-RC-1 bullet and backlog row 128 against packages/store/src/spend-book.ts:550-554 and settle() at 178-190, packages/gateway/src/paid.ts end() at 456-465, and fal.ts cancelJob at 191-194 and stoppedGeneration at 438-440. The bullet matches: settle wins, then release (state <> 'settled'), then abandon (open, sent or accepted only), keyed by row id.
- Playbook row 51: the purge commands, their order and their timing match the owner's 06:40 answer. I verified with a stash probe (R2-REC-2), and checked that the 2026-10-21 replaced commits are held by no reflog.
- Cited commit ids: every 7-40 hex token in the files changed in a002e60..137bf75, and in the range's messages, that resolves to a commit not on 137bf75. Outside the as-sent reports, every one is an explained, mapped id. None of the second rewrite's 11 replaced ids, and no id from 7715586 to 137bf75, is cited anywhere.
- Backlog row 138 and the stall bound against code: STREAM_IDLE_MS is 900_000; acts.ts has model steps at 15 minutes and media at 45; cut-off.test.ts messages say 15 minutes.
- Backlog row names cited in the docs this round changed: one dangling name (R2-REC-3).

*Not checked by this lens:*

- I made no clones and ran no mutations. This lens's findings are about records and history, and no regression test applies to them. The gate's figures (typecheck, 5,386 unit tests, 58 browser tests) and 137bf75's 'setting the bound back to ten fails four tests' were not re-run.
- I did not open .env.agents or byway_review, and I did not inspect the pre-rewrite objects beyond the span counts in the report and the two redaction scripts in the scratchpad.
- That git expires stash entries this way rests on one probe with git 2.52.0.windows.1, not on the documentation.
- I did not check the other worktree's or the main checkout's stashes and reflogs for other sessions' recovery points, beyond counting stash entries (0).
- I did not read every line of the as-sent reports (b1-checks, block1-check, audit) beyond the pattern scans.

## The privacy check of the third fix round (2026-10-22)

*From `block1-round3-check-result.json` (12:08). The check the owner chose at 10:35, "Fix all, rewrite, gate, privacy check, branch CI (Recommended)", whose description read in part "one privacy-and-records lens with refuters on the result": that lens at b395d32, two refuters for each serious finding. Its result names no lens on its findings and gives what the lens checked as one text. Claude put its findings to the owner at 12:09; the owner answered at 12:10.*

### Findings that survived the refuters (3)

#### B1R3-REC-1: Purge row: the first re-check's clones are said to hold none of the replaced commits, but each holds five; lensb1r2 is not a clone

*Finding. Severity should-fix; where `docs/playbook.md:51`.*

**What is wrong:**

Row 51 still says the clones under recheck-b1-clones "hold none of them (the re-check of the fix round, RC-6)". The sentence this round added names only "recheck-b1r2-clones and lensb1r2" as holding replaced commits. In fact all 7 clones under recheck-b1-clones were made at 03:40-03:58, after the 01:54 rewrite and before the 06:40 one. Each holds five commits that were later replaced: 7715586, e6cd3e0 and 04508f4, which hold the old two-piece provider fixture, and 5ce7edd and 083ddb8, which hold the Block 1 check report's old passages on the owner's address as well as the fixture. lensb1r2 holds no git data at all, only six script and log files. In the last round, R2-REC-5's refuter raised the recheck-b1-clones half of this, and the owner then chose "Fix everything found". The row still gives the reader a false map of which local copies hold privacy-relevant material. I rate it should-fix, not blocking, because the row's own rule ("Claude deletes every check clone in the scratchpad") removes them whatever the inventory says.

**Evidence:**

git -C &lt;clone> cat-file -e &lt;old id> for every .git under the scratchpad (depth 7, 84 repositories). recheck-b1-clones/{lc,f2run,f3w,f1-gateway,rec-email,f3r1-refute,f2rc1-refute} each hold 7715586 e6cd3e0 04508f4 5ce7edd 083ddb8, which is 5 of the 25 ids in hist4-map.json and hist5-map.json. recheck-b1r2-clones/{lens-code,code4-refute,code3,c4} each hold 14 of them. recheck-b1r2-privacy/stash-probe and refute-r2rec5/stashrepo hold none. `ls -la scratchpad/lensb1r2` lists email-probe.log/.mjs, history-scan.mjs, redact-probe.mjs, stack-probe.mjs and tree-scan.mjs, with no .git. The R2-REC-5 refuter's vote in block1-round2-recheck-result.json reads in part: "(b) The row says the fix round's re-check clones (recheck-b1-clones) 'hold none of them'... All 7 of those clones hold 5ce7edd and 083ddb8."

**When it goes wrong:**

Someone tidying the scratchpad, or backing it up, keeps recheck-b1-clones because the record says --no-local made them clean. Those clones carry the report's old description of the owner's address and the old fixture that, together with the published R2-PRIV-1 note, points at the provider.

**Proposed fix:**

In row 51, keep "so they hold none of them" for the commits of 2026-10-21 and of the 01:54 rewrite. Then add: "but, made before the rewrites at 06:40 and 10:35, each holds five commits those rewrites replaced (7715586, e6cd3e0, 04508f4, 5ce7edd, 083ddb8)". Replace "(recheck-b1r2-clones and lensb1r2)" with "(recheck-b1r2-clones; lensb1r2 holds only the lens's scripts)", or just drop lensb1r2.

**Refuter 1: confirmed, should-fix.**

**Reasoning:**

I could not refute this finding. Its evidence reproduces in my own --no-local clone (recheck-b1r3-clones/refute-B1R3-REC-1-0, at b395d325) and in the scratchpad.

1. The row text. docs/playbook.md:51 at b395d32 still says the clones in recheck-b1-clones were made with --no-local, "so they hold none of them (the re-check of the fix round, RC-6)". The sentence this round added (it is absent at b395d32^) reads "The clones of that re-check (recheck-b1r2-clones and lensb1r2) were made before the last rewrite, so they hold the replaced commits too". So the row lists only recheck-b1r2-clones and lensb1r2 as the clones that hold the 2026-10-22 replaced commits.

2. The facts. I ran cat-file -e for the 25 old ids in hist4-map.json and hist5-map.json against every .git under the scratchpad (94 repositories now). Only these hold any of them:
   - Each of the 7 clones in recheck-b1-clones (f1-gateway, f2rc1-refute, f2run, f3r1-refute, f3w, lc, rec-email) holds exactly 7715586, e6cd3e0, 04508f4, 5ce7edd and 083ddb8.
   - Each of the 4 clones in recheck-b1r2-clones (c4, code3, code4-refute, lens-code) holds 14.
   - lc's fix/fx-block1 and origin refs point at 083ddb8, committed at 03:26. The directory times are 03:40 to 03:58, after the 01:54 rewrite and before the ones at 06:40 and 10:35.
   - lensb1r2 has no .git. It holds only six script and log files, and none of them matches the owner-address patterns. I probed that the pattern file matches a planted string first; grep aborted here, so I counted with node.

3. Privacy relevance. In the lc clone, the replaced 7715586 differs from its replacement c27ecf0 only in scripts/test/adr-evidence.test.ts (16 changed lines). It and 083ddb8 lack the new `'hot' + 'mail'` line, so they hold the old provider fixture. The row itself says 5ce7edd and 083ddb8 hold the report's old passages on the owner's address. So by the row's own account, the 7 clones it leaves out hold privacy-relevant material.

4. History. In block1-round2-recheck-result.json, the R2-REC-5 refuter's vote point (b) already raised this. It said all 7 recheck-b1-clones hold 5ce7edd and 083ddb8. The owner then chose "Fix everything found", but this round fixed only the main R2-REC-5 point.

Two mitigations:
- Read strictly, "hold none of them" refers to the commits of the 2026-10-21 rewrites. That is true, and it is also true of the 01:54 rewrite's commits (0 of hist2's 25 and hist3's 39 old ids, and 0 of the named eedc340...e438a14). So the finding's headline slightly overstates what that one sentence claims.
- The inventory is still wrong. It names lensb1r2, which holds no commits, and it omits the 7 recheck-b1-clones, each holding 5 replaced commits. A reader would take recheck-b1-clones to be clean.

Severity: should-fix, not blocking. No ref holds these commits, so no push sends them. The owner's chosen rule, "Remove every check clone in the session scratchpad", deletes these clones whatever the row lists. But the row is the record of which local copies hold privacy material, and the owner asked for this to be fixed.

The suggested fix fits:
- Keep "none of them" for the commits of 2026-10-21 and of the 01:54 rewrite.
- Add that each recheck-b1-clones clone holds the five commits replaced at 06:40 and 10:35.
- Drop lensb1r2, or say it holds only the lens's scripts.

**Refuter 2: confirmed, should-fix.**

**Reasoning:**

I tried to refute this and could not. It reproduces at b395d325c6c31ca2440a6b65b6e14f0a6153d167.

1. The row text. In docs/playbook.md:51, the clones under recheck-b1-clones are still said to "hold none of them (the re-check of the fix round, RC-6)". The sentence added this round reads "The clones of that re-check (recheck-b1r2-clones and lensb1r2) were made before the last rewrite, so they hold the replaced commits too". Read literally, "them" in the RC-6 sentence means the commits the two rewrites of 2026-10-21 replaced. That part is true: none of the 7 clones holds any of the 64 old ids in hist2-map.json or hist3-map.json, and a spot-check of eedc340, 11fc3b0, 15acbd2, 481b2e5, c001ced, 5abafbe, f57389c and e438a14 found none of them. But the row then lists the 06:40 and 10:35 rewrites, says only the second re-check's clones hold replaced commits, and gives "made before the last rewrite" as the reason. The recheck-b1-clones were also made before that rewrite, and before the one at 06:40. So the row tells a reader they are clean, which is false.

2. What the clones hold. I ran `git cat-file -e <id>^{commit}` for the 25 old ids in hist4-map.json and hist5-map.json:
- **recheck-b1-clones:** all 7 clones (f1-gateway, f2rc1-refute, f2run, f3r1-refute, f3w, lc, rec-email) hold the same five: 04508f4, 083ddb8, 5ce7edd, 7715586 and e6cd3e0. Every one has HEAD at 083ddb8, committed 2026-10-22T03:26-07:00. The folders date from 03:40 to 03:58.
- **recheck-b1r2-clones:** all 4 clones (c4, code3, code4-refute, lens-code) hold 14 of the 25.
- **Everything else:** across all 94 .git folders under the scratchpad (depth 7), no other repository holds any of the 25.

Comparing old and new trees: 7715586, e6cd3e0 and 04508f4 differ from c27ecf0, 960e5ba and 7735a91 only in scripts/test/adr-evidence.test.ts, which is the old fixture. 5ce7edd and 083ddb8 differ in both the report and that test file. As a positive control, I took 40-character spans from rc1-pairs.json that occur only in the old report text. The checked-out report in lc and in rec-email contains 44 of 44 such spans. The report at the tip contains 0 of 44. So the old description of the owner's address is in these clones' checked-out files as well as in their git objects. Running the email-patterns.txt patterns gave 0 hits everywhere, including on the known-old text. That is because the passages describe the address rather than spell it out, so the zero proves nothing either way.

3. lensb1r2. It has no .git. It holds only email-probe.log, email-probe.mjs, history-scan.mjs, redact-probe.mjs, stack-probe.mjs and tree-scan.mjs. The session transcript shows no clone ever made into it. Calling it one of "the clones of that re-check" is wrong.

4. This was already raised and accepted. In block1-round2-recheck-result.json, both refuters of R2-REC-5 flagged it. One wrote that recheck-b1-clones' "hold none of them" "is true only of the commits the 01:54 rewrite replaced. All 7 of those clones hold 5ce7edd and 083ddb8". The other said the sentence "now reassures falsely" and asked for it to be qualified. The owner chose "Fix everything found", and this round's fix left the sentence as it was.

5. Severity. It does not block the push. These clones are local and no push sends them. The row's own rule has Claude delete every check clone in the scratchpad, which removes them whatever the list says. But this row is the one record of where privacy-relevant copies still live on this machine. It now gives a false picture for 7 clones, whose checked-out files hold the old description of the address, and it repeats a gap the owner had already chosen to fix. So it is should-fix, not a note.

The suggested fix is accurate. It should keep "so they hold none of them" for the commits of 2026-10-21 and of the 01:54 rewrite. It should then say that the clones, made before the rewrites at 06:40 and 10:35, each hold the five replaced commits 7715586, e6cd3e0, 04508f4, 5ce7edd and 083ddb8. It should also drop lensb1r2 or describe it as script-only.

I made no clone and changed nothing in the repository. My temporary files under the scratchpad were deleted.

#### B1R3-REC-2: Purge row: the record of which replaced commits hold the provider hint and the old address description is incomplete

*Finding. Severity should-fix; where `docs/playbook.md:51`.*

**What is wrong:**

The row ties each part of the sensitive content to one rewrite. Commits replaced at 01:54 hold "the organisation's overage and part of an email address". At 06:40, "5ce7edd and 083ddb8 hold the Block 1 check report's passages". At 10:35, "7715586 to 264acd4 hold an old test fixture and 2092f9f a message bullet that together named the mail provider". The rewrites' replaced sets overlap more than that:
- The old two-piece provider fixture is also in four commits replaced at 01:54 (177b719, 3c6cd52, 5b39a9d, e9a1585) and in six replaced at 06:40 (5ce7edd, 083ddb8, daa393a, fd552c8, 5f0786d, 476d54f). That makes 19 replaced commits in all, not 9.
- e1eb13a, replaced at 06:40, carries the same message bullet as 2092f9f, so the provider pairing exists in the 06:40 set as well.
- e9a1585, replaced at 01:54 and still in both reflogs, holds 4 of the 5 old report lines that described the owner's address.
R2-REC-5's refuter raised the e9a1585 point last round. The recorded purge covers all of these: after it, 0 of the 105 replaced-only commits stay reachable. Only the inventory is wrong.

**Evidence:**

All reads were on the main checkout's object store. `git show <old>:scripts/test/adr-evidence.test.ts | grep -c` for the old constant gives 1 for the four hist3 keys above, the six hist4 keys above, and 7715586..264acd4. It gives 0 for 2092f9f, e1eb13a and later commits. `git log -1 --format=%B` contains the bullet in e1eb13a and 2092f9f only. I diffed 083ddb8 against daa393a and then grepped each removed line with -F -x: e9a1585 holds 4/5, 5ce7edd 4/5, 083ddb8 5/5 and daa393a 0/5. `git reflog show refs/heads/fix/fx-block1` and the fx-block1 worktree's HEAD reflog each list e9a1585, e1eb13a, 476d54f and daa393a. reach.cjs counts 105 replaced-only commits, and none of them is reachable once those two reflogs are expired.

**When it goes wrong:**

Someone checks which local objects still name the provider, or still describe the address, using the row. They conclude that the 01:54 and 06:40 sets hold only the overage, the fragment and two report commits, and they miss e1eb13a's message and the ten earlier fixture copies.

**Proposed fix:**

Add one sentence to row 51: "The old fixture is also in 177b719, 3c6cd52, 5b39a9d and e9a1585 (replaced at 01:54) and in 5ce7edd to 476d54f (replaced at 06:40); e1eb13a (replaced at 06:40) carries the same bullet as 2092f9f; and e9a1585 holds the report's old passages too." Or say once that every replaced commit from the 01:54 rewrite on may hold any of the three, since the purge removes them all.

**Refuter 1: confirmed, should-fix.**

**Reasoning:**

I reproduced every part of the finding at b395d325. The row's sentences are true, but they leave out content in the 01:54 and 06:40 replaced sets.

Method: I made my own --no-local clone at C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/recheck-b1r3-clones/refute-B1R3-REC-2-0 and read the main checkout's object store read-only. The scripts, which print counts only, are in C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/refute-rec2-work. They take the old constant from hist5-fixture.cjs, and a planted string matched it 1/1.

1. Fixture copies. The old two-piece provider constant is in scripts/test/adr-evidence.test.ts of these replaced commits:
- 01:54 set (hist3 keys): 177b719, 3c6cd52, 5b39a9d and e9a1585. The other 35 hold 0.
- 06:40 set (hist4 keys): 5ce7edd, 083ddb8, daa393a, fd552c8, 5f0786d and 476d54f. e1eb13a, 773bd9f, e687a17, a966ea6 and b89c80e hold 0.
- 10:35 set (hist5 keys): 7715586 to 264acd4 (9 commits). 2092f9f and later hold 0.
- 2026-10-21 set (hist2 keys): 0 of 25.
That makes 19 replaced commits, not the 9 the row names. None of the 74 reachable commits a002e60..b395d32 holds the constant.

2. Message bullet. Across all four maps' replaced commits, only e1eb13a (06:40 set) and 2092f9f (10:35 set) carry it. The reachable range has 0. Because 476d54f and its ancestors also hold the fixture, the 06:40 set holds the whole provider pairing on its own. The row's "together named the mail provider" is tied only to the 10:35 set.

3. Report passages. daa393a changed 5 lines of docs/adr/evidence/reports/block1-check-2026-10-22.md relative to 083ddb8.
- Line 0 is the header (RC-3). It is not one of the address passages; 56c1347 and the reachable 0d36f8a keep it, and it matches no email pattern.
- Lines 1 to 4 are the address-describing passages (RC-1). e9a1585 holds all four, as do 5ce7edd and 083ddb8; daa393a holds none.
e9a1585 was replaced at 01:54. The row describes that set only as holding "the organisation's overage and part of an email address" and names only 5ce7edd and 083ddb8 for the passages.

4. Reflogs. e9a1585, e1eb13a, 476d54f, daa393a, 177b719, 3c6cd52, 5b39a9d, 5ce7edd, 083ddb8, fd552c8 and 5f0786d are each listed in refs/heads/fix/fx-block1's reflog and in the fx-block1 worktree's HEAD reflog. No branch contains them. No other reflog reaches any of them: logs/HEAD, main, fix/fx-r3code, flaky-ledger-tamper-mtime, the fx-r3code and admiring-agnesi worktree HEADs, and stash (0 entries). So the recorded purge (expire those two reflogs, then gc --prune=now) removes everything. As the finding says, only the inventory is wrong.

Why it matters and why should-fix is right:
- This is not new. Last round's R2-REC-5 refuter already proposed this exact addition ("e9a1585, among the commits the 01:54 rewrite replaced, holds that description too"; block1-round2-recheck-result.json), and R2-REC-5 was rated should-fix.
- ADR-0111:122 now says the playbook's pre-rewrite row covers R2-REC-5, but the e9a1585 point never landed. The row also understates where the provider pairing lives, which R2-PRIV-1 rated blocking.
- Nothing leaks and the purge is unaffected, so it is not blocking. But it is a privacy-relevant inventory in a record to be pushed, and it repeats a gap already flagged, so it is more than a note.
- The suggested fix (one sentence, or a blanket statement that every commit replaced from the 01:54 rewrite on may hold any of the three) is proportionate.

Off-path, not part of this finding: row 51 still says recheck-b1-clones "hold none of them". Last round's refuter said those clones were made at 083ddb8, so they hold 5ce7edd and 083ddb8. I did not check whether those clones still exist.

**Refuter 2: confirmed, should-fix.**

**Reasoning:**

I could not refute this finding. Every claim reproduces at b395d32. I worked in my own --no-local clone at C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/recheck-b1r3-clones/refute-B1R3-REC-2-1. The replaced objects can only be read in the main checkout, so I read them there with read-only git commands. My scripts are in C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/refute-b1r3-rec2-1w.

What row 51 says: the 01:54 set holds "the organisation's overage and part of an email address"; of the 06:40 set, 5ce7edd and 083ddb8 hold the report's passages; of the 10:35 set, 7715586 to 264acd4 hold the fixture and 2092f9f the bullet.

1. The old fixture is in 19 commits, not 9. I took the old constant line from the diff of 264acd4 against 3d0ce86 and never printed it. I then counted it with grep -F in scripts/test/adr-evidence.test.ts for every key and value in hist3, hist4 and hist5-map.json.
   - The count is 1 in 177b719, 3c6cd52, 5b39a9d and e9a1585, all replaced at 01:54.
   - It is 1 in 5ce7edd, 083ddb8, daa393a, fd552c8, 5f0786d and 476d54f, all replaced at 06:40.
   - It is 1 in the nine commits 7715586..264acd4, replaced at 10:35.
   - It is 0 everywhere else, including every commit `git rev-list --all` reaches and main a002e60.

2. The bullet is also in e1eb13a, replaced at 06:40. e1eb13a and 2092f9f have byte-identical message bodies (same hash). No reachable commit message contains the bullet. So the fixture and bullet that together name the provider are already together inside the 06:40 set.

3. e9a1585 holds the report's old passages. Its tree is identical to 5ce7edd's: `git diff --stat e9a1585 5ce7edd` is empty. I diffed the report file between 083ddb8 and daa393a and got 5 removed lines.
   - e9a1585 holds 4 of them, 5ce7edd 4 and 083ddb8 5.
   - The fifth line is only the header, and it is harmless. 56c1347 and 0d36f8a each hold 1 line, which is that header.

4. The purge does cover everything. For each reflog file I collected its SHAs and ran rev-list over them. All 21 of these commits are reached only from logs/refs/heads/fix/fx-block1 and worktrees/fx-block1/logs/HEAD, not from any ref, worktree HEAD or other reflog. There is no refs/stash reflog. So the two corrected expire commands plus gc remove them all. Only the record is wrong.

Why should-fix and not a note:
- This is the one record that tracks where the owner's sensitive content still lives on this machine, and it understates it. A reader told that the provider pairing exists only in the 10:35 set, and the address description only in 5ce7edd and 083ddb8, misses e1eb13a, ten fixture copies and e9a1585.
- Last round, both refuters of R2-REC-5 confirmed it as should-fix. Both explicitly flagged e9a1585 holding the passages. b395d32 still leaves it out, so one gap is a repeat.
- No other tracked record has the fuller list. git grep of the tip finds neither e9a1585 nor e1eb13a, and ADR-0111:122 says only "one unpushed commit, with an old test fixture in nine others".

Why not blocking: nothing reachable holds any of this, nothing is pushed, and the recorded purge removes it all.

On the fix: the second option is the more robust one. Say once that any commit replaced from the 01:54 rewrite on may hold any of the overage, the fragment, the provider hint or the address passages, since the purge removes them all.

Separate issue, not part of this finding: row 51 still says the recheck-b1-clones "hold none of them", which is true only for the commits replaced on 2026-10-21 and at 01:54. All 7 of those clones have HEAD at 083ddb8 and contain 7715586, 5ce7edd and 083ddb8, so they hold the fixture and the passages. Last round's refuter raised this too, as point (b), and the row does not say it.

#### B1R3-REC-3: R2-NOTE-1 (the empty 3ea91f8, whose message claims a redaction) is neither fixed nor recorded, although the owner chose to fix everything found

*Finding. Severity should-fix; where `docs/adr/0111-cancel-cuts-off-the-calls-byway-can-stop.md:122`.*

**What is wrong:**

The third-round Later note says the re-check found "six notes". It accounts for five: B1R2-CODE-5 to B1R2-CODE-7 are "fixed where they stood", B1R2-CODE-8 is fixed with B1R2-CODE-4, and R2-NOTE-2's broken sentence is fixed. It says nothing of R2-NOTE-1. 3ea91f8 is still an empty commit whose message says the B1 checks report "no longer holds the organisation's September overage or a fragment of the owner's email address". The second half of R2-NOTE-2 is also left without being recorded: fdf60d1 and 0d36f8a, formerly a84c9bb and 56c1347, still have the report header that says the fragments are described "without their @ form", and only 66cbab5 on explains the brackets. R2-NOTE-2 itself said that half can be left, but leaving it is Claude's choice and the note does not say so. The owner's answer at 10:35 was "Fix everything found".

**Evidence:**

`git show --stat 3ea91f8` lists no files. `git grep -E 'R2-NOTE-1|3ea91f8|RC-4' b395d32 -- docs` finds 0 matches. Across the messages of a002e60..b395d32, the only hit is 3ea91f8's own subject. block1-round2-recheck-result.json notes[4] is R2-NOTE-1, whose suggested fix is the sentence in the --no-ff merge message. The report at fdf60d1 and at 0d36f8a contains 'without their @ form' (1 each, 0 mentions of square brackets), while 66cbab5 and b395d32 explain the brackets.

**When it goes wrong:**

Block 1 is merged into main and pushed with 3ea91f8's message unexplained. A reader of main's history sees a commit that claims a redaction and changes nothing, and no record says why. A later audit then counts R2-NOTE-1 as silently dropped under "Fix everything found".

**Proposed fix:**

In the --no-ff merge of block 1 into main, add "3ea91f8 is empty after the rewrite; its redaction stands in every commit from 126025f on". Use the new id 126025f, not e438a14, which the builder's original sentence named and which is a replaced id. In ADR-0111's third-round note, add that R2-NOTE-1 is answered in that merge message and that R2-NOTE-2's two intermediate commits are left as they are (Claude's choice, as the note allowed).

**Refuter 1: confirmed, note.**

**Reasoning:**

I reproduced the facts in my own --no-local clone at .../scratchpad/recheck-b1r3-clones/refute-B1R3-REC-3-0, at b395d32. The finding's facts are right, but should-fix is too high. The right severity is note.

What reproduces:
- 3ea91f8 is in a002e60..b395d32, and `git diff --name-only 3ea91f8^ 3ea91f8` lists 0 files. Its subject still says the B1 checks report no longer holds the overage or the address fragment.
- ADR-0111:122 says the re-check found "six notes" but accounts for only five: B1R2-CODE-5 to -7 "fixed where they stood", B1R2-CODE-8 fixed with -4, and R2-NOTE-2's comma sentence. block1-round2-recheck-result.json notes[4] is R2-NOTE-1.
- `git grep -E 'R2-NOTE-1|3ea91f8|RC-4' b395d32 -- docs` finds nothing. Across the commit messages of a002e60..b395d32, the only hit is 3ea91f8's own subject.
- The second-round note at ADR-0111:118 also never named RC-4 (the same item). It counted eleven notes and accounts for ten.
- The id maps check out. hist5 maps a84c9bb to fdf60d1, 56c1347 to 0d36f8a and e3ded0a to 66cbab5. In block1-check-2026-10-22.md, 'without their @ form' appears once each at fdf60d1 and 0d36f8a, with no mention of brackets. At 66cbab5 and b395d32 the header explains the brackets.
- The finding's id correction is right. hist3 maps e438a14 to 126025f. e438a14 is not an object in the clean clone. 126025f adds b1-checks-2026-10-21.md, is an ancestor of 3ea91f8, and has 0 email-pattern hits there.

Why should-fix is too high:
1. R2-NOTE-1's own suggested fix goes in the --no-ff merge message into main, and that merge only happens after this lens. The session's main thread shows the fix is planned. The 17:37:46Z summary's plan says "merge --no-ff into main with a message naming the slips (including empty commit 3ea91f8)". The coordinator's 18:24:27Z message says "drafting the merge message for main. It will name the slips, including the empty commit 3ea91f8." So "not fixed" is premature, and the failure scenario (merged unexplained) goes against the stated plan. No merge draft is in the scratchpad yet, so this is a plan, not a done fix.
2. 3ea91f8's message is true as a statement of state. The report at 3ea91f8 has 0 email-pattern hits. The pattern file is proven on the pre-rewrite counterpart, read-only in the main checkout: 05fd020's parent has 1 hit, 05fd020 has 0. So the empty commit misleads no one about privacy; it is a readability issue in history.
3. R2-NOTE-2 itself said its second half "can be left as they are". Leaving it is within the note's advice; not recording that it was left is a small gap.

What remains is a real but minor records slip. ADR-0111:122 counts six notes and leaves one unaccounted for, and RC-4/R2-NOTE-1 is not named in any record. ADR-0111 is not on main, so fixing it in place is allowed and cheap. Suggested fix:
- In ADR-0111's third-round note, add that R2-NOTE-1 (RC-4) is answered in the merge message of block 1 into main, and that R2-NOTE-2's two intermediate commits are left as the note allowed.
- In the merge message, name 126025f, not e438a14.

The org-pattern files were not positively probed. That does not matter here: the finding is about records, not a leak. No owner address, part of one, or organisation figure was printed.

**Refuter 2: confirmed, note.**

**Reasoning:**

The facts reproduce, but the finding overstates how much it matters, so I rate it a note, not should-fix. Checked in my own --no-local clone, scratchpad/recheck-b1r3-clones/refute-B1R3-REC-3-1, at b395d32, which was clean afterwards.

What reproduces:
(1) 3ea91f8 is in a002e60..b395d32 (74 commits) and is still empty: `git diff --name-only 3ea91f8^ 3ea91f8` gives 0 files. Its subject still claims the B1 checks report was redacted.
(2) At b395d32, `git grep -E 'R2-NOTE-1|3ea91f8|RC-4'` finds nothing about this commit in ADR-0111, the playbook, the backlog or the evidence README. The only docs hits are unrelated uses of e438a14, in block1-check-2026-10-22.md and playbook.md:51. No record contains "merge message" or "empty commit".
(3) block1-round2-recheck-result.json has exactly six notes: B1R2-CODE-5 to B1R2-CODE-8, R2-NOTE-1 and R2-NOTE-2. ADR-0111:122 says "six notes" but names only five: CODE-5 to CODE-7 "fixed where they stood", CODE-8 together with CODE-4, and R2-NOTE-2's sentence. R2-NOTE-1 is missing. The previous round did the same thing: the first re-check had 11 notes, and the second-round Later note names every one except RC-4, which is the same empty-commit issue.
(4) R2-NOTE-2's second half also holds. In block1-check-2026-10-22.md, fdf60d1 and 0d36f8a each still say "without their @ form" (1 each) and do not mention brackets. 66cbab5 and b395d32 explain the brackets. R2-NOTE-2 itself said these two commits "can be left as they are".
(5) The id correction is right. hist3-map.json maps e438a14 to 126025f, e438a14 is not in the clone, and 126025f is in the range. A merge sentence copied word for word from R2-NOTE-1 would name a commit that is not there.

Why should-fix is too high:
- R2-NOTE-1's own suggested fix is a sentence in the --no-ff merge message to main. That merge cannot exist at b395d32 yet: main is at a002e60 and the branch is unpushed. So "not fixed" here means "not yet due", not dropped.
- The main thread has planned it. The session's plan, at transcript line 25536 (main thread), says to "merge --no-ff into main with a message naming the slips (including empty commit 3ea91f8)". At 18:24 UTC, line 26582, the main thread says it is drafting that merge message and that it will name the empty commit 3ea91f8.
- The finding's failure scenario, "merged into main ... with 3ea91f8's message unexplained", happens only if that plan is dropped.
- Neither R2-NOTE-1 nor R2-NOTE-2 is a privacy issue.

What is still worth fixing, and is cheap because ADR-0111 is not on main yet:
- ADR-0111's third-round note counts six notes and accounts for five. One clause would close it: R2-NOTE-1 is answered in the merge message, and the two intermediate commits are left as R2-NOTE-2 allowed.
- The merge sentence must name 126025f, not e438a14.

Neither of these makes b395d32 wrong to push. Both are records completeness or a reminder for a step still to come.

### Refuted findings (0)

None.

### Notes (1)

Minor findings and observations, not put to refuters.

#### B1R3-NOTE-1: The answer-wait research that block 2's choice sets will rest on exists only in the session's Temp scratchpad

*Note. Severity note; where `docs/backlog.md:138`.*

**What is wrong:**

The row "Selectable answer waits per model (block 2)" now says "Claude ran that research on 2026-10-22 (providers' pages and SDKs, and second-party measurements) and puts the choice sets to the owner before block 2 builds them". The research is real. Its report is only at C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/answer-waits-research-2026-10-22.md (29 KB, 10:48), and nothing in the repository holds or names it. The records' own practice (126025f, "Evidence the records cite by name, brought in from Temp before the scratchpad goes") would keep it, and the planned clean-up of the scratchpad can remove it before block 2 uses it.

**Evidence:**

`git grep answer-waits-research b395d32` finds 0 matches. The report's headings include measured silences per model, image and video sections, and the owner's choice sets tested against those measurements.

**When it goes wrong:**

The scratchpad is cleared with the check clones after the push. Block 2's choice sets are then put to the owner without the cited measurements the row says they come from.

**Proposed fix:**

Before the scratchpad goes, copy the report into docs/adr/evidence/reports/, run it through the evidence email, organisation and key checks, and name it in the row. Otherwise, say in the row that the research is not kept in the repository.

### What the lens checked

Clone used: the given --no-local clone recheck-b1r3-clones/lens at b395d32 (74 commits, 10 merges, clean status afterwards). My scripts are in C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/recheck-b1r3-lensrec. Everything in C:/Users/arvik/code/byway was read-only: for-each-ref, worktree list, reflog show, rev-list, cat-file, show, log, and file reads under .git. Its .git/index mtime is unchanged (2026-10-21 19:02). I did not read .env.agents, did not use git stash on any real repository, printed no keys, and did not report author or committer fields.

PRIVACY, items 1 to 4. No problems found.
- Pattern files probed first:
  - Email patterns: 3/3 planted strings match with git grep -i. Plain `grep -i -E -f` aborts in this Git Bash, so I used git grep.
  - Org patterns: 3/3 planted strings match.
- Pattern scans with git grep -E -f: email patterns case-insensitive, org patterns as written.
  - Every tree of all 74 commits: 0 files hit.
  - All 74 messages: 0 hits.
- Commit-by-commit scan (scan.cjs, self-tested on a planted repo). For each commit it read the message, the added lines (non-merges with -p, merges with --cc) and each file's added block, and checked:
  - The email patterns: 0 hits.
  - The org patterns: 0 hits.
  - emailsIn as at the tip: only noreply trailers, the jane.doe@example fakes and [masked: the sign-in part of a URL in a test, shaped like an address].
  - makeRedactor's six key shapes, plus the gh, github_pat, AKIA, xox, JWT, hf_, r8_ and private-key shapes: only labelled fakes ('test-not-a-real-key', a sequential-hex fal fake, an alphabetic sk-proj placeholder in a report) and pattern descriptions.
- Tip tree: all 1267 text files through emailsIn (self-tested): no address at any mail provider.
- Owner name parts in added lines, messages and the tip: 0.
- Pairing of owner wording with a provider name (pair.cjs): paragraphs of every message and of the post-image of every changed file in every commit. This gave 87 unique contexts, all of them 'live run', Google as an AI provider, the generic PROVIDERS list or fakes.
- The specific provider name and its old two-piece constant across all 74 trees: only the generic PROVIDERS list and one unrelated research line. The constant appears in no commit of the range.
- The dropped bullet appears in no message of the range (0). The 14 old ids are absent from the clone.
- The rewrite was compared pair by pair against the old ids:
  - 9 pairs differ only in adr-evidence.test.ts.
  - 2092f9f to 15c74aa differs only by that bullet.
  - Identity is the same in every pair.
  - 137bf75 and 886c211 have the same tree.
- The four new record entries hold only Claude's questions and the owner's answers.

RECORDS, items 5 to 10.
- Quotes (quotes.cjs): 84 quoted strings in b395d32, 1612c6d, de601a3, b6e7ecf, f361a6f and 886c211 (messages and added lines) are verbatim substrings of the conversation record. Every quote not found is not the owner's (row names, placeholders, provider documentation). Times and questions checked by hand: 06:40, 06:41/09:50 and 10:34/10:35 are right. The stream.ts bound comment's two quotes are right.
- Extraction: I ran extract.cjs on a copy of the transcript and deleted the copy afterwards. From the 06:40 entry on, the file's tail is byte-identical (8165 bytes). There is no owner-typed message after 06:40 apart from the answers. The header and README row 8 both end at 10:35, which is right.
- Claims checked true at the tip:
  - Limits: 45/15/1 minutes in acts.ts. media.assetStep and media.relayLink are the media steps.
  - stepLimitMs: read from startToCloseTimeoutMs in liveness.ts and joined after the memo hash in activities/index.ts.
  - Gateway: Math.max(STREAM_IDLE_MS, stepLimitMs). The decline retry carries the limit. validateSpend runs before reservation.
  - Workflow: unchanged from 886c211 to b395d32.
  - @temporalio/activity 1.24.0: Info.startToCloseTimeoutMs is at lib/index.d.ts:202.
  - Counts: 11 and 14 rewritten commits, with ranges matching hist4-map.json and hist5-map.json. The R2 counts are 1 blocking, 9 others and 6 notes.
  - Reflogs: the branch has 33 entries and the worktree HEAD 34. In each, 29 are not ancestors of b395d32, which matches the record.
  - 5ce7edd and 083ddb8 hold the old report passages.
- Purge probe (recheck-b1r3-clones/purge-probe, git 2.52.0). Setup: a linked worktree on fix/fx-block1, two stashes, a branch with a reflog-only commit, a main HEAD reflog-only commit, and old commits reachable only from the branch's reflog and the worktree's HEAD reflog. The recorded commands, run exactly, pruned the old commits. These stayed byte-identical: the stash reflog with both stash commits readable, the other branch's reflog, and main's HEAD and branch reflogs. The `git -C .worktrees/fx-block1 ... HEAD` form expired only the worktree's own HEAD reflog (10 entries to 6, main's stayed at 5).
- Control (purge-probe-control): with the branch reflog alone the old commit survives, so both expiries are needed.
- Old-stash probe: stash entries backdated 40 days survive gc. gc's own default expiry does empty another branch's reflog older than 30 days. Every reflog entry in byway dates from 2026-10-07 on, so nothing else is touched today.
- Real checkout, after a simulated purge (reach.cjs): 0 of the 105 replaced-only commits stay reachable. The roots counted were every ref (including refs/codex), all four worktree HEADs, every other reflog, ORIG_HEAD (main, fx-block1, fx-r3code) and FETCH_HEAD. refs/original is an empty folder and there is no stash.
- Other copies: byway_review is not a git repository. Three older byway clones under Temp/byway-fixes hold none of the replaced commits.
- Citations (ids.cjs, resolver self-tested): every id the round cites resolves in the clone to the commit the text names, except the replaced ids, which the purge row cites deliberately as replaced. Old ids in earlier messages are cited deliberately.
- Attribution: the third-round note closes with \"Each change is Claude's, under those answers\", and the playbook marks the round-2 extras as Claude's.

Not run: the test suite (the clone has no node_modules), so the \"253 tests pass\" claim is unchecked.
