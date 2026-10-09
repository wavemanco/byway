# ADR-0092: Recipe semantics are derived from execution and checked at every entry

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude implemented the verified recommendation from the 2026-10-08 external-review verification under the user's goal "complete implementation of all fixes that can be implemented independent of the four decisions"; not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-08 23:10 |
| **Track** | System |

## Context

The external review's F01 ("make executable semantics authoritative") was accepted in part by the verification, at P1, and found wider than the review said. Admission and execution used two definitions of what a recipe does.

**Execution.** The runner decides everything from what a step is and where it sits:

- who changes the work: actor, role, the ports it produces and the medium;
- whose words go into the work: a human voice, build or fix step that produces the artifact;
- what a VOICE covers: `variant`, the knobs and the medium;
- whether a step's output is kept: the operator it sits in;
- where a loop's gate can end the body: right after a model critic or check that reports to it.

**Admission.** The validator and the composed profile (ADR-0058) read self-declared annotations instead (`writes`, the 'voice' port, block labels), plus structural approximations: "always runs" meant "not in an optional or a route", and the flow walk ran every loop body to its end.

The verification reproduced the consequences against the real code. Every case below was admitted:

- **The writes spoof.** A model fix after C4's VOICE that says `writes: false`, or leaves the flag out, passed with no violation. The runner still applied its rewrite over the person's words.
- **The voice source was a declaration.** A VOICE without the 'voice' port let an honest writer follow it (V1). A human vision labelled VOICE (X3), or C6's author draft declaring the port (X4), counted as VOICE.
- **Operators could undo the person's work.** A pick after VOICE (Q1, QA), a keep-or-revert right after it (QRh), or a scored loop holding it (QS) could each put back a version made before the person's words.
- **Containers and placement.** Checkpoints inside a lens or a gate body counted, though their output is dropped (V2a, V2b). Checkpoints were counted by existence, not one to one, and not by scope (V2c, V3, V3c).
- **Exit points.** A VOICE placed after a check that can end its loop's round counted as always running, and so did C6's author write (K1).
- **The held voice.** A keepsVoice writer moved past a later VOICE passed (K2b, K2f, K2m). The runner checks such a writer only against the latest VOICE answer.
- **Block labels.** Stripped labels let VOICE run before CUT and TELLS (K2g).
- **The previous version.** A keep-or-revert moved right after C3's human cut could restore the AI angle card on the "own draft" route (R1).
- **Prompt binding** checked the role only, so prose prompts could run on web pages and code-diff prompts on prose.
- **The `ok` flag** stored at compose time was never checked again at start.

An execution oracle found that, of 3,453 single moves of a step in C1–C7, 72 broke a checkpoint protection and were admitted. The canonical catalog is written so that every reading agrees, so a model-composed recipe was the first input to exercise the gaps.

The verification recommended option C of its cluster A: write the executed semantics down once, have every consumer read them, and enforce at each entry what that entry can see. The work comes in four stages. This ADR records stage 1, which closes the P1 at admission, and the plan for the later stages. The design drafted these records as ADR-0081 and ADR-0082. They are numbered ADR-0092 here and ADR-0093 (the loop cap policy, a later stage) because those numbers were taken by then.

## Decision

1. **One written definition: `@byway/recipe/semantics`.** A pure module with type-only imports and no Node built-ins, exported from `@byway/recipe` and from that subpath. It contains:
   - **The effects table.** For each (actor, role, produced ports), what a step does to the work: writes, restores, annotates, renders or passes. It mirrors the runner and fails closed the same way: a model role the parser does not name writes.
   - **Whose words a step writes.** `personWrite` is a human voice, build or fix step that produces the artifact. `voiceWrite` is a person write whose role is voice. `authorWrite` is any other person write: a human fix and a human build run the same branch, so the role label must not choose the protection.
   - **VOICE scope** (claims, script, on-screen, all; key lines or every line) and its coverage order: every line covers key lines, never the reverse.
   - **The block of each role.** The runner reads `block` only for labels, so a label is a declaration of its role's block. A check may carry CRITIC or nothing.
   - **Loop exit points and "runs every time".** Exit points are reached through seq, relay, route and optional, never through replicate, each, audit, a gate or an inner loop. A step runs every time unless it sits under an optional, a route, a container or a candidate, or after an exit point of an enclosing loop within that loop's body.
   - **Operator facts:** which operators contain their steps, which run per candidate, which hand the loop context on, who makes each kind of pick, and the judge roles a C pick may use.
   - **Field roles.** Every field of every schema object is classified as a name, a child, a semantic value or a semantic set, so a field added to the schema must be classified to compile. The diff reads this in stage 3.

   Tests hold the module to execution:
   - the catalog agrees with every reading;
   - the runner's parser, ASSET, RELAY and human-write activities agree with the effects table;
   - the real Interpreter, with its activities stubbed, leaves a loop right after the steps `exitPoints` names, and nowhere else.

2. **The declaration rule.** Every protection is granted by an executed predicate. A declaration may only add arming or refusals. ST12, a new invariant, refuses a declaration that says less than execution does, and for VOICE and block labels one that says anything else. Its clauses:
   - `writer-undeclared`: an uncontained step that changes the work when it runs without `writes: true`. Saying more stays legal: C5's matte is a tool relay that runs as a skip and declares `writes: true`.
   - `voice-not-written` and `voice-undeclared`: a step declares VOICE but writes no person's words, or writes them without the block and the port.
   - `block-role`: a block label that is not its role's block.
   - `voice-per-candidate`: a VOICE inside replicate or each.
   - `pick-judge`: a C pick needs a model judge or select step.
   - `pick-actor`: a pick's actor is its mode's.
   - `set-aside`: on the exit-aware flow, a keep-or-revert whose previous version may predate a person's write, and a critic-score or critic-rank loop holding a person's write; in scope typing, a pick, an each or another option consumer that a later round of a loop or relay link reaches after a person's write, which set the options aside. That includes the option a pick of one leaves held.

   `keepsVoice` is an executed declaration: it asks for the voice check that the runtime performs.

3. **The validator reads execution.**
   - **One flow walk** (`flowRecipe`, now exported) is exit-aware: the state right after an exit point also reaches the loop's exit, so must-analyses are sound and may-analyses are unchanged. It is containment-aware: each step is told whether it sits in a lens, a gate body or a pick's judge. The advisor's own copy of the walk is deleted.
   - **PR6** arms on an executed VOICE write, or a declared one, and flags every machine writer whose output reaches the work, whatever its flag says.
   - **ST9 and ST10** gain a `human-write` clause: no person's write or VOICE in a lens or a gate body.
   - **Scope typing** sets the options aside at every person's write: an open option set, and the list a pick of one leaves held (the runner keeps the chosen option as its option list, and a later pick or each takes it). A pick, an each or an option consumer after the write gets ST5 `set-aside`, naming the write.
     - **Later rounds.** A loop body or relay link is typed again from the state its back-edge brings, round after round until that state repeats. An option consumer that such a round reaches set aside gets ST12 `set-aside`; every other port rule is checked on the first round.
     - **Cost.** These rounds, and ST11's typing of a relay link without its anchor, are memoized by node and by the only state each reads: the option set, or the anchor. Every node is typed once on the first round, and at most once more for each option-set state that a later round brings to it (the state records who set the options aside, so there are at most 8 × (W + 1) of them, W being the number of person's writes), and once more for the anchor probe. With no option work in a nest (no pick, each or person's write), nested loops cost one visit per node, as before this ADR, and nested relays at most two, where before this ADR the cost doubled with each level. A nest that holds picks and person's writes brings a new option-set state at each enclosing later round, so its cost grows with the square of the depth: on the round-2 verifier's shapes, about 8 visits per node at depth 16 and 55 at depth 128 (about 70 ms), where the walk before memoizing took 0.8 s on 16 such loops and 396 s on 16 such relays. `scope-cost.test.ts` counts the visits, with a bound of nodes × (depth + 2) for such nests.
     - **Later rounds whatever the cap.** Later rounds are typed whatever the loop's or relay's cap, so a person's loop with `max` 1 or a relay with `maxLinks` 1, which the runner never repeats, can be refused for a set-aside its later round would bring. This over-approximates (it refuses, never admits); the message may then name such a loop as "the later round". Stage 2 reads the caps.
   - **DR9** counts executed VOICE writes for `fixed-input` and `missing`, and adds `claims-only`.

4. **The composed profile reads execution.**
   - **COMP-1** matches the nearest recipe's protected checkpoints one to one, over steps that run every time: VOICE by stage and scope with the coverage order, and the author's write by stage. No declaration takes part.
   - **The writer allowance is per VOICE.** After each VOICE, the composed recipe may have no more machine writers of a role than the nearest recipe has after the counterpart VOICE. A VOICE with no counterpart, or a declared-only VOICE, allows none.
   - **COMPOSED-PROMPT** also requires that a reused prompt answers the output contract the runner parses for that role in the recipe's medium, and that it renders with exactly the slots the step fills. Those slots come from `slotsForStep`, a structural helper in `@byway/prompts`' main entry, which a runner test holds to `buildPrompt`.
   - **COMPOSED-INTERNAL** is what `checkAnswer` reports for anything its checks cannot handle, instead of throwing.

5. **Re-admission at start.** `Advisor.admit` (additive, [ADR-0068](0068-contracts-first-parallel-build.md)) re-runs the composer's checks on a stored composed recipe under its own id, and recomputes its differences, presentation, label and estimate. It makes no model call. Web start uses it, and the intake keeps the result either way, so the estimate is refreshed silently:
   - a recipe that no longer passes, or no longer hashes to the one offered (`ADMIT-HASH`), gets 400 `composed-refused`;
   - one built from a recipe the catalog no longer has cannot be checked again, so `admit` refuses its id; start records it as not passing (`ADMIT-NEAREST`) and gives 400 `composed-refused`, asking the person to build their own again;
   - one whose explanation changed gets 409 `composed-changed` and does not start;
   - every one of these refusals carries the screen's view of the recipe, which the Recommendation screen shows. `ADMIT-HASH` and `ADMIT-NEAREST` are not protocol checks, so the screen leads them with "It cannot run", and keeps "It did not pass the protocol checks" for refusals that are all protocol checks.

   Runner and workflow start enforce no product policy.

6. **`@byway/protocol` is side-effect free.** Its rule and exception tables were in the workflow bundle although workflow code never reads them, so a new rule would have changed the bundle's hash. With `"sideEffects": false` the bundle keeps only `blocks.ts` and `media.ts`. A build test edits `rules.ts` and `exceptions.ts` as esbuild reads them and requires the hash to stay put; a control edit to `blocks.ts` must move it. This changes the bundle once, from `e572716a…` to `bfdda860…`, as the verification's in-memory build predicted. Runs open at that upgrade end plainly, once ([ADR-0078](0078-runs-from-older-engine-versions-end-plainly.md)). Nothing else in stage 1 touches the bundle.

7. **What protects the catalog.** Every CATALOG recipe keeps its verdict, its cited exceptions and its hash. Two corpus tests pin the stage:
   - **Declaration monotonicity:** none of 3,952 single declaration changes on 13 refused bases makes a refused recipe pass.
   - **Placement soundness:** of 3,453 single moves of a seq child of C1–C7 and C6a, admission accepts 1,180, and a trace model of the interpreter finds none of them breaking a checkpoint protection.

**Later stages.** The rest of the recommendation is a separate work package.

- **Stage 2: bounds.** Shape limits in `parseRecipe`; engine limits with a batch-bytes bound and a work bound; ST3 `limit`; ST10 `retry-scope`, which keeps a retrying gate out of replicate, each and audit (the verification's G1, not refused by stage 1); composed limits; and `Runner.start` refusing with a typed error.
- **Stage 3: disclosure.** The diff says "the same steps" only when the semantic projections built from the field roles are equal. The presentation and the estimator read the effects table and VOICE scope instead of the declared `writes`, which `present.ts` and `estimate.ts` still read today.
- **Stage 4: execution.** The runtime half: every held VOICE in the keepsVoice check; `ports.voice` set only by a VOICE write; a PR6 guard in the interpreter; `humanKind` reading `HUMAN_WRITE_ROLES`; pick throwing instead of defaulting to 'A'; and the engine check inside `run.ts`. Scope typing will be aligned with the interpreter for audit, gate and each, gate feeds added, and LS1 extended to human loops. Prompt output contracts (`outputs.ts`, which is in the bundle) will be aligned for model VOICE and render steps. The cap policy for every loop exit is ADR-0093. Stage 4 changes the bundle once more.

## Alternatives considered

- **A compiled plan IR checked and run as one artifact (option A).** Rejected. It means a second IR, an interpreter rewrite and research-pin churn, and buys little over one shared definition.
- **Per-finding patches (option B).** Rejected. It would leave the operator, exit-point, held-voice, label, scope, container and retry variants open, which is how earlier rounds kept missing cases.
- **Removing the self-declared fields from the schema (option D).** Rejected. It changes every recipe hash, research pins included, and still needs this definition. The fields stay as declarations that can only make a step stricter, and ST12 keeps them honest.
- **An ST12 "skippable" refusal of every person's write after an exit point.** Rejected. Counting only the checkpoints that run every time restores the protection. A blanket refusal would also refuse a legitimate human fix after a check in a check-clean loop, where skipping it on a clean check is intended.
- **Binding prompts by the slots a template declares.** Rejected in favour of a dry render. Templates branch on optional slots (a critic's references, a loop's round), so a declared slot is not a needed one.
- **Counting slots the runner fills only sometimes in `slotsForStep`** (a GREAT lineup's references, a loop's round, a model keep-or-revert's two versions). Rejected. A template that needs one would pass admission and then fail a run that lacks it. `slotsForStep` promises only slots the runner always fills, which is sound, and stricter for such templates.
- **Run-time set-aside** (clearing options and the previous version at a person's write) **and run-time arming from declarations.** Not done, for proportionality. Admission refuses every recipe where they would matter, and only catalog recipes and admitted composed recipes can start.

## Consequences

**Positive**

- Every reproduced F01 case is refused at admission: the writes spoof in three forms, V1, V1b, M1–M3, W1, W2, W2b, W2d, Q1+W2, X1–X4, K1 (C1, C1b, C2, C5, relay, C6c), K2b, K2f, K2m, K2g, Q1–Q4, QA, QRh, QS, R1, V2a–V2c, V3, V3c, variants4, and the three prompt mismatches. So are the branch verifier's A1 and A3, a pick of one and then a person's write in a loop, whose next round takes back the option from before that write. C6 with its author write as a human fix is now admitted. The mock composer's widened C4 VOICE stays admitted.
- A composed recipe stored under older rules is checked again before it can start, and the person sees what changed.
- Rule and exception edits no longer change the workflow bundle, so they no longer end open runs.
- A model's pathological answer is refused instead of crashing compose.

**Negative, and residuals named**

- **The bundle changes once.** Runs open at the upgrade end plainly.
- **The runtime still holds a keepsVoice writer to the latest VOICE only**, and does not refuse writers itself, until stage 4. Admission refuses every recipe where this matters, and web start re-admits composed recipes, but `Runner.start` runs no product policy.
- **The evidence has stated limits.** The oracle shares step-level predicates with the rules. Its writers-after criterion is the profile's own unit. The sweeps try single changes and single moves only.
- **A changed explanation costs the person a second Start**, after the screen shows the new one.
- **The prompt check renders each reused step prompt once per check.** It makes no model call, but it is a render.
- **Admission time still doubles with each level of nested loops.** The shared flow walk (`flowRecipe`) runs a loop body twice, as before this ADR, and this stage adds walks of its own (ST12's flow clauses, the composed profile's per-VOICE counts). On the branch verifier's shapes, `checkAnswer` took about 1.5 to 2 times main's time at 20 and 22 nested loops (the round-2 verifier measured 1.46 to 2.2 times, median about 1.8: 0.35 to 0.43 s and 1.4 to 1.7 s, against 0.2 s and 0.77 to 0.98 s), and less than main's on nested relays. Scope typing adds nothing that grows with nesting in a nest with no option work, and grows with the square of the depth in one with picks and person's writes (decision 3). Stage 2's composed limits bound the depth.
- **Three fixture tests changed expectations**, as the rule intends: a model step declaring VOICE now also gets ST12, under DR9 and SM-6, and a scored author loop gets ST12 `set-aside`. The advisor's prompts dependency widened to `PromptLibrary`, and `alwaysRunSteps` left the advisor's exports in favour of `runsEveryTime`.
- **`present.ts` and `estimate.ts` still read the declared `writes`** until stage 3. Prompt contracts for a model VOICE or render still read "none" until stage 4; the agreement test pins that.

## Evidence

- [External-review verification](../reviews/2026-10-08-external-review-verification.md), cluster A (F01: "accept, partly", P1), recommendation C, stage 1.
- The original review: `C:/Users/arvik/code/byway_review/byway-review.md` (outside the repository).
- The verification's prototypes (`sem.mts`, `drive.mts`, `oracle.mts`, `bundle-se.mts`), outside the repository: `C:/Users/arvik/AppData/Local/Temp/byway-review-verify/round3/revise-A-r3-1b/`.
- Tests:
  - recipe: `packages/recipe/test/semantics.test.ts`;
  - catalog: `packages/catalog/test/semantics.test.ts`;
  - runner: `packages/runner/test/semantics-effects.test.ts`, `semantics-exits.test.ts` and `build.test.ts`;
  - prompts: `packages/prompts/test/step-slots.test.ts`;
  - validator: `packages/validator/test/semantics-rules.test.ts` and `scope-cost.test.ts`;
  - advisor: `packages/advisor/test/semantics-admission.test.ts`, `admit.test.ts` and `corpus.test.ts`;
  - web: `apps/web/test/start-admission.test.ts` and `recommendation.test.ts`.
- It supersedes no ADR. It makes [ADR-0058](0058-design-time-composition-only.md)'s "cannot be removed" mean one-to-one counterparts of executed checkpoints that run every time, and holds [ADR-0069](0069-product-c5-relay-and-honest-skips.md)'s honest skips to their declarations.
