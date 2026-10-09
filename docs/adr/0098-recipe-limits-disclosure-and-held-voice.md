# ADR-0098: Recipe limits, a diff that means "runs the same", and the held voice at run time

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude implemented the verified recommendation from the 2026-10-08 external-review verification under the user's goal "complete implementation of all fixes that can be implemented independent of the four decisions"; not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-09 05:30 |
| **Track** | System |

## Context

[ADR-0092](0092-recipe-semantics-derived-from-execution.md) wrote the executed semantics of a recipe down once and closed the F01 P1 at admission (stage 1). It named the later stages in a paragraph: bounds (stage 2), disclosure (stage 3) and the runtime half (stage 4). The cap policy of stage 4 is [ADR-0093](0093-every-loop-exit-at-the-cap-follows-one-policy.md). This record holds the decisions the other stages took, with their numbers and where they depart from the verification's design.

The findings they close, from the verification (cluster A, option C):

- **F02, bound total work (P2).** Nothing bounded the counts that shape work. The interpreter expands replicate, each and audit eagerly, so Temporal's limits were the only ceiling, and a run that hit one stayed "running". The verifiers saw this at n = 1e9, at nested 50 × 50, at n = 2,500 (pending activities) and at n = 1,500 (a scheduling batch over gRPC's limit). That batch was large because every activity input carries every seed handed out so far, and the entry ports' option lists, by value. About 1,000 nested steps crashed admission. A retrying gate inside a fan-out restarted its stage without stopping the branches beside it (G1).
- **F08, explain actual composition changes (P2).** The composed diff compared a hand-picked subset of fields and said "The same steps as …" for everything else: a human pick made random, a hidden bar lowered from 9 to 1, a VOICE narrowed to a claim log, a step moved behind a check. The presentation called a random pick "The AI chooses", read the declared `writes`, and called any VOICE label "your words".
- **F01, the rest (P1, closed at admission by stage 1).** The runtime still checked a keepsVoice writer against the latest VOICE answer only, set `ports.voice` from a declared port, and took draft A when a C pick's judge named none. The operators' port semantics in scope typing disagreed with the interpreter: a score after an audit, the option set inside each, the view and score after a gate.

## Decision

1. **The shape bound** (`@byway/recipe` shape.ts), checked iteratively inside `parseRecipe` before any recursive walk, and thrown as a ZodError at the place it went over:
   - the raw JSON nests at most 64 levels deep, about 25 levels of operators, twice the composed limit;
   - at most 10,000 objects carry an `op`;
   - at most 1 MiB of UTF-8.
   The design's "depth 64" is read as JSON nesting, because that is what every recursive reader follows. Deeply nested knobs and cyclic objects are refused too.
2. **The engine's limits** (`@byway/recipe/limits`, pure, also in the workflow bundle). They hold for every recipe, research-frozen ones included:
   - at most 500 steps in flight at once;
   - at most 2,000 step runs in the worst case;
   - at most 3 gate retries;
   - at most 2 MiB of activity inputs in flight.
   - The validator reports them as ST3 `limit`. ST3 is an invariant, so no exception relaxes it.
   - `engineProblems` adds positive whole counts, a C pick's model judge and ST10 `retry-scope` (a retrying gate inside replicate, each or an audit lens).
   - `Runner.start` throws `RecipeRefused` (contracts, additive, [ADR-0068](0068-contracts-first-parallel-build.md)) before a run record or workflow exists. Web start maps it to a 400.
   - The workflow checks the same inside `run.ts`'s try, so a recipe started past the client ends failed before it begins.
3. **The work bound** walks the recipe as the estimator does. It is memoized by place and ports, so nested loops cost no more than linear time.
   - replicate sets the option count, each multiplies by it, audit sums its lenses, and a C pick asks k times;
   - a loop runs to `loopRounds(gate).withRaise` (twice its max when a person may raise it), a relay to every link;
   - a retry adds its stages, times its count.
   - **Bytes in flight** are bounded structurally, per activity: 1 KiB of base and envelope, the step's JSON, 64 B per seed, 76 B per listed id and 2.75 KiB per carried view (a web page's: 17 screenshots, listed twice).
   - **Seeds:** the bound counts every seed the run can hand out. It is a sound bound on the seeds that can precede any fan-out, siblings' included (the final check's `replicate(n, seq(seed, X))`).
   - **The constants are measured:** a runner test holds every batch the real Interpreter schedules, in four shapes, to at most the bound and at least half of it.
   - **Run inputs are not counted:** the brief, a fixed voice deck and the held voice are set by the person or written by them, and are carried by value. That is the backlog item on run inputs, widened below.
4. **The composed limits** (COMPOSED-LIMIT in the composed profile) hold for model-authored recipes only: replicate 16, loop rounds 12, relay links 8, lenses 4, peak 32, 400 step runs, depth 12 operators, 100 nodes, 32 KiB.
   - **The catalog stays inside both sets of limits**, research recipes included, and each recipe's bound is pinned.
   - **C5 bounds at 201 step runs.** The design's prototype walk counted 213; the difference is in what it counted, not in C5.
   - **B-BoN passes for every N from 1 to 64.** Its peak is 4N, so N may be at most 125 (500 steps at once).
5. **A diff says "The same steps" only when the recipes run the same.** `projection.ts` projects a recipe from FIELD_ROLES: names dropped, sets sorted, a sit-out by its block. It compares only the fields that say how it runs (medium, inputs, stages, sit-outs, exceptions, bank). The fields the composer forces are left out: kind, channel, family, schema, parent. A test holds FIELD_ROLES to the zod schema object by object.
   - **The projection may tell apart two recipes that run the same, never equate two that do not.** So it keeps what the runner reads in order or by position:
     - **A seq keeps its nesting**, a seq of one included. The interpreter reads a step's siblings in its own seq: a model cliché sweep asks the person which finds to swap only when its swap step follows it there (`asksSwaps`, now in `@byway/recipe/semantics` and shared by the interpreter, the diff, the explainers and the estimate). Flattening, as first built, let a composed C1 or C7 with the rest of Finish wrapped in a seq of its own drop that choice and read "The same steps" (the adversarial verification of this branch).
     - **A step's consumed ports keep their order.** `buildPrompt` lays out the images a step sees port by port: a view's screenshots and an option set's, in `consumes` order.
       - **This departs from the design's acceptance test, on purpose.** The verification's design (its step 8 and acceptance list) says "an id-only rename or a consumes reorder still does" read "The same steps". Here a consumes reorder reads "Other technical changes that affect how it runs." The reason: for a step that takes in both a view and an option set, a reorder changes the order of the images the model sees. A set would let the diff call two recipes that run differently the same, which the projection never does. The price is named under Consequences. An id-only rename still reads "The same steps".
     - **What a step reads when it is there keeps its order too** (`reads`, [ADR-0089](0089-recipe-ir-optional-reads.md), merged after this record was first written). `FIELD_ROLES` classifies it `semantic`, where ADR-0089's decision 1 says a semantic set. The reason is the one for `consumes`: `buildPrompt` walks `inputsOf` (the consumed ports, then the read ones) and lays out a read view's or option set's images in that order. This record amends that one clause of ADR-0089. A read is semantic either way: it changes what the step's prompt receives.
     - **A route's question is semantic**, as an optional's trigger is. A composed recipe's route asks its own `on` at run time: the catalog's plain question stands in only for a catalog recipe.
   - **Every node type is paired.** The diff describes:
     - who picks ("chosen at random, no one compares them") and how many;
     - a quality bar moved, never quoted, and how a repeat stops early;
     - what your words cover, whether you choose a cliché sweep's swaps, and an optional's or a route's question;
     - a read gained or dropped: "now also reads the brief when there is one", "no longer reads the brief" (a reorder of reads, or a port moved between consumed and read, is another technical change);
     - a final check's re-runs;
     - moves into or out of a review, a final check or a draft, behind a check that can end the round, and past your words.
   - **Anything else** reads "Other technical changes that affect how it runs." A re-nesting that changes nothing reads so too.
   - **A mutation test:** a single change of any semantic field, on any node of C1–C7, never reads "The same steps".
6. **The presentation and the estimate read what runs.**
   - A step's label follows its role's block.
   - Only a VOICE write is "your words", explained by its scope: every line, key lines, the claims, the script or the on-screen words.
   - A random pick says it is random.
   - A writer applies a critique by what it runs: a machine writer that consumes the critique, or reads it when it is there (ADR-0089).
   - **A step's findings are said to be applied only by a writer that applies them and no other critique:** on every path to that writer, the step put the latest critique in place (`critiqueSources` in the shared semantics, on the flow walk). The first such writer in the step's stage is shown with the step, not the writer that merely comes next. replicate, each and a pick hand on the critique they started with, an audit its lenses' and a one-shot gate its body's, so a reviewer inside a replicate is never said to have its findings applied after it. A render, a write or a step of yours that gives no critique leaves the critique as it was, so a writer after one still applies the step's findings, and is shown with it. The round-3 verification found C3 and C4 with the cliché sweep in a replicate of two explained "the AI swaps every one", while the swap step applied the person's trim list a second time.
   - **A cliché sweep is worded by where its finds go:**
     - "you choose which ones, if any, the AI swaps" where `asksSwaps` holds, at every place the sweep sits. The run asks right after the sweep, and the swap step applies the finds you chose. A render or a step of yours that gives no critique may sit between the sweep and its swap step; the run still asks, and the sentence says so.
     - "the AI swaps every one" where an AI writer in the sweep's stage applies its finds and no other critique, and no one is asked at any place the sweep sits: a swap step that only reads the critique, one in a seq of its own, or one behind a machine keep-or-revert.
     - "It flags only." where no AI writer that takes in a critique can come after the sweep at all.
     - "A fresh reviewer flags stock patterns." everywhere else, which says nothing about where the finds go: an AI writer can take in a critique after the sweep, but none in its stage applies its finds and no other critique. Something may put another critique in their place first (a person's direction given as a critique, a critic, a check, a CUT, or an audit or a final check that notes anything), the sweep may sit in a replicate or each, which hands on the critique it started with, or the writer is in a later stage. A sweep used at two places, one asked and one not, reads so too.
   - The estimator counts your choosing time where `asksSwaps` holds. `asksSwaps` looks for the next step in the sweep's seq that consumes a critique; a fix that only reads it is handed every find, and no one is asked. Nor is anyone asked when something before that fix can put another critique in place of the finds (`replacesCritique`: a critic, a check, a CUT, a person's direction given as a critique, an audit or a final check that notes anything). The fix applies that critique, so a choice among the finds would decide nothing. Before, the interpreter asked anyway, on an admitted composed C1 or C7 with a direction of yours between the sweep and its swap step; the shared function and the interpreter changed together.
   - **A sentence about the steps around a step is used only where the recipe establishes it** (present.ts `around`: walk order, a loop's or relay's body running again, and nothing a lens, a gate body or a judge makes; for the AI's directions, what reaches your next VISION). Elsewhere the sentence without that claim is used.
     - "the AI wrote the rest" only on a VOICE that no person's write (a VOICE or their own draft) can come before. The round-2 verification found it on an admitted C4 whose draft the person writes; it was false on the catalog's C4 too, whose claim sign-off follows the person's key lines.
     - "It is locked after this" only on a script that nothing you write later can change (`lockedScripts` in the shared semantics): no later draft of yours, script VOICE or claim log, and no loop round, relay link or final check's re-run that asks for the script again. A claim log's corrections replace claims wherever they stand, the voice-over included; the on-screen VOICE cannot touch it. C5's launch check re-runs Refine and Finish, so a second script VOICE in Finish is not locked either.
     - "Nothing is deleted for you" and "It flags only" only where no AI writer can take the notes in after them.
     - "for you to react to" only where, on every path, the next VISION of yours after the AI's directions is shown them, and on some path one runs (`directionsReactedTo` in the shared semantics, on the flow walk). Following is not enough: the directions reach your VISION as the latest note beside what it shows, so no step that leaves a note of its own may run between (a critic, a check, a CUT, a sweep, an overlap flag, another VISION, a seed's direction, or an audit one of whose lenses does). They must sit outside any candidate, lens, gate body or judge (replicate, each, a pick and a final check hand on the notes they started with), and no final check may re-run their stage while they wait for you. The round-3 verification found the order-only rule false on 495 admitted variants, among them C2 with a second AI direction right after the sharpened brief (the next round shows the second one's note) and C5 with AI directions before the obvious-answer check (its flags are what your direction step shows). The runtime is unchanged: the person's VISION shows the latest notes, as before. The label follows the same rule: such a step is "Directions to react to" there and "Directions" elsewhere. `stepLabel` without the recipe claims nothing about the steps around a step. The diff names each recipe's steps with that recipe's labels (`labelsIn`) and never compares labels, so a label that moved with its context is never by itself a change.
   - **A step a person takes is their turn.** A person's fix is their own draft, as a person's build is; a person's image step, merge or sweep is "Your turn." None is said to be done by the AI or a reviewer.
   - **A step is said to do what this version runs** (F08's fourth round, checked against the runner's executors for every medium):
     - A step with no executor yet finishes skipped with a plain note, and its explainer says "Not available in this version" ([ADR-0069](0069-product-c5-relay-and-honest-skips.md); `hasNoExecutor` in the shared semantics, held to the interpreter's dispatch and the asset activity). That covers a tool RELAY's compositing ("Composite"), an ASSET that turns the script into voice-over audio ("Voice-over audio", not "Custom imagery"), and any other tool or policy step that is not a render. A writer after such a step is not said to apply its findings.
     - A model RELAY is "each part starting where the last one ended" only inside a relay chain. Outside one it is one clip of the last shot, from the latest start frame.
     - A seed is "separate sessions" only inside each or a replicate of more than one.
     - A machine writer in an audit lens or a final check's body (the plain drafts of an obvious-answer check) drafts a version that never becomes the work, and is never said to apply a critique to it.
   - **What the run asks says the same** (the workflow's wording.ts): a VOICE is asked by what it covers in the run's medium (`voiceScope`), and a script VOICE says "It is locked after this, and used exactly as you write it" exactly where `lockedScripts` holds. The interpreter reads that from the recipe at the step, so the run and the explainers cannot disagree. Before, every early VOICE said it, even on an admitted composed C5 whose second script VOICE could change it.
7. **The operators as the interpreter runs them.**
   - **`gateFeed`** names the steps a gate's verdict is read from on every run of its body. ST2 `feed` and ST10 `feed` refuse a gate with none. ST10 `metric` refuses a one-shot check-clean or human gate.
   - **What an audit hands on:** its lenses' joined critique, not a score.
   - **What a one-shot gate hands on:** its body's critique only.
   - **Inside each:** each candidate runs without the option set.
   - **Intended test changes:** a score consumed after an audit is now ST5, and the Audit doc comment says so. A trim whose marks reach the fix past a render reads "the AI removes it" (decision 6: the marks reach the fix), where it read "marks what could go".
   - **LS1 names a person's loop first.** A loop a person holds whose last round goes to a policy reads "is yours to end", even with a critic in its review (C6), and is no longer called a critic loop. The verdict is the same.
   - **A person's list or critique is asked only where the run hands it on** (`personCritique` in the shared semantics). A person's CUT (their list of what to remove), or a reaction of theirs given as a critique, is what the step after it acts on. Where the operator around it drops that answer, the step after it applies an earlier critique, and the person's answer is lost without a word: their authority, the F01 class, not only wording.
     - replicate and each hand on only the candidates' work: the answer never reaches a step after them. Refused as ST12 `critique-per-candidate`. One that a fix in the same candidate would apply is refused too: the rule is where the person is asked, and no catalog recipe asks a person per candidate for a list.
     - An audit lens and a one-shot gate's body drop an empty answer: an audit joins only lenses that noted something, and a gate keeps the critique from before it. A non-empty answer does reach the step after them, under the lens's name or as the gate's critique, but a person who lists nothing then has an earlier critique applied. Refused as ST9 and ST10 `human-critique`, beside the `human-write` clauses for a person's write there.
     - The round-3 verification admitted C3 with the person's CUT in a replicate of two and C4 with it in an audit lens, both explained "Your turn: list what the work could lose, and the AI removes it" while the fix applied the critic's critique. Both are now refused. No catalog recipe has such a step; every one keeps its verdict and its hash.
8. **The held voice at run time.** `Ports.held` collects every VOICE write's answer on the path. `ports.voice` is set only by a VOICE write, or by the fixed copy deck at start. A step that only declares VOICE sets neither.
   - **keepsVoice:** a writer is checked against the held voice plus the latest words (`keptVoice`). For C5, the only catalog recipe with such writers, that is its latest answer, as before.
   - **The guard:** a machine write after the person's words, outside a lens or gate body and without keepsVoice, fails the run before it runs. Admission refuses such a recipe first.
   - **Picks:** a C pick whose judge names no draft fails, instead of taking A.
   - **Shared lists:** `humanKind` reads `HUMAN_WRITE_ROLES`. The prompt contract of a model VOICE or render is the artifact, as the runner parses it, which closes ADR-0092's pinned difference.
9. **The flow walk is memoized** by a state key each rule gives (PR6, ST12 set-aside, DR7, the profile's writer counts). This closes ADR-0092's named cost: admission time doubling per level of nested loops.
   - **It lives in the shared semantics** (`flowRecipe` in `@byway/recipe/semantics`, re-exported by the validator), beside the analyses of what reaches a step that read it (`critiqueSources`, `directionsReactedTo`). Such an analysis follows one port, so it says through `after` what replicate, each, a pick, an audit and a one-shot gate hand on of it, and through `exit` what a loop's exit gets after a judge that may be skipped (a judge in a relay link with nothing to see ends its round with the ports from before it, ADR-0090). The rules that leave both out walk as before. The interpreter imports none of it, so the workflow bundle does not change with it.
   - **Before:** a nest of 22 loops took 37.7M step applications and 29 s in `validate()`.
   - **After:** it takes at most four per step.
   - **The proof is a test:** on 600 random recipes of every operator, the memoized verdict equals the full walk's, finding for finding.
10. **Refusals are worded by what they are.** The Recommendation screen lists the protocol checks under "It did not pass the protocol checks". An answer byway could not read or check, a recipe that no longer reads as the one offered (ADMIT-HASH), and one built from a recipe byway no longer has (ADMIT-NEAREST) each get their own line.

## Alternatives considered

- **Counting only the seeds that precede a fan-out in execution order.** Rejected for now. It needs the walk to model retries and loop rounds, and it buys nothing on any catalog or composed recipe. Counting all of the run's seeds is sound and simple.
- **Medium-specific view sizes.** Rejected. The web page's 2.75 KiB bounds every medium, and the composed limits keep the worst composed batch well under the engine's.
- **Cancelling a retry's sibling branches (a CancellationScope).** Rejected, as the design did. Refusing a retrying gate inside a fan-out is simpler, and no catalog recipe has one.
- **A describer for every semantic field.** Rejected. Projection equality decides "The same steps", and "Other technical changes" names the rest honestly.
- **Flattening seqs and making the swap choice read past them** (the verifier's alternative). Rejected. It would change how any admitted recipe with a nested seq runs, which is a decision of its own. A projection that keeps nesting also stays sound if another rule ever reads a step's siblings.
- **Showing a person's VISION the AI's latest directions wherever they were made** (the round-3 verifier's alternative to deciding "for you to react to" by what reaches the step). Rejected: it changes what a running recipe shows a person, and the workflow bundle with it, which is a decision of its own. Nothing points to it as the intended semantics: in every catalog recipe the directions are the latest note when your VISION runs, so the run already shows them. The explainer now claims it only where that is so.
- **Run-time set-aside, and arming the guard from declarations.** Not done, as ADR-0092 decided: admission refuses every recipe where they would matter.

## Consequences

**Positive**

- No recipe can make a run wedge on Temporal's limits through its counts. Runner start and workflow start refuse it with a plain message.
- A composed recipe's "How it differs" is never silent about a change in how it runs.
- The runtime holds a keepsVoice writer to every VOICE, and refuses a writer over the person's words whatever admitted it.
- Admission no longer slows by half with each nested loop.

**Negative, and residuals named**

- **The workflow bundle changes once**, with ADR-0093's cap policy: from main's `ec88dae8…` (after [ADR-0089](0089-recipe-ir-optional-reads.md) and [ADR-0090](0090-execution-contracts-for-revising-humans-and-media-steps.md)) to `38afef53…`, pinned in `packages/runner/test/build.test.ts`. On its branch it passed through `bfdda860…` to `9f872bb4…` (before main's media-contract work was merged under it) and then `fcadfee4…`; neither reached main. The one change carries every stage's workflow code: stage 2's engine check at workflow start, stage 4's held voice, guard and C pick, ADR-0093's cap turn, and F08's fourth round (a VOICE asked by what it covers, the script lock read from `lockedScripts`, and `asksSwaps` with `replacesCritique`). Stage 3 changed no workflow code, and moving `asksSwaps` into the shared semantics changed only where its code lives. Runs open at the upgrade end plainly ([ADR-0078](0078-runs-from-older-engine-versions-end-plainly.md)).
- **A re-nesting that changes nothing reads "Other technical changes that affect how it runs."** That overstates it, and is the price of a projection that never equates two recipes that run differently. So does a reorder of a step's consumed or read ports when the step takes in at most one port with images (a view or an option set): it runs the same.
- **A stored composed intake is checked again at start.** One whose explanations changed (VOICE scope wording, a random pick, a sentence about the steps around a step that the recipe does not establish, a person's step said to be the AI's, a step with no executor or a lens's plain draft said to work on the work, a seed outside a fan-out, a model VISION's label, a writer shown with a step whose findings do not reach it) gets a 409 once and starts on the second Start. One that a new rule refuses (ST2 or ST10 `feed`, LS1, ST9 or ST10 `human-critique`, ST12 `critique-per-candidate`, the composed limits) gets a 400.
- **Run inputs are still carried by value** in every activity input: the brief with its attachments, the fixed voice deck, and now `ports.held` and `ports.voice`. Large inputs can still pass Temporal's batch or payload limits. That is the backlog item on run inputs by reference, widened to the held voice.
- **The bound is an over-approximation.** It counts every seed, every view at a web page's size, and a raised cap on every loop a person holds. A recipe near the limits may be refused although it would run.
- **What reaches a step is decided conservatively.** Where the analyses cannot tell paths apart, they make no claim, and the plain sentence is used; they never make one that does not hold. So the AI's directions are not called "for you to react to" when they sit inside a candidate, a lens, a gate body or a judge, even if a VISION of yours there is shown them; nor when a final check could re-run their stage while they wait, even if they would run again before your VISION; nor past a judge in a relay link, which counts as leaving a note although it may be skipped. A step whose critique reaches a writer in a later stage is not shown with it, since shown steps are grouped by stage. A step object used at two places claims only what holds at both.

## Evidence

- [External-review verification](../reviews/2026-10-08-external-review-verification.md), cluster A (F01 P1, F02 P2, F08 P2), recommendation C, stages 2–4, and its final check's residuals (the seed term; the held voice by value).
- The original review: `C:/Users/arvik/code/byway_review/byway-review.md` (outside the repository).
- The verifiers' probes, outside the repository: `C:/Users/arvik/AppData/Local/Temp/byway-review-verify/verify-F02-reproduce/`, `verify-F02-refute/`, `verify-F08-reproduce/` and `verify-F08-refute/`.
- Tests:
  - recipe: `packages/recipe/test/shape.test.ts`, `limits.test.ts`, `projection.test.ts` and `semantics.test.ts` (run order, `lockedScripts`, `hasNoExecutor`, `replacesCritique`, the flow walk's `after` and `exit`, `critiqueSources`, `directionsReactedTo`);
  - catalog: `packages/catalog/test/limits.test.ts`;
  - validator: `packages/validator/test/limits-rules.test.ts`, `flow-memo.test.ts`, `operator-semantics.test.ts` and `semantics-rules.test.ts` (`human-critique`, `critique-per-candidate`);
  - advisor: `packages/advisor/test/limits-admission.test.ts`, `diff-semantics.test.ts` and `present.test.ts`;
  - runner: `packages/runner/test/limits-batch.test.ts`, `start-refusal.test.ts`, `held-voice.test.ts`, `swap-choice.test.ts`, `script-lock.test.ts`, `no-executor.test.ts`, `semantics-effects.test.ts` and `e2e/loop-cap.ts`;
  - web: `apps/web/test/start-admission.test.ts` and `recommendation.test.ts`, and `apps/web/e2e/composed-start.spec.ts`.
- It carries out the later stages ADR-0092 named. It amends one clause of [ADR-0089](0089-recipe-ir-optional-reads.md) (decision 1: `reads` is ordered, decision 5 above) and supersedes no ADR.
