*Claude's build map for block 2 (batch W), the coordinator's plan for the block's builders, copied from the session's scratchpad (`block2-plan/plan.md`) below the line as it stood at its last change, 2026-10-22 21:18 local. It was written at main 37a4104, after Block 1 merged; section 7's notes were added as the build went, the last of them the items the sweep of 2026-10-22 found for block 2's records pass (B1 to B9). Claude did not send it to the owner. Where it says "(Claude)", the choice or reading is Claude's, not the owner's. The owner's answers it quotes are in [conversation-continued.md](../conversation-continued.md); the two it marks as not in that record at 37a4104 are there now, under 2026-10-22 14:07. The designs it builds are [2026-10-21-p2.md](2026-10-21-p2.md) and [2026-10-22-answer-waits.md](2026-10-22-answer-waits.md). The scratchpad files it names, the script that listed the workflow bundle's inputs among them, are not kept.*

---

# Block 2 (batch W): the build map

Read-only planning pass over byway at main `37a4104` (Block 1 merged, CI green), 2026-10-22. Nothing in the checkout, its worktrees or `byway_review` was edited. Line numbers below are at `37a4104`. Backlog rows are named by their first cell (title); the row numbers in the approved design are stale (it was read at `a002e60`).

Sources read: `docs/backlog.md`, `docs/playbook.md`, `docs/adr/0111-cancel-cuts-off-the-calls-byway-can-stop.md` (Later notes), `docs/adr/evidence/designs/2026-10-21-p2.md` (the approved design), `docs/adr/evidence/designs/2026-10-21-true-stop.md`, `docs/adr/evidence/reports/answer-waits-research-2026-10-22.md`, `docs/adr/evidence/conversation-continued.md`, and the code. The workflow bundle's inputs were listed with esbuild's metafile (a script in this folder, `write: false`, nothing written to the repo). Prices for the long-context tiers were read from the providers' pages on 2026-10-22 (see item LC-TIERS); the builder must read them again, word for word, before recording them.

---

## 0. Ground rules for every builder

1. **The workflow bundle changes once.** Every file below is an input of `packages/runner/dist/workflows.js` (esbuild metafile of `packages/runner/src/workflows/index.ts` at 37a4104). A change to any of them can move the hash pinned in `packages/runner/test/build.test.ts:25` (esbuild keeps some comments, build.ts:9-11). Only builder **B1 (W-core)** edits them, and B1 updates `PINNED_WORKFLOW_HASH` once, in its last commit, with its note in the comment block at `build.test.ts:10-24`. Every other builder runs `build.test.ts` unedited and must see it pass; if a type-only change still moves the hash, move the change out of the bundle's inputs.

   Bundle inputs: `packages/runner/src/workflow/{acts,control,interpreter,run,version,wording}.ts`, `packages/runner/src/workflows/index.ts`, `packages/runner/src/{types,gates,hits,labels}.ts`, `packages/recipe/src/{semantics,limits,prompt-shows,template-slots}.ts`, `packages/prompts/src/{ids,outputs,pure,slots}.ts`, `packages/protocol/src/{blocks,exceptions,index,media,ports,rules}.ts`, `packages/contracts/src/{advisor,gateway,index,medium,prompts,runner,spend,store}.ts`, `packages/store/src/resolution.ts`. (Type-only edits to contracts are erased; build.test.ts is the judge.)
2. **One integration branch.** Cut `fix/fx-block2` from `37a4104`. Builders work in their own worktrees on branches off it and merge into it in the order of section 3. The block gets one adversarial check and one branch CI on Windows and Linux before it merges to main (the order the owner chose: "Two blocks: 0+A+B+C, then W (Recommended)", whose description read "Block 2: the workflow change (P2, held voice, VOICE-RETRY and its riders), merged while no run waits. Each block gets one adversarial check and CI. All before your first live run, per D3.").
3. **Records are written once, after the code merges** (item B2-RECORDS), by the coordinator: ADRs, the ADR index's "changed by" links, backlog rows, the playbook's delegated-review list, the conversation record. Builders do not edit `docs/backlog.md`, `docs/playbook.md`, `docs/adr/README.md` or `docs/adr/evidence/conversation-continued.md`; they hand the coordinator their record notes (each choice they made that the design does not, named as theirs).
4. **No gate, setting or behaviour the owner did not choose.** Where this map says **(Claude)** it is a proposal or reading for the coordinator to name in the records, not the owner's decision. Choices left open below go to the coordinator before the builder fixes them.
5. **Fix rounds need the owner's yes, each round** (memory: fix loops need approval per round). The adversarial check's findings are reported first.
6. Tests carry no wall-clock assertions (the design's rule); fake timers, signals and Temporal histories instead.

---

## 1. The owner's decisions this block carries (verbatim)

All from `docs/adr/evidence/conversation-continued.md` unless marked.

| Decision | The owner's answer (verbatim) | Where |
|---|---|---|
| D3, when P2 lands | "Now, before the first live run" (its description: "The same batch, landed first. It puts new plumbing under your first real spend.") | 2026-10-21 21:31 |
| D9, VOICE-RETRY | "The interpreter carries it, with P2 (Recommended)" (its description: "It rides in the workflow-change batch, so it costs no extra round of ended runs. C5 is held out of the first live runs and only you run it.") | 21:31 |
| Order | "Two blocks: 0+A+B+C, then W (Recommended)" | 21:43 |
| Designs first | "Yes, short designs first (Recommended)" | 21:43 |
| The P2 design | "Approve, and price long-context tiers in W" (its description: "As the first, but W also records OpenAI's and Google's long-context rates and prices each call at its tier, since W lets very large briefs run where today they fail without spending.") | 23:05 |
| Price table | "Weekly report + monthly re-read + date in the app (Recommended)" | 23:15 |
| Stall limit, the owner's own words | "Build selectable limits for every model/provider: 15, 30, 45, and 60 minutes" | 2026-10-22 06:40 |
| Where / how fine / default | "In Block 2, 15 meanwhile (Recommended)"; "Per model (Recommended)"; "15 minutes (Recommended)" | 09:50 |
| Video, the owner's words | "I am fine with including fal and other video generation models but shouldn't their limits be different: 30, 45, 60, 75? And for image generation also, may be not as long as video generators but surely longer compared to high reasoning text? Can we do a deep dive internet research pass for all of these looking at providers as well as credible second party reviewers?" | 09:50 |
| Media-step calls meanwhile | "45 minutes for calls in media steps (Recommended)" | 10:35 |
| Image choice set | "5, 10, 15, 20; default 15 (Recommended)" | 12:10 |
| Video default | "30 minutes (Recommended)" (choices 30, 45, 60, 75) | 12:10 |
| C5 browser flake | "Fix it in Block 2 (Recommended)" ("The e2e helper waits on the run's progress (a new event within 120 s) instead of on the next turn alone, so a slow but moving run no longer fails; tested by mutation, and part of Block 2's check.") | **Not in the conversation record at 37a4104**: quoted from the Block 2 brief |
| Waits design | "Short design of the waits first (Recommended)" ("I write a short design for the waits part covering those points, with a recommendation for each, and put it to you; the rest of Block 2, whose design you approved, starts building meanwhile.") | **Not in the conversation record at 37a4104**: quoted from the Block 2 brief |

What the P2 answer settles, from the backlog row "Activity inputs carry the brief and the step's ports by value (P2)": the design's choices 1-3 take its recommendations (row "A writer acts on an older critique when an optional critique step is declined": clear a declined critique; W does not start the content-layer pilot, the reading of its trigger staying Claude's; "activities receive only the ports their step reads" stays on its row), and choice 4 is replaced: W prices the long-context tiers.

**Record gap (blocking for the records pass, not for building):** the last two answers are in no file at 37a4104 (`grep` of `docs/` finds neither label). The records pass adds them to the conversation record with the questions as asked, and updates the rows "Known Windows timing flake: browser test C5 waits at most 120 s for each next turn" (it still says the e2e waits "are left as they are") and "Selectable answer waits per model (block 2)".

---

## 2. Items

Legend: **Bundle** = touches a bundle input (section 0). **Waits** = waits on the short waits design being approved. Sizes in builder-days.

### Summary

| Key | Item | Bundle | Waits | Builder | Size |
|---|---|---|---|---|---|
| P2-BRIEF | The brief stored once, its id in the start input and every step | yes | no | B1 | M (1.5) |
| P2-INPUTS | Fixed copy deck, author's draft, tell catalog by reference | yes | no | B1 | S (0.75) |
| P2-SEEDS | Seeds read from the store; the batch bound loses its seed term | yes | no | B1 | M (1) |
| P2-HELD | The held voice by id | yes | no | B1 | M (1) |
| VOICE-RETRY | A gate's retry keeps the person's VOICE answers | yes | no | B1 | M (1.5) |
| R-VOICE-APPLY | Retire helper.voice.apply | yes | no | B1 | S (0.5) |
| R-SUFFIX | VOICE's prompt suffix: its fixed sentence into the workflow's wording | yes | no | B1 | S (0.5) |
| R-ADVICE | C3's optional "advice" field in the output-contract table | yes | no | B1 | S (0.25) |
| R-C7 | C7's in-place prompt keyed on the brief | yes | no | B1 | S (0.5) |
| R-GATE-MARK | The one-shot gate clears the empty-critique mark | yes | no | B1 | S (0.25) |
| R-DECLINED | A declined optional critique step clears the critique | yes | no | B1 | M (1, plus the 40-min oracle) |
| R-PORTS-TEST | Operator ports: the execution test (no bundle change) | no | no | B4 | M (0.75) |
| R-PORTS-MOVE | Operator ports: the table moves into semantics.ts | yes | no | B1 | M (0.75) |
| R-RECONCILE | The lost-run pass also runs while the engine runs | no | no | B4 | M (1-1.5) |
| CANCEL-SCOPE | The proxies' cancellation type; one cancellation scope kept | yes | no | B1 | S-M (0.5-1) |
| FANOUT-FAILURE | A failure during a fan-out: real-workflow test, and a note on stopped siblings | yes (with CANCEL-SCOPE) | no | B1 | S-M (0.5) |
| SLOTS-KNOB | An ASSET step whose slots knob is below 1 | yes (if refused at admission) | no | B1 | S (0.5) |
| OWN-DRAFT | A person's unreadable own draft is asked again | no (activity) | no | B1 | S (0.25) |
| START-F19 | Runner.start refusing a recipe with a lone surrogate: the test | no | no | B1 | S (0.25) |
| ORACLE | The claims oracle at full size, and its header note | no (test run) | no | B1 | S (40 min + 0.25) |
| LC-TIERS | Long-context tiers priced per call | no | no | B2 | M (1) |
| PRICE-CADENCE | Weekly CI price report, monthly re-read, last-checked date in the app | no | no | B2 | M (1.5) |
| WAITS-SETTINGS | Selectable answer waits per model (Settings, store, gateway) | no | **yes** | B3 | L (2) |
| WAITS-CAPS | Lift the caps below the waits (OpenAI images, Google fetch, fal) | no | **yes** | B3 | M (1-1.5) |
| WAITS-STEP-LIMITS | Steps sized so the chosen wait governs | yes | **yes** | B1 (last) | M (0.5-1) |
| C5-FLAKE | The browser helper waits on the run's progress | no | no | B5 | S (0.5) |
| B2-RECORDS | ADRs, index links, backlog, playbook, conversation record | no | after code | coordinator | M (1) |

B1's ordered total is about 11-12 days; the others run beside it.

---

### P2-BRIEF: the brief stored once

- **Backlog rows:** "Activity inputs carry the brief and the step's ports by value (P2)".
- **Owner decision:** D3 "Now, before the first live run"; order "Two blocks: 0+A+B+C, then W (Recommended)"; the design "Approve, and price long-context tiers in W".
- **What to build (design, "What is stored where"):** Runner.start writes the brief (text, fields, attachments) as one JSON file in the content-addressed store (`store.artifacts.putText`) before it starts the workflow; `RunInput` carries its id instead of `problem`; `RunRef` carries the id; a step that fills the problem slot reads it once through `ArtifactReader` (cached per activity). `StartRunInput` and the run record do not change. A start sent twice stores the same bytes under the same id and still starts one run. A missing file after a partial restore fails the step with a plain message (the start-up data check already lists missing files). The part "activities receive only the ports their step reads" is **not** built (stays on the row).
- **Code sites:** `packages/runner/src/client.ts:117-181` (start; RunInput built at :154-164); `packages/runner/src/types.ts:20-31` (RunInput.problem :24), `:133-142` (RunRef.problem :139); `packages/runner/src/workflow/interpreter.ts:141-144` (the `run` getter); `packages/runner/src/activities/prompting.ts:119-121` (SlotContext.problem), `:146-148` (`slots.problem = problemSlot(ctx.problem)`); `packages/runner/src/activities/model-step.ts:75, :109-118`; `packages/runner/src/activities/asset.ts:125`; `packages/runner/src/activities/relay.ts:56`; tests that build RunInput by hand: `packages/runner/test/e2e/loop-cap.ts:113`, `packages/runner/test/engine-state.test.ts:177`.
- **Bundle:** yes (types.ts, interpreter.ts). **Depends on:** nothing. **Waits:** no.
- **Tests (design):** the row's acceptance, a demo C2 run with a maximal non-English brief (20,000 + 5 x 200,000 characters) completes D1 and its prompts carry the brief exactly; a weighing test as in `limits-batch.test.ts`: C1 and C2 with that brief, weighing the start input and every scheduled step input (none holds the brief or a seed, each under a fixed size); Runner.start stores the inputs once, and a start sent twice still starts one run.
- **Size:** M (1.5).
- **Open questions:** the JSON's exact shape (a canonical key order so a start sent twice hashes the same; the coordinator should fix it with B1); the plain message for a missing brief file; whether `data-check.ts` needs to name these artifacts (they are ordinary CAS rows, so probably not).

### P2-INPUTS: deck, draft and tells by reference

- **Backlog rows:** "Run inputs by reference also covers the held voice" (its first sentence), "Activity inputs carry the brief and the step's ports by value (P2)".
- **Owner decision:** as P2-BRIEF. That the draft and the tells move too is **(Claude)** in the design ("the rows name the brief and the deck. The draft and the tells are the same kind of input, so they move too").
- **What to build:** Runner.start writes the fixed copy deck, the author's draft and the person's tell catalog as text files; `RunInput.inputs` carries their ids (`refs` already are ids). The deck's id is the first `ports.voice`; the voice slot and the keepsVoice check read the text (with P2-HELD). The tells reach `tellsText` as text read by id; the draft reaches `openCheckpoint`'s `initial: { from: 'draft' }` as an id the activity reads.
- **Code sites:** `packages/runner/src/types.ts:30` (`inputs: { refs?, voice?, draft?, tells? }`), `:187-188` (ModelStepInput.tells), `:302` (OpenCheckpointInput.initial.draft); `interpreter.ts:162` (initial ports from `inputs.voice`), `:353` (tells by value into every model step), `:420` (draft by value); `packages/runner/src/activities/model-step.ts:58` (`tellsText(..., input.tells)`); `packages/runner/src/activities/human.ts:71-73` (`case 'draft'`); `packages/runner/src/tells.ts`; `client.ts:163`.
- **Bundle:** yes. **Depends on:** P2-BRIEF (same start path). **Waits:** no.
- **Tests:** in the weighing test (no input carries the deck, draft or tells); an own-draft step (C3) and a run with its own tell catalog still render exactly as before.
- **Size:** S (0.75).
- **Open questions:** none beyond the design's (Claude) note, which the records must name.

### P2-SEEDS: seeds read from the store

- **Backlog rows:** "Activity inputs carry the brief and the step's ports by value (P2)" ("RunRef stops carrying seeds").
- **Owner decision:** as P2-BRIEF.
- **What to build:** `RunRef.seeds` goes. Each seed is already memoized under `${call.key}/seed`; its key gets a prefix so the run's seeds sit in one key range, and one new read-only Store method on the existing memo table (no migration) returns the run's seeds. Every PR3 check reads them: the model writer's check, the direction note's redaction, the person's draft, the claim log, VOICE writes, asset and relay writes. PR3 then sees a superset of today's seeds (a sibling's, an earlier attempt's): stricter, never looser. The batch bound loses its seed term and `limits-batch.test.ts` measures it again; no catalog verdict changes; the 2 MiB engine bound stays **(Claude)**.
- **Code sites:** `interpreter.ts:127` (`seeds` array), `:143`, `:355` (`this.seeds.push`); `types.ts:140-141`; `model-step.ts:107` (memo key `${call.key}/seed`), `:122` (`seeds = [...run.seeds, seed]`), `:126`, `:150` (direction redaction); `packages/runner/src/activities/writes.ts:17-18, :35, :49, :54`; `human.ts:253, :270, :338, :409`; `asset.ts:116`; `relay.ts:52`; `packages/runner/src/activities/memo.ts:333-337` (`memoized`); `packages/contracts/src/store.ts:292-297` (getMemo/setMemo; add the read-only method); `packages/store/src/store.ts:398-420` (+ `queries.ts` for the range query); `packages/recipe/src/limits.ts:67-74` (ACTIVITY_BYTES.seed), `:82-83` (takesSeed), `:127-146` (Walker seeds term), `:287-327` (walkStages/workBound); `packages/runner/test/limits-batch.test.ts:8-10, :38-39, :96-100`.
- **Bundle:** yes (limits.ts, types.ts, interpreter.ts). **Depends on:** P2-BRIEF. **Waits:** no.
- **Tests (design):** PR3 refuses a write that holds another step's seed, read from the store; the store read returns exactly the run's seeds (store contract suite, `packages/store/test/memo.test.ts`); limits-batch measured again, catalog verdicts unchanged; `packages/runner/test/memo.test.ts` (memo keys otherwise unchanged).
- **Size:** M (1).
- **Open questions:** the prefix form (e.g. `seed/<call.key>`); whether a recipe refused today only for its seeds is now admitted silently (the design says it would be; name it in the ADR); the store method's name and whether it must exclude a run's other memo keys by construction.

### P2-HELD: the held voice by id

- **Backlog rows:** "Run inputs by reference also covers the held voice".
- **Owner decision:** as P2-BRIEF (the row: the owner chose its landing with D3, and approved the design at 23:05).
- **What to build:** `finishHumanStep` stores each VOICE answer as a text file and returns its id; `ports.voice` and `ports.held` hold ids; `keptVoice` reads the texts; the voice slot reads the text. An empty answer is still held (an empty file is an answer).
- **Code sites:** `interpreter.ts:291` (port rule 6 guard reads `ports.held?.length`), `:458` (`voice: text, held: [...held, text]`); `types.ts:80-90` (Ports.voice/held), `:327-333` (FinishHumanResult gains the id); `human.ts:231-283` (finishHumanStep); `packages/runner/src/activities/held-voice.ts:20-24` (keptVoice, becomes async/read by id); its callers `model-step.ts:124`, `asset.ts:116`, `relay.ts:52`; `prompting.ts:179-181` (`slots.voice`).
- **Bundle:** yes. **Depends on:** P2-INPUTS (the deck is the first `ports.voice`). **Waits:** no.
- **Tests (design):** the keepsVoice writers (model step, relay, asset) hold every VOICE answer read by id, an empty answer still held: `packages/runner/test/held-voice-writers.test.ts:68-120` moves to ids, `held-voice.test.ts`.
- **Size:** M (1).
- **Open questions:** risk the design names: a step stops getting a text it needs; every call site must be driven by a test.

### VOICE-RETRY

- **Backlog rows:** "VOICE-RETRY: C5's launch-gate retry drops the copy written at the first late VOICE".
- **Owner decision:** D9 "The interpreter carries it, with P2 (Recommended)"; the design "Approve, and price long-context tiers in W".
- **What to build (design):** the interpreter keeps the id of each VOICE's last answer and of the deck it answered, and carries both across `RetryStage`. When that VOICE runs again because the gate sent the run back, the box starts from the person's earlier lines where they still fit the work: for a deck of named fields (C5's headline, tagline, captions) when they still read as an answer to the work's deck; for prose only when the deck has not changed. Otherwise the box starts from the work's lines and the question says the earlier lines could not be kept and quotes them. **(Claude):** "unchanged" compares the answer with the work's own deck, not with what the box started from; on a web page the question names the earlier lines but never pre-fills them.
- **Code sites:** `interpreter.ts:159-179` (runStages; `entries[j]` restored at :174), `:389-470` (human: `initial` at :416, the offered text at :430, the finish at :435), `:753-771` (gate; RetryStage thrown at :766); `human.ts:46-92` (openCheckpoint, `case 'copy'` :55-63), `:314` (writeVoice; `sameCopy` against `initialText` at :319), page VOICE `:351-395`; `types.ts:294-303` (OpenCheckpointInput.initial), `:316-325` (FinishHumanInput.initialText); `packages/runner/test/e2e/c2-c5.ts:114-117` (the assertions that flip).
- **Bundle:** yes. **Depends on:** P2-HELD (answers by id). **Waits:** no.
- **Tests (design):** C5 e2e (runner): the VOICE-RETRY assertions flip; the second late VOICE starts from the person's headline, and the delivered work carries it (the drive should send the second offer back unchanged to show it); an interpreter test covers lines that no longer fit.
- **Size:** M (1.5).
- **Open questions:** where "unchanged" is measured when the box starts from earlier lines (the design's (Claude) answer: against the work's deck; the builder must keep `initialText` semantics consistent with ENG-6's re-ask, `interpreter.ts:443`).

### R-VOICE-APPLY: retire helper.voice.apply

- **Backlog rows:** "Retire the helper.voice.apply templates and the voice.apply id".
- **Owner decision:** the design "Approve, and price long-context tiers in W" (the rider is in the design).
- **What to build:** the id, the five templates, the mock responder and their tests go.
- **Code sites:** `packages/prompts/src/ids.ts:93-98` (`'voice.apply': 'helper.voice.apply'` :96); `packages/prompts/src/outputs.ts:43` (ARTIFACT_ROLES); `packages/recipe/src/template-slots.ts:23` (check whether it is generated by `packages/prompts/src/emit-template-slots.ts`); `packages/prompts/templates/helper.voice.apply@{code-diff,media,options,prose,web-page}.md`; `packages/gateway/src/mock/responders.ts:91-95, :152`; `packages/gateway/src/mock/revision.ts:4`; tests `packages/prompts/test/{coverage.test.ts:53, mock.test.ts:79-91, outputs.test.ts:35, review-fixes.test.ts:56}`, `packages/gateway/test/{contract.ts:106, exposure.test.ts:91, great-critic.test.ts:163, mock.test.ts:36,164-174,306-308, purposes.test.ts:38,123,219,283-288}`; comments `packages/contracts/src/gateway.ts:52`, `packages/contracts/src/prompts.ts:7`, `packages/prompts/README.md:27`, `packages/advisor/src/estimate.ts:257`.
- **Bundle:** yes (ids.ts, outputs.ts, template-slots.ts). **Depends on:** none (order it after P2-HELD so the VOICE path is settled). **Waits:** no.
- **Tests:** the existing coverage and purposes tests updated; a purpose `voice.apply:<m>` is now an unknown purpose (outputForPurpose throws).
- **Size:** S (0.5).
- **Open questions:** none.

### R-SUFFIX: VOICE's prompt suffix, as far as it can move

- **Backlog rows:** "Move VOICE's prompt suffix out of openCheckpoint".
- **Owner decision:** the design (approved). How far it moves is **(Claude)**: "Only its fixed sentence moves into the workflow's wording. The rest is read from the page, and the copy code may never be bundled into the workflow (ADR-0081), so it stays in the activity. No shown text changes."
- **What to build:** the fixed sentence of `pageVoiceSuffix`, "One line per block of text; leave a line empty to remove its text.", moves into `humanPrompt`'s page VOICE wording; the activity appends the page-dependent rest as today. The prompt as shown must be byte-identical.
- **Code sites:** `packages/runner/src/page-copy.ts:1090-1102` (`pageVoiceSuffix`, the sentence at :1091); `human.ts:175-186` (withPageRules); `packages/runner/src/workflow/wording.ts:61-89` (humanPrompt; voice case :75-82); `interpreter.ts:404-405`.
- **Bundle:** yes (wording.ts). **Depends on:** none. **Waits:** no.
- **Tests:** a page VOICE's stored prompt is unchanged (characterization test before and after); the re-ask (`interpreter.ts:443`) carries the sentence once.
- **Size:** S (0.5).
- **Open questions:** a page VOICE with no artifact (pageQuestion returns undefined, human.ts:154-156) today gets no rules; after the move it would get the fixed sentence from the workflow. Decide whether the workflow adds it only when the step will have a page (the coordinator; it changes shown text in that corner).

### R-ADVICE: C3's optional "advice" field

- **Backlog rows:** "The output-contract table's image-briefs line leaves out C3's optional "advice" field".
- **Owner decision:** the design (approved).
- **What to build:** add the optional field to `OUTPUT_CONTRACTS['image-briefs']`; C3's template, the prompts README and spec §3.3 already state it (ADR-0101); ADR-0101 gets a dated Later note in the records.
- **Code sites:** `packages/prompts/src/outputs.ts:25`; `packages/prompts/test/outputs.test.ts`.
- **Bundle:** yes. **Depends on:** none. **Waits:** no.
- **Tests:** the contract-table test reads the field; C3's template still matches its contract.
- **Size:** S (0.25).
- **Open questions:** the exact wording (copy the template's).

### R-C7: C7's in-place prompt keyed on the brief

- **Backlog rows:** "C7's in-place answer prompt is keyed on the variant, not on the brief".
- **Owner decision:** the design (approved); the keying is **(Claude)**: "Answer the questions below in place…" shows only when the brief being revised came from the interview prompt; any other brief revised in place gets the general question; the catalog's wording does not change.
- **What to build:** the interpreter records where the brief port came from (e.g. a mark set in `applyModel` when a vision step writes `brief` with prompt `product.c7.interview`) and `humanPrompt` keys on that mark instead of `step.variant === 'VISION-lite'`.
- **Code sites:** `wording.ts:39-41` (SPEC_IN_PLACE_PROMPT), `:61-65`; `interpreter.ts:364-370` (applyModel, `out.brief = res.text`), `:401-405`; `types.ts:71-113` (a Ports mark); `packages/catalog/src/c7.ts:49-51`; `packages/runner/test/revise-in-place.test.ts`.
- **Bundle:** yes. **Depends on:** none. **Waits:** no.
- **Tests:** C7's spec step still shows SPEC_IN_PLACE_PROMPT; a composed recipe with a VISION-lite reaction after a non-interview brief gets the general question.
- **Size:** S (0.5).
- **Open questions:** keyed on the prompt id (`product.c7.interview`) or on a declared property of the producing step; a prompt-id list in workflow code is the simplest **(Claude)**.

### R-GATE-MARK: the one-shot gate's mark

- **Backlog rows:** "A one-shot gate hands on the entry ports' emptyCritique mark beside its body's critique".
- **Owner decision:** the design (approved).
- **What to build:** the gate's critique clears the empty-critique mark it was handed (use `withCritique(ports, out.critique)`).
- **Code sites:** `interpreter.ts:756` (`const kept: Ports = { ...ports, ...(out.critique ? { critique: out.critique } : {}) }`), `:824-827` (withCritique); `packages/recipe/src/semantics.ts` gate handling (`:851-855` flowRecipe; `:196` replacesCritique) if the semantics model the mark.
- **Bundle:** yes. **Depends on:** none. **Waits:** no.
- **Tests:** a fix right after a gate that follows an empty CUT applies the gate critic's critique (unreachable in admitted recipes: a runner-level test with a hand-built recipe).
- **Size:** S (0.25).
- **Open questions:** none.

### R-DECLINED: a declined optional critique step clears the critique

- **Backlog rows:** "A writer acts on an older critique when an optional critique step is declined".
- **Owner decision:** the design (approved) with the recommendation in the question: "row 104, clear a declined critique"; the option read "Clear the critique (Recommended): a declined step that would have written the critique leaves it empty and marked, so the writer after it makes no change and its step says why, by the same path as an empty CUT ("Nothing to remove")".
- **What to build:** when an optional is declined and its body `replacesCritique`, the interpreter returns ports with the critique cleared and an empty-critique mark (a note saying the step was declined), so the fix after it passes with a note, as for an empty CUT. @byway/recipe's semantics change with it (flowRecipe's optional, and every claim that reads it).
- **Code sites:** `interpreter.ts:710-721` (optional), `:345-351` (fix after an empty critique), `:824-827`; `wording.ts:100-101` (DECLINED_NOTE; a new pass note); `packages/recipe/src/semantics.ts:181-207` (replacesCritique), `:856-857` (flowRecipe optional), `:1048` and `:1151` (critiqueSources' walk at an optional), `:942` (answerPorts); `scripts/test/claims-oracle.test.ts`.
- **Bundle:** yes. **Depends on:** none (pair with ORACLE). **Waits:** no.
- **Tests:** the writer after a declined cut or check passes with its note (C7 with scope-cut made optional; C5 with the person's cut made optional, as the row says); semantics tests (`packages/runner/test/semantics-effects.test.ts`, `semantics-exits.test.ts`); the claims oracle at full size (ORACLE).
- **Size:** M (1, plus the oracle run, about 40 minutes).
- **Open questions:** the pass note's words; if this changes critiqueSources' walk (semantics.ts:1151), the row "directionsReactedTo and critiqueSources withhold some true claims" sees its trigger; this map does not widen those claims (section 4).

### R-PORTS-TEST and R-PORTS-MOVE: operator ports defined once

- **Backlog rows:** "Operator output ports are defined twice: audit, a one-shot gate and each".
- **Owner decision:** the design (approved); the order is **(Claude)**: "first an execution test (small admitted graphs run through the real interpreter, compared with scope.ts). Then what audit, gate and each hand on moves into @byway/recipe's semantics.ts, and both read it from there."
- **What to build:** (1) R-PORTS-TEST, no bundle change: a runner test that drives small admitted graphs through the real interpreter (audit then a consumer; a one-shot gate then view and score consumers; each, with pool scope) and compares the ports with scope.ts's typing. (2) R-PORTS-MOVE: a table of what audit, a one-shot gate and each hand on, in semantics.ts; scope.ts and the interpreter read it.
- **Code sites:** `packages/validator/src/scope.ts:5-6` (AUDIT_OUT), `:202-213` (each), `:248-256` (gate), `:283-302` (typeAudit); `interpreter.ts:481-491` (each), `:745-751` (audit, which also hands on `notes`), `:753-757` (gate); `packages/recipe/src/semantics.ts` (new table).
- **Bundle:** test no; move yes. **Depends on:** the move depends on the test (and is ordered after R-GATE-MARK, which changes what a gate hands on). **Waits:** no.
- **Tests:** the execution test itself (new file, e.g. `packages/runner/test/operator-ports.test.ts`); it must pass before and after the move.
- **Size:** M + M (0.75 each).
- **Open questions:** the audit's `notes` hand-on (interpreter.ts:748-750) is not in scope.ts's AUDIT_OUT; the test will say whether the table includes it.

### R-RECONCILE: the lost-run pass while the engine runs

- **Backlog rows:** "Reconcile lost runs while the engine runs, not only at start".
- **Owner decision:** the design (approved); the shape is **(Claude)**: "the pass byway runs at start also runs every few minutes while the engine runs. A run that Temporal closed on a payload, batch or history limit is then marked failed instead of staying "running". The pass skips queued runs, because a start may be under way."
- **What to build:** a periodic run of `reconcileLostRuns` (or a variant that skips `queued`) from the engine, stopped with it; errors logged, never fatal; the at-start pass unchanged.
- **Code sites:** `packages/runner/src/lost-runs.ts:110-127` (reconcileLostRuns; `ENDED` check at :120 does not skip queued today), `:63-72` (workflowRunning: a TERMINATED or FAILED execution reads not running); `packages/runner/src/dev-engine.ts:99-109` (settleBeforePolling), the engine's stop path; `packages/runner/src/index.ts:10`.
- **Bundle:** no. **Depends on:** none. **Waits:** no.
- **Tests (design):** the tests call the pass directly (a run closed from outside while the engine runs is marked failed; a queued run is skipped); put them in a new test file so B1's edits to `engine-state.test.ts` (RunInput) do not collide.
- **Size:** M (1-1.5).
- **Open questions:** the interval ("every few minutes"; propose 5 minutes **(Claude)**); whether the message for a run Temporal closed on a limit differs from LOST_RUN_MESSAGE; whether the periodic pass also stops orphans (the at-start pass does both directions).

### CANCEL-SCOPE: the proxies' cancellation type, one scope

- **Backlog rows:** "Block 2 (P2): the activity proxies' cancellation type and the one cancellation scope".
- **Owner decision:** none. The row is Claude's proposal from building the true stop (trigger proposed by Claude, 2026-10-21): "Pick up when block 2's branch is cut: its design says whether the proxies wait, and keeps the one scope or revisits that reading". The approved P2 design predates it and does not say.
- **What to build:** decide whether `model` and `media` (and `quick`?) proxies set `cancellationType: WAIT_CANCELLATION_COMPLETED` (the run reaches Cancelled only once its calls have ended) or stay as today (TRY_CANCEL sent as protocol 0). In either case the interpreter rewrite keeps exactly one `CancellationScope`, made in run.ts and cancelled only there (twice: the cancel signal and the catch).
- **Code sites:** `packages/runner/src/workflow/acts.ts:12-22`; `packages/runner/src/workflow/run.ts:39` (`const main = new CancellationScope()`), `:70` and `:103` (`main.cancel()`), `:96`; `packages/runner/test/liveness.test.ts:267-277` (the one-scope source check); `packages/runner/src/activities/index.ts:80-81` (a stopped step ends as CancelledFailure); `apps/web/src/server/run-data.ts` (RunData.ended, RS-5's polling while calls are under way).
- **Bundle:** yes. **Depends on:** the decision; ordered after the interpreter work. **Waits:** no (but see the open question).
- **Tests:** liveness.test.ts's source check unchanged; if the proxies wait, the cut-offs hear CANCELLED (not NOT_FOUND) and the run's Cancelled comes after its steps end; a run with an uncut Google or image call in flight stays visibly running until it returns.
- **Size:** S if left as is; M if the proxies wait (Run screen's "stopping" state and tests).
- **Open questions:** **the decision is open.** Waiting makes a Cancel with a Google text call or an image call in flight take up to that call's wait (minutes, up to the chosen per-model wait), and the screen must say the run is stopping; it would also give siblings stopped by a failure their own events before the run ends (FANOUT-FAILURE). Claude's suggestion: put it to the owner inside the short waits design, since both are about how long byway waits and both change acts.ts; otherwise it is a Claude choice the ADR names.

### FANOUT-FAILURE: a failure during a fan-out

- **Backlog rows:** "A failure during a fan-out: no real-workflow test, and the cut-off siblings read "Stopped" with no reason".
- **Owner decision:** none; Claude's trigger (2026-10-22): "when the runner's activities or the timeline next change, or in block 2".
- **What to build:** add the reproduction to liveness.test.ts (`seq(replicate('drafts', 4, build('draft')), build('after'))` with one budget refusal declined: siblings cut off, listed as interrupted, the run failed); give a sibling stopped by a failure a note in the timeline.
- **Code sites:** `packages/runner/test/liveness.test.ts`; `apps/web/src/view/timeline.ts:17, :268` (`step.status = ended ? 'stopped' : 'running'`); `run.ts:103`; `interpreter.ts:474-491` (replicate/each with Promise.all).
- **Bundle:** the test and timeline no; how a stopped sibling gets its note depends on CANCEL-SCOPE. **Depends on:** CANCEL-SCOPE. **Waits:** no.
- **Tests:** the reproduction itself; a timeline test for the stopped sibling's note.
- **Size:** S-M (0.5).
- **Open questions:** where the note comes from: the timeline reading "the run failed" (web only), or a step event written before the run closes (needs the proxies to wait).

### SLOTS-KNOB: an ASSET step whose slots knob is below 1

- **Backlog rows:** "An ASSET step whose slots knob is below 1 still buys its brief answer".
- **Owner decision:** none; Claude's trigger (2026-10-22): "Pick up with block 2's bundle change, or before anyone but the owner can run a recipe outside the catalog".
- **What to build:** either refuse at admission a slots knob that is not a whole number of at least 1 (in @byway/recipe's engineProblems, which the workflow runs: bundle), or skip the step before the brief call (activity only). No catalog recipe sets either.
- **Code sites:** `packages/recipe/src/limits.ts:388` (engineProblems); `packages/runner/src/activities/slot-plan.ts:46-52` (freePlan); `packages/runner/src/activities/asset.ts`.
- **Bundle:** yes if refused at admission. **Depends on:** none. **Waits:** no.
- **Tests:** a recipe with slots 0.5 and 1.5 refused (or skipped without a paid call); catalog verdicts unchanged.
- **Size:** S (0.5).
- **Open questions:** which fix (Claude's choice to name; refusing at admission is the one the row ties to block 2).

### OWN-DRAFT: an unreadable own draft is asked again

- **Backlog rows:** "A person's own draft that byway cannot read fails the run instead of being asked again".
- **Owner decision:** none; Claude's trigger (2026-10-22): "at the next change to finishHumanStep", which P2-HELD makes.
- **What to build:** throw AnswerRejected in finishHumanStep's own-draft branch; give `packages/runner/test/e2e/controls.ts`'s "a run that fails withdraws the questions it left open" another way to fail its run.
- **Code sites:** `packages/runner/src/activities/human.ts:266-274` (StepError at :269); `packages/runner/test/e2e/controls.ts`.
- **Bundle:** no. **Depends on:** P2-HELD (same function). **Waits:** no.
- **Tests:** a media own draft with a repeated shot number is asked again with why.
- **Size:** S (0.25).
- **Open questions:** none.

### START-F19: Runner.start and a lone surrogate

- **Backlog rows:** "Tests the review's acceptance named that are not written" (its F19 item only).
- **Owner decision:** none; Claude's trigger: "Write each at the next change to the code it covers", and P2-BRIEF changes Runner.start.
- **What to build:** the test that Runner.start refuses a recipe with a lone surrogate (and, now, that it stores nothing for such a start).
- **Code sites:** `packages/runner/src/client.ts:117-128`; `packages/runner/test/start-refusal.test.ts`.
- **Bundle:** no. **Depends on:** P2-BRIEF. **Waits:** no.
- **Tests:** itself. **Size:** S (0.25). **Open questions:** the row's F05, F06 and F15 items are not covered (section 4).

### ORACLE: the claims oracle at full size

- **Backlog rows:** "When to run the claims oracle at the measurement's size".
- **Owner decision:** none; Claude's trigger (2026-10-21): "Run the oracle at full size at the next change to semantics.ts, to present.ts's claims or diff.ts, or to the interpreter ...; at the same change, say in the header that a lone sampling-only E-REACT report at other seeds is expected". The design also budgets "the full claims-oracle run (about 40 minutes)" for the declined-critique fix.
- **What to build:** run `CLAIMS_ORACLE_TRIES=40000 CLAIMS_ORACLE_SEEDS=26 CLAIMS_ORACLE_RUNS=12 pnpm exec vitest run scripts/test/claims-oracle.test.ts` on B1's final tree; add the header sentence; keep the log as evidence.
- **Code sites:** `scripts/test/claims-oracle.test.ts:15-22` (header).
- **Bundle:** no. **Depends on:** R-DECLINED, R-PORTS-MOVE, every semantics/interpreter change. **Waits:** no. **Size:** S. **Open questions:** none.

### LC-TIERS: long-context tiers priced per call

- **Backlog rows:** "Rates byway does not record, and a maximal brief passes Google's 200K tier" (its long-context part only).
- **Owner decision:** "Approve, and price long-context tiers in W" ("As the first, but W also records OpenAI's and Google's long-context rates and prices each call at its tier, since W lets very large briefs run where today they fail without spending."). The design's option read "Price the tiers in W: prices.ts gains the long-context rates (OpenAI above 272K input tokens, Google above 200K), and the gateway prices each call at its tier". Claude's reading (the row): "what the gateway reserves before such a call and what it records after it are both priced at the tier the call's prompt falls in, so the spend cap holds for a very large brief." Refusing such briefs at Start was not chosen.
- **What the pages say (read 2026-10-22 for this map; the builder reads them again word for word):**
  - OpenAI (developers.openai.com/api/docs/pricing, "Long context: >272K input tokens", Standard, per 1M): gpt-6-astra input $20, cached input $2, 30m cache write $25, output $75 (short: $10 / $1 / $12.50 / $50); gpt-6.1-sol $4 / $0.20 / $5 / $15 (short $2 / $0.10 / $2.50 / $10); gpt-6-luna $0.20 / $0.02 / $0.25 / $0.75. The page does not say how the threshold is counted.
  - Google (ai.google.dev/gemini-api/docs/pricing, last updated 2026-10-22 UTC): gemini-3.1-pro-preview "$4.00, prompts > 200k tokens" input, "$18.00, prompts > 200k" output, context caching $0.40 above 200k; **gemini-3.8-flash has no long-context tier** (single rates); gemini-nano-banana-2.1 none.
  - Anthropic (platform.claude.com/docs/en/about-claude/pricing, "Long context pricing"): "Claude 4.6 and later models (except Claude Haiku 5.5) ... include the full 1M token context window at standard pricing. (A 900k-token request is billed at the same per-token rate as a 9k-token request.)" So claude-fable-5-1, claude-opus-5-5, claude-sonnet-5-5, claude-opus-5 and claude-opus-4-8 have **no** long-context tier; only Haiku 5.5 (over 100,000 tokens), which no profile uses. OpenRouter's pinned Anthropic rows follow (and OpenRouter reports each call's cost).
- **What to build:** `PriceRow` gains an optional long-context tier (threshold in input tokens and the tier's input, output and, where the short row records them, cache rates). `tokenCost` picks the tier from `usage.inputTokens` (the whole prompt, cached tokens included **(Claude's reading)**), so reservation (`maxCompletionCost`, on the planning estimate, which runs high), settlement (`completionCost`) and the advisor's estimate all price at the tier. Comments name Anthropic's standard pricing across 1M with its read date. Google's context-cache rates and gpt-6-luna's cached input stay on the row (its other parts keep their trigger).
- **Code sites:** `packages/gateway/src/prices.ts:7-35` (PriceRow), `:37-46` (read notes), `:66` ("short context ... byway's prompts stay well under"), `:76-82` (OpenAI rows), `:92-103` (Google rows; "> 200k: $4 / $18" at :98), `:217-228` (tokenCost); `packages/gateway/src/estimate.ts:67-70` (maxCompletionCost); `packages/gateway/src/gateway.ts:862-871` (admit), `:911-925` (completionCost); `packages/advisor/src/estimate.ts:186` (reads tokenCost; no edit needed if the tier lives in tokenCost); `packages/gateway/src/providers/{openai,google}.ts` usage mapping (confirm `inputTokens` includes cached tokens).
- **Bundle:** no (prices.ts is not a bundle input). **Depends on:** none (lands before W's merge so the cap holds when large briefs start running). **Waits:** no.
- **Tests:** tokenCost at 272,000 and 272,001 input tokens for OpenAI, 200,000 and 200,001 for Gemini Pro, no change for Anthropic at 900K; a reservation for a maximal brief at the tier; settlement from reported usage at the tier; the advisor's estimate crossing the tier. Money-path work gets the block check's money lens (ADR-0109's area).
- **Size:** M (1).
- **Open questions:** whether the threshold compares `>` or `>=` (OpenAI: ">272K"; Google: "> 200k"); whether a reservation priced on the estimate's tier but settled below it needs a note; whether to record the long tier's cache-write rates for OpenAI (yes if the short row records them **(Claude)**).

### PRICE-CADENCE: keep the price table current

- **Backlog rows:** "Keep the price table current".
- **Owner decision:** "Weekly report + monthly re-read + date in the app (Recommended)", whose description read "A weekly CI report (reporting only) compares OpenRouter's price API exactly and checks the other providers' pages for changed figures; Claude re-reads every page monthly and at once when the report flags a change; Settings and the estimate show when prices were last checked, with a notice after about 45 days. Plus the planned ledger-vs-dashboard check after real runs." The ledger check after real runs belongs to the first live run's row.
- **What to build:**
  1. `scripts/price-report.ts`: fetches `openrouter.ai/api/v1/models` (no key) and compares `pricing.prompt` / `pricing.completion` exactly with the OpenRouter rows; fetches Anthropic's, OpenAI's, Google's and fal's pages and reports any recorded figure it cannot find. Log, run summary, and a warning on the run's page; exits 0 whatever it finds.
  2. A step in `.github/workflows/verify.yml` on the weekly schedule, Linux only, `continue-on-error`, short timeout, like the Playwright pin's step; no secret read.
  3. A last-checked date exported from @byway/gateway (e.g. `PRICES_CHECKED`), set at each full re-read; Settings and the Recommendation's estimated cost show it, with a notice after about 45 days. The web reads it on the server and passes it on (the client components do not import @byway/gateway).
  4. The monthly re-read: a full read of every page now (the date must be true when it ships), with the research's parked figure in view (about 367 output tokens for a GPT Image 2.5 image at medium quality against the 8,000 planned).
- **Code sites:** `.github/workflows/verify.yml:15-18` (weekly cron), `:57-65` (the Playwright pin step to mirror); `scripts/playwright-pin.ts` (pattern); `scripts/test/ci.test.ts:17, :49, :420` (workflow assertions); `packages/gateway/src/prices.ts:37-46`; `packages/gateway/src/index.ts:9`; `apps/web/src/components/SettingsView.tsx:151-212`; `apps/web/src/components/RecommendationView.tsx:456-462`; the server code that feeds them (`apps/web/src/server/api.ts`, `apps/web/src/services/config.ts`).
- **Bundle:** no. **Depends on:** LC-TIERS (same file; same builder). **Waits:** no.
- **Tests:** ci.test.ts asserts the new step's shape and condition; the report script's parsing tested on fixtures (no network in tests); the 45-day notice tested with a fixed clock; a test that the exported date is not older than the newest "read YYYY-MM-DD" in prices.ts's sources **(Claude)**.
- **Size:** M (1.5).
- **Open questions:** how the monthly re-read is triggered (a scheduled routine needs the owner's yes; otherwise a playbook duty with a date); how the report reads JavaScript-rendered pages (Anthropic's `.md` page is plain; OpenAI's and Google's may need their text forms); whether to change the 8,000-token image planning figure (money path: lower reservations; Claude's call to name, or leave).

### WAITS-SETTINGS: selectable answer waits per model

- **Backlog rows:** "Selectable answer waits per model (block 2)".
- **Owner decision:** "Build selectable limits for every model/provider: 15, 30, 45, and 60 minutes"; "In Block 2, 15 meanwhile (Recommended)"; "Per model (Recommended)"; default "15 minutes (Recommended)" for text and image models; images "5, 10, 15, 20; default 15 (Recommended)"; video "30 minutes (Recommended)" (choices 30, 45, 60, 75); "Short design of the waits first (Recommended)" (not yet in the record).
- **What to build (after the waits design is approved):** a Settings section, grouped by provider, with one choice per model the profiles use: text 15/30/45/60 (default 15), image 5/10/15/20 (default 15), video 30/45/60/75 (default 30); fal's extract-frame has no entry and runs under its clip's wait. Stored per workspace (a store migration: new table or columns). The gateway reads the chosen wait for the model it resolves (as it reads the caps, on every call) and uses it: as the stall bound for streamed calls, replacing `max(STREAM_IDLE_MS, stepLimitMs)`; as the whole-call bound for unstreamed calls and images; as how long byway waits for a queued fal job. Demo mode's mock needs none.
- **Code sites:** `packages/gateway/src/providers/stream.ts:6-24` (STREAM_IDLE_MS), `:34-61` (StreamIdle); `packages/gateway/src/gateway.ts:259-279` (`streamIdleMs = Math.max(STREAM_IDLE_MS, req.operation?.stepLimitMs ?? 0)` at :264), `:500-505`, `:1175-1187` (operation validation); `packages/gateway/src/providers/types.ts:34-40`; `packages/gateway/src/providers/anthropic.ts:147-148`, `openai.ts:305-306`, `openrouter.ts:34-35`; `packages/contracts/src/gateway.ts:70-99` (operation.stepLimitMs; type-only edits); `packages/contracts/src/store.ts:192-198` (Preferences) and the Store methods; `packages/store/src/preferences.ts:1-33`, `packages/store/src/migrations.ts:110-130`; `packages/runner/src/activities/index.ts:60-66` (stepLimitMs passed today); `apps/web/src/components/SettingsView.tsx`; `apps/web/src/server/schemas.ts`, `api.ts`; the profiles' model list (`packages/gateway/src/profiles.ts`).
- **Bundle:** no (keep contracts edits type-only; build.test.ts unedited). **Depends on:** the waits design; PRICE-CADENCE merged first (both edit SettingsView.tsx). **Waits:** yes.
- **Tests:** a streamed call stalls only after its model's chosen wait (fake timers, as `cut-off.test.ts`); the default when nothing is chosen; a changed choice applies to the next call; Settings shows each kind's set and default; store migration test.
- **Size:** L (2).
- **Open questions (for the waits design):** what "wait" means per kind (silence on a stream; a whole unstreamed call; a queued job); whether the gateway reads the store per call or the runner passes the wait; Anthropic's `thinking.display: "summarized"` (would make a think not silent; changes the request body; not chosen by anyone); how a wait longer than the step's own limit behaves until WAITS-STEP-LIMITS lands on the integration branch.

### WAITS-CAPS: lift the caps below the waits

- **Backlog rows:** "Selectable answer waits per model (block 2)" ("Block 2 also lifts today's caps below those waits (OpenAI's SDK stops an image call at ten minutes, Google's at about five)").
- **Owner decision:** as WAITS-SETTINGS; the image answer's description: "Block 2 also lifts today's caps (OpenAI's SDK stops an image at 10 minutes, Google's fetch at about 5) so the chosen wait governs."
- **What to build:** OpenAI image calls get a per-request timeout equal to the chosen wait (the client has `maxRetries: 0` and the SDK's ten-minute default); Google's SDK gets its own fetch or dispatcher whose header and body timeouts follow the chosen wait (Node's undici gives up at 300 s, the research's local test); fal's job wait bounded by the chosen video wait, and the start-deadline header set to the time byway has left (which header the server honours, `X-Fal-Request-Start-Timeout` or the client's `x-fal-request-timeout`, is untested); extract-frame under its clip's wait.
- **Code sites:** `packages/gateway/src/providers/openai.ts:67-68` (createOpenAIClient), `:314` (`images.generate`); `packages/gateway/src/providers/google.ts:28` (`new GoogleGenAI({ apiKey })`); `packages/gateway/src/providers/fal.ts:54-55` (POLL_INTERVAL_MS), `:128` (submit), `:398-405` (pollJob, no deadline today).
- **Bundle:** no. **Depends on:** WAITS-SETTINGS. **Waits:** yes.
- **Tests:** an image call outlasting ten minutes on fake timers is not cut by the SDK; a Google call outlasting five minutes against a local server is not cut by undici (the research's probe, kept local and free); a fal job past its wait is given up and counted as the true stop's rules say.
- **Size:** M (1-1.5).
- **Open questions:** fal's fallbacks (`x-app-fal-disable-fallback`, may bear on ADR-0102) are parked by the research, not in this item.

### WAITS-STEP-LIMITS: steps sized so the chosen wait governs

- **Backlog rows:** "Selectable answer waits per model (block 2)" ("Block 2 also raises the steps' own limits (model steps 15 minutes and media steps 45 today ...) so the chosen wait governs"; "sizes the relay step to the chosen video wait").
- **Owner decision:** as WAITS-SETTINGS; the video answer's description: "Block 2 sizes the relay step to the chosen wait (today's 45-minute media step also holds the link call and the frame extraction, so 45 or more would not fit one attempt)."
- **What to build:** new start-to-close limits for model, media and relay steps, sized from the largest choices (one stall is sent once more, so twice the wait, plus the answer; a critic step can make up to 4 shuffles; an asset step makes its briefs call, its images one after another and an integrate call), or sized per run from the chosen waits carried in RunInput; and what happens on a step timeout (today timeouts are retried with new paid calls, `maximumAttempts` 3 for model steps).
- **Code sites:** `packages/runner/src/workflow/acts.ts:12` (retry policy), `:15` (quick), `:17` (HEARTBEAT_TIMEOUT), `:20` (model, 15 minutes), `:22` (media, 45 minutes); `interpreter.ts:324` (asset on `media`), `:339` (relayLink on `media`); `packages/runner/src/activities/liveness.ts:95`; `packages/runner/src/activities/index.ts:64`.
- **Bundle:** yes (B1, last). **Depends on:** the waits design; WAITS-SETTINGS (the gateway's stall bound must stop following the step limit before the limits grow). **Waits:** yes.
- **Tests:** the proxies' options read back; a step's calls carry the new limit; the heartbeat still detects a lost worker within a minute.
- **Size:** M (0.5-1).
- **Open questions:** fixed generous limits vs per-run sizing (per-run needs RunInput to carry the waits snapshot); whether a timed-out model step should stop being retried (it pays again).

### C5-FLAKE: the browser helper waits on progress

- **Backlog rows:** "Known Windows timing flake: browser test C5 waits at most 120 s for each next turn".
- **Owner decision:** "Fix it in Block 2 (Recommended)" ("The e2e helper waits on the run's progress (a new event within 120 s) instead of on the next turn alone, so a slow but moving run no longer fails; tested by mutation, and part of Block 2's check.") (not yet in the record).
- **What to build:** `nextTurn` restarts its 120 s window whenever the run shows progress (a new event: the run view's last event sequence, read through the app's API or the timeline), and fails only when 120 s pass with no new event, no turn and no end. Put the window logic in a small pure helper so a unit test can drive it on a fake clock.
- **Code sites:** `apps/web/e2e/flow.ts:85-101` (nextTurn), `:111-116` (turnAfter, 120_000), `:192-213` (answerUntilDone, stepTimeoutMs default 120_000); callers `apps/web/e2e/configurations.spec.ts:110,142,183`, `flow.spec.ts:53` (stepTimeoutMs 20_000), `keyboard.spec.ts:363`, `state.spec.ts:158,235`.
- **Bundle:** no. **Depends on:** none. **Waits:** no.
- **Tests:** a unit test (under `apps/web/test/`, which vitest runs) where a slow but moving run (an event every 100 s for 400 s) passes and a stalled one fails at 120 s; the mutation (the window not restarted on progress) makes the first fail, recorded as evidence; the browser suite passes on both CI machines.
- **Size:** S (0.5).
- **Open questions:** which progress signal (API event sequence is exact; the timeline DOM is what the person sees); flow.spec.ts's 20 s case keeps its own limit.

### B2-RECORDS: the block's records

- **Backlog rows:** every row above, closed or narrowed; a new row for what still travels by value (the design: "W's record files this as a new row").
- **Owner decision:** the design's "The record" section (one ADR, User-approved, quoting D3, D9 and the order, naming each (Claude) choice); D5's review rule for the delegated-review list.
- **What to build:** ADR-0113 "Run inputs, seeds and the held voice travel by reference; a gate's retry keeps the person's VOICE answers" (Track: System; User-approved; says that for D3 the owner chose another option than the recommended one; names every (Claude) choice; changes ADR-0081, 0090, 0092, 0096 and 0098, with "changed by" links in the index in the same merge; ADR-0101 gets a dated Later note for the advice field). Records for the waits (the owner's own answer; a new ADR or ADR-0111's Later note) and for the price cadence and long-context tiers (ADR-0109's area). The playbook's review row gets the block's Claude choices. The conversation record gets the two missing answers. Backlog rows closed: "Activity inputs carry the brief and the step's ports by value (P2)" stays open for its last part only.
- **Code sites:** `docs/adr/`, `docs/adr/README.md`, `docs/backlog.md` (rows 48, 63, 64, 73, 74, 75, 82, 83, 91, 92, 100, 102, 104, 110, 118, 119, 120, 131, 132, 138, 169 by line at 37a4104), `docs/playbook.md:49`, `docs/adr/evidence/conversation-continued.md`; `scripts/test/adr-*.test.ts` (the ADR checks).
- **Bundle:** no. **Depends on:** all code merged. **Waits:** after code.
- **Tests:** the ADR and evidence checks (`scripts/test/adr-records.test.ts`, `adr-evidence.test.ts`).
- **Size:** M (1).
- **Open questions:** ADR numbers (0113 for W; 0114 and 0115 if the waits and the price cadence get their own); whether the long-context tiers are recorded in W's ADR (the owner answered on the P2 design) or in a money-path ADR.

---

## 3. Build split

Five builders in separate worktrees off `fix/fx-block2` (cut from `37a4104`), plus the coordinator.

| Builder | Items | Files (main) | Order inside | Why this grouping |
|---|---|---|---|---|
| **B1 W-core** (the only one that edits bundle inputs) | P2-BRIEF, P2-INPUTS, P2-SEEDS, P2-HELD, VOICE-RETRY, OWN-DRAFT, START-F19, R-VOICE-APPLY, R-SUFFIX, R-ADVICE, R-C7, R-GATE-MARK, R-DECLINED, R-PORTS-MOVE, SLOTS-KNOB, CANCEL-SCOPE, FANOUT-FAILURE, WAITS-STEP-LIMITS, ORACLE | `packages/runner/src/workflow/*`, `packages/runner/src/types.ts`, `packages/runner/src/client.ts`, `packages/runner/src/activities/{human,model-step,prompting,held-voice,writes,asset,relay,slot-plan}.ts`, `packages/runner/src/{page-copy,tells}.ts`, `packages/recipe/src/{semantics,limits,template-slots}.ts`, `packages/validator/src/scope.ts`, `packages/prompts/src/{ids,outputs}.ts`, `packages/prompts/templates/helper.voice.apply@*.md`, `packages/gateway/src/mock/{responders,revision}.ts`, `packages/contracts/src/store.ts` (one Store method), `packages/store/src/{store,queries}.ts` (memo range), `apps/web/src/view/timeline.ts`, runner/prompts/gateway-mock tests, `packages/runner/test/build.test.ts` (last) | 1 P2-BRIEF, 2 P2-INPUTS, 3 P2-SEEDS (+ limits-batch), 4 P2-HELD, 5 OWN-DRAFT, START-F19, 6 VOICE-RETRY, 7 R-VOICE-APPLY, 8 R-SUFFIX, 9 R-ADVICE, 10 R-C7, 11 R-GATE-MARK, 12 R-DECLINED, 13 R-PORTS-MOVE (after B4's test is on the branch), 14 SLOTS-KNOB, 15 CANCEL-SCOPE, 16 FANOUT-FAILURE, 17 WAITS-STEP-LIMITS (after the waits design and B3), 18 limits-batch re-measured, ORACLE at full size, the pinned hash updated once | Every bundle change in one builder, ordered, so the hash moves once; the activities that read by id must land with the workflow that passes ids. |
| **B2 Prices** | LC-TIERS, PRICE-CADENCE | `packages/gateway/src/{prices,index}.ts`, gateway price tests, `scripts/price-report.ts` (new), `.github/workflows/verify.yml`, `scripts/test/ci.test.ts`, `apps/web/src/components/{SettingsView,RecommendationView}.tsx`, the web server code that feeds them, web tests | LC-TIERS, then the re-read and the date, then the report and the CI step | Both edit prices.ts; both are the owner's money-path answers of 2026-10-21. |
| **B3 Waits** (starts when the waits design is approved) | WAITS-SETTINGS, WAITS-CAPS | `packages/gateway/src/gateway.ts`, `packages/gateway/src/providers/{stream,anthropic,openai,openrouter,google,fal,types}.ts`, `packages/contracts/src/{gateway,store}.ts` (types only), `packages/store/src/{preferences,migrations,store}.ts`, `packages/runner/src/activities/index.ts`, `apps/web/src/components/SettingsView.tsx`, `apps/web/src/server/{schemas,api}.ts`, gateway/store/web tests | WAITS-SETTINGS, then WAITS-CAPS | Gateway and Settings plumbing; no bundle file; the step limits it needs are B1's last stage. |
| **B4 Engine** | R-RECONCILE, R-PORTS-TEST | `packages/runner/src/{lost-runs,dev-engine}.ts`, new tests (`packages/runner/test/reconcile-while-running.test.ts`, `packages/runner/test/operator-ports.test.ts`) | R-PORTS-TEST first (B1's move needs it), then R-RECONCILE | Non-bundle runner work; new test files only, so no clash with B1's test edits. |
| **B5 Browser helper** | C5-FLAKE | `apps/web/e2e/flow.ts`, a pure helper and its unit test under `apps/web/test/` | one step | Disjoint from everything else. |

Known overlaps (resolved by the merge order): B2 and B3 both edit `SettingsView.tsx` and the settings API (B2 merges first; B3 rebases). B1 and B3 both edit `packages/contracts/src/store.ts` and `packages/store/src/store.ts` (different methods; B3 merges before B1, B1 rebases). B1 edits `packages/gateway/src/mock/*` and gateway tests for voice.apply; B3 edits other gateway files and `cut-off.test.ts`.

**Merge order into `fix/fx-block2`:**
1. B5 (C5-FLAKE): it steadies every later CI run of the block.
2. B4 (R-PORTS-TEST, R-RECONCILE): the operator-ports test must be on the branch before B1's R-PORTS-MOVE.
3. B2 (LC-TIERS, PRICE-CADENCE): the tiers must be in before large briefs can run.
4. B3 (WAITS-SETTINGS, WAITS-CAPS), once the waits design is approved: the gateway stops following the step limit before B1 raises the limits. `build.test.ts` must pass unedited.
5. B1 (W-core) last, rebased onto the branch; its final commits are WAITS-STEP-LIMITS, limits-batch, the full oracle run and the one hash update.
6. Coordinator: B2-RECORDS.
7. The gate (section 6), then merge to main.

If the waits design is not approved by the time B1 reaches step 17, B1 stops there with everything else done; the bundle still changes once, when the step limits land.

---

## 4. Rows that name block 2 (or P2, W, a workflow change) and are not built here

| Row | Why not |
|---|---|
| "Activity inputs carry the brief and the step's ports by value (P2)" (its last part) | "activities receive only the ports their step reads" stays on its row by the owner's approval of the design's recommendation; the row stays open for that part only. |
| "Owner decision: simplify VOICE on web pages to a content layer" | The owner approved "W does not start the content-layer pilot"; W does not fire "a workflow change is made for another reason" (Claude's reading). |
| "Other questions that commit money show no figure" | Its trigger is "when block 2 reworks the loop turns"; W does not rework the loop turns (only the optional decline and the gate's mark change). |
| "Ask the swap question lazily when an optional or route step may replace the finds" | The design: "W does not change the swap step, which is its trigger." |
| "An admitted answer can go unapplied on paths no one chooses" | Named "do not come" in the design (its row 108); trigger is composed recipes for others or the registry. |
| "Owner question: ST9/ST10 human-critique case 2" | Held by the owner (2026-10-17); its optional guard says "no workflow-bundle change". |
| "Ask to raise the budget when a declined call's retry does not fit" | The design's row 145: it waits for live runs. |
| "Rates byway does not record, and a maximal brief passes Google's 200K tier" (its other parts) | Google's context-cache rates, gpt-6-luna's cached input and the cached-token comparison keep their trigger (the row says so). |
| "Tests the review's acceptance named that are not written" (F05, F06, F15) | Their code (web history, inspection, refresh) does not change in this block; only F19 is built (START-F19). |
| "directionsReactedTo and critiqueSources withhold some true claims" | Its trigger is "the next change to these claims in semantics.ts"; it fires only if R-DECLINED changes critiqueSources' walk at an optional (semantics.ts:1151). If it does, the ADR records the revisit; widening the claims is not in scope. |
| "Paid-call residuals named only in ADRs" | It names a consequence, not work: a workflow left under a run marked failed is terminated at the next engine start after a workflow-code change, which W is. Its revisit triggers are live-run findings. |
| "Engine-thread stalls on slow machines" | "moving CI's data folder off C: is a workflow change" means the CI workflow file; its trigger is a live run or a server log showing stalls. B2's report step does not fire it. |

---

## 5. Risks

1. **A step stops getting a text it needs** (the design's first risk): the held words, the deck, the draft or the tells now come by id. Every call site is driven by a test (held-voice-writers, the weighing test, C3 own draft, C5).
2. **Very large briefs now run and spend.** LC-TIERS must be on the branch before B1 merges; above a provider's context window (a maximal CJK brief can estimate near 3M tokens by its UTF-8 bytes) the provider refuses with a 400, unbilled, and the step fails plainly. P2's acceptance runs in demo mode.
3. **The bundle hash moves by accident on a non-W branch** (a comment in a bundle input). Each builder runs build.test.ts unedited; B1 updates the pin once.
4. **Runs waiting at the merge end** (ADR-0078). Before merging, read-only: the engine's port is free on this checkout, and `byway.sqlite` in the data folder holds no queued, running, waiting or paused run; if a demo run is open, the owner says whether to finish it or let it end (the design). CI and the e2e tests use their own temporary data.
5. **The reconcile pass could race a start**: it skips queued runs.
6. **Waiting on the waits design** could stall B1's last stage; everything else proceeds.
7. **CANCEL-SCOPE undecided**: if the proxies wait, Cancel with an uncut call in flight takes that call's time; if they do not, siblings stopped by a failure still need a web-only note.
8. **Two owner answers are not in the record** (C5 flake, waits design first); the records pass adds them with their questions before the block's check reads the records.
9. **W is large and lands just before the first spend**: one adversarial check with a money lens (prices, waits) and a workflow/replay lens, and further rounds need the owner's yes.
10. **Shared-file conflicts** (SettingsView.tsx, contracts/store.ts, store.ts): the merge order puts the smaller change first.

## 6. The gate

`pnpm verify` on the integration branch; the full claims oracle (ORACLE) on B1's final tree; one adversarial check of the whole block; branch CI on Windows and Linux (a risky branch under the owner's merge rule), with main's last run checked first; the runs-waiting check above; merge to main; confirm main's CI. Any fix round goes to the owner first.

## 7. Coordinator notes added 2026-10-22 (after the map was written)

- The owner's answers after the map: the waits design approved with "Relay from your video wait, 24 h elsewhere (Recommended)", "Ask for summaries (Recommended)", "Give up and end the call plainly (Recommended)", "Keep today's behaviour (Recommended)" (Cancel: TRY_CANCEL, one scope); the re-read trigger "Claude checks at each session's start (Recommended)".
- Provider-neutral harness (owner, 2026-10-22, typed): "note that you are assuming it would be Claude reading the pricing pages. It could be another modelwith internet access provided by anothe rprovider. make sure we are allowing that in the harness. I can;t have this completely tethered to one provider". So PRICE-CADENCE's re-read is a duty of "the agent running the session": add AGENTS.md at the repo root (the duty, its trigger, and the exact steps: run the price report script, read each source page prices.ts names, update rows and the last-checked date, branch, gate) and a CLAUDE.md that only imports it (`@AGENTS.md`); no shown text, comment or record says Claude does it; the script does the mechanical part so any model with web access, or a person, can finish it. Check the prices branch for "Claude" in strings and docs at integration.
- The waits builder (fix/fx-b2-waits) removes operation.stepLimitMs and adds operation.waitMs (gateway side); W-core's last link adds the workflow side (a quick step reading the waits before each relay step, the relay proxy's limit from it, the relay activity passing waitMs), the 24 h backstop for model and image steps, keeps TRY_CANCEL with the one scope (a test pinning both), and updates PINNED_WORKFLOW_HASH once.
- The waits builder (fix/fx-b2-waits, 8 commits, 2bea6a2..2a60931) finished. Open from it: how byway reads a clip fal dropped at the start deadline (a 504 with timeout type "user"), which the design does not say; decide before Block 2's check (likely "nothing billed, the step says fal did not start the clip within the wait"), and file or build it. undici 7.18.2 was added as an exact dependency of @byway/gateway with the network (the offline mirror had no metadata). Its recordNotes list the builder's own choices (1)-(6+) for the records pass.

- The unfiled-items sweep of 2026-10-22 (scratchpad/sweep3/result.json) found these for Block 2's records pass (B2-RECORDS), each to be recorded or filed then:
  - B1: Block 2's builders and its approved waits design name many choices as Claude's: in P2, VOICE-RETRY, the riders, R-RECONCILE, C5-FLAKE, the prices and the waits. None is in the playbook's review row yet. B2-RECORDS says that row gets them. This entry lists them so that pass can be checked for completeness.
  - B2: By Claude's choice, Cancel does not cut off Google's text calls (the SDK's abort works only on the client side, and the call is still charged) or any image call. After Cancel these calls finish, are paid for and are added to the run. The playbook lists this as a Claude choice to review, but no backlog row says when to revisit what it costs. Block 2 makes it matter more: image waits go up to 20 minutes, and Google calls up to 60 once Node's five-minute fetch limit is lifted.
  - B3: prices.ts plans 8,000 output tokens per GPT Image 2.5 image. OpenAI's own calculator gives 343 to 439, and a second-party source about 367, so every OpenAI image is reserved and estimated at about 20 times its likely cost. Block 2's price re-read left the figure as it is until the first live run's ledger (Claude's choice). The rows that point at the figure either have a trigger that will not fire (it fires only when a call settles above its reservation) or close with block 2.
  - B4: On main, row 138 and ADR-0111's Later notes say a stalled stream is cut off only after fifteen minutes of silence (forty-five in media steps) for every streamed provider, and that OpenAI's SDK stops an image call at ten minutes. That is not true for OpenAI and OpenRouter. Node's fetch closes a silent stream from them after five minutes (unless they send keep-alives, which is not known), and an OpenAI image after five to ten minutes. Each call is then sent once more as "may have been billed". Block 2 builds the code fix and closes row 138; its records also need to say what held on main until then.
  - B5: When block 2's records pass closes or narrows its rows, some parts of those rows need a home. Row 138's leftover open items need rows of their own. Row 73's last part becomes a new row. Row 63 keeps a $0.40 cache rate that LC-TIERS left unrecorded. Row 169's new wait is proven only in the browser. Row 48's batch-limit sentence may not hold. Row 155's "when block 2 reworks the loop turns" will not fire.
  - B6: Block 2 makes some records stale, and its builders asked for record changes: - ADR-0098's numbers (1 KiB base, 64 B per seed, "the bound counts every seed") no longer hold. - ADR-0101 needs a dated note on the advice field. - ADR-0111, the playbook's review item and row 138 still describe operation.stepLimitMs, which is gone. - AGENTS.md now meets ADR-0009's request for an AGENTS.md/CLAUDE.md keys note, which had never been met. - Row 169 still says the e2e waits are left as they are.
  - B7: The owner chose a price-table check at the start of every session. Block 2's AGENTS.md says the check runs "before other work that touches money", which reads as checking only in sessions that touch money, a condition the owner did not choose. The option the owner chose also called it "A playbook duty", but it appears only in AGENTS.md, not in the playbook.
  - B8: The owner chose step limits that size the relay step from the video wait and give every other step 24 hours. The description of that option says a step stuck in byway's own code holds its run as Running for up to 24 hours per try: 72 hours for a model step and 48 for an image step. The heartbeat catches a dead worker, not a live one that has hung. The waits ADR will name this, but no row says when to revisit it.
  - B9: The lost-run pass that runs while the engine runs catches only workflows that Temporal has closed. A workflow that Temporal keeps RUNNING while its workflow task keeps failing stays "running", so the closing row's batch-limit claim may not hold for that case. A queued run whose workflow closes before beginRun stays queued until the next engine start. No real Temporal limit was hit in the tests.
