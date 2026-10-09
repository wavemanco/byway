# ADR-0093: Every loop exit at the cap follows one policy; a loop a person holds ends only on their answer

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude implemented the verified recommendation from the 2026-10-08 external-review verification under the user's goal "complete implementation of all fixes that can be implemented independent of the four decisions"; not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-09 05:30 |
| **Track** | System |

## Context

The external review's F20 ("a work cap must not substitute for human acceptance") was accepted in part by the verification, at P2, and found wider than the review said. Gate-exit policy had no single definition.

- **A person's loop ended at its cap as if they had said yes.** The interpreter gave loops with metric `human` their own exit: at the last round it returned before asking "Is this ready?", and it never read the declared `onCap: 'human'`. The shared cap handler, which implements [ADR-0073](0073-runner-semantics-where-the-spec-was-open.md)'s raise-once rule, was reachable only after a model critic or check. So `onCap: 'human'` was dead configuration for C2's vision loop (3 rounds), C6a's vision loop (2) and the C6/C6a author loop (10). In C2 the model's round-3 sharpened brief went into the option map without anyone accepting it. In C6/C6a the round-10 readers' notes were paid for and never put in front of a decision, and nobody was told that round was the last.
- **A critic or check loop whose gate never saw its critic left at the cap without asking.** The interpreter drops the loop context at replicate, each, audit and a one-shot gate, and an optional may not run, so such a loop ran its body to the end and left through the best snapshot of an empty history (the verification's variants3).
- **The readings disagreed.** The spec said "Is this ready?" after every round plus a cap confirmation; the estimator counted "Is this ready?" after every round and no cap question; the interpreter skipped the last question and had no cap question; C6's own comment said "at it the human decides as at any cap". No test drove a person's loop to its cap.

The verification's recommendation (cluster A, option C, stage 4) drafted this record as ADR-0082. It is numbered ADR-0093 because that number was free when it was written; [ADR-0092](0092-recipe-semantics-derived-from-execution.md) records the stages' shared semantics.

## Decision

1. **One cap turn for every way a loop reaches its cap.** The interpreter's `capTurn` is taken right after a critic or check at the cap, at the last round of a person's loop, and after a round that ran to its end with no verdict:
   - **By policy** (`onCap` not human): the loop ends there; a critic loop ends on its best snapshot.
   - **With a person, the first time:** a critic or check loop asks "Use the best version so far?" (ADR-0073). A person's loop asks, in place of its last "Is this ready?": "That was the last planned round. Use this version? No allows up to N more rounds, once.", with the work and the round's notes beside it. No raises the cap once, by the planned number of rounds.
   - **At the raised cap:** a critic or check loop takes its best snapshot. A person's loop asks a last `choose` question: "Use this version" or "Stop the run".
2. **End-status policy.** The status names what ended the run. It is `done` when the recipe finished, and `failed` when something failed, a final check the person then chose not to use included ("It did not pass the final check… Use it anyway?" No stays a failure). It is `cancelled` when a person stopped it with nothing failed: Cancel, or "Stop the run" at a loop's last choice (`RunStopped` maps to `cancelRun`).
3. **Admission keeps the policy reachable.**
   - LS1 now also refuses a loop a person holds whose last round goes to a policy.
   - ST2 `feed` refuses a critic or check loop whose critic or check does not report to its gate on every round. That covers one inside replicate, each, an audit, a gate or an inner loop, and one under an optional or in only some branches of a route.
   - ST10 `feed` and `metric` hold a one-shot gate to a score its own critic gives on every run.
   - The interpreter still asks at the cap of such a loop if one runs; admission makes it unreachable for a composed recipe.
4. **The estimate reads the planned rounds** (`loopRounds(gate).planned`). A person's loop costs one question a round: "Is this ready?", and at the last round the cap's question. The rounds a person may allow at the cap are their choice, made when asked, so they are not counted. The work bound (ADR-0092 stage 2) counts them: `loopRounds(gate).withRaise`.
5. **What people are told.** C2's and C6a's direction steps and the C6/C6a author loop say that at the last round you can allow more, once. C6's comment, spec §3.2 and this record say the same.

## Alternatives considered

- **A hard bound for a person's loop, announced as the last round** (the refuter's alternative for C2 and C6a, whose round counts follow the protocol's "sharpen 1–3"). Rejected. The protocol's cap rule (02 §2) gives the person the call at any cap. The copy now says the extension exists, and C6's own comment promised the person decides.
- **Ask "Is this ready?" at the last round too, then the cap question.** Rejected: two questions in a row about the same version. The cap question replaces the last "Is this ready?" and says what No does there.
- **Implementing discard (<< D1) at the cap**, the protocol's third option. Not done: it is missing for critic loops too, and "Stop the run" plus starting again covers it for now.
- **Ending a stopped run as failed.** Rejected: nothing failed. The person decided, as with Cancel.

## Consequences

**Positive**

- No loop ends at its cap on anyone's behalf. A person's last round is a question with the work and its notes beside it, and they can allow more rounds once.
- One cap policy, read by the interpreter, LS1, the estimator, the work bound and the copy.
- Tests drive a person's loop to its cap at max 1 and max N, with repeated No, the raise, both last choices, a feedless critic loop, and Cancel while the cap question is open. The last two are end to end through the real workflow, on C6a's author loop capped at two rounds.

**Negative**

- **The workflow bundle changes**, together with ADR-0092's stage 4 (one change, `bfdda860…` to `9f872bb4…` on this branch). Runs open at the upgrade end plainly ([ADR-0078](0078-runs-from-older-engine-versions-end-plainly.md)). It is the second retirement of the ADR-0092 work.
- A person who answers No at every question of C6's author loop now sees up to 20 rounds and two more questions. The run's budget still bounds the cost.
- A recipe stored with a critic loop that never sees its critic, or a person's loop with a policy cap, no longer passes admission. Web start refuses it with a 400, and the person builds their own again.

## Evidence

- [External-review verification](../reviews/2026-10-08-external-review-verification.md), cluster A (F20: "accept, partly", P2), recommendation C, stage 4.
- The original review: `C:/Users/arvik/code/byway_review/byway-review.md` (outside the repository).
- The verifiers' probes, outside the repository: `C:/Users/arvik/AppData/Local/Temp/byway-review-verify/verify-F20-reproduce/f20-probe.mts` and `verify-F20-refute/probe.mts`.
- Tests:
  - runner: `packages/runner/test/loop-cap.test.ts`, and `test/e2e/loop-cap.ts` (in `configurations.test.ts`);
  - validator: `packages/validator/test/operator-semantics.test.ts`;
  - advisor: `packages/advisor/test/estimate.test.ts`.
- It extends ADR-0073 (the raise-once rule now holds for every loop exit at the cap) and supersedes no ADR.
